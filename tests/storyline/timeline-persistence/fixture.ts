import { randomBytes, createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Client } from "pg";
import { highlightDatabaseFixture, connect } from "../highlights-persistence/fixture";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { TIMELINE, timelinePolicy, type RecapTimelineInput } from "../../../lib/storyline/timeline/contracts";
import { TIMELINE_STORE as S, timelineProposalHash, type SaveTimelineProposal } from "../../../lib/storyline/timeline-persistence/contracts";
import { createSyntheticTimelineAuthenticationForTest, timelineCsrfHash, type StoreAction } from "../../../lib/storyline/timeline-persistence/auth";
import { createTimelineGatewayForTest, type TimelineConnections, type TimelineKeys } from "../../../lib/storyline/timeline-persistence/database";
import { createDisposableTimelineRepositoryForTest } from "../../../lib/storyline/timeline-persistence/service";
export const origin = "https://timelines.m702.invalid";
export { connect, timelineProposalHash };
export const uid = (prefix = "save") => `${prefix}-${randomBytes(12).toString("hex")}`;
export async function timelineDatabaseFixture(edited = false, mutateBeforeSeed?: Parameters<typeof highlightDatabaseFixture>[1]) {
  const m6 = await highlightDatabaseFixture(edited, mutateBeforeSeed), { admin, scope, owned } = m6;
  try {
    const selected = await m6.save(); if (selected.status === "UNKNOWN") throw Error("Fixture M6 save ambiguous");
    const sessions = m6.sessions.map(s => ({ ...structuredClone(s), token: randomBytes(32).toString("hex"), csrf: randomBytes(32).toString("hex") }));
    const connections = {} as TimelineConnections, keys = {} as TimelineKeys;
    await admin.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    for (const tenant of ["tenant-one", "tenant-two"]) {
      await admin.query("INSERT INTO timeline_m702.tenant VALUES($1)", [tenant]);
      await admin.query("INSERT INTO timeline_m702.scope VALUES($1,$2,$3,$4,true)", [tenant, scope.projectId, scope.movieId, scope.studioId]);
      await admin.query("INSERT INTO timeline_m702.repository_head(tenant,project,movie,studio) VALUES($1,$2,$3,$4)", [tenant, scope.projectId, scope.movieId, scope.studioId]);
    }
    for (const action of ["read", "create"] as const) {
      const user = `m702_${action}_${randomBytes(8).toString("hex")}`, password = randomBytes(32).toString("hex");
      await admin.query(`CREATE ROLE ${user} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE timeline_m702_${action} PASSWORD '${password}'`);
      connections[action] = { ...owned.prismaAdapterConfig(), user, password, application_name: "m702-owned-fixture" };
      keys[action] = randomBytes(32).toString("hex");
      await admin.query("INSERT INTO timeline_m702.proof_key VALUES($1,$2,decode($3,'hex'),true)", [action, user, keys[action]]);
    }
    for (const s of sessions) {
      await admin.query("INSERT INTO timeline_m702.principal VALUES($1,$2)", [s.tenantId, s.principalId]);
      await admin.query("INSERT INTO timeline_m702.session VALUES($1,$2,$3,$4,$5,$6,$7)", [s.tenantId, s.id, s.principalId, timelineCsrfHash(s.csrf), origin, new Date(s.expiresAtMs), s.principalId === "db-revoked"]);
      const grant = s.grants[0];
      await admin.query("INSERT INTO timeline_m702.access_grant VALUES($1,$2,$3,$4,$5,$6,$7)", [s.tenantId, scope.projectId, scope.movieId, scope.studioId, s.principalId, s.principalId === "db-denied" ? false : grant.canRead, s.principalId === "db-denied" ? false : grant.canCreate]);
    }
    const authentication = createSyntheticTimelineAuthenticationForTest({ mode: "M702_DISPOSABLE_ONLY", origin, sessions });
    const gateway = createTimelineGatewayForTest({ mode: "M702_DISPOSABLE_ONLY", connections, keys, authentication });
    const service = (options: Partial<Parameters<typeof createDisposableTimelineRepositoryForTest>[0]> = {}) => createDisposableTimelineRepositoryForTest({ mode: "M702_DISPOSABLE_ONLY", gateway, ...options });
    const api = service();
    const v = selected.view;
    const input: RecapTimelineInput = { schemaVersion: TIMELINE.input, execution: "SYNTHETIC_ONLY", scope,
      selected: { id: v.record.id, version: v.record.version, recordHash: v.recordHash, recordHashDomain: "story-highlight-saved-record-v1", planHash: v.record.plan.planHash, planHashDomain: "story-highlight-plan-v1" }, policy: timelinePolicy };
    function request(name = "editor-a", write = false, overrides: Parameters<typeof m6.request>[2] = {}) {
      const s = sessions.find(s => s.principalId === name)!;
      const headers = new Headers({ origin, "sec-fetch-site": "same-origin", cookie: `timeline_m702_session=${s.token}`, "x-timeline-m702-csrf": s.csrf });
      for (const [key, name] of [["origin", "origin"], ["csrf", "x-timeline-m702-csrf"], ["cookie", "cookie"], ["fetchSite", "sec-fetch-site"]] as const) if (Object.hasOwn(overrides, key)) {
        if (overrides[key] === null) headers.delete(name); else headers.set(name, overrides[key]!);
      }
      return new Request(overrides.url ?? `${origin}/isolated-fixture`, { method: overrides.method ?? (write ? "POST" : "GET"), headers });
    }
    async function proposal(key = uid(), name = "editor-a", target = input): Promise<SaveTimelineProposal> {
      return { schemaVersion: S.proposal, ...await api.prepareTimeline(request(name), target), idempotencyKey: key };
    }
    function sessionCookieForTest(name = "editor-a") {
      const s = sessions.find(s => s.principalId === name)!;
      return `timeline_m702_session=${s.token}; HttpOnly; Secure; SameSite=Strict; Path=/`;
    }
    return { sessionCookieForTest, m6, admin, scope, owned, sessions, connections, keys, authentication, gateway, api, service, request, proposal, input,
      async counts() { return (await admin.query("SELECT (SELECT count(*)::int FROM timeline_m702.version) versions,(SELECT count(*)::int FROM timeline_m702.reservation) reservations,(SELECT count(*)::int FROM timeline_m702.audit_event) audits,(SELECT sum(revision)::int FROM timeline_m702.repository_head) revisions")).rows[0]; },
      async save(p?: SaveTimelineProposal, name = "editor-a", options: Parameters<typeof service>[0] = {}) { return service(options).saveVersion(request(name, true), request(name), p ?? await proposal()); },
      async stop() { await m6.stop(); } };
  } catch (error) { await m6.stop(); throw error; }
}
export async function signed(c: Client, f: Awaited<ReturnType<typeof timelineDatabaseFixture>>, action: StoreAction, body: unknown) {
  const s = f.sessions[0], bytes = canonicalJson(body), row = (await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx,floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0];
  const wire = { schemaVersion: S.authorization, scope: f.scope, sessionId: s.id, principalId: s.principalId, action,
    payloadHash: createHash("sha256").update(bytes).digest("hex"), nonce: randomBytes(24).toString("hex"), pid: Number(row.pid), transactionId: row.tx, expiresAtMs: Number(row.now) + 3000,
    origin, csrfHash: timelineCsrfHash(s.csrf), method: action === "create" ? "POST" : "GET", fetchSite: "same-origin" };
  return { wire, seal() { const w = canonicalJson(wire); return [w, createHmac("sha256", Buffer.from(f.keys[action], "hex")).update(w).digest("hex"), bytes]; } };
}
