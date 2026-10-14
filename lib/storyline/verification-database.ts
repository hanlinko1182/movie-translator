import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { VerificationSecurityError } from "./verification-errors";

/** Probe effective privileges on the actual transaction connection, including
 * inherited and column grants. Owner/superuser/DDL identities are never runtime. */
export async function assertVerificationDatabaseBoundary(tx: Prisma.TransactionClient, purpose: "ISSUER" | "READER") {
  try {
    const [row] = await tx.$queryRaw<Array<{ safe: boolean; append: boolean; lock: boolean }>>`
      SELECT (
        NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolbypassrls AND NOT r.rolreplication AND
        NOT s.rolsuper AND NOT s.rolcreaterole AND NOT s.rolcreatedb AND NOT s.rolbypassrls AND
        NOT EXISTS (SELECT 1 FROM pg_roles privileged WHERE
          (privileged.rolsuper OR privileged.rolcreaterole OR privileged.rolcreatedb OR privileged.rolbypassrls OR privileged.rolreplication) AND
          (pg_has_role(current_user, privileged.oid, 'MEMBER') OR pg_has_role(session_user, privileged.oid, 'MEMBER'))) AND
        NOT pg_has_role(current_user, c.relowner, 'MEMBER') AND NOT pg_has_role(session_user, c.relowner, 'MEMBER') AND
        NOT has_schema_privilege(current_user, 'public', 'CREATE') AND
        NOT has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AND
        NOT has_any_column_privilege(current_user, c.oid, 'INSERT,UPDATE') AND
        current_setting('session_replication_role') = 'origin' AND
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND tgname='StorySourceVerification_append_guard' AND tgenabled='O') AND
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND tgname='StorySourceVerification_append_only' AND tgenabled='O') AND
        NOT EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
          WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE') AND
        (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname IN ('story_m1_verification_append','story_m1_verification_lock') AND
          p.prosecdef AND p.proowner=c.relowner AND p.proconfig @> ARRAY['search_path=pg_catalog, public'] AND
          NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
      ) AS safe,
      has_function_privilege(current_user, 'public.story_m1_verification_append(text,text,text)', 'EXECUTE') AS append,
      has_function_privilege(current_user, 'public.story_m1_verification_lock(text,text,text)', 'EXECUTE') AS lock
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
        pg_roles r, pg_roles s
      WHERE n.nspname='public' AND c.relname='StorySourceVerification' AND r.rolname=current_user AND s.rolname=session_user
    `;
    if (!row?.safe || row.append !== (purpose === "ISSUER") || row.lock !== (purpose === "ISSUER")) throw new Error();
  } catch { throw new VerificationSecurityError("VERIFICATION_DATABASE_UNSAFE"); }
}
