import assert from "node:assert/strict";
import { before, after, mock, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { HighlightStoreError, highlightProposalHash } from "../../../lib/storyline/highlights-persistence/contracts";
import { createHighlightGatewayForTest } from "../../../lib/storyline/highlights-persistence/database";
import { connect, highlightDatabaseFixture, signed } from "./fixture";
let f: Awaited<ReturnType<typeof highlightDatabaseFixture>>;
let originalId: string;
const code = (name: string) => (e: unknown) => e instanceof HighlightStoreError && e.code === name;
before(async () => {
  mock.method(globalThis, "fetch", () => assert.fail("No provider/network calls"));
  f = await highlightDatabaseFixture(); const r = await f.save(await f.proposal("security-record"));
  if (r.status === "UNKNOWN") assert.fail(); originalId = r.view.record.id;
});
after(async () => { await f?.stop(); mock.restoreAll(); });

for (const [name, principal, overrides, expected] of [
  ["missing session", "editor-a", { cookie: null }, "AUTH_REQUIRED"],
  ["forged session", "editor-a", { cookie: "highlight_m602_session=forged" }, "SESSION_INVALID"],
  ["duplicate session", "editor-a", { cookie: "highlight_m602_session=one; highlight_m602_session=two" }, "AUTH_REQUIRED"],
  ["expired session", "expired", {}, "SESSION_INVALID"],
  ["foreign tenant", "foreign", {}, "FORBIDDEN"],
  ["read-only principal", "reader", {}, "FORBIDDEN"],
  ["missing grant", "denied", {}, "FORBIDDEN"],
  ["database revoked session", "db-revoked", {}, "FORBIDDEN"],
  ["database denied principal", "db-denied", {}, "FORBIDDEN"],
  ["wrong Origin", "editor-a", { origin: "https://evil.invalid" }, "ORIGIN_REJECTED"],
  ["missing Origin", "editor-a", { origin: null }, "ORIGIN_REJECTED"],
  ["wrong CSRF", "editor-a", { csrf: "f".repeat(64) }, "CSRF_REJECTED"],
  ["missing CSRF", "editor-a", { csrf: null }, "CSRF_REJECTED"],
  ["cross-site", "editor-a", { fetchSite: "cross-site" }, "ORIGIN_REJECTED"],
  ["wrong method", "editor-a", { method: "GET" }, "ORIGIN_REJECTED"],
  ["wrong URL origin", "editor-a", { url: "https://evil.invalid/x" }, "ORIGIN_REJECTED"],
] as const) test(`M6-02 save denies ${name} without changing durable state`, async () => {
  const p = await f.proposal("unauthorized-proposal"), before = await f.counts();
  await assert.rejects(() => f.api.saveVersion(f.request(principal, true, overrides), f.request(principal), p), code(expected));
  assert.deepEqual(await f.counts(), before);
});

for (const field of ["projectId", "movieId", "studioId"] as const) test(`M6-02 database ownership rejects server-granted but unowned ${field}`, async () => {
  const scope = { ...f.scope, [field]: "other-resource" };
  for (const method of [
    () => f.api.readVersion(f.request("wide"), { scope, id: originalId }),
    () => f.api.readHead(f.request("wide"), { scope }),
    () => f.api.listHistory(f.request("wide"), { scope, afterVersion: 0, limit: 1 }),
    () => f.api.readOperation(f.request("wide"), { scope, idempotencyKey: "security-record", proposalHash: "f".repeat(64) }),
  ]) await assert.rejects(method, code("FORBIDDEN"));
  const p = structuredClone(await f.proposal("unowned-save")); p.scope = scope;
  Object.assign(p.plan.plan.input.source.narration.scope, { [field]: scope[field] }); Object.assign(p.plan.plan.input.source.narration.source, { [field]: scope[field] });
  Object.assign(p.plan, { planHash: contractHash("story-highlight-plan-v1", p.plan.plan) });
  await assert.rejects(() => f.save(p, "wide"), code("FORBIDDEN"));
});

test("M6-02 read authorizes every version/head/history/operation independently", async () => {
  for (const method of [
    () => f.api.readVersion(f.request("denied"), { scope: f.scope, id: originalId }),
    () => f.api.readHead(f.request("denied"), { scope: f.scope }),
    () => f.api.listHistory(f.request("denied"), { scope: f.scope, afterVersion: 0, limit: 1 }),
    () => f.api.readOperation(f.request("denied"), { scope: f.scope, idempotencyKey: "security-record", proposalHash: "f".repeat(64) }),
  ]) await assert.rejects(method, code("FORBIDDEN"));
  assert.equal((await f.api.readHead(f.request("reader"), { scope: f.scope })).revision, 1);
});

test("M6-02 server-owned session must match the database principal and read-back identity", async () => {
  const p = await f.proposal("identity-mismatch");
  await assert.rejects(() => f.api.saveVersion(f.request("editor-a", true), f.request("editor-b"), p), code("FORBIDDEN"));
  await f.admin.query("UPDATE highlight_m602.session SET principal='editor-b' WHERE id='session-editor-a'");
  try { await assert.rejects(() => f.save(p), code("FORBIDDEN")); }
  finally { await f.admin.query("UPDATE highlight_m602.session SET principal='editor-a' WHERE id='session-editor-a'"); }
});

test("M6-02 catalog denies action logins all direct private reads/writes, helper calls and creation", async () => {
  for (const action of ["read", "create"] as const) {
    const c = await connect(f.connections[action]);
    try {
      for (const sql of [
        "SELECT * FROM highlight_m602.version", "SELECT * FROM highlight_m602.proof_key", "SELECT * FROM highlight_m602.source_snapshot",
        "SELECT a.id FROM highlight_m602.version a JOIN highlight_m602.version b ON a.id=b.id WHERE a.tenant<>b.tenant",
        "UPDATE highlight_m602.repository_head SET revision=0", "DELETE FROM highlight_m602.version", "TRUNCATE highlight_m602.version",
        "INSERT INTO highlight_m602.audit_event SELECT * FROM highlight_m602.audit_event", "CREATE TABLE highlight_m602.forged(id int)",
        "CREATE TEMP TABLE forged(id int)", "SELECT highlight_m602.load_dependency('x','x','x','x','x')", "SELECT highlight_m602.gateway('read','{}','','{}')",
        `SELECT highlight_m602.${action === "read" ? "create" : "read"}('{}','','{}')`,
      ]) await assert.rejects(() => c.query(sql), (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "42501");
    } finally { await c.end(); }
  }
  const functions = (await f.admin.query("SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='highlight_m602' AND p.prosecdef")).rows;
  assert.equal(functions.length, 3); assert(functions.every(p => p.owner === "highlight_m602_owner" && p.proconfig.includes("search_path=pg_catalog, highlight_m602, pg_temp")));
  const fks = (await f.admin.query("SELECT cardinality(conkey) n FROM pg_constraint WHERE connamespace='highlight_m602'::regnamespace AND contype='f'")).rows;
  assert(fks.filter(r => Number(r.n) >= 4).length >= 10);
});

test("M6-02 immutable source, dependency, reservation, version and audit rows resist owner UPDATE/DELETE/TRUNCATE", async () => {
  for (const table of ["source_snapshot", "analysis_snapshot", "narration_snapshot", "dependency", "reservation", "version", "audit_event"]) {
    for (const sql of [`UPDATE highlight_m602.${table} SET tenant=tenant`, `DELETE FROM highlight_m602.${table}`, `TRUNCATE highlight_m602.${table} CASCADE`])
      await assert.rejects(() => f.admin.query(sql), (e: unknown) => e instanceof Error && e.message === "H602_IMMUTABLE");
  }
  assert.equal((await f.counts()).versions, 1);
});

test("M6-02 composite source foreign keys reject cross-tenant artifact references", async () => {
  const s = f.scope;
  await f.admin.query("INSERT INTO highlight_m602.source_snapshot SELECT tenant,project,movie,studio,'only-in-tenant-one',value FROM highlight_m602.source_snapshot WHERE tenant='tenant-one' LIMIT 1");
  await assert.rejects(() => f.admin.query("INSERT INTO highlight_m602.analysis_snapshot VALUES('tenant-two',$1,$2,$3,'foreign-analysis','only-in-tenant-one','{}')", [s.projectId,s.movieId,s.studioId]),
    (e: unknown) => !!e && typeof e === "object" && (e as { code: string }).code === "23503");
});

for (const [name, setup, teardown] of [
  ["table SELECT", "GRANT SELECT ON highlight_m602.version TO highlight_m602_read", "REVOKE SELECT ON highlight_m602.version FROM highlight_m602_read"],
  ["column SELECT", "GRANT SELECT(hash) ON highlight_m602.version TO highlight_m602_read", "REVOKE SELECT(hash) ON highlight_m602.version FROM highlight_m602_read"],
  ["PUBLIC gateway", "GRANT EXECUTE ON FUNCTION highlight_m602.gateway(text,text,text,text) TO PUBLIC", "REVOKE EXECUTE ON FUNCTION highlight_m602.gateway(text,text,text,text) FROM PUBLIC"],
  ["unsafe search path", "ALTER FUNCTION highlight_m602.read(text,text,text) SET search_path=public,pg_catalog", "ALTER FUNCTION highlight_m602.read(text,text,text) SET search_path=pg_catalog,highlight_m602,pg_temp"],
  ["missing search path", "ALTER FUNCTION highlight_m602.read(text,text,text) RESET search_path", "ALTER FUNCTION highlight_m602.read(text,text,text) SET search_path=pg_catalog,highlight_m602,pg_temp"],
  ["disabled immutability", "ALTER TABLE highlight_m602.version DISABLE TRIGGER immutable_row", "ALTER TABLE highlight_m602.version ENABLE TRIGGER immutable_row"],
] as const) test(`M6-02 runtime catalog assertion rejects ${name}`, async () => {
  await f.admin.query(setup);
  try { await assert.rejects(() => f.api.readHead(f.request(), { scope: f.scope }), code("DATABASE_UNSAFE")); }
  finally { await f.admin.query(teardown); }
});

test("M6-02 no default/application connection, connection string override or elevated login is accepted", async () => {
  for (const changed of [
    { ...f.connections.read, host: "127.0.0.1" }, { ...f.connections.read, connectionString: "postgresql://unreachable.invalid/app" },
    { ...f.connections.read, database: "application" }, { ...f.connections.read, host: "/tmp/movie-translator-storyline-m1e15-abc/../socket" },
  ]) assert.throws(() => createHighlightGatewayForTest({ mode: "M602_DISPOSABLE_ONLY", authentication: f.authentication, connections: { ...f.connections, read: changed }, keys: f.keys }));
  const p = await f.proposal("forged-auth");
  const gateway = createHighlightGatewayForTest({ mode: "M602_DISPOSABLE_ONLY", authentication: { mode: "M602_DISPOSABLE_ONLY", revokeForTest() {} }, connections: f.connections, keys: f.keys });
  await assert.rejects(() => f.service({ gateway }).saveVersion(f.request("editor-a", true), f.request(), p), code("AUTH_REQUIRED"));
});

for (const [name, mutate, expected] of [
  ["wrong action", (w: Record<string, unknown>) => { w.action = "read"; }, "H602_PROOF_INVALID"],
  ["wrong backend", (w: Record<string, unknown>) => { w.pid = Number(w.pid) + 1; }, "H602_PROOF_INVALID"],
  ["missing backend", (w: Record<string, unknown>) => { w.pid = null; }, "H602_PROOF_INVALID"],
  ["expired proof", (w: Record<string, unknown>) => { w.expiresAtMs = 1; }, "H602_FORBIDDEN"],
  ["null expiry", (w: Record<string, unknown>) => { w.expiresAtMs = null; }, "H602_FORBIDDEN"],
  ["wrong Origin", (w: Record<string, unknown>) => { w.origin = "https://evil.invalid"; }, "H602_FORBIDDEN"],
  ["wrong CSRF", (w: Record<string, unknown>) => { w.csrfHash = "f".repeat(64); }, "H602_FORBIDDEN"],
  ["wrong principal", (w: Record<string, unknown>) => { w.principalId = "editor-b"; }, "H602_FORBIDDEN"],
] as const) test(`M6-02 database proof rejects ${name} even with a valid action MAC`, async () => {
  const c = await connect(f.connections.create);
  try { await c.query("BEGIN"); const proof = await signed(c, f, "create", { op: "capture", key: null, proposalHash: null });
    mutate(proof.w); await assert.rejects(() => c.query("SELECT highlight_m602.create($1,$2,$3)", proof.seal()), (e: unknown) => e instanceof Error && e.message === expected);
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("M6-02 proof binds exact payload, one-use nonce, transaction and backend", async () => {
  const a = await connect(f.connections.create), b = await connect(f.connections.create);
  try {
    await a.query("BEGIN"); await b.query("BEGIN");
    const proof = await signed(a, f, "create", { op: "capture", key: null, proposalHash: null });
    await assert.rejects(() => b.query("SELECT highlight_m602.create($1,$2,$3)", proof.seal()), /H602_PROOF_INVALID/); await b.query("ROLLBACK; BEGIN");
    const tampered = proof.seal(); tampered[2] = canonicalJson({ op: "head" });
    await assert.rejects(() => a.query("SELECT highlight_m602.create($1,$2,$3)", tampered), /H602_PROOF_INVALID/); await a.query("ROLLBACK; BEGIN");
    const once = await signed(a, f, "create", { op: "capture", key: null, proposalHash: null });
    await a.query("SELECT highlight_m602.create($1,$2,$3)", once.seal());
    await assert.rejects(() => a.query("SELECT highlight_m602.create($1,$2,$3)", once.seal()), (e: unknown) => !!e && typeof e === "object" && (e as { code: string }).code === "23505");
    await a.query("ROLLBACK; BEGIN"); const prior = await signed(a, f, "create", { op: "capture", key: null, proposalHash: null });
    await a.query("COMMIT; BEGIN"); await assert.rejects(() => a.query("SELECT highlight_m602.create($1,$2,$3)", prior.seal()), /H602_PROOF_INVALID/);
  } finally { await a.query("ROLLBACK"); await b.query("ROLLBACK"); await a.end(); await b.end(); }
});

test("M6-02 incomplete authorized reservation cannot commit without a version and audit", async () => {
  const c = await connect(f.connections.create);
  try {
    const p = await f.proposal("incomplete-reservation"); await c.query("BEGIN");
    const proof = await signed(c, f, "create", { op: "reserve", proposal: p, proposalHash: highlightProposalHash(p), dependencyId: f.initial.id, dependencyHash: f.initial.hash });
    const r = (await c.query("SELECT highlight_m602.create($1,$2,$3) result", proof.seal())).rows[0].result;
    assert.equal(r.status, "OPEN"); await assert.rejects(() => c.query("COMMIT"), /H602_INCOMPLETE/);
    assert.equal((await f.counts()).reservations, 1);
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("M6-02 canonical SQL digest agrees with JS and historical tampering is independently detected", async () => {
  const read = await f.api.readVersion(f.request(), { scope: f.scope, id: originalId });
  const sqlHash = (await f.admin.query("SELECT highlight_m602.digest($1,$2::jsonb) hash", ["story-highlight-saved-record-v1", canonicalJson(read.record)])).rows[0].hash;
  assert.equal(sqlHash, read.recordHash);
  await f.admin.query("ALTER TABLE highlight_m602.version DISABLE TRIGGER immutable_row");
  try { await f.admin.query("UPDATE highlight_m602.version SET payload=jsonb_set(payload,'{plan,plan,candidates,0,totalScore}','66') WHERE id=$1", [originalId]); }
  finally { await f.admin.query("ALTER TABLE highlight_m602.version ENABLE TRIGGER immutable_row"); }
  try { await assert.rejects(() => f.api.readVersion(f.request(), { scope: f.scope, id: originalId }), code("INTEGRITY_FAILED")); }
  finally {
    await f.admin.query("ALTER TABLE highlight_m602.version DISABLE TRIGGER immutable_row");
    await f.admin.query("UPDATE highlight_m602.version SET payload=$2::jsonb WHERE id=$1", [originalId, canonicalJson(read.record)]);
    await f.admin.query("ALTER TABLE highlight_m602.version ENABLE TRIGGER immutable_row");
  }
});

test("M6-02 source stays outside production imports and does not execute media/provider operations", async () => {
  async function visit(path: string) {
    for (const e of await readdir(path, { withFileTypes: true })) {
      const p = join(path, e.name); if (e.isDirectory()) await visit(p); else if (/\.[cm]?[jt]sx?$/.test(p)) {
        const s = await readFile(p, "utf8"); assert(!/highlights-persistence|highlight_m602|createDisposableHighlightRepositoryForTest/.test(s), p);
      }
    }
  }
  for (const dir of ["app", "components", "workers", "scripts"]) await visit(dir);
  for (const name of await readdir("lib/storyline/highlights-persistence")) {
    const s = await readFile(join("lib/storyline/highlights-persistence", name), "utf8");
    assert(!/\bfetch\s*\(|\bexecFile\s*\(|DATABASE_URL|from ["'].*(?:media|provider|prisma)[^"']*["']/.test(s), name);
  }
});

test("M6-02 elevated membership and revoked proof keys fail the same-backend catalog/auth checks", async () => {
  await f.admin.query(`GRANT highlight_m602_owner TO ${f.connections.read.user}`);
  try { await assert.rejects(() => f.api.readHead(f.request(), { scope: f.scope }), code("DATABASE_UNSAFE")); }
  finally { await f.admin.query(`REVOKE highlight_m602_owner FROM ${f.connections.read.user}`); }
  await f.admin.query("UPDATE highlight_m602.proof_key SET enabled=false WHERE action='read'");
  try { await assert.rejects(() => f.api.readHead(f.request(), { scope: f.scope }), code("PROOF_INVALID")); }
  finally { await f.admin.query("UPDATE highlight_m602.proof_key SET enabled=true WHERE action='read'"); }
});

test("M6-02 SQL rejects null/unbounded history and malformed JSON without trusting service parsers", async () => {
  const c = await connect(f.connections.read);
  try {
    for (const body of [{ op: "history", afterVersion: 0, limit: null }, { op: "history", afterVersion: null, limit: 1 }, { op: "history", afterVersion: 0, limit: 1000000 }]) {
      await c.query("BEGIN"); const proof = await signed(c, f, "read", body);
      await assert.rejects(() => c.query("SELECT highlight_m602.read($1,$2,$3)", proof.seal()), /H602_INVALID_INPUT/); await c.query("ROLLBACK");
    }
    await assert.rejects(() => c.query("SELECT highlight_m602.read($1,$2,$3)", ["{", "", "{"]), (e: unknown) => !!e && typeof e === "object" && (e as { code: string }).code === "22P02");
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("M6-02 complete independent replay rejects coordinated rehashed plan/proposal/record/audit manipulation", async () => {
  const old = (await f.admin.query(`SELECT v.payload,v.hash,v.plan_hash,r.proposal,r.proposal_hash,a.payload audit,a.hash audit_hash
   FROM highlight_m602.version v JOIN highlight_m602.reservation r ON r.id=v.reservation_id AND r.tenant=v.tenant
   JOIN highlight_m602.audit_event a ON a.version_id=v.id AND a.tenant=v.tenant WHERE v.id=$1`, [originalId])).rows[0];
  const payload = structuredClone(old.payload), proposal = structuredClone(old.proposal), audit = structuredClone(old.audit);
  payload.plan.plan.candidates[0].totalScore++;
  payload.plan.planHash = contractHash("story-highlight-plan-v1", payload.plan.plan); proposal.plan = payload.plan;
  payload.proposalHash = highlightProposalHash(proposal);
  const recordHash = contractHash("story-highlight-saved-record-v1", payload);
  audit.recordHash = recordHash; audit.proposalHash = payload.proposalHash;
  async function replace(p: unknown, h: string, ph: string, q: unknown, qh: string, a: unknown, ah: string) {
    for (const table of ["version", "reservation", "audit_event"]) await f.admin.query(`ALTER TABLE highlight_m602.${table} DISABLE TRIGGER immutable_row`);
    try {
      await f.admin.query("UPDATE highlight_m602.version SET payload=$2::jsonb,hash=$3,plan_hash=$4 WHERE id=$1", [originalId, canonicalJson(p), h, ph]);
      await f.admin.query("UPDATE highlight_m602.reservation SET proposal=$2::jsonb,proposal_hash=$3 WHERE id=$1", [originalId, canonicalJson(q), qh]);
      await f.admin.query("UPDATE highlight_m602.audit_event SET payload=$2::jsonb,hash=$3 WHERE version_id=$1", [originalId, canonicalJson(a), ah]);
    } finally { for (const table of ["version", "reservation", "audit_event"]) await f.admin.query(`ALTER TABLE highlight_m602.${table} ENABLE TRIGGER immutable_row`); }
  }
  try {
    await replace(payload, recordHash, payload.plan.planHash, proposal, payload.proposalHash, audit, contractHash("story-highlight-save-audit-v1", audit));
    await assert.rejects(() => f.api.readVersion(f.request(), { scope: f.scope, id: originalId }), code("INTEGRITY_FAILED"));
  } finally { await replace(old.payload, old.hash, old.plan_hash, old.proposal, old.proposal_hash, old.audit, old.audit_hash); }
});

test("M6-02 invalid runtime action cannot index missing credentials or fall back to ambient pg defaults", async () => {
  await assert.rejects(() => f.gateway.transaction("unsupported" as "read", f.request(), f.scope, async () => assert.fail("No transaction may start")), code("DATABASE_UNSAFE"));
});
