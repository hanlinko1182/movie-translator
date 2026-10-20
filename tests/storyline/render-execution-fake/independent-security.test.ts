import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { chmod, unlink, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { executionFixture, connect } from "./fixture";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { createSyntheticExecutionAuthenticationForTest } from "../../../lib/storyline/render-execution-fake/auth";
import { createExecutionGatewayForTest, CommitUnknown, type ExecutionGateway } from "../../../lib/storyline/render-execution-fake/database";
import { EXECUTION, actions, envelope, type Action } from "../../../lib/storyline/render-execution-fake/contracts";

for (const action of ["recover", "quarantine", "gc"] as Action[]) test(`independent review: ${action} alone cannot capture or inspect private source lineage`, async () => {
  const f = await executionFixture();
  try {
    const original = await f.reserve();
    const sessions = structuredClone(f.sessions); sessions.find(s => s.principalId === "editor-a")!.actions = [action];
    await f.admin.query("UPDATE execution_m803.access_grant SET actions=$1 WHERE principal='editor-a'", [[action]]);
    const auth = createSyntheticExecutionAuthenticationForTest(sessions);
    const gateway = createExecutionGatewayForTest({ mode: "M803_DISPOSABLE_ONLY", connections: f.connections, keys: f.keys, authentication: auth.authentication });
    const bodies = [{ op: "capture", sourceHash: f.source.sourceHash }, { op: "inspect", id: original.id }];
    for (const body of bodies) await assert.rejects(gateway.transaction(action, f.request(action), f.context, tx => tx.call(body)), { code: "FORBIDDEN" });
    // Bypass the broker using an otherwise correct action proof: SQL must deny
    // independently, even when the trusted broker is defective or compromised.
    const c = await connect(f.connections[action]);
    try {
      await c.query("BEGIN");
      const s = sessions.find(s => s.principalId === "editor-a")!, meta = (await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx,floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0];
      for (const input of bodies) {
        await c.query("SAVEPOINT negative_operation");
        const body = canonicalJson(input);
        const wire = canonicalJson({ domain: EXECUTION.access, ...f.context, sessionId: s.id, principalId: s.principalId, action, bodyHash: createHash("sha256").update(body).digest("hex"), nonce: randomBytes(24).toString("hex"), backendPid: Number(meta.pid), transactionId: meta.tx, expiresAtMs: Number(meta.now) + 3000, origin: s.origin, csrfHash: createHash("sha256").update(s.csrf).digest("hex") });
        const mac = createHmac("sha256", Buffer.from(f.keys[action], "hex")).update(`${EXECUTION.access}\n${wire}`).digest("hex");
        await assert.rejects(c.query(`SELECT execution_m803.${action}($1,$2,$3)`, [wire, mac, body]), /E803_FORBIDDEN/);
        await c.query("ROLLBACK TO SAVEPOINT negative_operation");
      }
    } finally { await c.query("ROLLBACK"); await c.end(); }
    assert.equal(f.process.starts(), 0);
  } finally { await f.stop(); }
});

test("independent review: M7 editor authority does not confer a missing fake execution grant", async () => {
  const f = await executionFixture();
  try {
    assert.equal(f.f.sessions.find(s => s.principalId === "editor-a")!.grants[0].canCreate, true);
    await f.admin.query("UPDATE execution_m803.access_grant SET actions=ARRAY['inspect'] WHERE principal='editor-a'");
    const proposal = await f.api.proposal(f.request("inspect"), "ungranted-editor");
    await assert.rejects(f.api.reserve(f.request("execute"), proposal), { code: "FORBIDDEN" });
    assert.equal(f.process.starts(), 0);
  } finally { await f.stop(); }
});

test("independent review: a rehashed verification with a foreign dependency cannot finalize", async () => {
  const f = await executionFixture();
  try {
    const r = await f.reserve(); await f.api.executeFake(f.request("execute"), r.id); await f.api.capture(f.request("validate"), r.id);
    const verified = await f.api.verify(f.request("validate"), r.id), s = await f.api.inspect(f.request("read"), r.id);
    const forged = envelope("verification", f.context, { ...verified.body, dependencyHash: "b".repeat(64) });
    await assert.rejects(f.gateway.transaction("validate", f.request("validate"), f.context, tx => tx.call({ op: "verify", id: r.id, revision: s.state.revision, generation: s.state.owner_generation, fact: forged })), { code: "INVALID_VERIFICATION" });
    assert.deepEqual((await f.api.inspect(f.request("read"), r.id)).facts.verification, verified);
    await f.api.finalize(f.request("finalize"), r.id); assert.equal(f.process.starts(), 1);
  } finally { await f.stop(); }
});

test("independent review: audit insertion failure rolls back finalization and preserves original facts", async () => {
  const f = await executionFixture();
  try {
    const r = await f.reserve(); await f.api.executeFake(f.request("execute"), r.id); await f.api.capture(f.request("validate"), r.id); await f.api.verify(f.request("validate"), r.id);
    await f.admin.query("CREATE TRIGGER review_audit_failure BEFORE INSERT ON execution_m803.audit_event FOR EACH ROW EXECUTE FUNCTION execution_m803.immutable()");
    await assert.rejects(f.api.finalize(f.request("finalize"), r.id));
    const s = await f.api.inspect(f.request("read"), r.id);
    assert.equal(s.state.availability, "ABSENT"); assert.equal(s.facts.artifact, undefined); assert.ok(s.facts.result); assert.ok(s.facts.verification);
    await f.admin.query("DROP TRIGGER review_audit_failure ON execution_m803.audit_event");
    await f.api.finalize(f.request("finalize"), r.id); assert.equal(f.process.starts(), 1);
  } finally { await f.stop(); }
});

test("independent review: lost verification acknowledgement observes the original receipt without a new start", async () => {
  const f = await executionFixture();
  try {
    const r = await f.reserve(); await f.api.executeFake(f.request("execute"), r.id); await f.api.capture(f.request("validate"), r.id);
    const gateway: ExecutionGateway = { ...f.gateway, async transaction(action, request, context, work, hooks) {
      let verified = false;
      return f.gateway.transaction(action, request, context, tx => work({ ...tx, call: async b => { const result = await tx.call(b); if (b.op === "verify") verified = true; return result; } }), {
        ...hooks, afterCommit: async () => { await hooks?.afterCommit?.(); if (verified) throw new Error("review lost verification acknowledgement"); },
      });
    } };
    await assert.rejects(f.service({ gateway }).verify(f.request("validate"), r.id), CommitUnknown);
    const before = await f.api.inspect(f.request("read"), r.id); assert.ok(before.facts.verification);
    await f.api.recovery.recover(f.request("recover"), r.id);
    assert.deepEqual((await f.api.inspect(f.request("read"), r.id)).facts.verification, before.facts.verification);
    await f.api.finalize(f.request("finalize"), r.id); assert.equal(f.process.starts(), 1);
  } finally { await f.stop(); }
});

test("independent review: concurrent recovery cannot relaunch UNKNOWN or advance submission generation", async () => {
  const f = await executionFixture();
  try {
    const r = await f.reserve(); await assert.rejects(f.api.executeFake(f.request("execute"), r.id, "UNKNOWN"));
    const starts = f.process.starts();
    await Promise.allSettled([f.api.recovery.recover(f.request("recover"), r.id), f.api.recovery.recover(f.request("recover", "editor-b"), r.id)]);
    const s = await f.api.inspect(f.request("read"), r.id);
    assert.equal(s.state.state, "UNKNOWN"); assert.equal(s.work.submission.body.generation, 1); assert.ok(s.state.owner_generation >= 2);
    assert.equal(f.process.starts(), starts); await assert.rejects(f.service().executeFake(f.request("execute"), r.id));
    await assert.rejects(f.api.recovery.releaseHold(f.request("recover"), r.id)); assert.equal(f.process.starts(), starts);
  } finally { await f.stop(); }
});

test("independent review: revoked reader leaves a durable hold that explicit hold release cannot bypass", async () => {
  const f = await executionFixture();
  try {
    const id = await f.complete();
    await assert.rejects(f.api.inspectPrivate(f.request("read", "reader"), id, async () => {
      await f.admin.query("UPDATE execution_m803.session SET revoked=true WHERE principal='reader'");
    }));
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.read_hold")).rows[0].n, 1);
    await f.api.recovery.quarantine(f.request("quarantine"), id); await f.api.recovery.releaseHold(f.request("recover"), id);
    await assert.rejects(f.api.recovery.gc(f.request("gc"), id), { code: "GC_HELD" });
    assert.equal((await f.api.inspect(f.request("read"), id)).state.availability, "QUARANTINED"); assert.equal(f.process.starts(), 1);
  } finally { await f.stop(); }
});

test("independent review: corruption discovered by a read-only inspector quarantines availability", async () => {
  const f = await executionFixture();
  try {
    const id = await f.complete(), before = await f.api.inspect(f.request("read"), id);
    const path = `${f.storageIdentity.root}/objects/${before.facts.artifact!.body.version}.blob`;
    await chmod(path, 0o600); await writeFile(path, Uint8Array.from([99]));
    await assert.rejects(f.api.inspectPrivate(f.request("read", "reader"), id), { code: "OUTPUT_INTEGRITY" });
    const after = await f.api.inspect(f.request("read"), id);
    assert.equal(after.state.availability, "QUARANTINED");
    assert.deepEqual(after.facts.artifact, before.facts.artifact);
    assert.deepEqual(after.facts.verification, before.facts.verification);
    assert.equal(f.sessions.find(s => s.principalId === "reader")!.actions.includes("quarantine"), false);
    assert.equal((await f.admin.query("SELECT payload->'body'->>'principalId' principal FROM execution_m803.audit_event WHERE payload->'body'->>'action'='quarantine' ORDER BY revision DESC LIMIT 1")).rows[0].principal, "editor-b");
  } finally { await f.stop(); }
});

for (const fault of ["missing", "truncated", "extra"] as const) test(`independent review: ${fault} committed bytes deny read and quarantine the same artifact`, async () => {
  const f = await executionFixture();
  try {
    const id = await f.complete(), before = await f.api.inspect(f.request("read"), id), artifact = before.facts.artifact!;
    const path = `${f.storageIdentity.root}/objects/${artifact.body.version}.blob`;
    if (fault === "missing") await unlink(path);
    else { await chmod(path, 0o600); await writeFile(path, new Uint8Array(Number(artifact.body.byteCount) + (fault === "extra" ? 1 : -1)).fill(37)); }
    await assert.rejects(f.api.inspectPrivate(f.request("read", "reader"), id));
    const after = await f.api.inspect(f.request("read"), id);
    assert.equal(after.state.availability, "QUARANTINED"); assert.deepEqual(after.facts.artifact, artifact); assert.equal(f.process.starts(), 1);
  } finally { await f.stop(); }
});

test("independent review: revoked quarantine coordinator cannot borrow reader or other identity authority", async () => {
  const f = await executionFixture();
  try {
    const id = await f.complete(), before = await f.api.inspect(f.request("read"), id);
    await unlink(`${f.storageIdentity.root}/objects/${before.facts.artifact!.body.version}.blob`);
    await f.admin.query("UPDATE execution_m803.session SET revoked=true WHERE principal='editor-b'");
    await assert.rejects(f.api.inspectPrivate(f.request("read", "reader"), id));
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.audit_event WHERE payload->'body'->>'action'='quarantine'")).rows[0].n, 0);
    // Metadata is last-known availability until a currently authorized coordinator
    // acts; the private read always checks bytes and returns none on this path.
    await f.api.recovery.quarantine(f.request("quarantine"), id);
    assert.equal((await f.api.inspect(f.request("read"), id)).state.availability, "QUARANTINED");
  } finally { await f.stop(); }
});

test("independent review: concurrent quarantine at the private response fence releases no bytes", async () => {
  const f = await executionFixture();
  try {
    const id = await f.complete();
    await assert.rejects(f.api.inspectPrivate(f.request("read", "reader"), id, () => f.api.recovery.quarantine(f.request("quarantine"), id).then(() => {})));
    assert.equal((await f.api.inspect(f.request("read"), id)).state.availability, "QUARANTINED"); assert.equal(f.process.starts(), 1);
  } finally { await f.stop(); }
});

test("independent review: native method and exact URL cannot be replaced by a valid cookie", async () => {
  const f = await executionFixture();
  try {
    const proposal = await f.api.proposal(f.request("inspect"), "native-request"), valid = f.request("execute");
    for (const request of [new Request(valid.url, { method: "GET", headers: valid.headers }), new Request(`${valid.url}?claim=editor`, valid), new Request(`${valid.url}/other`, valid), new Request(valid.url, { method: "PUT", headers: valid.headers })]) {
      await assert.rejects(f.api.reserve(request, proposal), { code: "ORIGIN_REJECTED" });
    }
    assert.equal(f.process.starts(), 0); assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.work")).rows[0].n, 0);
  } finally { await f.stop(); }
});

test("independent review: a currentness change committed during admission lock wait denies new work", async () => {
  const f = await executionFixture(), writer = await f.f.owned.securityAdministrator();
  let pending: Promise<unknown> | undefined;
  try {
    const proposal = await f.api.proposal(f.request("inspect"), "drift-during-wait");
    await writer.query("BEGIN; UPDATE timeline_m702.repository_head SET revision=revision+1 WHERE tenant='tenant-one'");
    const writerPid = (await writer.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    pending = assert.rejects(f.api.reserve(f.request("execute"), proposal));
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked = (await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='m803-owned-fixture' AND $1=ANY(pg_blocking_pids(pid))) blocked", [writerPid])).rows[0].blocked;
      if (blocked) break; await delay(10);
    }
    assert.ok(blocked, "admission must wait behind the independent M7 writer");
    await writer.query("COMMIT"); await pending;
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.work")).rows[0].n, 0); assert.equal(f.process.starts(), 0);
  } finally { await writer.query("ROLLBACK"); await pending?.catch(() => {}); await writer.end(); await f.stop(); }
});

test("independent review: all nine logins cannot shadow or alter fixed gateway search paths", async () => {
  const f = await executionFixture();
  try {
    for (const action of actions) {
      const c = await connect(f.connections[action]);
      try {
        await c.query("SET search_path=public,pg_temp");
        await assert.rejects(c.query("CREATE FUNCTION public.capture() RETURNS int LANGUAGE sql AS 'SELECT 1'"));
        await assert.rejects(c.query(`ALTER FUNCTION execution_m803.${action}(text,text,text) SET search_path=public`));
        const configured = (await c.query("SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure", [`execution_m803.${action}(text,text,text)`])).rows[0].proconfig;
        assert.deepEqual(configured, ["search_path=pg_catalog, execution_m803, pg_temp"]);
      } finally { await c.end(); }
    }
  } finally { await f.stop(); }
});

for (const method of ["executeFake", "cancel"] as const) test(`independent review: unauthorized ${method} cannot consume the original live flow`, async () => {
  const f = await executionFixture();
  try {
    const original = await f.reserve();
    await assert.rejects(f.api[method](f.request("execute", "foreign"), original.id), { code: "FORBIDDEN" });
    await assert.rejects(f.api[method](f.request("execute", "db-denied"), original.id));
    if (method === "executeFake") await assert.rejects(f.api.executeFake(f.request("execute", "editor-b"), original.id), { code: "NO_ORIGINAL_FLOW" });
    assert.equal((await f.api.inspect(f.request("read"), original.id)).state.state, "RESERVED");
    await f.api.executeFake(f.request("execute"), original.id);
    assert.equal(f.process.starts(), 1);
    await assert.rejects(f.api.executeFake(f.request("execute"), original.id)); assert.equal(f.process.starts(), 1);
  } finally { await f.stop(); }
});

test("independent review: a NULL grant element cannot turn missing execute authority into permission", async () => {
  const f = await executionFixture();
  try {
    const proposal = await f.api.proposal(f.request("inspect"), "null-is-not-permission");
    await f.admin.query("UPDATE execution_m803.access_grant SET actions=ARRAY['inspect',NULL] WHERE principal='editor-a'");
    await assert.rejects(f.api.reserve(f.request("execute"), proposal), { code: "FORBIDDEN" });
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.work")).rows[0].n, 0); assert.equal(f.process.starts(), 0);
  } finally { await f.stop(); }
});

test("independent review: correctly MACed result without quiescence cannot resolve UNKNOWN", async () => {
  const f = await executionFixture();
  try {
    const original = await f.reserve(); await assert.rejects(f.api.executeFake(f.request("execute"), original.id, "CHECKPOINT_ACK_LOST"));
    const state = await f.api.inspect(f.request("read"), original.id), fact = structuredClone(envelope("result", f.context, { operationId: original.id, submissionId: state.work.submission.body.submissionId, generation: 1, outcome: "FAILURE", quiescence: "QUIESCENT", byteSha256: null, byteCount: 0 }));
    delete fact.body.quiescence;
    const c = await connect(f.connections.observe);
    try {
      await c.query("BEGIN");
      const s = f.sessions.find(s => s.principalId === "editor-a")!, meta = (await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx,floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0];
      const factProof = createHmac("sha256", Buffer.from(f.keys.observe, "hex")).update(`${EXECUTION.result}\n${canonicalJson({ ...f.context, id: original.id, generation: state.state.owner_generation, revision: state.state.revision, backendPid: Number(meta.pid), transactionId: meta.tx, factHash: contractHash(EXECUTION.result, fact) })}`).digest("hex");
      const body = canonicalJson({ op: "result", id: original.id, generation: state.state.owner_generation, revision: state.state.revision, fact, factProof });
      const wire = canonicalJson({ domain: EXECUTION.access, ...f.context, sessionId: s.id, principalId: s.principalId, action: "observe", bodyHash: createHash("sha256").update(body).digest("hex"), nonce: randomBytes(24).toString("hex"), backendPid: Number(meta.pid), transactionId: meta.tx, expiresAtMs: Number(meta.now) + 3000, origin: s.origin, csrfHash: createHash("sha256").update(s.csrf).digest("hex") });
      const mac = createHmac("sha256", Buffer.from(f.keys.observe, "hex")).update(`${EXECUTION.access}\n${wire}`).digest("hex");
      await assert.rejects(async () => { await c.query("SELECT execution_m803.observe($1,$2,$3)", [wire, mac, body]); await c.query("COMMIT"); }, /E803_INVALID_RESULT/);
    } finally { await c.query("ROLLBACK"); await c.end(); }
    assert.equal((await f.api.inspect(f.request("read"), original.id)).state.state, "UNKNOWN");
    assert.equal(f.process.originalResult(original.id), null); assert.equal(f.process.starts(), 0);
  } finally { await f.stop(); }
});
