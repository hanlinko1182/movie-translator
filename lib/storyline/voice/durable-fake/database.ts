import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { Client, type ClientConfig } from "pg";
import { canonicalJson } from "../../canonical";
import { FAKE_ACTIONS, csrfHash, resolveSyntheticSession, type Action, type SessionCapability } from "./auth";
export type DurableFixtureConnections = Record<Action, ClientConfig>;
export type DurableFixtureKeys = Record<Action, string>;
export type Fence = { generation: number; revision: number };
/** No default connection, environment datasource or production composition.
 * Caller must inject restricted credentials established by the owned fixture. */
export function createDurableGatewayForTest(options: { connections: DurableFixtureConnections; keys: DurableFixtureKeys; session: SessionCapability; request: () => Request }) {
  async function transaction<T>(action: Action, work: (c: Client) => Promise<T>, beforeCommit?: () => Promise<void>) {
    if (!FAKE_ACTIONS.includes(action)) throw new Error("M505_ACTION");
    const config = options.connections[action];
    if (!config || typeof config.host!=="string" || !config.host.startsWith("/tmp/movie-translator-storyline-m1e15-") || !String(config.database).startsWith("m1e15_db_") || !String(config.user).startsWith(`m505_${action}_`)) throw new Error("M505_DATABASE_UNSAFE");
    const c = new Client(config); await c.connect();
    try {
      await c.query("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s'; SET LOCAL search_path=pg_catalog,voice_m505,pg_temp");
      const safe = await c.query(`SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
        AND NOT pg_has_role(current_user,'voice_m505_owner','MEMBER') AND NOT has_schema_privilege(current_user,'public','CREATE')
        AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='voice_m505' AND c.relkind='r' AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE')))
        AND inet_server_addr() IS NULL AS safe FROM pg_roles WHERE rolname=current_user`);
      if (!safe.rows[0]?.safe) throw new Error("M505_DATABASE_UNSAFE");
      const result = await work(c); if (beforeCommit) await beforeCommit(); await c.query("COMMIT"); return result;
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { await c.end(); }
  }
  async function proof(c: Client, action: Action, target: string, fence: Fence, payload: Record<string, unknown>) {
    const req = options.request(), session = resolveSyntheticSession(options.session, action, req);
    const info = await c.query("SELECT pg_backend_pid() pid, pg_current_xact_id()::text tx, floor(extract(epoch FROM clock_timestamp())*1000)::bigint now");
    const row = info.rows[0];
    const p = canonicalJson({ ...payload, origin: req.headers.get("origin"), method: req.method, fetchSite: req.headers.get("sec-fetch-site"), csrfHash: csrfHash(req.headers.get("x-csrf-token")!), sourceEpoch: payload.sourceEpoch ?? 1, policyEpoch: payload.policyEpoch ?? 1 }, 4194304);
    const wire = canonicalJson({ namespace: session.namespace, tenantId: session.tenantId, principalId: session.principalId, sessionId: session.id,
      action, target, payloadHash: createHash("sha256").update(p).digest("hex"), ownerGeneration: fence.generation, revision: fence.revision,
      nonce: randomBytes(24).toString("hex"), pid: row.pid, transactionId: row.tx, expiresAtMs: Number(row.now)+3000 }, 8192);
    const mac = createHmac("sha256", Buffer.from(options.keys[action],"hex")).update(wire).digest("hex");
    return { wire, mac, payload: p };
  }
  async function redeem(c: Client, action: Action, signed: { wire: string; mac: string; payload: string }) {
    return (await c.query(`SELECT voice_m505.${action}($1,$2,$3) result`,[signed.wire,signed.mac,signed.payload])).rows[0].result;
  }
  return Object.freeze({ transaction, proof, redeem,
    call: (action: Action, target: string, fence: Fence, payload: Record<string, unknown>, beforeCommit?: () => Promise<void>) => transaction(action, async c => redeem(c,action,await proof(c,action,target,fence,payload)), beforeCommit),
  });
}
export type DurableGateway = ReturnType<typeof createDurableGatewayForTest>;
