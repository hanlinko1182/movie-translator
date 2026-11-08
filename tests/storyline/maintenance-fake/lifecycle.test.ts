import test from "node:test";
import assert from "node:assert/strict";
import { maintenanceFixture } from "./fixture";
import { MaintenanceCommitUnknown } from "../../../lib/storyline/maintenance-fake/database";
import { envelope, envelopeHash } from "../../../lib/storyline/maintenance-fake/contracts";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dummy } from "./fixture";
import { Client } from "pg";

test("maintenance original evidence -> immutable decision -> future-only qualification -> reconciliation", async () => {
  const f = await maintenanceFixture();
  try {
    const input = f.decision(), id = String(input.body.decisionId); let view = await f.api.submit(f.request("submit"), input);
    assert.equal(view.status, "REGISTERED"); const origin = await f.origin();
    for (const handle of origin.handles) view = await f.api.registerEvidence(f.request("evidence"), f.rootId, id, view.revision, handle);
    assert.equal(view.status, "EVIDENCE_PENDING");
    view = await f.api.qualify(f.request("qualify"), f.rootId, id, view.revision);
    assert.equal(view.status, "QUALIFIED_FOR_FUTURE_PHASE_ONLY"); assert.equal(view.rootGeneration, 2);
    const result = structuredClone(view.result);
    view = await f.api.reconcile(f.request("reconcile"), f.rootId, id, envelopeHash("decision", input));
    assert.equal(view.status, "DECISION_RECONCILED"); assert.deepEqual(view.result, result);
    assert.deepEqual((await f.api.submit(f.request("submit"), input)).result, result);
    assert.equal(f.fakeOwner.starts(), 0);
    for (const forbidden of ["invoke", "arm", "releaseHold", "remove", "quarantine", "gc"]) assert.equal(forbidden in f.api, false);
  } finally { await f.stop(); }
});
test("original ID plus changed body conflicts; incomplete evidence commits immutable blocked outcome", async () => {
  const f = await maintenanceFixture();
  try {
    const input = f.decision(), id = String(input.body.decisionId), view = await f.api.submit(f.request("submit"), input);
    assert.deepEqual(await f.api.submit(f.request("submit"), input), view);
    const changed = envelope("decision", f.context, { ...input.body, expectedRevision: 1 });
    await assert.rejects(f.api.submit(f.request("submit"), changed), { code: "IDEMPOTENCY_CONFLICT" });
    const result = await f.api.qualify(f.request("qualify"), f.rootId, id, view.revision);
    assert.equal(result.status, "QUALIFICATION_BLOCKED"); assert.equal(result.rootGeneration, 1);
    assert.equal((await f.api.reconcile(f.request("reconcile"), f.rootId, id, view.hash)).status, "DECISION_RECONCILED");
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("two original decisions contend on root generation; one qualified outcome, no overwrite", async () => {
  const f = await maintenanceFixture();
  try {
    const a = await f.prepared(), b = await f.prepared();
    const results = await Promise.allSettled([f.api.qualify(f.request("qualify"), f.rootId, String(a.decision.body.decisionId), a.revision),
      f.api.qualify(f.request("qualify"), f.rootId, String(b.decision.body.decisionId), b.revision)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.result")).rows[0].n, 1);
    assert.equal((await f.admin.query("SELECT generation FROM maintenance_m806.root_head")).rows[0].generation, 2);
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("lost submit or qualification commit ACK discovers original decision/result without new identity", async () => {
  const f = await maintenanceFixture();
  try {
    let fail = true; const api = f.service(f.gateway({ hooks: { afterCommit: async () => { if (fail) throw Error("ACK withheld"); } } }));
    const input = f.decision(), id = String(input.body.decisionId);
    await assert.rejects(api.submit(f.request("submit"), input), MaintenanceCommitUnknown); fail = false;
    let view = await f.api.read(f.request("read"), f.rootId, id, envelopeHash("decision", input));
    assert.equal(view.status, "REGISTERED"); const origin = await f.origin();
    for (const h of origin.handles) view = await f.api.registerEvidence(f.request("evidence"), f.rootId, id, view.revision, h);
    fail = true; await assert.rejects(api.qualify(f.request("qualify"), f.rootId, id, view.revision), MaintenanceCommitUnknown); fail = false;
    const recovered = await f.api.reconcile(f.request("reconcile"), f.rootId, id, view.hash);
    assert.equal(recovered.result?.body.outcome, "QUALIFIED_FOR_FUTURE_PHASE_ONLY"); assert.equal(f.fakeOwner.starts(), 0);
  } finally { await f.stop(); }
});
test("transport error code after server COMMIT remains UNKNOWN and reconciles the original decision", async t => {
  const f = await maintenanceFixture();
  try {
    const original = Client.prototype.query;
    const transport = t.mock.method(Client.prototype, "query", function(this: Client, ...args: unknown[]) {
      const pending = Reflect.apply(original, this, args);
      if (args[0] === "COMMIT") return Promise.resolve(pending).then(() => {
        throw Object.assign(Error("Original COMMIT acknowledgement lost"), { code: "ECONNRESET" });
      });
      return pending;
    } as Client["query"]);
    const input = f.decision();
    await assert.rejects(f.api.submit(f.request("submit"), input), MaintenanceCommitUnknown);
    transport.mock.restore();
    const v = await f.api.reconcile(f.request("reconcile"), f.rootId, String(input.body.decisionId), envelopeHash("decision", input));
    assert.equal(v.status, "REGISTERED"); assert.equal(v.result, null);
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.decision")).rows[0].n, 1);
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { t.mock.restoreAll(); await f.stop(); }
});
for (const phase of ["submit-before-commit", "submit-after-commit", "qualify-after-commit"] as const) test(`metadata-only SIGKILL at ${phase} retains original identity and adds zero fake starts`, async () => {
  const f = await maintenanceFixture();
  const child = fork(fileURLToPath(new URL("./decision-child.fixture.ts", import.meta.url)), [], {
    execArgv: ["--conditions=react-server", "--import", "tsx"], env: { PATH: "/usr/bin:/bin", NODE_ENV: "test", DATABASE_URL: dummy }, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const exit = new Promise<void>(done => child.once("exit", () => done())), timer = setTimeout(() => child.kill("SIGKILL"), 20000);
  let size = 0; for (const pipe of [child.stdout, child.stderr]) pipe?.on("data", b => { size += b.length; if (size > 65536) child.kill("SIGKILL"); });
  try {
    const input = f.decision(); let revision = 0;
    if (phase === "qualify-after-commit") revision = (await f.prepared(input)).revision;
    const seen = new Promise<void>((done, reject) => {
      child.once("error", reject); child.once("exit", () => reject(Error("child exited before original barrier")));
      child.once("message", raw => { const r = raw as { event: string; id: string; phase: string; code?: string };
        if (r.event === "barrier" && r.id === input.body.decisionId && r.phase === phase) done(); else reject(Error(`child ${r.code ?? r.event}`)); });
    });
    child.send({ connections: f.connections, keys: f.keys, sessions: f.sessions, context: f.context, input, revision, phase });
    await seen; child.kill("SIGKILL"); await exit; assert.equal(child.signalCode, "SIGKILL");
    const id = String(input.body.decisionId), dh = envelopeHash("decision", input);
    if (phase === "submit-before-commit") {
      await assert.rejects(f.api.read(f.request("read"), f.rootId, id, dh), { code: "DECISION_UNKNOWN" });
      assert.equal((await f.admin.query("SELECT count(*)::int n FROM maintenance_m806.audit_event")).rows[0].n, 0);
    } else {
      const state = await f.api.reconcile(f.request("reconcile"), f.rootId, id, dh);
      assert.equal(state.status, phase === "submit-after-commit" ? "REGISTERED" : "DECISION_RECONCILED");
      if (phase === "qualify-after-commit") assert.equal(state.result?.body.outcome, "QUALIFIED_FOR_FUTURE_PHASE_ONLY");
    }
    assert.equal(f.fakeOwner.starts(), 0);
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exit; await f.stop(); }
});
