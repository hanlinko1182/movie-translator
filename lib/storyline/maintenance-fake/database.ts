import "server-only";
import { Client, type ClientConfig } from "pg";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { canonicalJson } from "../canonical";
import { authenticate, csrfHash, type Authentication } from "./auth";
import { actions, MAINTENANCE, MaintenanceError, parseContext, parseEnvelope, envelopeHash, restrictions, same, reject, type Action, type Context, type Kind } from "./contracts";
export type Connections = Record<Action, ClientConfig>;
export type Keys = Record<Action, string>;
export class MaintenanceCommitUnknown extends Error {}
export type Hooks = { beforeCommit?: (pid: number) => Promise<void>; afterCommit?: () => Promise<void> };
export async function assertMaintenanceDatabase(c: Client, action: Action) {
  const r = (await c.query(`SELECT current_user=session_user AND inet_server_addr() IS NULL AND current_database()~'^m1e15_db_[a-f0-9]{20}$'
  AND current_user~$1 AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
  AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE (p.rolsuper OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication OR p.rolbypassrls OR p.rolname IN('maintenance_m806_owner','pg_read_server_files','pg_write_server_files','pg_execute_server_program')) AND pg_has_role(session_user,p.oid,'MEMBER'))
  AND NOT has_database_privilege(current_user,current_database(),'CREATE,TEMP') AND NOT has_schema_privilege(current_user,'public','CREATE') AND pg_my_temp_schema()=0 AND current_setting('session_replication_role')='origin'
  AND (SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='maintenance_m806_owner')
  AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE (p.rolsuper OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication OR p.rolbypassrls OR p.rolname IN('pg_read_server_files','pg_write_server_files','pg_execute_server_program')) AND pg_has_role('maintenance_m806_owner',p.oid,'MEMBER'))
  AND (SELECT pg_get_userbyid(nspowner)='maintenance_m806_owner' FROM pg_namespace WHERE nspname='maintenance_m806')
  AND NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN('maintenance_m806','maintenance_m806_crypto') AND has_schema_privilege(current_user,n.oid,'CREATE'))
  AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('maintenance_m806','maintenance_m806_crypto') AND c.relkind IN('r','p','S') AND
   CASE WHEN c.relkind='S' THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE') ELSE has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)
  AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='maintenance_m806' AND c.relkind IN('r','p','S') AND pg_get_userbyid(c.relowner)<>'maintenance_m806_owner')
  AND NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='maintenance_m806' AND
   (pg_get_userbyid(f.proowner)<>'maintenance_m806_owner' OR (f.proconfig @> ARRAY['search_path=pg_catalog, maintenance_m806, pg_temp']) IS NOT TRUE
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
   OR f.oid<>to_regprocedure('maintenance_m806.'||$2||'(text,text,text)') AND has_function_privilege(current_user,f.oid,'EXECUTE')))
  AND NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='maintenance_m806_crypto' AND has_function_privilege(current_user,f.oid,'EXECUTE'))
  AND has_function_privilege(current_user,'maintenance_m806.'||$2||'(text,text,text)','EXECUTE')
  AND (SELECT count(*)=16 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='maintenance_m806' AND t.tgname IN('immutable_row','immutable_truncate') AND t.tgenabled='O')
  AND (SELECT count(*)=7 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='maintenance_m806' AND f.prosecdef)
  AND EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='maintenance_m806' AND t.tgname='transition_complete' AND t.tgdeferrable AND t.tginitdeferred AND t.tgenabled='O') safe
  FROM pg_roles r WHERE r.rolname=current_user`, [`^m806_${action}_[a-f0-9]{16}$`, action])).rows[0];
  if (!r?.safe) reject("DATABASE_UNSAFE");
}
export function createMaintenanceGatewayForTest(options: { mode: "M806_PHASE1A_DISPOSABLE_ONLY"; connections: Connections; keys: Keys; authentication: Authentication; proofTtlMs?: number; hooks?: Hooks; diagnosticForTest?: (code: string, message: string) => void }) {
  if (options.mode !== "M806_PHASE1A_DISPOSABLE_ONLY") reject("DATABASE_UNSAFE");
  const configs = {} as Connections, keys = {} as Record<Action, Buffer>;
  for (const action of actions) {
    const c = options.connections[action];
    if (!c || typeof c.host !== "string" || !/^\/tmp\/movie-translator-storyline-m1e15-[a-zA-Z0-9]+\/socket$/.test(c.host)
      || typeof c.database !== "string" || !/^m1e15_db_[a-f0-9]{20}$/.test(c.database) || typeof c.user !== "string" || !new RegExp(`^m806_${action}_[a-f0-9]{16}$`).test(c.user)
      || typeof c.password !== "string" || !/^[a-f0-9]{64}$/.test(c.password) || !/^[a-f0-9]{64}$/.test(options.keys[action])
      || !Number.isInteger(c.port) || Number(c.port) < 1 || Number(c.port) > 65535 || c.connectionString || c.ssl || c.options) reject("DATABASE_UNSAFE");
    configs[action] = { host: c.host, database: c.database, user: c.user, password: c.password, port: c.port,
      connectionTimeoutMillis: 5000, query_timeout: 15000, statement_timeout: 15000, application_name: "m806-maintenance-owned-fixture" };
    keys[action] = Buffer.from(options.keys[action], "hex");
    if (action !== "submit" && (c.host !== configs.submit.host || c.database !== configs.submit.database || c.port !== configs.submit.port)) reject("DATABASE_UNSAFE");
  }
  async function transaction<T>(action: Action, request: unknown, rawContext: Context, work: (tx: { call: (input: Record<string, unknown>) => Promise<unknown>; backendPid: number }) => Promise<T>) {
    if (!actions.includes(action)) reject("INVALID_ACTION");
    const context = parseContext(rawContext), session = authenticate(options.authentication, request, context, action), c = new Client(configs[action]);
    let committing = false, committed = false;
    try {
      await c.connect(); await c.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL search_path=pg_catalog,maintenance_m806,pg_temp");
      await assertMaintenanceDatabase(c, action);
      const backend = (await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx")).rows[0];
      const call = async (input: Record<string, unknown>) => {
        if (!same(authenticate(options.authentication, request, context, action), session)) reject("SESSION_INVALID");
        const b = JSON.parse(canonicalJson(input, 65536));
        if (action !== "health" && !session.rootIds.includes(b.rootId)) reject("ROOT_FORBIDDEN");
        if (b.fact) {
          if (action !== "evidence" || !["writer", "reader", "successor"].includes(b.kind)) reject("INVALID_FACT");
          const kind = b.kind as Kind; parseEnvelope(kind, b.fact);
          b.factProof = createHmac("sha256", keys[action]).update(`${MAINTENANCE[kind]}\n${canonicalJson({ context, rootId: b.rootId, decisionId: b.id, revision: b.revision, kind, factHash: envelopeHash(kind, b.fact), backendPid: Number(backend.pid), transactionId: backend.tx })}`).digest("hex");
        }
        const bytes = canonicalJson(b, 65536), now = Number((await c.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0].now);
        const wire = canonicalJson({ schemaVersion: MAINTENANCE.access, ...context, restrictions, sessionId: session.id, principalId: session.principalId,
          action, bodyHash: createHash("sha256").update(bytes).digest("hex"), nonce: randomBytes(24).toString("hex"), backendPid: Number(backend.pid), transactionId: backend.tx,
          expiresAtMs: now + (options.proofTtlMs ?? 3000), method: action === "read" || action === "health" ? "GET" : "POST", origin: session.origin, fetchSite: "same-origin", csrfHash: csrfHash(session.csrf) });
        const mac = createHmac("sha256", keys[action]).update(`${MAINTENANCE.access}\n${wire}`).digest("hex");
        return (await c.query(`SELECT maintenance_m806.${action}($1,$2,$3) value`, [wire, mac, bytes])).rows[0].value;
      };
      const value = await work({ call, backendPid: Number(backend.pid) });
      await options.hooks?.beforeCommit?.(Number(backend.pid));
      if (!same(authenticate(options.authentication, request, context, action), session)) reject("SESSION_INVALID");
      committing = true; await c.query("COMMIT"); committed = true; await options.hooks?.afterCommit?.(); return value;
    } catch (e) {
      if (!committed) await c.query("ROLLBACK").catch(() => {});
      if (e instanceof MaintenanceError) throw e;
      const message = e instanceof Error ? e.message : "", code = String((e as { code?: string }).code ?? "");
      if (message.startsWith("M806_")) reject(message.slice(5));
      // A transport error code does not establish rollback of an attempted COMMIT.
      if (committed || committing) throw new MaintenanceCommitUnknown("Original maintenance metadata outcome unknown");
      options.diagnosticForTest?.(code, message.slice(0, 200)); reject("TRANSACTION_FAILED");
    } finally { await c.end().catch(() => {}); }
  }
  return Object.freeze({ transaction, authenticate: (action: Action, request: unknown, context: Context) => authenticate(options.authentication, request, context, action) });
}
export type MaintenanceGateway = ReturnType<typeof createMaintenanceGatewayForTest>;
