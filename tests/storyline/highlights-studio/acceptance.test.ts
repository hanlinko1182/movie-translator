import assert from "node:assert/strict";
import { before, after, mock, test } from "node:test";
import { HighlightVersionSession, highlightHash, highlightJson, highlightUnsaved } from "@/components/storyline/highlight-version-session";
import { contractHash } from "@/lib/storyline/canonical";
import { highlightDatabaseFixture } from "../highlights-persistence/fixture";
import { highlightAdapter } from "./adapter.fixture";

before(() => mock.method(globalThis, "fetch", () => assert.fail("No provider or network in direct acceptance")));
after(() => mock.restoreAll());
const workspace = (a: ReturnType<typeof highlightAdapter>, key = "save-one") => new HighlightVersionSession(a, () => key);

test("M6-03 explicit prepare → exact immutable save/read/history; stable duplicate; original preserved", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const a = highlightAdapter(f), w = workspace(a), original = JSON.stringify(f.initial.capture), operations: string[] = [];
    const tracked = workspace({ ...a, saveVersion: async p => { operations.push("save"); const r = await a.saveVersion(p); assert.equal((await a.saveVersion(p)).status, "REUSED"); return r; }, readVersion: async v => { operations.push("read"); return a.readVersion(v); }, listHistory: async v => { operations.push("history"); return a.listHistory(v); } });
    await w.save(); assert.equal((await f.counts()).versions, 0); assert.equal(w.getSnapshot().phase, "NOT_PREPARED");
    await tracked.prepare(); assert.equal(tracked.getSnapshot().phase, "PREPARED");
    const plan = highlightJson(tracked.getSnapshot().plan);
    await tracked.save(); const s = tracked.getSnapshot();
    assert.equal(s.phase, "SAVED"); assert.deepEqual(operations, ["save", "read", "history"]);
    assert.equal(s.saved?.record.plan.planHash, s.plan?.planHash); assert.equal(highlightJson(s.plan), plan);
    assert.equal(s.saved?.record.previous, null); assert.equal(s.history?.entries[0].recordHash, s.saved?.recordHash);
    assert.equal(highlightUnsaved(s), false); assert.equal(s.saved?.record.restrictions.humanApproval, "NONE");
    assert.equal(s.saved?.record.restrictions.eligibleForRealTts, false); assert.equal(s.saved?.record.restrictions.eligibleForPublication, false);
    assert.equal(JSON.stringify(f.initial.capture), original); assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { await f.stop(); }
});
test("M6-03 concurrent sessions retain plan; refresh plus explicit acceptance and separate preparation required", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const a = workspace(highlightAdapter(f), "a"), b = workspace(highlightAdapter(f, "editor-b"), "b");
    await a.prepare(); await b.prepare(); const plan = b.getSnapshot().plan;
    await Promise.all([a.save(), b.save()]);
    const loser = a.getSnapshot().phase === "CONFLICT" ? a : b;
    assert.equal(loser.getSnapshot().phase, "CONFLICT"); loser.acceptHead(); assert.ok(loser.getSnapshot().pending);
    await loser.prepare(); assert.equal(loser.getSnapshot().phase, "CONFLICT");
    await loser.refresh(); assert.equal(loser.getSnapshot().plan, loser === b ? plan : a.getSnapshot().plan);
    loser.acceptHead(); assert.equal(loser.getSnapshot().prepared, null); await loser.save(); assert.equal((await f.counts()).versions, 1);
    await loser.prepare(); assert.equal(loser.getSnapshot().prepared?.expectedRevision, 1); await loser.save();
    assert.equal(loser.getSnapshot().saved?.record.version, 2); assert.ok(loser.getSnapshot().saved?.record.previous?.recordHash);
  } finally { await f.stop(); }
});
for (const [name, overrides, expected, onSave] of [
  ["denied", {}, "UNAUTHORIZED", false], ["expired", {}, "UNAUTHORIZED", false], ["editor-a", { cookie: null }, "UNAUTHORIZED", false],
  ["editor-a", { origin: null }, "UNAUTHORIZED", false], ["editor-a", { csrf: null }, "UNAUTHORIZED", true], ["reader", {}, "UNAUTHORIZED", true],
] as const) test(`M6-03 auth ${name} ${JSON.stringify(overrides)} cannot bypass server/SQL`, async () => {
  const f = await highlightDatabaseFixture(); try { const w = workspace(highlightAdapter(f, name, f.api, overrides)); await w.prepare(); if (onSave) { assert.equal(w.getSnapshot().phase, "PREPARED"); await w.save(); } assert.equal(w.getSnapshot().phase, expected); assert.equal((await f.counts()).versions, 0); } finally { await f.stop(); }
});
for (const field of ["projectId", "movieId", "studioId", "tenantId"] as const) test(`M6-03 wrong ${field} rejected through the injection seam`, async () => {
  const f = await highlightDatabaseFixture(); try { const a = highlightAdapter(f); a.target.scope[field] = "wrong"; const w = workspace(a); await w.prepare(); assert.equal(w.getSnapshot().phase, "UNAUTHORIZED"); assert.equal((await f.counts()).versions, 0); } finally { await f.stop(); }
});
test("M6-03 revoked session and stale source retain reviewed plan without another write", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const w = workspace(highlightAdapter(f)); await w.prepare(); const plan = w.getSnapshot().plan;
    f.authentication.revokeForTest(f.sessions[0].id); await w.save(); assert.equal(w.getSnapshot().phase, "UNAUTHORIZED"); assert.equal(w.getSnapshot().plan, plan);
    const b = workspace(highlightAdapter(f, "editor-b")); await b.prepare();
    await f.admin.query("UPDATE highlight_m602.current_dependency SET observed_reference=jsonb_set(observed_reference,'{currentness,sourceRevision}','99') WHERE tenant='tenant-one'");
    await b.save(); assert.equal(b.getSnapshot().phase, "STALE"); assert.ok(b.getSnapshot().plan); assert.equal((await f.counts()).versions, 0);
  } finally { await f.stop(); }
});
for (const kind of ["ack", "readback", "transport"] as const) test(`M6-03 ${kind} unknown retains original operation; lookup independently verifies without new save`, async () => {
  const f = await highlightDatabaseFixture();
  try {
    const api = f.service(kind === "ack" ? { afterCommitForTest: async () => { throw new Error("lost acknowledgement"); } } : {});
    const a = highlightAdapter(f, "editor-a", api); let reads = 0, writes = 0;
    const w = workspace({ ...a, saveVersion: async p => { writes++; const r = await a.saveVersion(p); if (kind === "transport") throw new Error("lost transport"); return r; }, readVersion: async p => { if (kind === "readback" && reads++ === 0) throw new Error("read unavailable"); return a.readVersion(p); } });
    await w.prepare(); await w.save(); const pending = w.getSnapshot().pending;
    assert.ok(pending); assert.ok(["UNKNOWN", "READBACK_UNAVAILABLE"].includes(w.getSnapshot().phase));
    assert.equal((await f.counts()).versions, 1); await w.save(); await w.prepare(); assert.equal(writes, 1);
    await w.recover(); assert.equal(w.getSnapshot().phase, "SAVED"); assert.equal(w.getSnapshot().saved?.record.idempotencyKey, pending.idempotencyKey); assert.equal(writes, 1);
  } finally { await f.stop(); }
});
test("M6-03 NOT_FOUND never proves rollback, allocates no new key and does not write", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const a = highlightAdapter(f); let keys = 0, writes = 0;
    const w = new HighlightVersionSession({ ...a, saveVersion: async p => { writes++; return { status: "UNKNOWN", scope: p.scope, idempotencyKey: p.idempotencyKey, proposalHash: await highlightHash(p.schemaVersion, p), safeCode: "COMMIT_ACK_LOST" }; } }, () => `key-${++keys}`);
    await w.prepare(); await w.save(); await w.recover(); await w.refresh(); await w.prepare(); await w.save();
    assert.equal(w.getSnapshot().phase, "UNKNOWN"); assert.ok(w.getSnapshot().pendingHash); assert.equal(keys, 1); assert.equal(writes, 1); assert.equal((await f.counts()).versions, 0);
    assert.equal(w.getSnapshot().pending?.idempotencyKey, "key-1");
  } finally { await f.stop(); }
});
test("M6-03 tampered receipt/content/parent/history never becomes Saved", async () => {
  const f = await highlightDatabaseFixture();
  try {
    for (const part of ["receipt", "read", "history"] as const) {
      const a = highlightAdapter(f);
      const corrupt = (v: Awaited<ReturnType<typeof a.readVersion>>) => { const x = structuredClone(v); (x.record as { id: string }).id = "forged"; return x; };
      const w = workspace({ ...a, saveVersion: async p => { const r = await a.saveVersion(p); return part === "receipt" && r.status !== "UNKNOWN" ? { ...r, view: corrupt(r.view) } : r; }, readVersion: async p => { const v = await a.readVersion(p); return part === "read" ? corrupt(v) : v; }, listHistory: async p => { const h = await a.listHistory(p); return part === "history" ? { ...h, entries: h.entries.map(corrupt) } : h; } }, `tamper-${part}`);
      await w.prepare(); await w.save(); assert.equal(w.getSnapshot().phase, "READBACK_UNAVAILABLE"); assert.ok(w.getSnapshot().pending);
    }
  } finally { await f.stop(); }
});
test("M6-03 scoped bounded history preview/load does not save or change head; saved R4 remains unapproved", async () => {
  const f = await highlightDatabaseFixture(true);
  try {
    const a = highlightAdapter(f); let n = 0; const w = new HighlightVersionSession(a, () => `version-${++n}`);
    for (let i = 0; i < 6; i++) { await w.prepare(); await w.save(); assert.equal(w.getSnapshot().phase, "SAVED"); }
    await w.refresh(); assert.equal(w.getSnapshot().history?.entries.length, 5); assert.equal(w.getSnapshot().history?.nextAfterVersion, 5);
    await w.refresh(true); assert.equal(w.getSnapshot().history?.entries[0].record.version, 6); await w.refresh();
    const first = w.getSnapshot().history!.entries[0], head = await a.readHead({ scope: a.target.scope });
    await w.prepare(); const prepared = w.getSnapshot().plan; await w.preview(first.record.id); assert.equal(w.getSnapshot().plan, prepared);
    w.loadPreview(); assert.equal(w.getSnapshot().phase, "HISTORICAL"); assert.equal(w.getSnapshot().plan?.planHash, first.record.plan.planHash);
    await w.save(); assert.deepEqual(await a.readHead({ scope: a.target.scope }), head);
    assert.equal(w.getSnapshot().plan?.plan.input.source.narration.artifact.kind, "R4_EDITED"); assert.equal(w.getSnapshot().saved?.record.restrictions.sourceVerified, false);
  } finally { await f.stop(); }
});
test("M6-03 disposed preparation/save responses cannot publish or issue downstream reads", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const a = highlightAdapter(f); let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { entered = r; });
    const w = workspace({ ...a, saveVersion: async p => { const r = await a.saveVersion(p); entered(); await gate; return r; }, readVersion: async () => assert.fail("Disposed response must not read") });
    await w.prepare(); const save = w.save(); await ready; w.dispose(); const snapshot = w.getSnapshot(); release(); await save; assert.equal(w.getSnapshot(), snapshot);
    const fresh = workspace({ ...a, identityKey: "new-session" }); assert.equal(fresh.getSnapshot().plan, null);
    let releasePrepare!: () => void; const wait = new Promise<void>(r => { releasePrepare = r; });
    const old = workspace({ ...a, preparePlan: async p => { const r = await a.preparePlan(p); await wait; return r; } });
    const prepare = old.prepare(); old.dispose(); const before = old.getSnapshot(); releasePrepare(); await prepare; assert.equal(old.getSnapshot(), before);
  } finally { await f.stop(); }
});
test("M6-03 browser canonical hash matches server protocol and rejects malformed JSON", async () => {
  const value = { z: "မြန်မာ 汉字", a: [1, true, null, { b: "😀" }] };
  assert.equal(await highlightHash("domain", value), contractHash("domain", value));
  for (const v of [undefined, NaN, -0, "\ud800", new Date(), Object.defineProperty({}, "secret", { enumerable: true, get: () => assert.fail("getter invoked") })]) assert.throws(() => highlightJson(v));
});

test("M6-03 read-back stale error cannot release a possibly committed original proposal", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const a = highlightAdapter(f), w = workspace({ ...a, readVersion: async () => { throw { code: "STALE_SOURCE" }; } });
    await w.prepare(); await w.save(); assert.equal(w.getSnapshot().phase, "READBACK_UNAVAILABLE");
    const pending = w.getSnapshot().pending; await w.prepare(); assert.equal(w.getSnapshot().pending, pending); assert.equal((await f.counts()).versions, 1);
    assert.throws(() => Object.assign(w.getSnapshot().pending!.plan.plan, { totalSourceMs: 0 }), TypeError);
  } finally { await f.stop(); }
});
test("M6-03 fake audio stays a noneligible reference through the actual repository", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const a = highlightAdapter(f); a.target.audio = { schemaVersion: "story-highlight-synthetic-audio-ref-v1", artifactId: "fake-audio", artifactHash: "a".repeat(64), planHash: "b".repeat(64), reference: a.target.source.narration, execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: { humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false, eligibleForPublication: false, spendingAuthority: "NONE", syntheticAncestry: true } };
    const w = workspace(a); await w.prepare(); await w.save(); assert.equal(w.getSnapshot().phase, "SAVED"); assert.equal(w.getSnapshot().saved?.record.plan.plan.input.audio?.speech, "NOT_VERIFIED");
    assert.equal(w.getSnapshot().saved?.record.restrictions.eligibleForRealTts, false);
  } finally { await f.stop(); }
});
