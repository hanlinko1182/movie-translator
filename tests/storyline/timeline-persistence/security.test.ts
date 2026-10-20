import assert from "node:assert/strict";
import { before, after, mock, test } from "node:test";
import { timelineDatabaseFixture, connect, signed } from "./fixture";
import { createTimelineGatewayForTest } from "../../../lib/storyline/timeline-persistence/database";
import { verifyTimelineRequest } from "../../../lib/storyline/timeline-persistence/auth";
let f: Awaited<ReturnType<typeof timelineDatabaseFixture>>;
let originalId: string;
before(async () => {
  mock.method(globalThis, "fetch", () => assert.fail("No network/provider calls"));
  f = await timelineDatabaseFixture(); const saved = await f.save(); if (saved.status === "UNKNOWN") assert.fail(); originalId = saved.view.record.id;
});
after(async () => { await f?.stop(); mock.restoreAll(); });
for (const [name, principal, overrides, expected] of [
  ["read-only", "reader", {}, "FORBIDDEN"], ["denied", "denied", {}, "FORBIDDEN"], ["foreign", "foreign", {}, "FORBIDDEN"],
  ["expired", "expired", {}, "SESSION_INVALID"], ["DB denied", "db-denied", {}, "FORBIDDEN"], ["DB revoked", "db-revoked", {}, "FORBIDDEN"],
  ["missing cookie", "editor-a", { cookie: null }, "AUTH_REQUIRED"], ["forged cookie", "editor-a", { cookie: "timeline_m702_session=forged" }, "SESSION_INVALID"],
  ["duplicate cookie", "editor-a", { cookie: "timeline_m702_session=a; timeline_m702_session=b" }, "AUTH_REQUIRED"],
  ["missing CSRF", "editor-a", { csrf: null }, "CSRF_REJECTED"], ["wrong CSRF", "editor-a", { csrf: "f".repeat(64) }, "CSRF_REJECTED"],
  ["wrong origin", "editor-a", { origin: "https://evil.invalid" }, "ORIGIN_REJECTED"], ["missing origin", "editor-a", { origin: null }, "ORIGIN_REJECTED"],
  ["cross-site", "editor-a", { fetchSite: "cross-site" }, "ORIGIN_REJECTED"], ["wrong method", "editor-a", { method: "GET" }, "ORIGIN_REJECTED"],
  ["wrong URL", "editor-a", { url: "https://evil.invalid/x" }, "ORIGIN_REJECTED"],
  ["wrong same-origin path", "editor-a", { url: "https://timelines.m702.invalid/other" }, "ORIGIN_REJECTED"],
  ["unexpected URL query", "editor-a", { url: "https://timelines.m702.invalid/isolated-fixture?role=owner" }, "ORIGIN_REJECTED"],
] as const) test(`M7-02 save rejects ${name} without durable changes`, async () => {
  const p = await f.proposal(), before = await f.counts();
  await assert.rejects(f.api.saveVersion(f.request(principal, true, overrides), f.request(principal), p), { code: expected });
  assert.deepEqual(await f.counts(), before);
});
for (const field of ["tenantId", "projectId", "movieId", "studioId"] as const) test(`M7-02 all reads independently reject wrong ${field} and disclose no record existence`, async () => {
  const scope = { ...f.scope, [field]: "unowned" };
  for (const call of [
    () => f.api.readVersion(f.request(), { scope, id: originalId }), () => f.api.readHead(f.request(), { scope }),
    () => f.api.listHistory(f.request(), { scope, afterVersion: 0, limit: 1 }),
    () => f.api.readOperation(f.request(), { scope, idempotencyKey: "first", proposalHash: "f".repeat(64) }),
  ]) await assert.rejects(call, { code: "FORBIDDEN" });
});
test("M7-02 copied role/session/authentication JSON cannot authenticate; server cookie policy is HttpOnly", async () => {
  const p = await f.proposal();
  await assert.rejects(f.api.saveVersion({ role: "editor", ...f.sessions[0] }, f.request(), p), { code: "AUTH_REQUIRED" });
  assert.throws(() => verifyTimelineRequest({ ...f.authentication }, f.request(), f.scope, "read"), { code: "AUTH_REQUIRED" });
  assert.match(f.sessionCookieForTest(), /; HttpOnly; Secure; SameSite=Strict; Path=\/$/);
  await assert.rejects(f.api.saveVersion(f.request("editor-a", true), f.request("editor-b"), p), { code: "FORBIDDEN" });
});
test("M7-02 revoked server-owned session rejects later requests", async () => {
  f.authentication.revokeForTest("session-editor-b");
  await assert.rejects(f.api.readHead(f.request("editor-b"), { scope: f.scope }), { code: "SESSION_INVALID" });
});
for (const schema of ["timeline_m702", "highlight_m602"] as const) test(`M7-02 independently checks ${schema} database session/grant agreement`, async () => {
  await f.admin.query(`UPDATE ${schema}.session SET principal='reader' WHERE id='session-editor-a'`);
  try { await assert.rejects(f.api.readVersion(f.request(), { scope: f.scope, id: originalId }), { code: "FORBIDDEN" }); }
  finally { await f.admin.query(`UPDATE ${schema}.session SET principal='editor-a' WHERE id='session-editor-a'`); }
});
test("M7-02 server grants cannot widen unowned database scope", async () => {
  for (const field of ["projectId", "movieId", "studioId"] as const) {
    const scope = { ...f.scope, [field]: "other-resource" };
    await assert.rejects(f.api.readHead(f.request("wide"), { scope }), { code: "FORBIDDEN" });
  }
});
test("M7-02 action logins have no private DML/SELECT, owner, helper, M6 or DDL authority", async () => {
  for (const action of ["read", "create"] as const) {
    const c = await connect(f.connections[action]);
    try {
      for (const sql of [
        "SELECT * FROM timeline_m702.version", "SELECT * FROM timeline_m702.proof_key", "SELECT * FROM timeline_m702.dependency",
        "UPDATE timeline_m702.repository_head SET revision=0", "DELETE FROM timeline_m702.version", "TRUNCATE timeline_m702.version",
        "INSERT INTO timeline_m702.audit_event SELECT * FROM timeline_m702.audit_event", "CREATE TABLE timeline_m702.forged(id int)", "CREATE TEMP TABLE forged(id int)",
        "SELECT timeline_m702.m6_snapshot('x','x','x','x','x')", "SELECT timeline_m702.gateway('read','{}','','{}')",
        `SELECT timeline_m702.${action === "read" ? "create" : "read"}('{}','','{}')`, "SELECT * FROM highlight_m602.version", "SELECT * FROM highlight_m602.proof_key",
        "UPDATE highlight_m602.repository_head SET revision=0", "SET ROLE timeline_m702_owner", "SET ROLE highlight_m602_owner",
      ]) await assert.rejects(c.query(sql), (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "42501");
    } finally { await c.end(); }
  }
  const functions = (await f.admin.query("SELECT pg_get_userbyid(proowner) owner,proconfig FROM pg_proc WHERE pronamespace='timeline_m702'::regnamespace AND prosecdef")).rows;
  assert.equal(functions.length, 3); assert.ok(functions.every(r => r.owner === "timeline_m702_owner" && r.proconfig.includes("search_path=pg_catalog, timeline_m702, pg_temp")));
  const fks = (await f.admin.query("SELECT cardinality(conkey) n FROM pg_constraint WHERE connamespace='timeline_m702'::regnamespace AND contype='f'")).rows;
  assert.ok(fks.filter(r => r.n >= 4).length >= 8);
  assert.equal((await f.m6.api.readHead(f.m6.request(), { scope: f.scope })).revision, 1, "unchanged M6 catalog boundary still passes after M7 fixture installation");
});
test("M7-02 immutable dependency, reservation, version and audit reject administrator UPDATE/DELETE/TRUNCATE", async () => {
  for (const table of ["dependency", "reservation", "version", "audit_event"]) for (const sql of [
    `UPDATE timeline_m702.${table} SET tenant=tenant`, `DELETE FROM timeline_m702.${table}`, `TRUNCATE timeline_m702.${table} CASCADE`,
  ]) await assert.rejects(f.admin.query(sql), (e: unknown) => e instanceof Error && e.message === "T702_IMMUTABLE");
  assert.equal((await f.counts()).versions, 1);
});
for (const change of ["pid", "transaction", "action", "payload", "expiry"] as const) test(`M7-02 SQL proof rejects valid-MAC ${change} mismatch`, async () => {
  const c = await connect(f.connections.read);
  try {
    await c.query("BEGIN"); const proof = await signed(c, f, "read", { op: "head" });
    if (change === "pid") proof.wire.pid++;
    if (change === "transaction") proof.wire.transactionId = "0";
    if (change === "action") proof.wire.action = "create";
    if (change === "payload") proof.wire.payloadHash = "f".repeat(64);
    if (change === "expiry") proof.wire.expiresAtMs = 0;
    await assert.rejects(c.query("SELECT timeline_m702.read($1,$2,$3)", proof.seal()), (e: unknown) => e instanceof Error && /T702_(PROOF_INVALID|FORBIDDEN)/.test(e.message));
  } finally { await c.query("ROLLBACK"); await c.end(); }
});
test("M7-02 action proof is one-use and cannot replay on another backend", async () => {
  const a = await connect(f.connections.read), b = await connect(f.connections.read);
  try {
    await a.query("BEGIN"); await b.query("BEGIN"); const proof = await signed(a, f, "read", { op: "head" });
    await a.query("SELECT timeline_m702.read($1,$2,$3)", proof.seal());
    await assert.rejects(b.query("SELECT timeline_m702.read($1,$2,$3)", proof.seal()), /T702_PROOF_INVALID/);
    await assert.rejects(a.query("SELECT timeline_m702.read($1,$2,$3)", proof.seal()), /T702_PROOF_INVALID/);
  } finally { await a.query("ROLLBACK"); await b.query("ROLLBACK"); await a.end(); await b.end(); }
});
test("M7-02 gateway rejects arbitrary/TCP/ambient connection config and unknown actions", async () => {
  for (const connections of [
    { ...f.connections, read: { ...f.connections.read, host: "127.0.0.1" } },
    { ...f.connections, create: { ...f.connections.create, database: "application" } },
    { ...f.connections, read: { ...f.connections.read, connectionString: "postgresql://unused" } },
  ]) assert.throws(() => createTimelineGatewayForTest({ mode: "M702_DISPOSABLE_ONLY", connections, keys: f.keys, authentication: f.authentication }));
  await assert.rejects(f.gateway.transaction("unknown" as "read", f.request(), f.scope, async () => null), { code: "DATABASE_UNSAFE" });
});
