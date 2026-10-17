import "server-only";
import { createHmac } from "node:crypto";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { canonicalJson } from "../canonical";
import type { StoryTaskScope } from "../jobs/service-boundary";
import { STUDIO_EDIT, type OriginalIdentity } from "./contracts";
import { rejectVersion } from "./errors";
import type { VerifiedStudioEditor } from "./synthetic-auth";

export function requireStudioDatabase(database: PrismaClient) {
  if (!database || database.constructor !== PrismaClient || typeof database.$transaction !== "function") rejectVersion("R4_DATABASE_UNSAFE");
}
export async function assertStudioDatabase(tx: Prisma.TransactionClient, write: boolean) {
  // The catalog probe itself must not resolve caller-created temporary
  // relations ahead of pg_catalog. This setting is transaction-local.
  await tx.$executeRaw`SET LOCAL search_path=pg_catalog,public,pg_temp`;
  const [row] = await tx.$queryRaw<Array<{ safe: boolean }>>`
    SELECT (current_user=session_user AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND
      NOT EXISTS(SELECT 1 FROM pg_roles privileged WHERE (privileged.rolsuper OR privileged.rolcreatedb OR privileged.rolcreaterole OR privileged.rolreplication OR privileged.rolbypassrls)
        AND pg_has_role(session_user,privileged.oid,'MEMBER')) AND
      NOT has_schema_privilege(current_user,'public','CREATE') AND current_setting('session_replication_role')='origin' AND
      NOT pg_has_role(current_user,'pg_read_server_files','MEMBER') AND NOT pg_has_role(current_user,'pg_write_server_files','MEMBER') AND
      NOT pg_has_role(current_user,'pg_execute_server_program','MEMBER') AND
      NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND
        (pg_has_role(current_user,c.relowner,'MEMBER') OR has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
          has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE') OR
          (c.relname NOT IN ('Project','Movie','Transcript','TranscriptSegment','Translation','TranslatedSegment','TranslationQcIssue','Scene',
            'CharacterAnalysisRun','Character','CharacterAlias','CharacterEvidence','CharacterRelationship','CharacterRelationshipEvidence','Recap','RecapSection',
            'RecapCharacterInsight','RecapRelationshipInsight','RecapEvidence','StorylineStudio','StorySourceSnapshot','StoryScriptVersion') AND
            (has_table_privilege(current_user,c.oid,'SELECT') OR has_any_column_privilege(current_user,c.oid,'SELECT'))))) AND
      NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='public' AND f.prosecdef AND
        f.proname NOT IN('story_m4_test_draft_read','story_m4_test_narration_read','story_r4_read','story_r4_save_open','story_r4_save_finish') AND
        has_function_privilege(current_user,f.oid,'EXECUTE')) AND
      has_function_privilege(current_user,'public.story_r4_read(text,text)','EXECUTE') AND
      has_function_privilege(current_user,'public.story_r4_save_open(text,text,text)','EXECUTE')=${write} AND
      has_function_privilege(current_user,'public.story_r4_save_finish(text,text,text)','EXECUTE')=${write} AND
      (SELECT count(*)=4 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN('StoryNarrationDraft','StoryR4EditedVersion') AND NOT t.tgisinternal AND t.tgenabled='O' AND
          t.tgname IN('StoryNarrationDraft_immutable','StoryNarrationDraft_no_truncate','StoryR4EditedVersion_immutable','StoryR4EditedVersion_no_truncate')) AND
      (SELECT count(*)=4 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='public' AND
        f.proname IN('story_r4_authorize','story_r4_read','story_r4_save_open','story_r4_save_finish') AND f.prosecdef AND
        pg_get_userbyid(f.proowner)='storyline_migration_owner' AND f.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'] AND
        NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
    ) safe FROM pg_roles r WHERE r.rolname=current_user`;
  if (!row?.safe) rejectVersion("R4_DATABASE_UNSAFE");
}
export async function studioReadTransaction<T>(database: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>, writeRole = false) {
  return database.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await assertStudioDatabase(tx, writeRole);
    return work(tx);
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 20000 });
}
export async function signStudioAuthorization(tx: Prisma.TransactionClient, key: Buffer, editor: VerifiedStudioEditor, scope: StoryTaskScope,
  action: "ORIGINAL" | "VERSION" | "HISTORY" | "SAVE", original: OriginalIdentity,
  options: { versionId?: string; afterVersion?: number; limit?: number; proposalHash?: string } = {}) {
  const [context] = await tx.$queryRaw<Array<{ pid: number; stamp: string }>>`SELECT pg_backend_pid() pid,transaction_timestamp()::text stamp`;
  const bytes = canonicalJson({ schemaVersion: STUDIO_EDIT.authDomain, editor, scope, action, original,
    versionId: options.versionId ?? null, afterVersion: options.afterVersion ?? 0, limit: options.limit ?? 1,
    proposalHash: options.proposalHash ?? null, pid: context.pid, transactionStamp: context.stamp }, 8192);
  const proof = createHmac("sha256", key).update(`${STUDIO_EDIT.authDomain}\n${bytes}`, "utf8").digest("hex");
  return { bytes, proof };
}
