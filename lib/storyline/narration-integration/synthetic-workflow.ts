import "server-only";
import { canonicalJson } from "../canonical";
import type { createSyntheticEvidenceAnalysisWorkflow } from "../evidence-analysis/synthetic-workflow";
import type { createSyntheticEvidenceCandidatePersistence } from "../evidence-analysis/persist-candidate";
import { taskFail } from "../jobs/errors";
import { serviceCall, taskScope, type StoryTaskScope } from "../jobs/service-boundary";
import { freeze, hash, id, integer, record } from "../validation";
import type { createPersistedNarrationPreparation } from "./prepare";
import type { createProvisionalNarrationPersistence } from "./persist";

type Reference = Readonly<{ taskId: string; generation: number }>;
type Candidate = Readonly<{ id: string; hash: string }>;
type Analysis = ReturnType<typeof createSyntheticEvidenceAnalysisWorkflow>;

function reference(value: unknown): Reference {
  const r = record(value, ["taskId", "generation"], "narrationWorkflow.reference");
  return freeze({ taskId: id(r.taskId, "narrationWorkflow.taskId"), generation: integer(r.generation, "narrationWorkflow.generation", 1_000_000) });
}

/** Explicit disposable synthetic composition only. All capability objects are
 * trusted server/test dependencies, never request payloads. No bootstrap,
 * network transport, datasource, timer, queue or authority issuer is installed. */
export function createSyntheticNarrationWorkflow(dependencies: {
  analysis: Analysis;
  candidateReader: Pick<ReturnType<typeof createSyntheticEvidenceCandidatePersistence>, "read">;
  preparation: ReturnType<typeof createPersistedNarrationPreparation>;
  persistence: ReturnType<typeof createProvisionalNarrationPersistence>;
  afterCandidateForTest?: () => Promise<void>;
  afterPrepareForTest?: () => Promise<void>;
  afterPersistForTest?: () => Promise<void>;
}) {
  async function finish(scope: StoryTaskScope, ref: Reference, candidate: Candidate,
    expected?: { snapshotId: string; revision: number; recipeHash: string }) {
    // Resolve by the intended task first. A supplied candidate for task B must
    // not even enter M4 composition when this invocation targets task A.
    const selected = await dependencies.candidateReader.read({ scope, ...ref });
    if (selected.status === "STALE_DEPENDENCIES") taskFail("STORY_TASK_SOURCE_STALE", "narrationWorkflow.candidate");
    if (selected.status !== "VALIDATED_CURRENT" || selected.id !== candidate.id || selected.candidateHash !== candidate.hash ||
      selected.taskId !== ref.taskId || selected.generation !== ref.generation)
      taskFail("STORY_TASK_SCOPE_MISMATCH", "narrationWorkflow.candidate");
    const selection = { scope, candidateId: candidate.id, candidateHash: candidate.hash };
    const prepared = await dependencies.preparation.prepare(selection);
    const { source, analysis } = prepared.draft.payload;
    if (prepared.candidate.id !== candidate.id || prepared.candidate.hash !== candidate.hash ||
      prepared.candidate.taskId !== ref.taskId || prepared.candidate.generation !== ref.generation ||
      analysis.candidateId !== candidate.id || analysis.candidateHash !== candidate.hash ||
      analysis.taskId !== ref.taskId || analysis.generation !== ref.generation ||
      source.projectId !== scope.projectId || source.movieId !== scope.movieId || source.studioId !== scope.studioId)
      taskFail("STORY_TASK_SCOPE_MISMATCH", "narrationWorkflow.candidate");
    if (expected && (source.snapshotId !== expected.snapshotId || source.expectedStudioRevision !== expected.revision || analysis.recipeHash !== expected.recipeHash))
      taskFail("STORY_TASK_SOURCE_STALE", "narrationWorkflow.source");
    await dependencies.afterPrepareForTest?.();
    // M4-03 independently reconstructs/validates current context and inserts
    // under its own source fence. Preparation is not persistence authority.
    const receipt = await dependencies.persistence.persist({ ...selection, draft: prepared.draft });
    if (receipt.candidateId !== candidate.id || receipt.candidateHash !== candidate.hash || receipt.draftHash !== prepared.draft.draftHash)
      taskFail("STORY_TASK_RESULT_STALE", "narrationWorkflow.receipt");
    await dependencies.afterPersistForTest?.();
    const view = await dependencies.persistence.read({ scope, narrationId: receipt.id });
    if (view.status === "STALE_DEPENDENCIES") taskFail("STORY_TASK_SOURCE_STALE", "narrationWorkflow.readback");
    if (view.status !== "PROVISIONAL_CURRENT_AT_READ") taskFail("STORY_TASK_RESULT_STALE", "narrationWorkflow.readback");
    const stored = record(view, ["status", "persisted", "trust", "humanApproval", "sourceVerified", "id", "candidateId", "candidateHash", "draftHash", "createdAt", "payload"], "narrationWorkflow.view");
    if (stored.id !== receipt.id || stored.draftHash !== receipt.draftHash || stored.candidateId !== candidate.id || stored.candidateHash !== candidate.hash ||
      stored.createdAt !== receipt.createdAt || stored.persisted !== true || stored.trust !== "PROVISIONAL_SYNTHETIC_DRAFT" ||
      stored.humanApproval !== "NONE" || stored.sourceVerified !== false || canonicalJson(stored.payload) !== canonicalJson(prepared.draft.payload))
      taskFail("STORY_TASK_RESULT_STALE", "narrationWorkflow.readback");
    return freeze({ outcome: "NARRATION_READY" as const, reference: ref, candidate, narration: receipt,
      view: { status: "PROVISIONAL_CURRENT_AT_READ" as const, persisted: true, trust: "PROVISIONAL_SYNTHETIC_DRAFT",
        humanApproval: "NONE", sourceVerified: false, id: receipt.id, candidateId: candidate.id, candidateHash: candidate.hash,
        draftHash: receipt.draftHash, createdAt: receipt.createdAt, payload: prepared.draft.payload } });
  }

  async function advance(value: unknown, resume: boolean) {
    const r = record(value, resume ? ["selection", "identity", "reference"] : ["decisionId", "selection", "identity"], "narrationWorkflow.input");
    const s = record(r.selection, ["projectId", "movieId", "studioId", "sourceSnapshotId", "scriptVersionId", "expectedStudioRevision"], "narrationWorkflow.selection");
    const scope = taskScope({ projectId: s.projectId, movieId: s.movieId, studioId: s.studioId });
    const expected = { snapshotId: id(s.sourceSnapshotId, "narrationWorkflow.snapshotId"), revision: integer(s.expectedStudioRevision, "narrationWorkflow.revision"),
      recipeHash: hash(record(r.identity, ["recipe", "canonicalRecipe", "recipeHash", "logicalTaskKey"], "narrationWorkflow.identity").recipeHash, "narrationWorkflow.recipeHash") };
    // M3 owns admission, exact recipe validation, checkpoint and UNKNOWN rules.
    const result = resume ? await dependencies.analysis.resumeCompleted(value) : await dependencies.analysis.run(value);
    if (result.outcome !== "CANDIDATE_READY") return result;
    await dependencies.afterCandidateForTest?.();
    return finish(scope, reference(result.reference), { id: result.candidate.id, hash: result.candidate.candidateHash }, expected);
  }

  return Object.freeze({
    /** Explicit initial/repeated fake run. M3 alone can admit/execute; its
     * restricted authority and one-use fake wire remain unchanged. */
    run: (value: unknown) => serviceCall(() => advance(value, false)),
    /** Definitive-result recovery, including missing M3 publication. M3's
     * recovery method cannot dispatch, claim, checkpoint or send. */
    resumeCompleted: (value: unknown) => serviceCall(() => advance(value, true)),
    /** M4-only recovery of one exact persisted candidate. This method never
     * calls the analysis workflow or accepts caller-supplied candidate bytes. */
    resumeCandidate: (value: unknown) => serviceCall(async () => {
      const r = record(value, ["scope", "reference", "candidateId", "candidateHash"], "narrationWorkflow.resumeCandidate");
      return finish(taskScope(r.scope), reference(r.reference), { id: id(r.candidateId, "narrationWorkflow.candidateId"), hash: hash(r.candidateHash, "narrationWorkflow.candidateHash") });
    }),
    /** Read-only historical status/payload; never prepares or persists. */
    read: (value: unknown) => dependencies.persistence.read(value),
  });
}
