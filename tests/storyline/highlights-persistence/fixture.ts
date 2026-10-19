import assert from "node:assert/strict";
import { randomBytes, createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client, type ClientConfig } from "pg";
import { DisposableStorylinePostgres } from "../disposable-postgres";
import { highlightsFixture } from "../highlights/fixture";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { referenceFromR4 } from "../../../lib/storyline/voice/foundation/reference";
import { HIGHLIGHT_STORE as S, highlightProposalHash, type HighlightStoreScope, type SaveHighlightProposal } from "../../../lib/storyline/highlights-persistence/contracts";
import { createSyntheticHighlightAuthenticationForTest, highlightCsrfHash, type HighlightSessionFixture, type StoreAction } from "../../../lib/storyline/highlights-persistence/auth";
import { createHighlightGatewayForTest, type HighlightConnections, type HighlightKeys } from "../../../lib/storyline/highlights-persistence/database";
import { createDisposableHighlightRepositoryForTest } from "../../../lib/storyline/highlights-persistence/service";
import type { SyntheticHighlightCapture } from "../../../lib/storyline/highlights/contracts";

export const origin = "https://highlights.m602.invalid";
const uid = (prefix: string) => `${prefix}-${randomBytes(12).toString("hex")}`;
export async function connect(c: ClientConfig) { const client = new Client(c); await client.connect(); return client; }
export async function highlightDatabaseFixture(edited = false, mutateBeforeSeed?: (capture: SyntheticHighlightCapture) => void) {
  const f = highlightsFixture({ edited }), owned = await DisposableStorylinePostgres.start(), admin = await owned.securityAdministrator();
  const scope: HighlightStoreScope = { tenantId: "tenant-one", ...f.input.source.narration.scope };
  if (f.capture.edit) {
    f.capture.edit.payload.editor.tenantId = scope.tenantId;
    f.capture.edit.contentHash = contractHash("story-edited-narration-v1", f.capture.edit.payload);
    f.capture.current.narration = referenceFromR4(f.capture.edit.payload, f.capture.edit.contentHash, f.originalReference);
  }
  mutateBeforeSeed?.(f.capture);
  const connections = {} as HighlightConnections, keys = {} as HighlightKeys;
  const sessions: HighlightSessionFixture[] = ["editor-a", "editor-b", "reader", "denied", "foreign", "expired", "wide", "db-denied", "db-revoked"].map(name => {
    const tenantId = name === "foreign" ? "tenant-two" : "tenant-one";
    return { id: `session-${name}`, token: randomBytes(32).toString("hex"), csrf: randomBytes(32).toString("hex"), tenantId, principalId: name,
      expiresAtMs: Date.now() + (name === "expired" ? -10000 : 3600000), grants: [{ scope: { ...scope, tenantId }, canRead: name !== "denied", canCreate: !["reader", "denied"].includes(name) }] };
  });
  sessions.find(s => s.principalId === "wide")!.grants.push(...["projectId", "movieId", "studioId"].map(field => ({ scope: { ...scope, [field]: "other-resource" }, canRead: true, canCreate: true })));
  try {
    await admin.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await admin.query(`REVOKE TEMPORARY ON DATABASE "${owned.name}" FROM PUBLIC`);
    for (const action of ["read", "create"] as const) {
      const user = `m602_${action}_${randomBytes(8).toString("hex")}`, password = randomBytes(32).toString("hex");
      await admin.query(`CREATE ROLE ${user} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE highlight_m602_${action} PASSWORD '${password}'`);
      connections[action] = { ...owned.prismaAdapterConfig(), user, password, application_name: "m602-owned-fixture" };
      keys[action] = randomBytes(32).toString("hex");
      await admin.query("INSERT INTO highlight_m602.proof_key VALUES($1,$2,decode($3,'hex'),true)", [action, user, keys[action]]);
    }
    for (const tenant of ["tenant-one", "tenant-two"]) await admin.query("INSERT INTO highlight_m602.tenant VALUES($1)", [tenant]);
    for (const tenant of ["tenant-one", "tenant-two"]) {
      await admin.query("INSERT INTO highlight_m602.scope VALUES($1,$2,$3,$4,true)", [tenant, scope.projectId, scope.movieId, scope.studioId]);
      await admin.query("INSERT INTO highlight_m602.repository_head(tenant,project,movie,studio) VALUES($1,$2,$3,$4)", [tenant, scope.projectId, scope.movieId, scope.studioId]);
    }
    for (const s of sessions) {
      await admin.query("INSERT INTO highlight_m602.principal VALUES($1,$2)", [s.tenantId, s.principalId]);
      await admin.query("INSERT INTO highlight_m602.session VALUES($1,$2,$3,$4,$5,$6,$7)", [s.tenantId, s.id, s.principalId, highlightCsrfHash(s.csrf), origin, new Date(s.expiresAtMs), s.principalId === "db-revoked"]);
      const grant = s.grants[0];
      await admin.query("INSERT INTO highlight_m602.access_grant VALUES($1,$2,$3,$4,$5,$6,$7)", [s.tenantId, scope.projectId, scope.movieId, scope.studioId, s.principalId, s.principalId === "db-denied" ? false : grant.canRead, s.principalId === "db-denied" ? false : grant.canCreate]);
    }
    async function seedCapture(input: SyntheticHighlightCapture, selected: HighlightStoreScope = scope, makeCurrent = true) {
      const capture = structuredClone(input), params = [selected.tenantId, selected.projectId, selected.movieId, selected.studioId];
      const source = capture.context.source, analysis = { recipe: capture.context.recipe, profile: capture.context.profile, candidate: capture.context.candidate, record: capture.context.record, result: capture.context.result };
      const narration = { original: capture.original, storedOriginal: capture.storedOriginal, edit: capture.edit };
      for (const [table, artifactId, value, extraName, extraValue] of [
        ["source_snapshot", source.payload.id, source, null, null],
        ["analysis_snapshot", capture.context.record.candidateId, analysis, "source_id", source.payload.id],
        ["narration_snapshot", capture.current.narration.artifact.id, narration, "analysis_id", capture.context.record.candidateId],
      ] as const) {
        const args: unknown[] = [...params, artifactId, canonicalJson(value)]; if (extraName) args.push(extraValue);
        await admin.query(`INSERT INTO highlight_m602.${table}(tenant,project,movie,studio,id,value${extraName ? "," + extraName : ""}) VALUES($1,$2,$3,$4,$5,$6${extraName ? ",$7" : ""}) ON CONFLICT DO NOTHING`, args);
        const existing = (await admin.query(`SELECT value FROM highlight_m602.${table} WHERE (tenant,project,movie,studio,id)=($1,$2,$3,$4,$5)`, [...params, artifactId])).rows[0].value;
        assert.equal(canonicalJson(existing), canonicalJson(value), "Fixture must not replace immutable source artifacts");
      }
      const dependencyId = uid("dependency"), dependencyHash = contractHash(S.dependency, { schemaVersion: S.dependency, scope: selected, capture });
      await admin.query("INSERT INTO highlight_m602.dependency VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [...params, dependencyId, source.payload.id, capture.context.record.candidateId, capture.current.narration.artifact.id, canonicalJson(capture.current), dependencyHash]);
      if (makeCurrent) await admin.query("INSERT INTO highlight_m602.current_dependency VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant,project,movie,studio) DO UPDATE SET dependency_id=EXCLUDED.dependency_id,observed_reference=EXCLUDED.observed_reference", [...params, dependencyId, canonicalJson(capture.current)]);
      return { id: dependencyId, hash: dependencyHash, capture };
    }
    const initial = await seedCapture(f.capture);
    await seedCapture(f.capture, { ...scope, tenantId: "tenant-two" });
    const authentication = createSyntheticHighlightAuthenticationForTest({ mode: "M602_DISPOSABLE_ONLY", origin, sessions });
    const gateway = createHighlightGatewayForTest({ mode: "M602_DISPOSABLE_ONLY", connections, keys, authentication });
    const service = (options: Partial<Parameters<typeof createDisposableHighlightRepositoryForTest>[0]> = {}) => createDisposableHighlightRepositoryForTest({ mode: "M602_DISPOSABLE_ONLY", gateway, ...options });
    function request(name = "editor-a", write = false, overrides: { origin?: string | null; csrf?: string | null; cookie?: string | null; fetchSite?: string | null; method?: string; url?: string } = {}) {
      const s = sessions.find(s => s.principalId === name)!;
      const headers = new Headers({ origin, "sec-fetch-site": "same-origin", cookie: `highlight_m602_session=${s.token}`, "x-highlight-m602-csrf": s.csrf });
      for (const [key, name] of [["origin", "origin"], ["csrf", "x-highlight-m602-csrf"], ["cookie", "cookie"], ["fetchSite", "sec-fetch-site"]] as const) if (Object.hasOwn(overrides, key)) {
        if (overrides[key] === null) headers.delete(name); else headers.set(name, overrides[key]!);
      }
      return new Request(overrides.url ?? `${origin}/isolated-fixture`, { method: overrides.method ?? (write ? "POST" : "GET"), headers });
    }
    const api = service();
    async function proposal(key = uid("save"), principal = "editor-a", selected = scope): Promise<SaveHighlightProposal> {
      const prepared = await api.preparePlan(request(principal), { scope: selected, policy: f.input.policy, audio: null });
      return { schemaVersion: S.proposal, ...prepared, idempotencyKey: key };
    }
    return { owned, admin, connections, keys, scope, sessions, initial, authentication, gateway, api, service, request, proposal, seedCapture, fixture: f,
      async counts() { return (await admin.query("SELECT (SELECT count(*)::int FROM highlight_m602.version) versions,(SELECT count(*)::int FROM highlight_m602.reservation) reservations,(SELECT count(*)::int FROM highlight_m602.audit_event) audits,(SELECT sum(revision)::int FROM highlight_m602.repository_head) revisions")).rows[0] as { versions: number; reservations: number; audits: number; revisions: number }; },
      async save(p?: SaveHighlightProposal, name = "editor-a", options: Parameters<typeof service>[0] = {}) { return service(options).saveVersion(request(name, true), request(name), p ?? await proposal()); },
      async stop() { await admin.end(); await owned.stop(); } };
  } catch (e) { await admin.end(); await owned.stop(); throw e; }
}
export async function signed(c: Client, f: Awaited<ReturnType<typeof highlightDatabaseFixture>>, action: StoreAction, body: unknown, selected: HighlightStoreScope = f.scope) {
  const session = f.sessions[0], bytes = canonicalJson(body), row = (await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx,floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0];
  const w = { schemaVersion: S.authorization, scope: selected, sessionId: session.id, principalId: session.principalId, action,
    payloadHash: createHash("sha256").update(bytes).digest("hex"), nonce: randomBytes(24).toString("hex"), pid: Number(row.pid), transactionId: row.tx, expiresAtMs: Number(row.now) + 3000,
    origin, csrfHash: highlightCsrfHash(session.csrf), method: action === "create" ? "POST" : "GET", fetchSite: "same-origin" };
  const seal = () => { const wire = canonicalJson(w); return [wire, createHmac("sha256", Buffer.from(f.keys[action], "hex")).update(wire).digest("hex"), bytes]; };
  return { w, bytes, seal };
}
export { highlightProposalHash };
