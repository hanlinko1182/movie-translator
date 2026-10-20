import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineDatabaseFixture } from "./fixture";
test("M7-02 authorized preparation, immutable save, independent read, history and original-operation lookup", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal("first-timeline"), saved = await f.save(p);
    if (saved.status === "UNKNOWN") return assert.fail("Ambiguous fixture save"); assert.equal(saved.status, "SAVED");
    assert.deepEqual(saved.view.record.plan, p.plan);
    assert.deepEqual(await f.api.readVersion(f.request("reader"), { scope: f.scope, id: saved.view.record.id }), saved.view);
    assert.equal((await f.api.readHead(f.request("reader"), { scope: f.scope })).revision, 1);
    const history = await f.api.listHistory(f.request("reader"), { scope: f.scope, afterVersion: 0, limit: 5 });
    assert.deepEqual(history.entries, [saved.view]);
    assert.equal((await f.save(p)).status, "REUSED");
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { await f.stop(); }
});

test("M7-02 exact duplicate, changed-key payload conflict, independent writer CAS and no silent rebase", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const a = await f.proposal("competing-a"), b = { ...await f.proposal("competing-b"), expectedRevision: a.expectedRevision, previous: a.previous };
    const results = await Promise.allSettled([f.save(a), f.save(b, "editor-b")]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    assert.equal(failed.reason.code, "REVISION_CONFLICT");
    const winner = results[0].status === "fulfilled" ? a : b;
    assert.equal((await f.save(winner)).status, "REUSED");
    await assert.rejects(f.save({ ...winner, expectedRevision: 1, previous: (await f.api.prepareTimeline(f.request(), f.input)).previous }), { code: "IDEMPOTENCY_CONFLICT" });
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
    const same = await f.proposal("concurrent-same-key"), both = await Promise.all([f.save(same), f.save(same, "editor-b")]);
    assert.deepEqual(both.map(r => r.status).sort(), ["REUSED", "SAVED"]);
    assert.deepEqual(await f.counts(), { versions: 2, reservations: 2, audits: 2, revisions: 2 });
  } finally { await f.stop(); }
});

test("M7-02 bounded immutable history, exact parent domains, superseded timeline and unchanged original", async () => {
  const f = await timelineDatabaseFixture(true);
  try {
    const original = JSON.stringify(f.m6.initial.capture.original);
    const identities: string[] = [];
    for (let i = 0; i < 6; i++) { const saved = await f.save(); if (saved.status === "UNKNOWN") assert.fail("ambiguous fixture"); identities.push(saved.view.record.id); }
    const first = await f.api.listHistory(f.request("reader"), { scope: f.scope, afterVersion: 0, limit: 5 });
    assert.equal(first.entries.length, 5); assert.equal(first.nextAfterVersion, 5);
    assert.equal(first.entries[0].currentness, "SUPERSEDED");
    const last = await f.api.listHistory(f.request("reader"), { scope: f.scope, afterVersion: 5, limit: 5 });
    assert.equal(last.nextAfterVersion, null); assert.equal(last.entries[0].record.version, 6); assert.equal(last.entries[0].currentness, "CURRENT_AT_READ");
    const parent = last.entries[0].record.previous!; assert.equal(parent.id, identities[4]);
    assert.equal(parent.recordHashDomain, "story-recap-timeline-saved-record-v1"); assert.equal(parent.planHashDomain, "story-recap-timeline-plan-v1");
    assert.equal(last.entries[0].record.plan.plan.source.narration.artifact.hashDomain, "story-edited-narration-v1");
    assert.equal(JSON.stringify(f.m6.initial.capture.original), original);
    await assert.rejects(f.api.listHistory(f.request(), { scope: f.scope, afterVersion: 0, limit: 6 }), { code: "INVALID_INPUT" });
  } finally { await f.stop(); }
});

test("M7-02 historical integrity survives replaced M6 head; new saves reject and original idempotent save reuses", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal(), saved = await f.save(p); if (saved.status === "UNKNOWN") assert.fail("ambiguous fixture");
    const oldHash = saved.view.recordHash;
    await f.m6.save();
    const old = await f.api.readVersion(f.request("reader"), { scope: f.scope, id: saved.view.record.id });
    assert.equal(old.recordHash, oldHash); assert.deepEqual(old.record.plan, p.plan); assert.equal(old.currentness, "STALE_DEPENDENCIES");
    await assert.rejects(f.api.prepareTimeline(f.request(), f.input), { code: "STALE_SOURCE" });
    await assert.rejects(f.save({ ...p, idempotencyKey: "fresh-after-m6-replacement" }), { code: "STALE_SOURCE" });
    assert.equal((await f.save(p)).status, "REUSED");
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { await f.stop(); }
});

test("M7-02 audit insertion failure rolls back dependency, reservation, version and head", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal();
    await f.admin.query("CREATE FUNCTION public.fail_timeline_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OWNED_TEST_AUDIT_FAILURE'; END $$");
    await f.admin.query("CREATE TRIGGER injected_failure BEFORE INSERT ON timeline_m702.audit_event FOR EACH ROW EXECUTE FUNCTION public.fail_timeline_audit()");
    await assert.rejects(f.save(p), { code: "TRANSACTION_FAILED" });
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
    assert.equal((await f.admin.query("SELECT count(*)::int n FROM timeline_m702.dependency")).rows[0].n, 0);
    await f.admin.query("DROP TRIGGER injected_failure ON timeline_m702.audit_event");
    assert.equal((await f.save(p)).status, "SAVED");
  } finally { await f.stop(); }
});

test("M7-02 lost ACK and failed read-back preserve UNKNOWN operation identity with read-only recovery", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal("lost-ack"), result = await f.save(p, "editor-a", { afterCommitForTest: async () => { throw Error("lost acknowledgement"); } });
    assert.equal(result.status, "UNKNOWN"); if (result.status !== "UNKNOWN") assert.fail();
    assert.equal(result.idempotencyKey, p.idempotencyKey);
    const before = await f.counts();
    const found = await f.api.readOperation(f.request("reader"), { scope: f.scope, idempotencyKey: p.idempotencyKey, proposalHash: result.proposalHash });
    assert.equal(found.status, "FOUND"); assert.deepEqual(await f.counts(), before);
    assert.deepEqual(await f.api.readOperation(f.request("reader"), { scope: f.scope, idempotencyKey: "not-observed", proposalHash: "f".repeat(64) }), { status: "NOT_FOUND" });
    assert.deepEqual(await f.counts(), before);
    await assert.rejects(f.api.readOperation(f.request("reader"), { scope: f.scope, idempotencyKey: p.idempotencyKey, proposalHash: "f".repeat(64) }), { code: "IDEMPOTENCY_CONFLICT" });
    const q = await f.proposal("readback-fails");
    const unknown = await f.save(q, "editor-a", { afterCommitForTest: async () => { f.authentication.revokeForTest("session-editor-a"); } });
    assert.equal(unknown.status, "UNKNOWN"); if (unknown.status !== "UNKNOWN") assert.fail(); assert.equal(unknown.safeCode, "READBACK_UNAVAILABLE");
    const recovered = await f.api.readOperation(f.request("reader"), { scope: f.scope, idempotencyKey: q.idempotencyKey, proposalHash: unknown.proposalHash });
    assert.equal(recovered.status, "FOUND"); assert.deepEqual(await f.counts(), { versions: 2, reservations: 2, audits: 2, revisions: 2 });
  } finally { await f.stop(); }
});

test("M7-02 exact nonchronological M6 presentation and optional fake-audio reference round trip without changing timing", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const source = f.m6.fixture.input.source;
    const { fakeVoiceRestrictions } = await import("../../../lib/storyline/voice/foundation/contracts");
    const audio = { schemaVersion: "story-highlight-synthetic-audio-ref-v1", artifactId: "reference-only", artifactHash: "a".repeat(64), planHash: "b".repeat(64), reference: source.narration,
      execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: fakeVoiceRestrictions };
    const prepared = await f.m6.api.preparePlan(f.m6.request(), { scope: f.scope, policy: { ...f.m6.fixture.input.policy, presentation: "SCORE_ORDER" }, audio });
    const selected = await f.m6.save({ schemaVersion: "story-highlight-save-proposal-v1", ...prepared, idempotencyKey: "score-order-audio" }); if (selected.status === "UNKNOWN") assert.fail();
    const target = { ...f.input, selected: { ...f.input.selected, id: selected.view.record.id, version: selected.view.record.version, recordHash: selected.view.recordHash, planHash: selected.view.record.plan.planHash } };
    const p = await f.proposal("timeline-audio", "editor-a", target), saved = await f.save(p); if (saved.status === "UNKNOWN") assert.fail();
    assert.deepEqual(saved.view.record.plan, p.plan); assert.notDeepEqual(p.plan.plan.presentationOrder, p.plan.plan.sourceOrder);
    assert.deepEqual(p.plan.plan.audio, audio); assert.equal(p.plan.plan.totalOutputMs, selected.view.record.plan.plan.totalSourceMs);
    assert.deepEqual(p.plan.plan.segments.map(s => s.candidate.id), selected.view.record.plan.plan.presentationOrder);
    assert.equal(p.plan.plan.restrictions.voiceSynchronization, "UNSUPPORTED"); assert.equal(p.plan.plan.restrictions.originalMovieAudio, "EXCLUDED");
  } finally { await f.stop(); }
});
