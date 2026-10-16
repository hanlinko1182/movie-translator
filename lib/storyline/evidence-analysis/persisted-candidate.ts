import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "../canonical";
import type { InspectedStorylineMedia } from "../media";
import type { StoryTaskProfileDefinition } from "../jobs/contracts";
import { taskFail } from "../jobs/errors";
import { parseStoryFakeResult } from "../jobs/fake-transport";
import { createPersistedStoryTaskSourceAccess } from "../jobs/persisted-source";
import { parseStoryTaskProfile, storyTaskGenerationIdentity } from "../jobs/recipe";
import { restrictedTransactions, serviceCall, taskScope } from "../jobs/service-boundary";
import { hash, id, integer, nullable, record, text } from "../validation";
import { EVIDENCE_ANALYSIS } from "./contracts";
import { validateEvidenceAnalysisCandidate } from "./validate";

const fields = ["taskId", "generation", "state", "kind", "projectId", "movieId", "studioId", "sourceSnapshotId",
  "scriptVersionId", "expectedStudioRevision", "canonicalRecipe", "recipeHash", "profileHash", "resultId",
  "submissionId", "submissionState", "requestHash", "resultOutcome", "normalizedPayload", "payloadHash", "validatorVersion"] as const;

/** Test-only server composition. The M2 result is an immutable synthetic
 * completion marker; the separately supplied candidate is never represented
 * as persisted M2 output or as human-verified Studio content. */
export function createPersistedEvidenceCandidateValidator(dependencies: {
  sourceDatabase: PrismaClient;
  resultDatabase: PrismaClient;
  inspectMedia: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
  profile: StoryTaskProfileDefinition;
}) {
  const profile = parseStoryTaskProfile(dependencies.profile);
  if (profile.kind !== "ANALYZE_EVIDENCE" || profile.execution !== "PAID_TEXT" ||
    profile.providerId !== "synthetic" || profile.modelId !== "synthetic/model" ||
    profile.responseSchemaVersion !== EVIDENCE_ANALYSIS.version)
    taskFail("STORY_TASK_PROFILE_INVALID", "evidence.profile");
  const readResult = restrictedTransactions(dependencies.resultDatabase, "READER");
  const sourceAccess = createPersistedStoryTaskSourceAccess(dependencies.sourceDatabase);

  return Object.freeze({
    async validate(value: unknown) {
      return serviceCall(async () => {
        const request = record(value, ["scope", "taskId", "generation", "candidate"], "evidence.request");
        const scope = taskScope(request.scope), taskId = id(request.taskId, "evidence.taskId");
        const generation = integer(request.generation, "evidence.generation", 1_000_000);
        // Bound untrusted content before any database or media work.
        canonicalJson(request.candidate, Math.min(EVIDENCE_ANALYSIS.maxBytes, profile.limits.responseBytes));
        const durable = await readResult(async tx => {
          const [privilege] = await tx.$queryRaw<Array<{ safe: boolean }>>`
            SELECT has_function_privilege(current_user,
              'public.story_m3_test_evidence_result(text,text,text,text,integer)','EXECUTE') safe`;
          if (!privilege?.safe) taskFail("STORY_TASK_INVALID", "evidence.reader");
          const [row] = await tx.$queryRaw<Array<{ binding: unknown }>>`
            SELECT public.story_m3_test_evidence_result(${scope.projectId},${scope.movieId},${scope.studioId},${taskId},${generation}::integer) binding`;
          if (!row?.binding) taskFail("STORY_TASK_SCOPE_MISMATCH", "evidence.task");
          return record(row.binding, fields, "evidence.result");
        });
        if (id(durable.taskId, "evidence.result.taskId") !== taskId ||
          integer(durable.generation, "evidence.result.generation") !== generation ||
          id(durable.projectId, "evidence.result.projectId") !== scope.projectId ||
          id(durable.movieId, "evidence.result.movieId") !== scope.movieId ||
          id(durable.studioId, "evidence.result.studioId") !== scope.studioId)
          taskFail("STORY_TASK_SCOPE_MISMATCH", "evidence.result");
        if (durable.state !== "COMPLETED" || durable.kind !== "ANALYZE_EVIDENCE" ||
          durable.resultOutcome !== "VALIDATED_CANDIDATE" || durable.submissionState !== "RESOLVED")
          taskFail("STORY_TASK_RESULT_STALE", "evidence.result.state");
        const resultId = id(durable.resultId, "evidence.result.id");
        const submissionId = id(durable.submissionId, "evidence.submission.id");
        const requestHash = hash(durable.requestHash, "evidence.submission.requestHash");
        const bytes = text(durable.normalizedPayload, profile.limits.responseBytes, "evidence.result.payload");
        const parsed = parseStoryFakeResult(bytes, { submissionId, taskId, generation, requestHash }, profile.limits.responseBytes);
        if (parsed.outcome !== "SUCCESS" || parsed.canonical !== bytes ||
          parsed.hash !== hash(durable.payloadHash, "evidence.result.payloadHash") ||
          durable.validatorVersion !== "synthetic-v1") taskFail("STORY_TASK_RESULT_STALE", "evidence.result.payload");
        const recipeBytes = text(durable.canonicalRecipe, 16384, "evidence.recipe");
        const recipe = JSON.parse(recipeBytes) as unknown;
        if (canonicalJson(recipe) !== recipeBytes ||
          contractHash("story-task-recipe-v1", recipe) !== hash(durable.recipeHash, "evidence.recipeHash") ||
          contractHash("story-task-profile-v1", profile) !== hash(durable.profileHash, "evidence.profileHash"))
          taskFail("STORY_TASK_SOURCE_STALE", "evidence.recipe");
        const sourceSnapshotId = id(durable.sourceSnapshotId, "evidence.sourceSnapshotId");
        const scriptVersionId = nullable(durable.scriptVersionId, v => id(v, "evidence.scriptVersionId"));
        if (scriptVersionId !== null) taskFail("STORY_TASK_SOURCE_STALE", "evidence.scriptVersionId");
        const expectedStudioRevision = integer(durable.expectedStudioRevision, "evidence.studioRevision");
        const movie = await dependencies.sourceDatabase.movie.findUnique({ where: { id: scope.movieId },
          select: { projectId: true, storageKey: true } });
        if (!movie || movie.projectId !== scope.projectId) taskFail("STORY_TASK_SCOPE_MISMATCH", "evidence.movie");
        const media = await dependencies.inspectMedia(movie.storageKey);
        return sourceAccess.transaction(async tx => {
          const selection = { ...scope, sourceSnapshotId, scriptVersionId, expectedStudioRevision };
          const handle = await sourceAccess.load(tx, selection, media);
          const current = await sourceAccess.inspect(tx, handle);
          const identity = await sourceAccess.validateRecipe(tx, recipe, handle, profile);
          if (identity.canonicalRecipe !== recipeBytes || identity.recipeHash !== durable.recipeHash ||
            current.source.payload.id !== sourceSnapshotId || current.script !== null)
            taskFail("STORY_TASK_SOURCE_STALE", "evidence.currentness");
          const checked = validateEvidenceAnalysisCandidate(request.candidate, current.source, identity,
            storyTaskGenerationIdentity({ taskId, generation }), profile);
          if (checked.payload.origin !== "SYNTHETIC_TEST") taskFail("STORY_TASK_INVALID", "evidence.origin");
          await media.assertUnchanged();
          return Object.freeze({ trust: "PROVISIONAL_CANDIDATE" as const,
            validationOutcome: "STRUCTURALLY_GROUNDED" as const,
            currentness: "CURRENT_AT_VALIDATION" as const,
            durableResult: Object.freeze({ taskId, generation, resultId, submissionId, resultHash: parsed.hash,
              recipeHash: identity.recipeHash, sourceSnapshotId }),
            candidate: checked });
        }, { readOnly: true });
      });
    },
  });
}
