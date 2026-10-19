import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { Client, type ClientConfig } from "pg";
import { canonicalJson } from "../canonical";
import { record } from "../validation";
import { HIGHLIGHT_STORE as S, HighlightStoreError, STORE_ERRORS, rejectStore, storeSame, type HighlightCurrentnessFence, type HighlightStoreScope } from "./contracts";
import { verifyHighlightRequest, type StoreAction, type SyntheticHighlightAuthentication } from "./auth";
export type HighlightConnections = Record<StoreAction, ClientConfig>;
export type HighlightKeys = Record<StoreAction, string>;
export class HighlightCommitUnknown extends Error { constructor() { super("Highlight commit observation unavailable"); } }
function safeDatabaseError(e: unknown): never {
  if (e instanceof HighlightStoreError || e instanceof HighlightCommitUnknown) throw e;
  const message = e && typeof e === "object" ? Object.getOwnPropertyDescriptor(e, "message")?.value : null;
  const code = typeof message === "string" && message.startsWith("H602_") ? message.slice(5) : "TRANSACTION_FAILED";
  rejectStore(STORE_ERRORS.includes(code as HighlightStoreError["code"]) ? code as HighlightStoreError["code"] : "TRANSACTION_FAILED");
}
/** Validate the real login/catalog on the same backend used for each action. */
export async function assertHighlightDatabase(c: Client, action: StoreAction) {
  const r = await c.query(`SELECT current_user=session_user AND inet_server_addr() IS NULL AND current_database() ~ '^m1e15_db_[a-f0-9]{20}$'
   AND current_user ~ $1 AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
   AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE (p.rolsuper OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication OR p.rolbypassrls) AND pg_has_role(session_user,p.oid,'MEMBER'))
   AND NOT pg_has_role(current_user,'highlight_m602_owner','MEMBER')
   AND NOT pg_has_role(current_user,'pg_read_server_files','MEMBER') AND NOT pg_has_role(current_user,'pg_write_server_files','MEMBER') AND NOT pg_has_role(current_user,'pg_execute_server_program','MEMBER')
   AND NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_schema_privilege(current_user,'highlight_m602','CREATE')
   AND NOT has_database_privilege(current_user,current_database(),'TEMP') AND pg_my_temp_schema()=0 AND current_setting('session_replication_role')='origin'
   AND (SELECT pg_get_userbyid(n.nspowner)='highlight_m602_owner' FROM pg_namespace n WHERE n.nspname='highlight_m602')
   AND (SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname='highlight_m602_owner')
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highlight_m602' AND c.relkind IN('r','p','S') AND
    (pg_get_userbyid(c.relowner)<>'highlight_m602_owner' OR pg_has_role(current_user,c.relowner,'MEMBER') OR
     CASE WHEN c.relkind='S' THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE') ELSE has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END))
   AND (SELECT count(*)=3 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='highlight_m602' AND f.prosecdef)
   AND NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='highlight_m602' AND
    (pg_get_userbyid(f.proowner)<>'highlight_m602_owner' OR (f.proconfig @> ARRAY['search_path=pg_catalog, highlight_m602, pg_temp']) IS NOT TRUE OR
     EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') OR
     (f.oid<>to_regprocedure('highlight_m602.'||$2||'(text,text,text)') AND has_function_privilege(current_user,f.oid,'EXECUTE'))))
   AND has_function_privilege(current_user,'highlight_m602.'||$2||'(text,text,text)','EXECUTE')
   AND (SELECT count(*)=14 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highlight_m602' AND t.tgname IN('immutable_row','immutable_truncate') AND t.tgenabled='O')
   AND (SELECT count(*)=1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highlight_m602' AND t.tgname='reservation_complete' AND t.tgdeferrable AND t.tginitdeferred AND t.tgenabled='O') safe
   FROM pg_roles r WHERE r.rolname=current_user`, [`^m602_${action}_[a-f0-9]{16}$`, action]);
  if (!r.rows[0]?.safe) rejectStore("DATABASE_UNSAFE");
}
export function createHighlightGatewayForTest(options: { mode: "M602_DISPOSABLE_ONLY"; connections: HighlightConnections; keys: HighlightKeys; authentication: SyntheticHighlightAuthentication }) {
  if (options.mode !== "M602_DISPOSABLE_ONLY") rejectStore("DATABASE_UNSAFE");
  const configs = {} as HighlightConnections, keys = {} as Record<StoreAction, Buffer>;
  for (const action of ["read", "create"] as const) {
    const cfg = record(options.connections[action], ["host", "port", "database", "user", "password", "connectionTimeoutMillis", "query_timeout", "statement_timeout", "application_name"], "highlightStore.connection");
    if (typeof cfg.host !== "string" || !/^\/tmp\/movie-translator-storyline-m1e15-[a-zA-Z0-9]+\/socket$/.test(cfg.host) || typeof cfg.database !== "string" || !/^m1e15_db_[a-f0-9]{20}$/.test(cfg.database) ||
      typeof cfg.user !== "string" || !new RegExp(`^m602_${action}_[a-f0-9]{16}$`).test(cfg.user) || typeof cfg.password !== "string" || !/^[a-f0-9]{64}$/.test(cfg.password) || !Number.isSafeInteger(cfg.port) || Number(cfg.port)<1 || Number(cfg.port)>65535 ||
      !/^[a-f0-9]{64}$/.test(options.keys[action])) rejectStore("DATABASE_UNSAFE");
    configs[action] = { host: cfg.host, port: Number(cfg.port), database: cfg.database, user: cfg.user, password: cfg.password,
      connectionTimeoutMillis: 5000, query_timeout: 15000, statement_timeout: 15000, application_name: "m602-owned-fixture" };
    keys[action] = Buffer.from(options.keys[action], "hex");
  }
  if (configs.read.host !== configs.create.host || configs.read.database !== configs.create.database || configs.read.port !== configs.create.port) rejectStore("DATABASE_UNSAFE");
  const authentication = options.authentication;
  const authenticate = (request: unknown, scope: HighlightStoreScope, action: StoreAction) => verifyHighlightRequest(authentication, request, scope, action);
  async function transaction<T>(action: StoreAction, request: unknown, scope: HighlightStoreScope, work: (tx: {
    call(body: Record<string, unknown>): Promise<unknown>; editor: ReturnType<typeof authenticate>; backendPid: number;
    validationProof(reservationId: string, challenge: string, recordHash: string, dependencyHash: string): string;
  }) => Promise<T>, afterCommitForTest?: () => Promise<void>) {
    // Validate before indexing credentials: pg.Client(undefined) would use
    // ambient defaults, which this fixture-only gateway must never permit.
    if (action !== "read" && action !== "create") rejectStore("DATABASE_UNSAFE");
    const editor = authenticate(request, scope, action), c = new Client(configs[action]);
    let committing = false, committed = false;
    try {
      await c.connect(); await c.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL search_path=pg_catalog,highlight_m602,pg_temp");
      await assertHighlightDatabase(c, action);
      const info = (await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx")).rows[0];
      const check = () => { if (!storeSame(authenticate(request, scope, action), editor)) rejectStore("SESSION_INVALID"); };
      const tx = { editor, backendPid: Number(info.pid),
        validationProof(reservationId: string, challenge: string, recordHash: string, dependencyHash: string) {
          if (action !== "create") rejectStore("FORBIDDEN");
          const fence: HighlightCurrentnessFence = { schemaVersion: S.fence, scope, reservationId, challenge, recordHash, dependencyHash, backendPid: Number(info.pid), transactionId: info.tx };
          return createHmac("sha256", keys[action]).update(`${S.fence}\n${canonicalJson(fence)}`, "utf8").digest("hex");
        },
        async call(body: Record<string, unknown>) {
          check(); const bytes = canonicalJson(body, S.maxBytes);
          const now = Number((await c.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0].now);
          const wire = canonicalJson({ schemaVersion: S.authorization, scope, sessionId: editor.sessionId, principalId: editor.principalId, action,
            payloadHash: createHash("sha256").update(bytes).digest("hex"), nonce: randomBytes(24).toString("hex"), pid: Number(info.pid), transactionId: info.tx, expiresAtMs: now + 3000,
            origin: editor.origin, csrfHash: editor.csrfHash, method: action === "create" ? "POST" : "GET", fetchSite: "same-origin" });
          const mac = createHmac("sha256", keys[action]).update(wire).digest("hex");
          return (await c.query(`SELECT highlight_m602.${action}($1,$2,$3) result`, [wire, mac, bytes])).rows[0].result as unknown;
        } };
      const result = await work(tx); check(); await assertHighlightDatabase(c, action);
      committing = true; await c.query("COMMIT"); committed = true;
      if (afterCommitForTest) await afterCommitForTest();
      return result;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      const sqlCode = e && typeof e === "object" ? Object.getOwnPropertyDescriptor(e, "code")?.value : null;
      if (committed || committing && !(typeof sqlCode === "string" && /^[0-9A-Z]{5}$/.test(sqlCode))) throw new HighlightCommitUnknown();
      safeDatabaseError(e);
    } finally { await c.end().catch(() => {}); }
  }
  return Object.freeze({ transaction, authenticate });
}
export type HighlightGateway = ReturnType<typeof createHighlightGatewayForTest>;
