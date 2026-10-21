import { Client, type ClientConfig } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DisposableStorylinePostgres } from "../disposable-postgres";
import { ownershipFixture } from "../ownership-exclusion-phase0/supervisor.fixture";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { envelope, envelopeHash, actions, type Context, type Action, type Envelope } from "../../../lib/storyline/maintenance-fake/contracts";
import { createMaintenanceAuthenticationForTest, newMaintenanceSessionForTest, csrfHash } from "../../../lib/storyline/maintenance-fake/auth";
import { createMaintenanceEvidenceOriginForTest } from "../../../lib/storyline/maintenance-fake/evidence";
import { createMaintenanceGatewayForTest, type Connections, type Keys, type Hooks } from "../../../lib/storyline/maintenance-fake/database";
import { createMaintenanceServiceForTest } from "../../../lib/storyline/maintenance-fake/service";
import { createFakeProcessOwnerForTest } from "../../../lib/storyline/render-execution-fake/process";

export const dummy = "postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable";
const digest = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex");
export async function connect(config: ClientConfig) { const c = new Client(config); await c.connect(); return c; }
export async function maintenanceFixture(mode: "COMPLETE" | "UNCERTAIN_DESCENDANT" = "COMPLETE") {
  if (process.env.DATABASE_URL !== dummy) throw Error("UNREACHABLE_DATASOURCE_REQUIRED");
  const kernel = await ownershipFixture();
  let owned: DisposableStorylinePostgres | undefined, admin: Client | undefined;
  try {
    const writer = await kernel.launch(); await writer.command("lock");
    let writerClosed = false;
    let writerReceipt: Awaited<ReturnType<typeof writer.seal>> | undefined;
    if (mode === "UNCERTAIN_DESCENDANT") {
      const pending = writer.command("probe-no-ack").catch(() => {}); await writer.waitForCut("probe-no-ack");
      await writer.killAndReap().catch(() => {}); await pending;
    } else { writerReceipt = await writer.seal(); writerClosed = kernel.closureRecognized(writerReceipt); }
    const reader = await kernel.launch(); await reader.command("read"); const readerReceipt = await reader.seal();
    const readerClosed = kernel.closureRecognized(readerReceipt), observer = await kernel.launch(); await observer.command("lock");
    let qualified = false;
    if (writerReceipt) { const result = await kernel.qualifySuccessor("original-evidence-observation", writerReceipt, observer, 1, 0); qualified = result.generation === 2 && result.revision === 1; }
    const context: Context = { namespace: `maintenance-${randomBytes(8).toString("hex")}`, scope: { tenantId: "tenant-one", projectId: "project", movieId: "movie", studioId: "studio" } };
    const rootId = `root-${kernel.id}`, guardHash = digest(kernel.guard), supervisorHash = digest(kernel.marker.supervisor);
    const root = envelope("root", context, { rootId, incarnationHash: digest(kernel.marker.incarnation), guardHash, writerId: writer.ownerId, readerId: reader.ownerId, supervisorHash });
    const owners = [envelope("owner", context, { rootId, ownerId: writer.ownerId, incarnationHash: digest(writer.identity), kind: "WRITER", generation: 1 }),
      envelope("owner", context, { rootId, ownerId: reader.ownerId, incarnationHash: digest(reader.identity), kind: "READER", generation: 1 })];
    const close = (owner: Envelope, closed: boolean) => ({ rootId, ownerId: owner.body.ownerId, ownerHash: envelopeHash("owner", owner), supervisorHash, guardHash,
      generation: 1, descriptorsClosed: closed, noFutureIO: closed, descendants: closed ? "PROVEN_QUIESCENT" : "UNKNOWN", origin: "ORIGINAL_PHASE0_SUPERVISOR" });
    const writerFact = envelope("writer", context, close(owners[0], writerClosed)), readerFact = envelope("reader", context, close(owners[1], readerClosed));
    const successor = envelope("successor", context, { rootId, writerHash: envelopeHash("writer", writerFact), readerHash: envelopeHash("reader", readerFact), guardHash,
      generation: 1, revision: 0, observation: qualified ? "QUALIFIED_FOR_FUTURE_PHASE_ONLY" : "BLOCKED", origin: "ORIGINAL_PHASE0_SUPERVISOR" });
    const original = { root, owners, evidence: [{ kind: "writer" as const, fact: writerFact }, { kind: "reader" as const, fact: readerFact }, { kind: "successor" as const, fact: successor }] };
    const origin = () => createMaintenanceEvidenceOriginForTest(context, async () => structuredClone(original));
    const source = await origin();
    const receipts = process.env.MAINTENANCE_RECEIPTS;
    if (receipts) {
      const folder = resolve(receipts); if (!folder.startsWith(resolve("coverage") + "/m8-06-phase1a-")) throw Error("RECEIPT_PATH");
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, `kernel-${kernel.id}.json`), JSON.stringify({ mode, observations: kernel.observations(), original }, null, 2), { mode: 0o600 });
    }
    owned = await DisposableStorylinePostgres.start(); admin = await owned.securityAdministrator();
    await admin.query(`REVOKE CREATE,TEMP ON DATABASE "${owned.name}" FROM PUBLIC`);
    await admin.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await admin.query("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA maintenance_m806_crypto FROM PUBLIC");
    await admin.query("GRANT EXECUTE ON FUNCTION maintenance_m806_crypto.digest(bytea,text),maintenance_m806_crypto.hmac(bytea,bytea,text) TO maintenance_m806_owner");
    const scopeKey = canonicalJson(context);
    async function addScope(c: Context) {
      await admin!.query("INSERT INTO maintenance_m806.scope VALUES($1,$2,$3,$4,$5,$6,true)", [canonicalJson(c), c.namespace, c.scope.tenantId, c.scope.projectId, c.scope.movieId, c.scope.studioId]);
    }
    await addScope(context);
    const foreignContext = { ...context, scope: { ...context.scope, tenantId: "tenant-two" } }; await addScope(foreignContext);
    await admin.query("INSERT INTO maintenance_m806.root VALUES($1,$2,$3,$4)", [scopeKey, rootId, canonicalJson(root), envelopeHash("root", root)]);
    await admin.query("INSERT INTO maintenance_m806.root_head(scope_key,id) VALUES($1,$2)", [scopeKey, rootId]);
    for (const o of owners) await admin.query("INSERT INTO maintenance_m806.owner VALUES($1,$2,$3,$4,$5,$6)", [scopeKey, rootId, o.body.ownerId, o.body.kind, canonicalJson(o), envelopeHash("owner", o)]);
    for (const e of original.evidence) await admin.query("INSERT INTO maintenance_m806.anchor VALUES($1,$2,$3,$4,$5)", [scopeKey, rootId, e.kind, canonicalJson(e.fact), envelopeHash(e.kind, e.fact)]);
    const sessions = [newMaintenanceSessionForTest(context, "editor", [...actions], [rootId]),
      ...actions.map(a => newMaintenanceSessionForTest(context, `only-${a}`, [a], [rootId])),
      newMaintenanceSessionForTest(foreignContext, "foreign", [...actions], [rootId]),
      newMaintenanceSessionForTest(context, "denied", [], []), newMaintenanceSessionForTest(context, "expired", [...actions], [rootId])];
    sessions.find(s => s.principalId === "expired")!.expiresAtMs = Date.now() - 1;
    const connections = {} as Connections, keys = {} as Keys;
    for (const a of actions) {
      const user = `m806_${a}_${randomBytes(8).toString("hex")}`, password = randomBytes(32).toString("hex");
      await admin.query(`CREATE ROLE ${user} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE maintenance_m806_${a} PASSWORD '${password}'`);
      connections[a] = { ...owned.prismaAdapterConfig(), user, password }; keys[a] = randomBytes(32).toString("hex");
      await admin.query("INSERT INTO maintenance_m806.proof_key VALUES($1,$2,decode($3,'hex'),true)", [a, user, keys[a]]);
    }
    for (const s of sessions) {
      const key = canonicalJson({ namespace: s.namespace, scope: s.scope });
      await admin.query("INSERT INTO maintenance_m806.principal VALUES($1,$2)", [key, s.principalId]);
      await admin.query("INSERT INTO maintenance_m806.session VALUES($1,$2,$3,$4,$5,$6,false)", [key, s.id, s.principalId, csrfHash(s.csrf), s.origin, new Date(s.expiresAtMs)]);
      await admin.query("INSERT INTO maintenance_m806.access_grant VALUES($1,$2,$3,$4)", [key, s.principalId, s.actions, s.rootIds]);
    }
    const auth = createMaintenanceAuthenticationForTest(sessions);
    function gateway(options: { hooks?: Hooks; proofTtlMs?: number } = {}) {
      return createMaintenanceGatewayForTest({ mode: "M806_PHASE1A_DISPOSABLE_ONLY", connections, keys, authentication: auth.authentication, ...options,
        diagnosticForTest: (code, message) => console.error("M806 fixture diagnostic", code, message.replace(/[a-f0-9]{16,}/g, "<opaque>")) });
    }
    const db = gateway(), service = (g = db) => createMaintenanceServiceForTest({ mode: "M806_PHASE1A_DISPOSABLE_ONLY", context, gateway: g }), api = service();
    function request(action: Action, name = "editor", overrides: Record<string, string | null> = {}) {
      const s = sessions.find(v => v.principalId === name)!;
      const headers = new Headers({ cookie: `maintenance_m806_session=${s.token}`, origin: s.origin, "sec-fetch-site": "same-origin", "x-maintenance-csrf": s.csrf });
      for (const [k, v] of Object.entries(overrides)) if (v === null) headers.delete(k); else headers.set(k, v);
      return new Request(`${s.origin}/isolated-maintenance`, { method: action === "read" || action === "health" ? "GET" : "POST", headers });
    }
    const decision = (decisionId = `decision-${randomUUID()}`, patch: Record<string, unknown> = {}) => envelope("decision", context, { decisionId, rootId, rootHash: envelopeHash("root", root),
      writerId: writer.ownerId, readerId: reader.ownerId, expectedGeneration: 1, expectedRevision: 0, purpose: "OBSERVE_CLOSURE_ONLY", evidenceHashes: [...source.hashes], ...patch });
    async function prepared(input = decision(), target = api) {
      let view = await target.submit(request("submit"), input); const fresh = await origin();
      for (const handle of fresh.handles) view = await target.registerEvidence(request("evidence"), rootId, String(input.body.decisionId), view.revision, handle);
      return view;
    }
    const fakeOwner = createFakeProcessOwnerForTest(); // Oracle only: never arm or invoke in Phase 1A.
    return { owned, admin, kernel, context, foreignContext, scopeKey, rootId, root, owners, original, origin, source, sessions, connections, keys, auth, db, gateway, service, api, request, decision, prepared, fakeOwner,
      async stop() { await admin!.end(); await owned!.stop(); await kernel.close(); } };
  } catch (error) { await admin?.end().catch(() => {}); await owned?.stop(); await kernel.close(); throw error; }
}
