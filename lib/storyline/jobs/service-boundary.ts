import "server-only";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { id, integer, record, StorylineContractError } from "../validation";
import { StoryTaskContractError, taskFail } from "./errors";
import { StorylinePreparationError } from "../preparation-errors";

export type StoryTaskScope = Readonly<{ projectId: string; movieId: string; studioId: string }>;

export function taskScope(value: unknown): StoryTaskScope {
  const r = record(value, ["projectId", "movieId", "studioId"], "scope");
  return Object.freeze({ projectId: id(r.projectId, "scope.projectId"), movieId: id(r.movieId, "scope.movieId"),
    studioId: id(r.studioId, "scope.studioId") });
}

export function boundedBatch(value: unknown, max: number): number {
  const result = integer(value, "batchSize", max);
  if (!result) taskFail("STORY_TASK_INVALID", "batchSize");
  return result;
}

/** Do not forward driver messages, source text or credentials through service errors. */
export async function serviceCall<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof StoryTaskContractError) throw error;
    if (error instanceof StorylineContractError) taskFail("STORY_TASK_INVALID", error.fieldPath);
    if (error instanceof StorylinePreparationError) taskFail("STORY_TASK_SOURCE_STALE", `source.${error.code}`);
    taskFail("STORY_TASK_INVALID", "service");
  }
}

/** Explicit server-bootstrap dependency, with no default datasource. These are
 * disposable reviewed gateways, not a deployment or authentication installer. */
export function restrictedTransactions(database: PrismaClient, kind: "OUTBOX" | "READER") {
  if (!database || database.constructor !== PrismaClient || typeof database.$transaction !== "function")
    taskFail("STORY_TASK_INVALID", "service.database");
  return async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => serviceCall(() =>
    database.$transaction(async tx => {
      if (kind === "READER") await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      // Inspect effective privileges, not a caller-supplied role name/flag. A
      // broad owner/runtime or combined admission/checkpoint identity fails.
      const [result] = await tx.$queryRaw<Array<{ safe: boolean }>>`
        SELECT (current_user=session_user AND
          NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolbypassrls AND NOT r.rolreplication AND
          NOT EXISTS (SELECT 1 FROM pg_roles privileged WHERE
            (privileged.rolsuper OR privileged.rolcreatedb OR privileged.rolcreaterole OR privileged.rolbypassrls OR privileged.rolreplication)
            AND pg_has_role(session_user,privileged.oid,'MEMBER')) AND
          NOT has_schema_privilege(current_user,'public','CREATE') AND current_setting('session_replication_role')='origin' AND
          NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
              (pg_has_role(current_user,c.relowner,'MEMBER') OR has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
                OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE'))) AND
          NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname IN
              ('story_m2_test_issue_decision','story_m2_test_admit','story_m2_test_open_fence','story_m2_test_finalize','story_m1_verification_append')
              AND has_function_privilege(current_user,p.oid,'EXECUTE')) AND
          CASE WHEN ${kind}='READER' THEN
            has_function_privilege(current_user,'public.story_m2_test_status(text,text,text,text,integer)','EXECUTE') AND
            NOT has_function_privilege(current_user,'public.story_m2_test_claim_due(text,text,text,integer)','EXECUTE')
          ELSE has_function_privilege(current_user,'public.story_m2_test_claim_due(text,text,text,integer)','EXECUTE') AND
            has_function_privilege(current_user,'public.story_m2_test_delivery(text,integer,integer,text,boolean)','EXECUTE') AND
            has_function_privilege(current_user,'public.story_m2_test_missing_receipt(text,integer,integer,text)','EXECUTE') AND
            NOT has_function_privilege(current_user,'public.story_m2_test_status(text,text,text,text,integer)','EXECUTE') END
        ) safe FROM pg_roles r WHERE r.rolname=current_user
      `;
      if (!result?.safe) taskFail("STORY_TASK_INVALID", "service.database");
      return run(tx);
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 20000 }));
}
