import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { maintenanceFixture, connect } from "./fixture";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { actions, MAINTENANCE, restrictions, envelope, envelopeHash, type Action, type Context } from "../../../lib/storyline/maintenance-fake/contracts";
import { assertMaintenanceDatabase } from "../../../lib/storyline/maintenance-fake/database";
const wait = (ms: number) => new Promise(done => setTimeout(done, ms));

async function signed(f: Awaited<ReturnType<typeof maintenanceFixture>>, action: Action, bodyInput: Record<string, unknown>, test: (c: Awaited<ReturnType<typeof connect>>, wire: string, mac: string, body: string) => Promise<void>, patch: Record<string, unknown> = {}) {
  const c = await connect(f.connections[action]);
  try {
    await c.query("BEGIN"); const s = f.sessions.find(v => v.principalId === "editor")!;
    const meta = (await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx,floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0];
    const b = structuredClone(bodyInput);
    if (b.fact) {
      const fact = b.fact as { schemaVersion: string }; const kind = b.kind as "writer" | "reader" | "successor";
      b.factProof = createHmac("sha256", Buffer.from(f.keys[action], "hex")).update(`${fact.schemaVersion}\n${canonicalJson({ context: f.context, rootId: b.rootId, decisionId: b.id, revision: b.revision, kind, factHash: envelopeHash(kind, b.fact), backendPid: Number(meta.pid), transactionId: meta.tx })}`).digest("hex");
    }
    const body = canonicalJson(b);
    const wire = canonicalJson({ schemaVersion: MAINTENANCE.access, ...f.context, restrictions, sessionId: s.id, principalId: s.principalId, action,
      bodyHash: createHash("sha256").update(body).digest("hex"), nonce: randomBytes(24).toString("hex"), backendPid: Number(meta.pid), transactionId: meta.tx,
      expiresAtMs: Number(meta.now) + 3000, method: action === "read" || action === "health" ? "GET" : "POST", origin: s.origin, fetchSite: "same-origin",
      csrfHash: createHash("sha256").update(s.csrf).digest("hex"), ...patch });
    const mac = createHmac("sha256", Buffer.from(f.keys[action], "hex")).update(`${MAINTENANCE.access}\n${wire}`).digest("hex");
    await test(c, wire, mac, body);
  } finally { await c.query("ROLLBACK").catch(() => {}); await c.end(); }
}

for (const principal of ["denied", "expired", "foreign", "only-health"] as const) test(`native ${principal} cannot submit a maintenance decision`, async () => {
  const f = await maintenanceFixture(); try {
    await assert.rejects(f.api.submit(f.request("submit", principal), f.decision()));
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.decision")).rows[0].n, 0);
  } finally { await f.stop(); }
});
for (const [header, value] of [["origin", "https://foreign.invalid"], ["sec-fetch-site", "cross-site"], ["x-maintenance-csrf", null]] as const) test(`native ${header} cannot borrow valid session identity`, async () => {
  const f = await maintenanceFixture(); try { await assert.rejects(f.api.submit(f.request("submit", "editor", { [header]: value }), f.decision())); } finally { await f.stop(); }
});
test("native evidence authority is checked before consuming the original one-use handle", async () => {
  const f = await maintenanceFixture(); try {
    const v = await f.api.submit(f.request("submit"), f.decision()), handle = (await f.origin()).handles[0], id = String(v.decision.body.decisionId);
    await assert.rejects(f.api.registerEvidence(f.request("evidence", "only-health"), f.rootId, id, v.revision, handle));
    assert.equal((await f.api.registerEvidence(f.request("evidence"), f.rootId, id, v.revision, handle)).status, "EVIDENCE_PENDING");
    await assert.rejects(f.api.registerEvidence(f.request("evidence"), f.rootId, id, v.revision, { ...handle }));
  } finally { await f.stop(); }
});
test("SQL rejects NULL grants even with matching action, native permission and a valid action MAC", async () => {
  const f = await maintenanceFixture(); try {
    await f.admin.query("UPDATE maintenance_m806.access_grant SET actions=ARRAY['submit',NULL] WHERE principal='editor'");
    const d = f.decision(), body = { op: "submit", rootId: f.rootId, id: d.body.decisionId, decision: d };
    await assert.rejects(f.api.submit(f.request("submit"), d), { code: "FORBIDDEN" });
    await signed(f, "submit", body, async (c,w,m,b) => { await assert.rejects(c.query("SELECT maintenance_m806.submit($1,$2,$3)", [w,m,b]), /M806_FORBIDDEN/); });
    await f.admin.query("UPDATE maintenance_m806.access_grant SET actions=$1,root_ids=ARRAY[$2,NULL] WHERE principal='editor'", [[...actions], f.rootId]);
    await assert.rejects(f.api.submit(f.request("submit"), d), { code: "FORBIDDEN" });
    await signed(f, "submit", body, async (c,w,m,b) => { await assert.rejects(c.query("SELECT maintenance_m806.submit($1,$2,$3)", [w,m,b]), /M806_FORBIDDEN/); });
  } finally { await f.stop(); }
});
test("SQL/native grant disagreement, exact root grant and session revocation deny independently", async () => {
  const f = await maintenanceFixture(); try {
    const d = f.decision();
    await f.admin.query("UPDATE maintenance_m806.access_grant SET actions=ARRAY['health'] WHERE principal='editor'");
    await assert.rejects(f.api.submit(f.request("submit"), d), { code: "FORBIDDEN" });
    await f.admin.query("UPDATE maintenance_m806.access_grant SET actions=$1,root_ids=ARRAY['foreign-root'] WHERE principal='editor'", [[...actions]]);
    await assert.rejects(f.api.submit(f.request("submit"), d), { code: "FORBIDDEN" });
    await f.admin.query("UPDATE maintenance_m806.access_grant SET root_ids=$1 WHERE principal='editor'", [[f.rootId]]);
    await f.admin.query("UPDATE maintenance_m806.session SET revoked=true WHERE principal='editor'");
    await assert.rejects(f.api.submit(f.request("submit"), d), { code: "FORBIDDEN" });
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("forged and rehashed supervisor evidence cannot replace the independent original anchor", async () => {
  const f = await maintenanceFixture(); try {
    const v = await f.api.submit(f.request("submit"), f.decision()), id = String(v.decision.body.decisionId);
    const original = f.original.evidence[0].fact;
    for (const patch of [{ ownerHash: "b".repeat(64) }, { guardHash: "b".repeat(64) }, { generation: 2 }, { descendants: "UNKNOWN", descriptorsClosed: false }]) {
      const forged = envelope("writer", f.context, { ...original.body, ...patch });
      await signed(f, "evidence", { op: "evidence", rootId: f.rootId, id, revision: v.revision, kind: "writer", fact: forged }, async (c,w,m,b) => {
        await assert.rejects(c.query("SELECT maintenance_m806.evidence($1,$2,$3)", [w,m,b]), /M806_ORIGINAL_EVIDENCE_REQUIRED/);
      });
    }
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.evidence")).rows[0].n, 0);
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("uncertain original descendant evidence is durable but never qualifies as quiescent", async () => {
  const f = await maintenanceFixture("UNCERTAIN_DESCENDANT"); try {
    const v = await f.prepared(), result = await f.api.qualify(f.request("qualify"), f.rootId, String(v.decision.body.decisionId), v.revision);
    assert.equal(result.status, "QUALIFICATION_BLOCKED"); assert.equal(result.rootGeneration, 1);
    assert.equal(f.original.evidence[0].fact.body.descendants, "UNKNOWN"); assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("unknown original owner and mismatched root identity cannot be repaired by a rehash", async () => {
  const f = await maintenanceFixture(); try {
    await assert.rejects(f.api.submit(f.request("submit"), f.decision(undefined, { rootHash: "b".repeat(64) })), { code: "ROOT_BINDING" });
    await assert.rejects(f.api.submit(f.request("submit"), f.decision(undefined, { writerId: "unknown-owner" })), { code: "ROOT_BINDING" });
    const v = await f.prepared();
    // Independent fixture administrator simulates loss of a registry row, not a maintenance privilege.
    await f.admin.query("ALTER TABLE maintenance_m806.owner DISABLE TRIGGER immutable_row");
    await f.admin.query("DELETE FROM maintenance_m806.owner WHERE kind='WRITER'");
    await f.admin.query("ALTER TABLE maintenance_m806.owner ENABLE TRIGGER immutable_row");
    assert.equal((await f.api.qualify(f.request("qualify"), f.rootId, String(v.decision.body.decisionId), v.revision)).status, "QUALIFICATION_BLOCKED");
  } finally { await f.stop(); }
});
test("proof expiry during a real quota lock wait denies after wait without partial decision", async () => {
  const f = await maintenanceFixture(), writer = await f.owned.securityAdministrator(); try {
    await writer.query("BEGIN; UPDATE maintenance_m806.quota SET bytes=bytes WHERE id");
    const api = f.service(f.gateway({ proofTtlMs: 50 }));
    const pending = assert.rejects(api.submit(f.request("submit"), f.decision()), { code: "AUTH_EXPIRED" });
    await wait(150); await writer.query("COMMIT"); await pending;
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.decision")).rows[0].n, 0);
  } finally { await writer.query("ROLLBACK").catch(() => {}); await writer.end(); await f.stop(); }
});
test("audit failure rolls back result, root CAS and quota; deferred deadline rejects late commit", async () => {
  const f = await maintenanceFixture(); try {
    const v = await f.prepared(), id = String(v.decision.body.decisionId);
    await f.admin.query("CREATE TRIGGER injected_audit_failure BEFORE INSERT ON maintenance_m806.audit_event FOR EACH ROW EXECUTE FUNCTION maintenance_m806.immutable()");
    await assert.rejects(f.api.qualify(f.request("qualify"), f.rootId, id, v.revision));
    assert.equal((await f.admin.query("SELECT generation FROM maintenance_m806.root_head")).rows[0].generation, 1);
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.result")).rows[0].n, 0);
    await f.admin.query("DROP TRIGGER injected_audit_failure ON maintenance_m806.audit_event");
    const late = f.service(f.gateway({ proofTtlMs: 50, hooks: { beforeCommit: async () => { await wait(100); } } }));
    await assert.rejects(late.qualify(f.request("qualify"), f.rootId, id, v.revision), { code: "AUTH_EXPIRED" });
    assert.equal((await f.api.qualify(f.request("qualify"), f.rootId, id, v.revision)).status, "QUALIFIED_FOR_FUTURE_PHASE_ONLY");
  } finally { await f.stop(); }
});
test("audit failure on submit/evidence rolls back charges, nonces and incomplete references atomically", async () => {
  const f = await maintenanceFixture(); try {
    const snapshot = async () => (await f.admin.query("SELECT q.decisions,q.evidence,q.bytes,(SELECT count(*)::int FROM maintenance_m806.used_proof) proofs,(SELECT count(*)::int FROM maintenance_m806.audit_event) audits FROM maintenance_m806.quota q")).rows[0];
    const fail = () => f.admin.query("CREATE TRIGGER injected_audit_failure BEFORE INSERT ON maintenance_m806.audit_event FOR EACH ROW EXECUTE FUNCTION maintenance_m806.immutable()");
    const resume = () => f.admin.query("DROP TRIGGER injected_audit_failure ON maintenance_m806.audit_event");
    const input = f.decision(), initial = await snapshot();
    await fail(); await assert.rejects(f.api.submit(f.request("submit"), input)); assert.deepEqual(await snapshot(), initial); await resume();
    const v = await f.api.submit(f.request("submit"), input), admitted = await snapshot();
    await fail();
    await assert.rejects(f.api.registerEvidence(f.request("evidence"), f.rootId, String(input.body.decisionId), v.revision, (await f.origin()).handles[0]));
    assert.deepEqual(await snapshot(), admitted);
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.evidence")).rows[0].n, 0);
    await resume();
    assert.equal((await f.api.read(f.request("read"), f.rootId, String(input.body.decisionId), v.hash)).revision, 0);
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("bounded decision metadata saturation does not evict original facts", async () => {
  const f = await maintenanceFixture(); try {
    const d = f.decision(), v = await f.api.submit(f.request("submit"), d);
    await f.admin.query("UPDATE maintenance_m806.quota SET decisions=16 WHERE id");
    await assert.rejects(f.api.submit(f.request("submit"), f.decision()), { code: "QUOTA" });
    assert.equal((await f.api.submit(f.request("submit"), d)).hash, v.hash);
    const health = await f.api.health(f.request("health", "only-health")); assert.equal(health.body.capacity, "SATURATED");
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.decision")).rows[0].n, 1);
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("native exact URL/method and revoked identity fail before SQL or original work", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("maintenance cannot make a network request"));
  const f = await maintenanceFixture(); try {
    const valid = f.request("submit"), input = f.decision();
    for (const request of [new Request(valid.url + "?action=submit", { method: "POST", headers: valid.headers }),
      new Request(valid.url, { method: "GET", headers: valid.headers }), { ...valid },
      f.request("submit", "editor", { cookie: valid.headers.get("cookie") + "; " + valid.headers.get("cookie") })])
      await assert.rejects(f.api.submit(request, input));
    f.auth.revokeForTest(f.sessions.find(s => s.principalId === "editor")!.id);
    await assert.rejects(f.api.submit(valid, input), { code: "SESSION_INVALID" });
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.decision")).rows[0].n, 0);
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("SQL independently rejects missing, NULL, unexpected and promoted decision fields with a valid MAC", async () => {
  const f = await maintenanceFixture(); try {
    const original = f.decision();
    const missing = structuredClone(original); delete missing.body.expectedRevision;
    for (const decision of [missing, { ...original, body: { ...original.body, expectedGeneration: null } },
      { ...original, body: { ...original.body, browserRole: "owner" } },
      { ...original, restrictions: { ...restrictions, operationalRecovery: true } },
      { ...original, schemaVersion: "story-recap-execution-permit-v1" }])
      await signed(f, "submit", { op: "submit", rootId: f.rootId, id: original.body.decisionId, decision }, async (c,w,m,b) => {
        await assert.rejects(c.query("SELECT maintenance_m806.submit($1,$2,$3)", [w,m,b]), /M806_INVALID_DECISION/);
      });
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.decision")).rows[0].n, 0);
  } finally { await f.stop(); }
});
test("cross-root and stale generation/revision cannot register or advance the maintenance root", async () => {
  const f = await maintenanceFixture(); try {
    await assert.rejects(f.api.submit(f.request("submit"), f.decision(undefined, { rootId: "other-root" })), { code: "ROOT_FORBIDDEN" });
    for (const patch of [{ expectedGeneration: 2 }, { expectedRevision: 1 }])
      await assert.rejects(f.api.submit(f.request("submit"), f.decision(undefined, patch)), { code: "STALE_CAS" });
    const v = await f.prepared(), id = String(v.decision.body.decisionId);
    await assert.rejects(f.api.qualify(f.request("qualify"), f.rootId, id, v.revision - 1), { code: "STALE_CAS" });
    assert.equal((await f.api.qualify(f.request("qualify"), f.rootId, id, v.revision)).status, "QUALIFIED_FOR_FUTURE_PHASE_ONLY");
    await assert.rejects(f.api.submit(f.request("submit"), f.decision()), { code: "STALE_CAS" });
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("evidence and logical byte ceilings roll back registration without erasing original anchors", async () => {
  const f = await maintenanceFixture(); try {
    const v = await f.api.submit(f.request("submit"), f.decision()), id = String(v.decision.body.decisionId);
    await f.admin.query("UPDATE maintenance_m806.quota SET evidence=32 WHERE id");
    await assert.rejects(f.api.registerEvidence(f.request("evidence"), f.rootId, id, v.revision, (await f.origin()).handles[0]), { code: "QUOTA" });
    await f.admin.query("UPDATE maintenance_m806.quota SET evidence=0,bytes=1048576 WHERE id");
    await assert.rejects(f.api.registerEvidence(f.request("evidence"), f.rootId, id, v.revision, (await f.origin()).handles[0]), { code: "QUOTA" });
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.evidence")).rows[0].n, 0);
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.anchor")).rows[0].n, 3);
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.audit_event")).rows[0].n, 1);
    assert.equal((await f.api.read(f.request("read"), f.rootId, id, v.hash)).revision, 0);
  } finally { await f.stop(); }
});
test("one-use proof record ceiling rejects additional access and retains existing decision evidence", async () => {
  const f = await maintenanceFixture(); try {
    await f.api.submit(f.request("submit"), f.decision());
    await f.admin.query("INSERT INTO maintenance_m806.used_proof SELECT lpad(to_hex(i),48,'0'),$1,$2 FROM generate_series(1,4095) i", [f.scopeKey, f.sessions.find(s => s.principalId === "editor")!.id]);
    await assert.rejects(f.api.health(f.request("health", "only-health")), { code: "QUOTA" });
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.used_proof")).rows[0].n, 4096);
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.decision")).rows[0].n, 1);
  } finally { await f.stop(); }
});
test("health-only login returns redacted scoped counters and cannot obtain decision or original content", async () => {
  const f = await maintenanceFixture(); try {
    const v = await f.prepared(); const h = await f.api.health(f.request("health", "only-health"));
    assert.equal(h.body.decisionCount, 1); assert.equal(h.body.evidenceCount, 3);
    const text = JSON.stringify(h); for (const privateValue of [f.rootId, f.owners[0].body.ownerId, f.root.body.guardHash]) assert.equal(text.includes(String(privateValue)), false);
    await assert.rejects(f.api.read(f.request("read", "only-health"), f.rootId, String(v.decision.body.decisionId), v.hash));
    assert.equal("releaseHold" in f.api, false);
  } finally { await f.stop(); }
});
for (const action of actions) test(`restricted ${action} login has no table/column/helper/owner/TEMP/schema privilege`, async () => {
  const f = await maintenanceFixture(), c = await connect(f.connections[action]); try {
    await assertMaintenanceDatabase(c, action);
    for (const sql of ["SELECT payload FROM maintenance_m806.anchor", "UPDATE maintenance_m806.root_head SET generation=2", "SELECT maintenance_m806.canonical('{}'::jsonb)",
      "SET ROLE maintenance_m806_owner", "CREATE TEMP TABLE forbidden(x int)", "CREATE SCHEMA forbidden", "ALTER FUNCTION maintenance_m806.gateway(text,text,text,text) SET search_path=public"]) await assert.rejects(c.query(sql));
    await c.query("SET search_path=public,pg_temp"); await assertMaintenanceDatabase(c, action);
    await f.admin.query(`GRANT SELECT(payload) ON maintenance_m806.anchor TO ${f.connections[action].user}`);
    await assert.rejects(assertMaintenanceDatabase(c, action), { code: "DATABASE_UNSAFE" });
  } finally { await c.end(); await f.stop(); }
});
test("one-use proof binds action/body/backend/transaction and cannot be replayed or moved", async () => {
  const f = await maintenanceFixture(); try {
    const d = f.decision(), body = { op: "submit", rootId: f.rootId, id: d.body.decisionId, decision: d };
    await signed(f, "submit", body, async (c,w,m,b) => {
      await c.query("SELECT maintenance_m806.submit($1,$2,$3)", [w,m,b]);
      await assert.rejects(c.query("SELECT maintenance_m806.submit($1,$2,$3)", [w,m,b]), /M806_PROOF_REPLAY/);
    });
    for (const patch of [{ backendPid: 1 }, { transactionId: "1" }, { action: "qualify" }, { bodyHash: "b".repeat(64) }, { scope: { ...f.context.scope, tenantId: "foreign" } }])
      await signed(f, "submit", body, async (c,w,m,b) => { await assert.rejects(c.query("SELECT maintenance_m806.submit($1,$2,$3)", [w,m,b])); }, patch);
    const otherContext: Context = { ...f.context, namespace: "wrong-namespace" };
    await assert.rejects(f.db.transaction("submit", f.request("submit"), otherContext, tx => tx.call(body)));
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
