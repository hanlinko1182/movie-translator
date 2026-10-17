import "server-only";
import { createHmac } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "../canonical";
import { StoryTaskContractError, taskFail } from "../jobs/errors";
import { createPersistedStoryTaskSourceAccess } from "../jobs/persisted-source";
import { serviceCall, taskScope } from "../jobs/service-boundary";
import { NARRATION_DRAFT } from "../narration/contracts";
import { validateSyntheticNarrationDraft } from "../narration/validate";
import { freeze, hash, id, literal, record, text } from "../validation";
import { createNarrationContextRunner } from "./context-access";

async function persistenceBoundary(tx: Prisma.TransactionClient, write: boolean) {
  const [r] = await tx.$queryRaw<Array<{ safe: boolean }>>`
    SELECT (current_user=session_user AND
      has_function_privilege(current_user,'public.story_m4_test_draft_read(text,text,text,text)','EXECUTE') AND
      has_function_privilege(current_user,'public.story_m4_test_narration_open(text,text,text,text,text)','EXECUTE')=${write} AND
      has_function_privilege(current_user,'public.story_m4_test_narration_finish(text,text,text,text)','EXECUTE')=${write} AND
      NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
        (pg_has_role(current_user,c.relowner,'MEMBER') OR has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
          has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE') OR
          (c.relname IN ('StoryNarrationDraft','StoryTestNarrationFence','StoryTestValidationKey') AND has_table_privilege(current_user,c.oid,'SELECT'))))
    ) safe`;
  if (!r?.safe) taskFail("STORY_TASK_INVALID", "narration.persistence.database");
}

/** Explicit disposable-only composition. Key and restricted connections are
 * server dependencies, never request data. No provider/worker/API bootstrap. */
export function createProvisionalNarrationPersistence(dependencies: Parameters<typeof createNarrationContextRunner>[0] & {
  readerDatabase: PrismaClient;
  validationKey: Buffer;
  afterInsertForTest?: () => Promise<void>;
}) {
  if (!Buffer.isBuffer(dependencies.validationKey) || dependencies.validationKey.length !== 32)
    taskFail("STORY_TASK_INVALID", "narration.persistence.key");
  const writer = createNarrationContextRunner(dependencies);
  const reader = createNarrationContextRunner({ ...dependencies, database: dependencies.readerDatabase,
    beforeFenceForTest: undefined, afterComposeForTest: undefined });
  const reads = createPersistedStoryTaskSourceAccess(dependencies.readerDatabase);
  return Object.freeze({
    async persist(value: unknown) {
      return serviceCall(async () => {
        const r = record(value, ["scope", "candidateId", "candidateHash", "draft"], "narration.persist");
        const selection = { scope: taskScope(r.scope), candidateId: id(r.candidateId, "narration.candidateId"),
          candidateHash: hash(r.candidateHash, "narration.candidateHash") };
        const proposed = record(r.draft, ["payload", "draftHash"], "narration.draft");
        canonicalJson(proposed, NARRATION_DRAFT.maxBytes + 256);
        return writer.run(selection, async (tx, context) => {
          await persistenceBoundary(tx, true);
          const draft = validateSyntheticNarrationDraft(proposed.payload, context);
          if (hash(proposed.draftHash, "narration.draftHash") !== draft.draftHash)
            taskFail("STORY_TASK_RESULT_STALE", "narration.draftHash");
          const bytes = canonicalJson(draft.payload, NARRATION_DRAFT.maxBytes);
          const [opened] = await tx.$queryRaw<Array<{ challenge: string }>>`
            SELECT public.story_m4_test_narration_open(${selection.scope.projectId},${selection.scope.movieId},${selection.scope.studioId},
              ${selection.candidateId},${selection.candidateHash}) challenge`;
          const challenge = text(opened?.challenge, 4096, "narration.challenge");
          const proof = createHmac("sha256", dependencies.validationKey).update(`${challenge}\n${draft.draftHash}`, "utf8").digest("hex");
          const [finished] = await tx.$queryRaw<Array<{ receipt: unknown }>>`
            SELECT public.story_m4_test_narration_finish(${selection.candidateId},${bytes},${draft.draftHash},${proof}) receipt`;
          const receipt = record(finished?.receipt, ["id", "draftHash", "candidateId", "candidateHash", "createdAt"], "narration.receipt");
          if (receipt.draftHash !== draft.draftHash || receipt.candidateId !== selection.candidateId || receipt.candidateHash !== selection.candidateHash)
            taskFail("STORY_TASK_INVALID", "narration.receipt");
          await dependencies.afterInsertForTest?.();
          // The shared runner rechecks authoritative source/media AFTER insert,
          // before commit. Any failure rolls back both narration and fence writes.
          return freeze({ id: id(receipt.id, "narration.receipt.id"), draftHash: draft.draftHash,
            candidateId: selection.candidateId, candidateHash: selection.candidateHash,
            createdAt: text(receipt.createdAt, 64, "narration.createdAt"), persisted: true,
            trust: "PROVISIONAL_SYNTHETIC_DRAFT", humanApproval: "NONE", sourceVerified: false,
            currentness: "CURRENT_AT_VALIDATION" });
        });
      });
    },
    async read(value: unknown) {
      return serviceCall(async () => {
        const r = record(value, ["scope", "narrationId"], "narration.read");
        const scope = taskScope(r.scope), narrationId = id(r.narrationId, "narration.id");
        const stored = await reads.transaction(async tx => {
          await persistenceBoundary(tx, false);
          const [row] = await tx.$queryRaw<Array<{ draft: unknown }>>`
            SELECT public.story_m4_test_draft_read(${scope.projectId},${scope.movieId},${scope.studioId},${narrationId}) draft`;
          return row?.draft;
        }, { readOnly: true });
        if (stored === null || stored === undefined) return freeze({ status: "MISSING", humanApproval: "NONE", sourceVerified: false });
        const c = record(stored, ["id", "candidateId", "candidateHash", "draftHash", "canonicalPayload", "schemaVersion", "composerVersion", "createdAt", "currentBinding"], "narration.stored");
        literal(c.schemaVersion, NARRATION_DRAFT.version, "narration.stored.schemaVersion");
        literal(c.composerVersion, NARRATION_DRAFT.composerVersion, "narration.stored.composerVersion");
        const bytes = text(c.canonicalPayload, NARRATION_DRAFT.maxBytes, "narration.stored.bytes");
        const payload: unknown = JSON.parse(bytes);
        if (c.id !== narrationId || canonicalJson(payload, NARRATION_DRAFT.maxBytes) !== bytes || contractHash(NARRATION_DRAFT.hashDomain, payload) !== c.draftHash ||
          typeof c.currentBinding !== "boolean") taskFail("STORY_TASK_INVALID", "narration.stored.hash");
        const candidateId = id(c.candidateId, "narration.stored.candidateId"), candidateHash = hash(c.candidateHash, "narration.stored.candidateHash");
        let current = false;
        if (c.currentBinding) {
          try {
            current = await reader.run({ scope, candidateId, candidateHash }, async (_tx, context) => {
              const validated = validateSyntheticNarrationDraft(payload, context);
              if (validated.draftHash !== c.draftHash) taskFail("STORY_TASK_INVALID", "narration.stored.validation");
              return true;
            });
          } catch (error) {
            if (!(error instanceof StoryTaskContractError) || error.code !== "STORY_TASK_SOURCE_STALE") throw error;
          }
        }
        return freeze({ status: current ? "PROVISIONAL_CURRENT_AT_READ" : "STALE_DEPENDENCIES", persisted: true,
          trust: "PROVISIONAL_SYNTHETIC_DRAFT", humanApproval: "NONE", sourceVerified: false,
          id: narrationId, candidateId, candidateHash, draftHash: hash(c.draftHash, "narration.stored.draftHash"),
          createdAt: text(c.createdAt, 64, "narration.stored.createdAt"), payload });
      });
    },
  });
}
