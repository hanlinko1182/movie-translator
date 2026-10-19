import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { timelineDatabaseFixture, timelineProposalHash } from "./fixture";

for (const field of ["sourceRevision", "narrationRevision", "media", "candidate", "narration", "parent"] as const) test(`M7-02 saving-backend reacquisition rejects ${field} drift after preparation`, async () => {
  const f = await timelineDatabaseFixture(field === "narration");
  try {
    const p = await f.proposal();
    await assert.rejects(f.save(p, "editor-a", { beforeTransactionForTest: async () => {
      const current = structuredClone(f.m6.initial.capture.current);
      if (field === "sourceRevision" || field === "narrationRevision") current.currentness[field]++;
      if (field === "media") current.media.sha256 = "f".repeat(64);
      if (field === "candidate") current.narration.analysis.candidateHash = "f".repeat(64);
      if (field === "narration") current.narration.artifact.hash = "f".repeat(64);
      if (field === "parent") current.narration.original.parentDraft = { id: "wrong-parent", hash: "f".repeat(64), hashDomain: "story-narration-draft-v1" };
      await f.admin.query("UPDATE highlight_m602.current_dependency SET observed_reference=$1", [JSON.stringify(current)]);
    } }), { code: "STALE_SOURCE" });
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
  } finally { await f.stop(); }
});

test("M7-02 independently committed M6 head replacement between preflight/save rejects old prepared timeline", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal();
    await assert.rejects(f.save(p, "editor-a", { beforeTransactionForTest: async () => { assert.equal((await f.m6.save()).status, "SAVED"); } }), { code: "STALE_SOURCE" });
    assert.equal((await f.m6.api.readHead(f.m6.request(), { scope: f.scope })).revision, 2);
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
  } finally { await f.stop(); }
});

for (const schema of ["highlight_m602", "timeline_m702"] as const) test(`M7-02 disabled ${schema} policy rejects fresh admission while immutable history remains readable`, async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal(), saved = await f.save(p); if (saved.status === "UNKNOWN") assert.fail();
    await f.admin.query(`UPDATE ${schema}.policy SET enabled=false`);
    const read = await f.api.readVersion(f.request(), { scope: f.scope, id: saved.view.record.id });
    assert.equal(read.currentness, "STALE_DEPENDENCIES"); assert.equal(read.recordHash, saved.view.recordHash);
    await assert.rejects(f.api.prepareTimeline(f.request(), f.input), { code: "STALE_SOURCE" });
    await assert.rejects(f.save({ ...p, idempotencyKey: "new-key-disabled" }), { code: "STALE_SOURCE" });
    assert.equal((await f.save(p)).status, "REUSED");
  } finally { await f.stop(); }
});

async function waitForBlocked(f: Awaited<ReturnType<typeof timelineDatabaseFixture>>, pid: number, blocker: number) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const row = (await f.admin.query("SELECT $2=ANY(pg_blocking_pids($1)) blocked", [pid, blocker])).rows[0];
    if (row.blocked) return; await delay(10);
  }
  assert.fail("Independent writer did not block on the saving backend");
}
for (const [name, sql] of [
  ["M6 current source", "UPDATE highlight_m602.current_dependency SET observed_reference=jsonb_set(observed_reference,'{currentness,sourceRevision}','99')"],
  ["M6 policy", "UPDATE highlight_m602.policy SET enabled=false"],
  ["M7 policy", "UPDATE timeline_m702.policy SET enabled=false"],
  ["M6 session revocation", "UPDATE highlight_m602.session SET revoked=true WHERE id='session-editor-a'"],
  ["M7 grant revocation", "UPDATE timeline_m702.access_grant SET can_create=false WHERE principal='editor-a'"],
] as const) test(`M7-02 real independent ${name} writer waits through timeline commit`, async () => {
  const f = await timelineDatabaseFixture(), other = await f.owned.securityAdministrator();
  let write: Promise<unknown> | undefined;
  try {
    const pid = Number((await other.query("SELECT pg_backend_pid() pid")).rows[0].pid);
    const p = await f.proposal();
    const saved = await f.save(p, "editor-a", { afterReservationForTest: async savingPid => {
      assert.notEqual(pid, savingPid); write = other.query(sql); void write.catch(() => {});
      await waitForBlocked(f, pid, savingPid);
      assert.equal((await f.counts()).versions, 0, "uncommitted timeline is not visible to the independent backend");
    } });
    await write;
    assert.ok(["SAVED", "UNKNOWN"].includes(saved.status), "read-back may observe post-commit revocation, never presumed rollback");
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
    assert.equal((await f.api.readOperation(f.request("reader"), { scope: f.scope, idempotencyKey: p.idempotencyKey, proposalHash: timelineProposalHash(p) })).status, "FOUND");
  } finally { await write?.catch(() => {}); await other.end(); await f.stop(); }
});

test("M7-02 actual M6 repository writer cooperates with the same-database shared head fence", async () => {
  const f = await timelineDatabaseFixture(); let writer: ReturnType<typeof f.m6.save> | undefined;
  try {
    const m6Proposal = await f.m6.proposal(), p = await f.proposal();
    const saved = await f.save(p, "editor-a", { afterReservationForTest: async savingPid => {
      writer = f.m6.save(m6Proposal, "editor-b"); void writer.catch(() => {});
      const deadline = Date.now() + 2000; let blocked = false;
      while (Date.now() < deadline) {
        blocked = Boolean((await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='m602-owned-fixture' AND $1=ANY(pg_blocking_pids(pid))) blocked", [savingPid])).rows[0].blocked);
        if (blocked) break; await delay(10);
      }
      assert.ok(blocked, "actual M6 CAS writer must wait for M7's M6 head lock");
    } });
    assert.notEqual(saved.status, "UNKNOWN"); assert.equal((await writer)!.status, "SAVED");
    assert.equal((await f.m6.api.readHead(f.m6.request(), { scope: f.scope })).revision, 2);
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
    await assert.rejects(f.api.prepareTimeline(f.request(), f.input), { code: "STALE_SOURCE" });
  } finally { await writer?.catch(() => {}); await f.stop(); }
});

for (const schema of ["timeline_m702", "highlight_m602"] as const) test(`M7-02 deferred commit fence rejects ${schema} session expiry after final seal`, async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal();
    await f.admin.query("CREATE FUNCTION public.delay_timeline_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3.2); RETURN NULL; END $$");
    await f.admin.query("CREATE CONSTRAINT TRIGGER aaaa_owned_delay AFTER INSERT ON timeline_m702.reservation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.delay_timeline_commit()");
    await assert.rejects(f.save(p, "editor-a", {
      beforeTransactionForTest: async () => { await f.admin.query(`UPDATE ${schema}.session SET expires_at=clock_timestamp()+interval '3 seconds' WHERE id='session-editor-a'`); },
      beforeCommitForTest: async () => { assert.ok((await f.admin.query(`SELECT expires_at>clock_timestamp() valid FROM ${schema}.session WHERE id='session-editor-a'`)).rows[0].valid, "positive control: authorization must still be valid before seal/commit delay"); },
    }), { code: "FORBIDDEN" });
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
  } finally { await f.stop(); }
});
