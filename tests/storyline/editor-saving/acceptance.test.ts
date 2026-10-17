import assert from "node:assert/strict";
import { before, after, mock, test } from "node:test";
import { ScriptVersionSession, scriptSections, versionBufferDirty } from "@/components/storyline/script-version-session";
import { studioVersionFixture } from "../studio-versions/fixture";
import { adapterForTest, previewForTest } from "./adapter.fixture";

before(() => mock.method(globalThis, "fetch", () => assert.fail("No network/providers in direct editor acceptance")));
after(() => mock.restoreAll());

test("M9-05 real editor snapshot → save → exact read-back → history, duplicate, reused key, concurrent conflict and recovery", async () => {
  const x = await studioVersionFixture();
  try {
    const artifact = await previewForTest(x), unchanged = JSON.stringify(artifact), before = await x.counts();
    const a = new ScriptVersionSession(adapterForTest(x), artifact, () => "editor-request-a");
    const b = new ScriptVersionSession(adapterForTest(x, "editor-b"), artifact, () => "editor-request-b");
    await Promise.all([a.refresh(), b.refresh()]);
    const text = "  ပြင်ဆင်ထားသော မြန်မာစာ ဖြစ်သည်။\nမူရင်းကို မပြောင်းလဲပါ။  ";
    const sections = scriptSections(artifact, { [artifact.draft.payload.sections[0].id]: [text] });
    assert.equal(versionBufferDirty(a.getSnapshot(), sections), true);
    const originalBefore = (await x.f.admin.query('SELECT "canonicalPayload" FROM public."StoryNarrationDraft" WHERE id=$1', [x.original.id])).rows[0];
    await a.save(sections);
    const saved = a.getSnapshot().selected!;
    assert.equal(a.getSnapshot().phase, "SAVED"); assert.equal(saved.sections[0].paragraphs[0], text);
    assert.equal(versionBufferDirty(a.getSnapshot(), sections), false);
    assert.equal(a.getSnapshot().history?.versions[0].id, saved.id);
    assert.deepEqual(await x.api.saveVersion(x.request("editor-a", true), { ...x.input("editor-request-a"), sections }), { ...saved, currentness: "CURRENT_AT_SAVE" });
    await assert.rejects(() => x.api.saveVersion(x.request("editor-a", true), x.input("editor-request-a")), { code: "R4_IDEMPOTENCY_CONFLICT" });
    await b.save(sections); assert.equal(b.getSnapshot().phase, "CONFLICT");
    assert.match(b.getSnapshot().message, /Local text is retained/); assert.equal(b.getSnapshot().pending?.sections[0].paragraphs[0], text);
    b.acceptObservedHead(); assert.equal(b.getSnapshot().pending?.expectedRevision, 0, "cannot reconcile without an explicit refresh");
    await b.refresh(); b.acceptObservedHead();
    assert.equal(b.getSnapshot().base?.latestRevision, 1); assert.equal(b.getSnapshot().pending, null);
    await b.save(sections); assert.equal(b.getSnapshot().selected?.version, 2);
    assert.deepEqual(b.getSnapshot().selected?.previousVersion, { id: saved.id, contentHash: saved.contentHash });
    await a.refresh(); await a.preview(b.getSnapshot().selected!.id);
    assert.equal(a.getSnapshot().selected?.version, 2);
    assert.deepEqual((await x.f.admin.query('SELECT "canonicalPayload" FROM public."StoryNarrationDraft" WHERE id=$1', [x.original.id])).rows[0], originalBefore);
    assert.equal(JSON.stringify(artifact), unchanged);
    assert.deepEqual(await x.counts(), { ...before, versions: "2" }); assert.equal(x.wire.calls(), 1);
    assert.equal(saved.review.humanApproval, "NONE"); assert.equal(saved.review.eligibleForTts, false);
  } finally { await x.close(); }
});

test("M9-05 uncertain response retries same proposal/key; tampered read-back never marks saved; pending edits survive", async () => {
  const x = await studioVersionFixture();
  try {
    const artifact = await previewForTest(x), adapter = adapterForTest(x); let lose = true;
    const a = new ScriptVersionSession({ ...adapter, saveVersion: async input => { const saved = await adapter.saveVersion(input); if (lose) { lose = false; throw new Error("private diagnostic"); } return saved; } }, artifact, () => "uncertain-response");
    await a.refresh(); const sections = x.input().sections; await a.save(sections);
    assert.equal(a.getSnapshot().phase, "ERROR"); assert.equal((await x.counts()).versions, "1");
    assert.equal(a.getSnapshot().pending?.idempotencyKey, "uncertain-response");
    await a.save(x.input("different").sections); assert.equal((await x.counts()).versions, "1");
    await a.retry(); assert.equal(a.getSnapshot().phase, "SAVED"); assert.equal((await x.counts()).versions, "1");
    const bad = new ScriptVersionSession({ ...adapter, readVersion: async input => ({ ...await adapter.readVersion(input), contentHash: "0".repeat(64) }) }, artifact, () => "tampered-read");
    await bad.refresh(); await bad.save(sections);
    assert.equal(bad.getSnapshot().phase, "ERROR"); assert.equal(bad.getSnapshot().selected, null); assert.ok(bad.getSnapshot().pending);
    assert.doesNotMatch(bad.getSnapshot().message, /private diagnostic/);
  } finally { await x.close(); }
});

test("M9-05 adapter uses R4 for wrong scope, authentication, origin, session identity, staleness and rollback denial", async t => {
  const x = await studioVersionFixture();
  try {
    const artifact = await previewForTest(x), sections = x.input().sections;
    for (const [name, overrides, message] of [
      ["reader", {}, /permission denied/], ["denied", {}, /permission denied/],
      ["editor-a", { cookie: null }, /Authentication required/], ["editor-a", { origin: null }, /origin rejected/],
      ["expired", {}, /Session expired/],
    ] as const) await t.test(`${name} ${JSON.stringify(overrides)}`, async () => {
      const a = new ScriptVersionSession(adapterForTest(x, name, x.api, overrides), artifact);
      await a.refresh(); if (a.getSnapshot().base) await a.save(sections);
      assert.match(a.getSnapshot().message, message); assert.equal(a.getSnapshot().selected, null);
    });
    for (const field of ["projectId", "movieId", "studioId"] as const) await t.test(`wrong ${field}`, async () => {
      const adapter = adapterForTest(x, "wide"); adapter.target = { ...adapter.target, scope: { ...x.scope, [field]: "other-resource" } };
      const a = new ScriptVersionSession(adapter, artifact); await a.refresh(); assert.match(a.getSnapshot().message, /permission denied/);
    });
    const before = await x.counts();
    const rollback = new ScriptVersionSession(adapterForTest(x, "editor-a", x.service({ afterInsertForTest: async () => { throw new Error("private rollback failure"); } })), artifact);
    await rollback.refresh(); await rollback.save(sections); assert.equal(rollback.getSnapshot().phase, "ERROR");
    assert.deepEqual(await x.counts(), before); assert.deepEqual(rollback.getSnapshot().pending?.sections, sections);
    const identity = new ScriptVersionSession(adapterForTest(x), artifact);
    await identity.refresh(); x.authentication.revokeSessionForTest("session-editor-a");
    await identity.save(sections); assert.match(identity.getSnapshot().message, /Session expired/); assert.deepEqual(await x.counts(), before);
    const stale = new ScriptVersionSession(adapterForTest(x, "editor-b"), artifact);
    await stale.refresh(); x.f.media.setChanged(true); await stale.save(sections);
    assert.match(stale.getSnapshot().message, /authoritative source changed/); assert.deepEqual(await x.counts(), before);
  } finally { await x.close(); }
});

test("M9-05 truly concurrent editors use independent writers; one immutable winner, one explicit conflict", async () => {
  const x = await studioVersionFixture();
  try {
    const artifact = await previewForTest(x), before = await x.counts();
    const a = new ScriptVersionSession(adapterForTest(x), artifact, () => "race-a");
    const b = new ScriptVersionSession(adapterForTest(x, "editor-b", x.service({ writerDatabase: x.twinWriter() })), artifact, () => "race-b");
    await a.refresh(); await b.refresh();
    const sections = x.input().sections;
    await Promise.all([a.save(sections), a.save(sections), b.save(sections)]);
    assert.deepEqual([a.getSnapshot().phase, b.getSnapshot().phase].sort(), ["CONFLICT", "SAVED"]);
    assert.deepEqual(await x.counts(), { ...before, versions: "1" });
    const winner = a.getSnapshot().selected ?? b.getSnapshot().selected;
    assert.equal(winner?.version, 1); assert.equal(winner?.previousVersion, null);
    const loser = a.getSnapshot().pending ?? b.getSnapshot().pending;
    assert.deepEqual(loser?.sections, sections);
  } finally { await x.close(); }
});

test("M9-05 save captures text before await; realm disposal ignores late responses and stops subsequent reads", async () => {
  const x = await studioVersionFixture();
  try {
    const artifact = await previewForTest(x), adapter = adapterForTest(x);
    let release!: () => void, entered!: () => void, readCalls = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const a = new ScriptVersionSession({ ...adapter,
      saveVersion: async input => { const saved = await adapter.saveVersion(input); entered(); await gate; return saved; },
      readVersion: input => { readCalls++; return adapter.readVersion(input); },
    }, artifact, () => "late-response");
    await a.refresh(); const sections = x.input().sections, expected = structuredClone(sections);
    const saving = a.save(sections); sections[0].paragraphs[0] = "သိမ်းနေစဉ် ထပ်ပြင်ထားသော စာသား။";
    await reached; a.dispose(); release(); await saving;
    assert.equal(a.getSnapshot().selected, null); assert.equal(readCalls, 0);
    const next = new ScriptVersionSession(adapterForTest(x, "editor-b"), artifact);
    await next.refresh(); assert.equal(next.getSnapshot().selected, null);
    const id = next.getSnapshot().history!.versions[0].id; await next.preview(id);
    assert.deepEqual(next.getSnapshot().selected?.sections, expected);
    assert.equal(versionBufferDirty(next.getSnapshot(), sections), true);
  } finally { await x.close(); }
});
