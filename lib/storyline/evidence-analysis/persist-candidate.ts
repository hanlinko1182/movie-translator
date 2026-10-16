import "server-only";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "../canonical";
import type { InspectedStorylineMedia } from "../media";
import type { StoryTaskProfileDefinition } from "../jobs/contracts";
import { taskFail, StoryTaskContractError } from "../jobs/errors";
import { parseStoryFakeResult } from "../jobs/fake-transport";
import { createPersistedStoryTaskSourceAccess } from "../jobs/persisted-source";
import { parseStoryTaskProfile, storyTaskGenerationIdentity } from "../jobs/recipe";
import { restrictedTransactions, serviceCall, taskScope } from "../jobs/service-boundary";
import { hash, id, integer, nullable, record, text } from "../validation";
import { EVIDENCE_ANALYSIS } from "./contracts";
import { validateEvidenceAnalysisCandidate } from "./validate";

const bindingFields = ["taskId", "generation", "state", "kind", "projectId", "movieId", "studioId",
  "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "sourceDependencyHash", "sourceBindingHash",
  "scriptVersionId", "expectedStudioRevision", "canonicalRecipe", "recipeHash", "profileHash",
  "resultId", "submissionId", "submissionState", "requestHash", "resultOutcome",
  "normalizedPayload", "payloadHash", "validatorVersion"] as const;

/** Explicit synthetic, disposable-only composition. Neither database is opened
 * from application configuration; the 32-byte test key is never serialized. */
export function createSyntheticEvidenceCandidatePersistence(dependencies: {
  writerDatabase: PrismaClient;
  readerDatabase: PrismaClient;
  inspectMedia: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
  profile: StoryTaskProfileDefinition;
  validationKey: Buffer;
  /** Disposable fault injection; never installed by application bootstrap. */
  afterInsertForTest?: () => Promise<void>;
}) {
  const profile = parseStoryTaskProfile(dependencies.profile);
  if (profile.kind !== "ANALYZE_EVIDENCE" || profile.execution !== "PAID_TEXT" ||
    profile.providerId !== "synthetic" || profile.modelId !== "synthetic/model" ||
    profile.responseSchemaVersion !== EVIDENCE_ANALYSIS.version ||
    !Buffer.isBuffer(dependencies.validationKey) || dependencies.validationKey.length !== 32)
    taskFail("STORY_TASK_PROFILE_INVALID", "candidate.profile");
  const access = createPersistedStoryTaskSourceAccess(dependencies.writerDatabase);
  const readTransaction = restrictedTransactions(dependencies.readerDatabase, "READER");

  function request(value: unknown, withCandidate: boolean) {
    const row = record(value, withCandidate ? ["scope", "taskId", "generation", "candidate"] :
      ["scope", "taskId", "generation"], "candidate.request");
    return { scope: taskScope(row.scope), taskId: id(row.taskId, "candidate.taskId"),
      generation: integer(row.generation, "candidate.generation", 1_000_000), candidate: row.candidate };
  }

  return Object.freeze({
    async persist(value: unknown) {
      return serviceCall(async () => {
        const r = request(value, true);
        canonicalJson(r.candidate, Math.min(EVIDENCE_ANALYSIS.maxBytes, profile.limits.responseBytes));
        const movie = await dependencies.writerDatabase.movie.findUnique({ where: { id: r.scope.movieId },
          select: { projectId: true, storageKey: true } });
        if (!movie || movie.projectId !== r.scope.projectId) taskFail("STORY_TASK_SCOPE_MISMATCH", "candidate.movie");
        const media = await dependencies.inspectMedia(movie.storageKey);
        return access.transaction(async tx => {
          // Opening the gateway takes Project -> Movie -> Studio -> Task locks.
          // All authoritative reconstruction and final insertion use this SAME
          // restricted PostgreSQL transaction and its cooperating source locks.
          const [opened] = await tx.$queryRaw<Array<{ opened: unknown }>>`
            SELECT public.story_m3_test_candidate_open(${r.scope.projectId},${r.scope.movieId},
              ${r.scope.studioId},${r.taskId},${r.generation}::integer) opened`;
          const envelope = record(opened?.opened, ["challenge", "binding"], "candidate.open");
          const challenge = text(envelope.challenge, 4096, "candidate.challenge");
          const b = record(envelope.binding, bindingFields, "candidate.binding");
          if (id(b.taskId, "candidate.binding.taskId") !== r.taskId ||
            integer(b.generation, "candidate.binding.generation") !== r.generation ||
            id(b.projectId, "candidate.binding.projectId") !== r.scope.projectId ||
            id(b.movieId, "candidate.binding.movieId") !== r.scope.movieId ||
            id(b.studioId, "candidate.binding.studioId") !== r.scope.studioId ||
            b.state !== "COMPLETED" || b.kind !== "ANALYZE_EVIDENCE" ||
            b.submissionState !== "RESOLVED" || b.resultOutcome !== "VALIDATED_CANDIDATE")
            taskFail("STORY_TASK_RESULT_STALE", "candidate.binding");
          const resultId = id(b.resultId, "candidate.resultId");
          const submissionId = id(b.submissionId, "candidate.submissionId");
          const requestHash = hash(b.requestHash, "candidate.requestHash");
          const markerBytes = text(b.normalizedPayload, profile.limits.responseBytes, "candidate.result");
          const marker = parseStoryFakeResult(markerBytes,
            { submissionId, taskId: r.taskId, generation: r.generation, requestHash }, profile.limits.responseBytes);
          if (marker.outcome !== "SUCCESS" || marker.canonical !== markerBytes ||
            marker.hash !== hash(b.payloadHash, "candidate.resultHash") || b.validatorVersion !== "synthetic-v1")
            taskFail("STORY_TASK_RESULT_STALE", "candidate.result");
          const recipeBytes = text(b.canonicalRecipe, 16384, "candidate.recipe");
          const recipe = JSON.parse(recipeBytes) as unknown;
          if (canonicalJson(recipe) !== recipeBytes ||
            contractHash("story-task-recipe-v1", recipe) !== hash(b.recipeHash, "candidate.recipeHash") ||
            contractHash("story-task-profile-v1", profile) !== hash(b.profileHash, "candidate.profileHash"))
            taskFail("STORY_TASK_SOURCE_STALE", "candidate.recipe");
          const snapshotId = id(b.sourceSnapshotId, "candidate.snapshotId");
          if (nullable(b.scriptVersionId, v => id(v, "candidate.scriptVersionId")) !== null)
            taskFail("STORY_TASK_SOURCE_STALE", "candidate.script");
          const studioRevision = integer(b.expectedStudioRevision, "candidate.studioRevision");
          const selection = { ...r.scope, sourceSnapshotId: snapshotId, scriptVersionId: null,
            expectedStudioRevision: studioRevision };
          const handle = await access.load(tx, selection, media);
          const current = await access.inspect(tx, handle);
          const identity = await access.validateRecipe(tx, recipe, handle, profile);
          if (identity.canonicalRecipe !== recipeBytes || identity.recipeHash !== b.recipeHash ||
            current.source.payload.id !== snapshotId || current.script !== null ||
            current.source.sourceContentHash !== hash(b.sourceContentHash, "candidate.sourceContentHash") ||
            current.source.sourceContextHash !== hash(b.sourceContextHash, "candidate.sourceContextHash") ||
            current.source.payload.preparation?.dependencyHash !== hash(b.sourceDependencyHash, "candidate.dependencyHash") ||
            current.source.payload.preparation?.sourceBindingHash !== hash(b.sourceBindingHash, "candidate.bindingHash"))
            taskFail("STORY_TASK_SOURCE_STALE", "candidate.currentness");
          const validated = validateEvidenceAnalysisCandidate(r.candidate, current.source, identity,
            storyTaskGenerationIdentity({ taskId: r.taskId, generation: r.generation }), profile);
          if (validated.payload.origin !== "SYNTHETIC_TEST") taskFail("STORY_TASK_INVALID", "candidate.origin");
          const bytes = canonicalJson(validated.payload, EVIDENCE_ANALYSIS.maxBytes);
          const candidateHash = contractHash(EVIDENCE_ANALYSIS.hashDomain, validated.payload);
          if (candidateHash !== validated.candidateHash) taskFail("STORY_TASK_INVALID", "candidate.hash");
          await media.assertUnchanged();
          const proof = createHmac("sha256", dependencies.validationKey)
            .update(`${challenge}\n${candidateHash}`, "utf8").digest("hex");
          const [finished] = await tx.$queryRaw<Array<{ receipt: unknown }>>`
            SELECT public.story_m3_test_candidate_finish(${r.taskId},${r.generation}::integer,
              ${bytes},${candidateHash},${proof}) receipt`;
          await media.assertUnchanged();
          const receipt = record(finished?.receipt,
            ["id", "taskId", "generation", "candidateHash", "resultId", "validatedAt", "validationStatus", "origin"],
            "candidate.receipt");
          if (receipt.taskId !== r.taskId || receipt.generation !== r.generation ||
            receipt.candidateHash !== candidateHash || receipt.resultId !== resultId ||
            receipt.validationStatus !== "STRUCTURALLY_GROUNDED" || receipt.origin !== "SYNTHETIC_TEST")
            taskFail("STORY_TASK_INVALID", "candidate.receipt");
          await dependencies.afterInsertForTest?.();
          return Object.freeze({ id: id(receipt.id, "candidate.receipt.id"), taskId: r.taskId,
            generation: r.generation, resultId, candidateHash, sourceSnapshotId: snapshotId,
            recipeHash: identity.recipeHash, validatedAt: text(receipt.validatedAt, 64, "candidate.receipt.validatedAt"),
            trust: "PROVISIONAL_CANDIDATE" as const, validationStatus: "STRUCTURALLY_GROUNDED" as const,
            humanApproval: "NONE" as const });
        });
      });
    },
    async read(value: unknown) {
      return serviceCall(async () => {
        const r = request(value, false);
        const stored = await readTransaction(async tx => {
          const [row] = await tx.$queryRaw<Array<{ candidate: unknown }>>`
            SELECT public.story_m3_test_candidate_read(${r.scope.projectId},${r.scope.movieId},
              ${r.scope.studioId},${r.taskId},${r.generation}::integer) candidate`;
          return row?.candidate;
        });
        if (stored === null || stored === undefined) return Object.freeze({ status: "MISSING" as const, humanApproval: "NONE" as const });
        const c = record(stored, ["id", "taskId", "generation", "resultId", "resultHash",
          "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "sourceDependencyHash", "sourceBindingHash",
          "expectedStudioRevision", "recipeHash", "profileHash", "schemaVersion", "canonicalPayload",
          "candidateHash", "validationStatus", "origin", "validatedAt"], "candidate.stored");
        if (c.taskId !== r.taskId || c.generation !== r.generation || c.schemaVersion !== EVIDENCE_ANALYSIS.version ||
          c.validationStatus !== "STRUCTURALLY_GROUNDED" || c.origin !== "SYNTHETIC_TEST")
          taskFail("STORY_TASK_INVALID", "candidate.stored");
        const bytes = text(c.canonicalPayload, EVIDENCE_ANALYSIS.maxBytes, "candidate.stored.payload");
        const payload = JSON.parse(bytes) as unknown;
        if (canonicalJson(payload) !== bytes || contractHash(EVIDENCE_ANALYSIS.hashDomain, payload) !== c.candidateHash)
          taskFail("STORY_TASK_INVALID", "candidate.stored.hash");
        const movie = await dependencies.writerDatabase.movie.findUnique({ where: { id: r.scope.movieId },
          select: { projectId: true, storageKey: true } });
        if (!movie || movie.projectId !== r.scope.projectId) taskFail("STORY_TASK_SCOPE_MISMATCH", "candidate.movie");
        let current = false;
        try {
          const media = await dependencies.inspectMedia(movie.storageKey);
          current = await access.transaction(async tx => {
            const handle = await access.load(tx, { ...r.scope, sourceSnapshotId: id(c.sourceSnapshotId, "candidate.snapshotId"),
              scriptVersionId: null, expectedStudioRevision: integer(c.expectedStudioRevision, "candidate.revision") }, media);
            const source = (await access.inspect(tx, handle)).source;
            await media.assertUnchanged();
            return source.sourceContentHash === c.sourceContentHash && source.sourceContextHash === c.sourceContextHash &&
              source.payload.preparation?.dependencyHash === c.sourceDependencyHash &&
              source.payload.preparation?.sourceBindingHash === c.sourceBindingHash;
          }, { readOnly: true });
        } catch (error) {
          if (!(error instanceof StoryTaskContractError)) throw error;
        }
        return Object.freeze({ status: current ? "VALIDATED_CURRENT" as const : "STALE_DEPENDENCIES" as const,
          humanApproval: "NONE" as const, trust: "PROVISIONAL_CANDIDATE" as const,
          id: id(c.id, "candidate.id"), taskId: r.taskId, generation: r.generation,
          resultId: id(c.resultId, "candidate.resultId"), candidateHash: hash(c.candidateHash, "candidate.hash"),
          sourceSnapshotId: id(c.sourceSnapshotId, "candidate.snapshotId"),
          validatedAt: text(c.validatedAt, 64, "candidate.validatedAt"),
          candidate: payload });
      });
    },
  });
}
