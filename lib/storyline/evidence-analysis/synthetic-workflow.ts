import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { InspectedStorylineMedia } from "../media";
import { readStorylineSource } from "../read-source";
import type { StoryTaskProfileDefinition, StoryTaskRecipeIdentity } from "../jobs/contracts";
import type { StoryTaskReference } from "../jobs/dispatch";
import type { createStoryTaskAdmission } from "../jobs/admission";
import type { createStoryTaskReconciler } from "../jobs/reconcile";
import type { createStoryTaskReader } from "../jobs/read";
import type { createStoryTaskFakeWorker } from "../jobs/fake-worker";
import type { createStoryTaskFakeCheckpoint } from "../jobs/fake-checkpoint";
import type { StoryFakeWire } from "../jobs/fake-transport";
import { createPersistedStoryTaskSourceAccess } from "../jobs/persisted-source";
import { taskFail } from "../jobs/errors";
import { serviceCall, taskScope, type StoryTaskScope } from "../jobs/service-boundary";
import { id, integer, nullable, record } from "../validation";
import type { createPersistedEvidenceCandidateValidator } from "./persisted-candidate";
import type { createSyntheticEvidenceCandidatePersistence } from "./persist-candidate";
import { generateSyntheticEvidenceCandidate } from "./synthetic-generator";

type Selection = StoryTaskScope & Readonly<{ sourceSnapshotId: string; scriptVersionId: null; expectedStudioRevision: number }>;
type Identity = StoryTaskRecipeIdentity;
type Reference = StoryTaskReference;

/** Explicit fake-only server composition. No bootstrap, timer, route, Redis,
 * provider transport or production authority is installed by this module. */
export function createSyntheticEvidenceAnalysisWorkflow(dependencies: {
  sourceDatabase: PrismaClient;
  inspectMedia: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
  profile: StoryTaskProfileDefinition;
  admission: ReturnType<typeof createStoryTaskAdmission>;
  reconcile: ReturnType<typeof createStoryTaskReconciler>;
  reader: ReturnType<typeof createStoryTaskReader>;
  worker: ReturnType<typeof createStoryTaskFakeWorker>;
  checkpoint: ReturnType<typeof createStoryTaskFakeCheckpoint>;
  validator: ReturnType<typeof createPersistedEvidenceCandidateValidator>;
  persistence: ReturnType<typeof createSyntheticEvidenceCandidatePersistence>;
  wire: StoryFakeWire;
  /** Disposable fault/race injection; no application bootstrap uses it. */
  afterResultForTest?: () => Promise<void>;
}) {
  const sourceAccess = createPersistedStoryTaskSourceAccess(dependencies.sourceDatabase);
  const profile = structuredClone(dependencies.profile);

  function parseSelection(value: unknown): Selection {
    const row = record(value, ["projectId", "movieId", "studioId", "sourceSnapshotId", "scriptVersionId", "expectedStudioRevision"], "workflow.selection");
    const scope = taskScope({ projectId: row.projectId, movieId: row.movieId, studioId: row.studioId });
    if (nullable(row.scriptVersionId, v => id(v, "workflow.scriptVersionId")) !== null)
      taskFail("STORY_TASK_INVALID", "workflow.scriptVersionId");
    return Object.freeze({ ...scope, sourceSnapshotId: id(row.sourceSnapshotId, "workflow.snapshotId"),
      scriptVersionId: null, expectedStudioRevision: integer(row.expectedStudioRevision, "workflow.revision") });
  }
  function parseReference(value: unknown): Reference {
    const row = record(value, ["taskId", "generation"], "workflow.reference");
    return Object.freeze({ taskId: id(row.taskId, "workflow.taskId"),
      generation: integer(row.generation, "workflow.generation", 1_000_000) });
  }
  function scopeOf(selection: Selection): StoryTaskScope {
    return Object.freeze({ projectId: selection.projectId, movieId: selection.movieId, studioId: selection.studioId });
  }
  function parseIdentity(value: unknown): Identity {
    const row = record(value, ["recipe", "canonicalRecipe", "recipeHash", "logicalTaskKey"], "workflow.identity");
    // The M1 source-access service revalidates every field and exact bytes
    // before generation; admission independently checks the same identity.
    if (typeof row.recipeHash !== "string" || typeof row.canonicalRecipe !== "string")
      taskFail("STORY_TASK_INVALID", "workflow.identity");
    return value as Identity;
  }

  async function currentCandidate(scope: StoryTaskScope, reference: Reference) {
    const existing = await dependencies.persistence.read({ scope, ...reference });
    if (existing.status === "STALE_DEPENDENCIES") taskFail("STORY_TASK_SOURCE_STALE", "workflow.candidate");
    return existing;
  }

  async function persistCompleted(selection: Selection, identity: Identity, reference: Reference) {
    const scope = scopeOf(selection);
    const sourceRecord = await readStorylineSource({ projectId: scope.projectId, movieId: scope.movieId }, dependencies.sourceDatabase);
    const media = await dependencies.inspectMedia(sourceRecord.storageKey);
    const generated = await sourceAccess.transaction(async tx => {
      const handle = await sourceAccess.load(tx, selection, media);
      const recipe = await sourceAccess.validateRecipe(tx, identity.recipe, handle, profile);
      if (recipe.canonicalRecipe !== identity.canonicalRecipe || recipe.recipeHash !== identity.recipeHash ||
        recipe.logicalTaskKey !== identity.logicalTaskKey)
        taskFail("STORY_TASK_SOURCE_STALE", "workflow.recipe");
      const source = (await sourceAccess.inspect(tx, handle)).source;
      const result = generateSyntheticEvidenceCandidate({ source, recipe, profile, reference });
      await media.assertUnchanged();
      return result;
    }, { readOnly: true });
    const existing = await currentCandidate(scope, reference);
    if (existing.status === "VALIDATED_CURRENT") {
      if (existing.candidateHash !== generated.candidateHash)
        taskFail("STORY_TASK_RESULT_STALE", "workflow.immutableCandidate");
      return Object.freeze({ outcome: "CANDIDATE_READY" as const, reference, candidate: existing });
    }
    const validated = await dependencies.validator.validate({ scope, ...reference, candidate: generated.payload });
    if (validated.candidate.candidateHash !== generated.candidateHash ||
      validated.durableResult.recipeHash !== identity.recipeHash)
      taskFail("STORY_TASK_RESULT_STALE", "workflow.validation");
    const receipt = await dependencies.persistence.persist({ scope, ...reference, candidate: validated.candidate.payload });
    if (receipt.candidateHash !== generated.candidateHash || receipt.recipeHash !== identity.recipeHash)
      taskFail("STORY_TASK_RESULT_STALE", "workflow.receipt");
    const stored = await currentCandidate(scope, reference);
    if (stored.status !== "VALIDATED_CURRENT" || stored.candidateHash !== receipt.candidateHash || stored.resultId !== receipt.resultId)
      taskFail("STORY_TASK_RESULT_STALE", "workflow.readback");
    return Object.freeze({ outcome: "CANDIDATE_READY" as const, reference, candidate: stored });
  }

  async function advance(selection: Selection, identity: Identity, reference: Reference, allowExecution: boolean) {
    const scope = scopeOf(selection);
    let status = await dependencies.reader.get({ scope, taskId: reference.taskId });
    if (!status || status.generation !== reference.generation || status.kind !== "ANALYZE_EVIDENCE")
      taskFail("STORY_TASK_SCOPE_MISMATCH", "workflow.task");
    if (status.state === "COMPLETED") return persistCompleted(selection, identity, reference);
    if (status.state === "UNKNOWN") return Object.freeze({ outcome: "UNKNOWN" as const, reference });
    if (status.state === "FAILED" || status.state === "CANCELLED")
      return Object.freeze({ outcome: "TERMINAL" as const, state: status.state, reference });
    if (!allowExecution || status.state !== "QUEUED")
      return Object.freeze({ outcome: "IN_PROGRESS" as const, state: status.state, reference });

    const dispatched = await dependencies.reconcile.reconcileOnce({ scope, batchSize: 1, missingReceipts: [] });
    if (dispatched.deliveries.some(item => item.taskId !== reference.taskId))
      taskFail("STORY_TASK_SCOPE_MISMATCH", "workflow.dispatch");
    if (dispatched.deliveries.some(item => item.outcome !== "ACKNOWLEDGED"))
      return Object.freeze({ outcome: "IN_PROGRESS" as const, state: "QUEUED" as const, reference });
    const claimed = await dependencies.worker.claim(reference);
    if (claimed.outcome !== "CLAIMED") {
      status = await dependencies.reader.get({ scope, taskId: reference.taskId });
      if (status?.state === "COMPLETED") return persistCompleted(selection, identity, reference);
      if (status?.state === "UNKNOWN") return Object.freeze({ outcome: "UNKNOWN" as const, reference });
      return Object.freeze({ outcome: "IN_PROGRESS" as const, state: status?.state ?? "QUEUED", reference });
    }
    const result = await dependencies.checkpoint.runOnce(claimed.lease, dependencies.wire);
    if (result.state === "COMPLETED") {
      await dependencies.afterResultForTest?.();
      return persistCompleted(selection, identity, reference);
    }
    if (result.state === "UNKNOWN") return Object.freeze({ outcome: "UNKNOWN" as const, reference });
    return Object.freeze({ outcome: "TERMINAL" as const, state: result.state, reference });
  }

  return Object.freeze({
    /** Explicit first invocation. The reviewed admission gateway owns all
     * authority and idempotency; this wrapper never issues a decision. */
    async run(value: unknown) {
      return serviceCall(async () => {
        const row = record(value, ["decisionId", "selection", "identity"], "workflow.run");
        const decisionId = id(row.decisionId, "workflow.decisionId");
        const selection = parseSelection(row.selection), identity = parseIdentity(row.identity);
        const reference = await dependencies.admission.admit({ decisionId, selection, identity });
        return advance(selection, identity, reference, true);
      });
    },
    /** Explicit recovery after a definitive result. Never dispatches, claims,
     * checkpoints or sends; UNKNOWN remains UNKNOWN. */
    async resumeCompleted(value: unknown) {
      return serviceCall(async () => {
        const row = record(value, ["selection", "identity", "reference"], "workflow.resume");
        return advance(parseSelection(row.selection), parseIdentity(row.identity), parseReference(row.reference), false);
      });
    },
  });
}
