import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "../canonical";
import { EVIDENCE_ANALYSIS } from "../evidence-analysis/contracts";
import { validateEvidenceAnalysisCandidate } from "../evidence-analysis/validate";
import type { StoryTaskProfileDefinition } from "../jobs/contracts";
import { taskFail } from "../jobs/errors";
import { createPersistedStoryTaskSourceAccess } from "../jobs/persisted-source";
import { parseStoryTaskProfile, storyTaskGenerationIdentity } from "../jobs/recipe";
import { serviceCall, taskScope } from "../jobs/service-boundary";
import type { InspectedStorylineMedia } from "../media";
import { composeSyntheticNarration } from "../narration/synthetic-composer";
import { validateSyntheticNarrationDraft } from "../narration/validate";
import type { SyntheticNarrationContext } from "../narration/contracts";
import { hash, id, integer, literal, nullable, record, text } from "../validation";

const candidateFields = ["id", "taskId", "generation", "resultId", "resultHash", "sourceSnapshotId", "sourceContentHash", "sourceContextHash",
  "sourceDependencyHash", "sourceBindingHash", "expectedStudioRevision", "recipeHash", "profileHash", "schemaVersion", "canonicalPayload",
  "candidateHash", "validationStatus", "origin", "validatedAt"];
const bindingFields = ["taskId", "generation", "state", "kind", "projectId", "movieId", "studioId", "sourceSnapshotId", "scriptVersionId",
  "expectedStudioRevision", "canonicalRecipe", "recipeHash", "profileHash", "resultId", "submissionId", "submissionState", "requestHash",
  "resultOutcome", "normalizedPayload", "payloadHash", "validatorVersion"];

async function readerBoundary(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<Array<{ safe: boolean }>>`
    SELECT (current_user=session_user AND
      has_function_privilege(current_user,'public.story_m4_test_narration_read(text,text,text,text,text)','EXECUTE') AND
      NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
        (pg_has_role(current_user,c.relowner,'MEMBER') OR
          has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
          has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE') OR
          (c.relname IN ('StoryTask','StoryTaskResult','StoryEvidenceCandidate','StoryProviderSubmission','StorySourceVerification',
            'StoryTestValidationKey','StoryTestCandidateFence','StoryNarrationDraft','StoryTestNarrationFence') AND has_table_privilege(current_user,c.oid,'SELECT')))) AND
      NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('story_m2_test_issue_decision','story_m2_test_open_fence','story_m2_test_finalize',
          'story_m2_test_claim_due','story_m2_test_checkpoint_open','story_m3_test_candidate_open','story_m3_test_candidate_finish',
          'story_m1_verification_append') AND has_function_privilege(current_user,p.oid,'EXECUTE'))
    ) safe`;
  if (!row?.safe) taskFail("STORY_TASK_INVALID", "narration.reader");
}

/** Internal server-only transaction runner shared by preparation and persistence.
 * The callback never receives a future freshness lease; locks last until commit. */
export function createNarrationContextRunner(dependencies: {
  database: PrismaClient;
  inspectMedia: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
  profile: StoryTaskProfileDefinition;
  /** Test-only coordination/fault hooks. No request can supply these. */
  beforeFenceForTest?: () => Promise<void>;
  afterComposeForTest?: () => Promise<void>;
}) {
  const access = createPersistedStoryTaskSourceAccess(dependencies.database);
  const profile = parseStoryTaskProfile(dependencies.profile);
  if (profile.kind !== "ANALYZE_EVIDENCE" || profile.providerId !== "synthetic" || profile.modelId !== "synthetic/model" ||
    profile.responseSchemaVersion !== EVIDENCE_ANALYSIS.version) taskFail("STORY_TASK_PROFILE_INVALID", "narration.profile");
  return Object.freeze({
    async run<T>(value: unknown, work: (tx: Prisma.TransactionClient, context: SyntheticNarrationContext, draft: ReturnType<typeof composeSyntheticNarration>) => Promise<T>) {
      return serviceCall(async () => {
        const r = record(value, ["scope", "candidateId", "candidateHash"], "narration.request");
        const scope = taskScope(r.scope), candidateId = id(r.candidateId, "narration.candidateId"), expectedHash = hash(r.candidateHash, "narration.candidateHash");
        const load = async (tx: Prisma.TransactionClient) => {
          await readerBoundary(tx);
          await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
          const [row] = await tx.$queryRaw<Array<{ envelope: unknown }>>`
            SELECT public.story_m4_test_narration_read(${scope.projectId},${scope.movieId},${scope.studioId},${candidateId},${expectedHash}) envelope`;
          if (!row?.envelope) taskFail("STORY_TASK_SCOPE_MISMATCH", "narration.candidate");
          canonicalJson(row.envelope, EVIDENCE_ANALYSIS.maxBytes + profile.limits.responseBytes + 32768);
          const envelope = record(row.envelope, ["candidate", "binding"], "narration.envelope");
          return { c: record(envelope.candidate, candidateFields, "narration.stored"), b: record(envelope.binding, bindingFields, "narration.binding") };
        };
        // First scoped read captures private media location only on the server.
        // Inspect outside locks; the second read and M1 reconstruction recheck
        // all dependencies after any source writer or Studio update has committed.
        const initial = await access.transaction(async tx => {
          await load(tx);
          const movie = await tx.movie.findUnique({ where: { id: scope.movieId }, select: { projectId: true, storageKey: true } });
          if (!movie || movie.projectId !== scope.projectId) taskFail("STORY_TASK_SCOPE_MISMATCH", "narration.movie");
          return movie;
        });
        const media = await dependencies.inspectMedia(initial.storageKey);
        await dependencies.beforeFenceForTest?.();
        return access.transaction(async tx => {
          const { c, b } = await load(tx); // Project → Movie → Studio → Task locks held through commit
          if (c.id !== candidateId || c.candidateHash !== expectedHash || b.projectId !== scope.projectId || b.movieId !== scope.movieId ||
            b.studioId !== scope.studioId || c.taskId !== b.taskId || c.generation !== b.generation || c.resultId !== b.resultId ||
            c.resultHash !== b.payloadHash || c.recipeHash !== b.recipeHash || c.profileHash !== b.profileHash ||
            c.sourceSnapshotId !== b.sourceSnapshotId || c.expectedStudioRevision !== b.expectedStudioRevision)
            taskFail("STORY_TASK_RESULT_STALE", "narration.binding");
          literal(c.schemaVersion, EVIDENCE_ANALYSIS.version, "narration.schemaVersion");
          literal(c.origin, "SYNTHETIC_TEST", "narration.origin"); literal(c.validationStatus, "STRUCTURALLY_GROUNDED", "narration.validationStatus");
          literal(b.state, "COMPLETED", "narration.state"); literal(b.kind, "ANALYZE_EVIDENCE", "narration.kind");
          literal(b.submissionState, "RESOLVED", "narration.submissionState"); literal(b.resultOutcome, "VALIDATED_CANDIDATE", "narration.resultOutcome");
          literal(b.validatorVersion, "synthetic-v1", "narration.validatorVersion");
          const taskId = id(b.taskId, "narration.taskId"), generation = integer(b.generation, "narration.generation", 1_000_000);
          const selection = { ...scope, sourceSnapshotId: id(b.sourceSnapshotId, "narration.snapshotId"),
            scriptVersionId: nullable(b.scriptVersionId, v => id(v, "narration.scriptVersionId")),
            expectedStudioRevision: integer(b.expectedStudioRevision, "narration.revision") };
          if (selection.scriptVersionId !== null) taskFail("STORY_TASK_SOURCE_STALE", "narration.script");
          const handle = await access.load(tx, selection, media);
          const recipeBytes = text(b.canonicalRecipe, 16384, "narration.recipe");
          const recipe = await access.validateRecipe(tx, JSON.parse(recipeBytes), handle, profile);
          const current = await access.inspect(tx, handle);
          if (recipe.canonicalRecipe !== recipeBytes || recipe.recipeHash !== b.recipeHash || current.script !== null ||
            contractHash("story-task-profile-v1", profile) !== b.profileHash || current.source.sourceContentHash !== c.sourceContentHash ||
            current.source.sourceContextHash !== c.sourceContextHash || current.source.payload.preparation?.dependencyHash !== c.sourceDependencyHash ||
            current.source.payload.preparation?.sourceBindingHash !== c.sourceBindingHash)
            taskFail("STORY_TASK_SOURCE_STALE", "narration.currentness");
          const candidateBytes = text(c.canonicalPayload, EVIDENCE_ANALYSIS.maxBytes, "narration.candidateBytes");
          const candidate = validateEvidenceAnalysisCandidate(JSON.parse(candidateBytes), current.source, recipe,
            storyTaskGenerationIdentity({ taskId, generation }), profile);
          if (canonicalJson(candidate.payload) !== candidateBytes || candidate.candidateHash !== expectedHash)
            taskFail("STORY_TASK_RESULT_STALE", "narration.candidateHash");
          const context: SyntheticNarrationContext = { source: current.source, recipe, profile, candidate,
            record: { candidateId, candidateHash: expectedHash, candidateSchemaVersion: candidate.payload.schemaVersion, candidateOrigin: candidate.payload.origin,
              taskId, generation, resultId: id(b.resultId, "narration.resultId"), resultHash: hash(b.payloadHash, "narration.resultHash"),
              submissionId: id(b.submissionId, "narration.submissionId"), recipeHash: recipe.recipeHash, profileDefinitionHash: hash(b.profileHash, "narration.profileHash") },
            result: { state: "COMPLETED", submissionState: "RESOLVED", outcome: "VALIDATED_CANDIDATE", taskId, generation,
              resultId: id(b.resultId, "narration.resultId"), submissionId: id(b.submissionId, "narration.submissionId"),
              requestHash: hash(b.requestHash, "narration.requestHash"), canonicalMarker: text(b.normalizedPayload, profile.limits.responseBytes, "narration.resultMarker"),
              resultHash: hash(b.payloadHash, "narration.resultHash") } };
          const composed = composeSyntheticNarration(context), draft = validateSyntheticNarrationDraft(composed.payload, context);
          await dependencies.afterComposeForTest?.();
          await access.inspect(tx, handle); // final authoritative check before returning/committing
          await media.assertUnchanged();
          const result = await work(tx, context, draft);
          await access.inspect(tx, handle);
          await media.assertUnchanged();
          return result;
        });
      });
    },
  });
}
