import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { StudioVersionError } from "@/lib/storyline/studio-versions/errors";
import { STUDIO_EDIT } from "@/lib/storyline/studio-versions/contracts";
import { createSyntheticStudioAuthenticationForTest } from "@/lib/storyline/studio-versions/synthetic-auth";
import { origin, studioVersionFixture } from "./fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No providers or external requests in R4")); });
after(() => mock.restoreAll());
const denied = (run: () => Promise<unknown>, code?: StudioVersionError["code"]) => assert.rejects(run, error => error instanceof StudioVersionError && (!code || error.code === code));
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function waitForLock(x: Awaited<ReturnType<typeof studioVersionFixture>>, pid: number) {
  for (let n = 0; n < 100; n++) {
    if ((await x.f.admin.query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`, [pid])).rows[0]?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Expected actual PostgreSQL lock contention");
}

for (const first of [true, false]) test(`R4 authorized immutable original/edit/read/history, M1 ${first ? "first" : "last"}`, async () => {
  const x = await studioVersionFixture(first);
  try {
    const before = await x.counts(), input = x.input();
    const beforeOriginal = (await x.f.admin.query(`SELECT "canonicalPayload" FROM public."StoryNarrationDraft" WHERE id=$1`, [x.original.id])).rows[0].canonicalPayload;
    assert.equal(x.originalView.currentness, "CURRENT_AT_READ"); assert.equal(x.originalView.latestRevision, 0);
    assert.equal(x.originalView.binding.original.id, x.original.id); assert.notEqual(x.original.id, x.originalView.binding.original.payloadId);
    const saved = await x.api.saveVersion(x.request("editor-a", true), input);
    assert.equal(saved.version, 1); assert.equal(saved.editor.principalId, "editor-a"); assert.equal(saved.currentness, "CURRENT_AT_SAVE");
    assert.equal(saved.sections[0].paragraphs[0], input.sections[0].paragraphs[0]);
    const readInput = { scope: x.scope, original: x.original };
    const read = await x.api.readVersion(x.request("reader"), { ...readInput, versionId: saved.id });
    assert.deepEqual(read, { ...saved, currentness: "CURRENT_AT_READ" });
    const second = await x.api.saveVersion(x.request("editor-b", true), x.input("edit-two", 1, { id: saved.id, contentHash: saved.contentHash }));
    assert.equal(second.version, 2); assert.deepEqual(second.previousVersion, { id: saved.id, contentHash: saved.contentHash });
    const head = await x.api.readOriginal(x.request(), readInput); assert.equal(head.latestRevision, 2); assert.equal(head.latestVersion?.id, second.id);
    const history = await x.api.listVersions(x.request("reader"), { ...readInput, afterVersion: 0, limit: 1 });
    assert.deepEqual(history.versions.map(row => row.id), [saved.id]); assert.equal(history.nextAfterVersion, 1);
    const rest = await x.api.listVersions(x.request(), { ...readInput, afterVersion: 1, limit: 50 });
    assert.deepEqual(rest.versions.map(row => row.id), [second.id]); assert.equal(rest.nextAfterVersion, null);
    assert.equal((await x.f.admin.query(`SELECT "canonicalPayload" FROM public."StoryNarrationDraft" WHERE id=$1`, [x.original.id])).rows[0].canonicalPayload, beforeOriginal);
    assert.equal(beforeOriginal, canonicalJson(x.prepared.draft.payload));
    assert.deepEqual(await x.counts(), { ...before, versions: "2" }); assert.equal(x.wire.calls(), 1);
    for (const view of [x.originalView, saved, read, history]) {
      assert.equal(view.review.humanApproval, "NONE"); assert.equal(view.review.sourceVerified, false); assert.equal(view.review.eligibleForTts, false);
      assert.doesNotMatch(canonicalJson(view), /storageKey|canonicalPayload|canonicalRecipe|secret|challenge|sessionId|csrf|idempotencyKey|authProof/);
    }
    await denied(() => x.api.readVersion(x.request(), { ...readInput, versionId: "missing-version" }), "R4_NOT_FOUND");
  } finally { await x.close(); }
});

test("R4 authenticated session, origin, CSRF, scoped permissions and tenancy fail closed", async t => {
  const x = await studioVersionFixture();
  try {
    const before = await x.counts(), read = { scope: x.scope, original: x.original };
    const cases: [string, () => Promise<unknown>, StudioVersionError["code"]][] = [
      ["missing request identity", () => x.api.readOriginal(null, read), "R4_AUTH_REQUIRED"],
      ["missing session", () => x.api.readOriginal(x.request("editor-a", false, { cookie: null }), read), "R4_AUTH_REQUIRED"],
      ["unknown session", () => x.api.readOriginal(x.request("editor-a", false, { cookie: "story_r4_test_session=forged" }), read), "R4_SESSION_INVALID"],
      ["expired session", () => x.api.readOriginal(x.request("expired"), read), "R4_SESSION_INVALID"],
      ["missing origin", () => x.api.readOriginal(x.request("editor-a", false, { origin: null }), read), "R4_ORIGIN_REJECTED"],
      ["foreign origin", () => x.api.readOriginal(x.request("editor-a", false, { origin: "https://foreign.invalid" }), read), "R4_ORIGIN_REJECTED"],
      ["foreign adapter URL", () => x.api.readOriginal(x.request("editor-a", false, { url: "https://foreign.invalid/read" }), read), "R4_ORIGIN_REJECTED"],
      ["cross-site fetch context", () => x.api.readOriginal(x.request("editor-a", false, { fetchSite: "cross-site" }), read), "R4_ORIGIN_REJECTED"],
      ["missing fetch context", () => x.api.readOriginal(x.request("editor-a", false, { fetchSite: null }), read), "R4_ORIGIN_REJECTED"],
      ["GET cannot save", () => x.api.saveVersion(x.request(), x.input()), "R4_ORIGIN_REJECTED"],
      ["missing CSRF", () => x.api.saveVersion(x.request("editor-a", true, { csrf: null }), x.input()), "R4_CSRF_REJECTED"],
      ["wrong CSRF", () => x.api.saveVersion(x.request("editor-a", true, { csrf: "0".repeat(64) }), x.input()), "R4_CSRF_REJECTED"],
      ["unauthorized read", () => x.api.readOriginal(x.request("denied"), read), "R4_FORBIDDEN"],
      ["read-only principal cannot save", () => x.api.saveVersion(x.request("reader", true), x.input()), "R4_FORBIDDEN"],
      ["cross-tenant original read", () => x.api.readOriginal(x.request("foreign"), read), "R4_FORBIDDEN"],
      ["cross-tenant save", () => x.api.saveVersion(x.request("foreign", true), x.input()), "R4_FORBIDDEN"],
      ["untrusted principal body", () => x.api.readOriginal(x.request(), { ...read, principalId: "editor-b" }), "R4_INVALID_INPUT"],
      ["wrong original hash", () => x.api.readOriginal(x.request(), { ...read, original: { ...x.original, draftHash: "0".repeat(64) } }), "R4_PARENT_MISMATCH"],
      ["missing exact original", () => x.api.readOriginal(x.request(), { ...read, original: { ...x.original, id: "missing" } }), "R4_NOT_FOUND"],
    ];
    for (const field of ["projectId", "movieId", "studioId"] as const) cases.push([`database rejects ${field} despite wide synthetic grant`,
      () => x.api.readOriginal(x.request("wide"), { ...read, scope: { ...x.scope, [field]: "other-resource" } }), "R4_FORBIDDEN"]);
    for (const [name, run, code] of cases) await t.test(name, () => denied(run, code));
    await t.test("database rejects a cross-tenant ownership grant itself", async () => {
      await assert.rejects(() => x.f.admin.query(`INSERT INTO public."StoryR4Access"
        (login,"sessionId","tenantId","principalId","projectId","movieId","studioId","canRead","canSave","validUntil")
        VALUES($1,'session-foreign','tenant-two','foreign',$2,$3,$4,true,true,clock_timestamp()+interval '1 hour')`,
      [x.writerLogin, x.scope.projectId, x.scope.movieId, x.scope.studioId]), { code: "23503" });
    });
    await t.test("database session expiry independently rejects an unexpired process session", async () => {
      await x.f.admin.query(`UPDATE public."StoryR4Access" SET "validUntil"=clock_timestamp()-interval '1 second' WHERE "principalId"='editor-b'`);
      await denied(() => x.api.readOriginal(x.request("editor-b"), read), "R4_FORBIDDEN");
    });
    await t.test("copied/missing authentication cannot install a service", () => {
      for (const authentication of [null, {}, { ...x.authentication }]) assert.throws(() => x.service({ authentication }), error => error instanceof StudioVersionError && error.code === "R4_AUTH_REQUIRED");
    });
    await t.test("headers cannot create an authenticated principal", async () => {
      const request = x.request("editor-a", false, { cookie: null }); request.headers.set("x-principal-id", "editor-a"); request.headers.set("x-role", "admin");
      await denied(() => x.api.readOriginal(request, read), "R4_AUTH_REQUIRED");
    });
    await t.test("all read capabilities and save independently enforce database grants", async () => {
      await x.f.admin.query(`UPDATE public."StoryR4Access" SET "canRead"=false,"canSave"=false WHERE "principalId"='editor-a'`);
      await denied(() => x.api.readOriginal(x.request(), read), "R4_FORBIDDEN");
      await denied(() => x.api.readVersion(x.request(), { ...read, versionId: "missing" }), "R4_FORBIDDEN");
      await denied(() => x.api.listVersions(x.request(), { ...read, afterVersion: 0, limit: 50 }), "R4_FORBIDDEN");
      await denied(() => x.api.saveVersion(x.request("editor-a", true), x.input()), "R4_FORBIDDEN");
    });
    await t.test("revoked synthetic session is rejected", async () => {
      x.authentication.revokeSessionForTest("session-editor-b");
      await denied(() => x.api.readOriginal(x.request("editor-b"), read), "R4_SESSION_INVALID");
    });
    assert.deepEqual(await x.counts(), before);
  } finally { await x.close(); }
});

test("R4 bounded exact Unicode, strict proposals and tampered lineage never write", async t => {
  const x = await studioVersionFixture();
  try {
    const before = await x.counts();
    for (const [name, text] of [["surrogate", "\ud800"], ["control", "က\0"], ["bidi", "က\u202e"], ["C1 control", "က\u0085"], ["empty", ""], ["non-Myanmar", "English only"], ["oversized", "က".repeat(1201)]]) {
      await t.test(name, async () => { const input = x.input(); input.sections[0].paragraphs[0] = text; await denied(() => x.api.saveVersion(x.request("editor-a", true), input), "R4_INVALID_INPUT"); });
    }
    for (const field of ["principalId", "role", "approved", "sourceVerified", "createdAt", "version"])
      await t.test(`browser cannot supply ${field}`, () => denied(() => x.api.saveVersion(x.request("editor-a", true), { ...x.input(), [field]: true }), "R4_INVALID_INPUT"));
    const binding = x.input().binding;
    for (const group of ["original", "source", "analysis"] as const) for (const field of Object.keys(binding[group])) {
      await t.test(`tampered ${group}.${field}`, async () => {
        const input = x.input(), old = (input.binding[group] as unknown as Record<string, unknown>)[field];
        const next = typeof old === "number" ? old + 1 : typeof old === "string" && /^[a-f0-9]{64}$/.test(old) ? "0".repeat(64) : "forged-reference";
        Object.assign(input.binding[group], { [field]: next });
        await denied(() => x.api.saveVersion(x.request("editor-a", true), input));
      });
    }
    await t.test("shape/order and paragraph topology cannot silently change", async () => {
      const inputs = [x.input(), x.input(), x.input(), x.input()];
      inputs[0].sections.reverse(); inputs[1].sections[0].paragraphs.push("အပို စာပိုဒ်။");
      inputs[2].sections[0].sectionId = "forged"; inputs[3].sections.pop();
      for (const input of inputs) await denied(() => x.api.saveVersion(x.request("editor-a", true), input), "R4_PARENT_MISMATCH");
    });
    await t.test("whole-script ceiling, duplicate sections and sparse arrays reject", async () => {
      const input = x.input(); input.sections = Array.from({ length: 31 }, (_, i) => ({ sectionId: `section-${i}`, paragraphs: ["က".repeat(1200)] }));
      await denied(() => x.api.saveVersion(x.request("editor-a", true), input), "R4_INVALID_INPUT");
      const duplicate = x.input(); duplicate.sections.push(structuredClone(duplicate.sections[0]));
      await denied(() => x.api.saveVersion(x.request("editor-a", true), duplicate), "R4_INVALID_INPUT");
      const sparse = x.input(); delete sparse.sections[0]; await denied(() => x.api.saveVersion(x.request("editor-a", true), sparse), "R4_INVALID_INPUT");
    });
    await t.test("getters never execute", async () => {
      const input = x.input(); let invoked = false;
      Object.defineProperty(input, "sections", { enumerable: true, get() { invoked = true; return []; } });
      await denied(() => x.api.saveVersion(x.request("editor-a", true), input), "R4_INVALID_INPUT"); assert.equal(invoked, false);
    });
    await t.test("database independently rejects wrong source/candidate/parent bindings", async () => {
      for (const group of ["original", "source", "analysis"] as const) {
        const input = x.input(); Object.assign(input.binding[group], { [group === "original" ? "payloadId" : group === "source" ? "contextHash" : "candidateHash"]: "0".repeat(64) });
        assert.deepEqual(await x.probe(input), { outcome: "PARENT_MISMATCH" });
      }
      assert.deepEqual(await x.probe(x.input(), true), { outcome: "INVALID_FINISH_PROOF_REJECTED" });
    });
    assert.deepEqual(await x.counts(), before); assert.equal(x.wire.calls(), 1);
  } finally { await x.close(); }
});

test("R4 real concurrent sessions, optimistic parent CAS and request idempotency", async () => {
  const x = await studioVersionFixture();
  try {
    const twin = x.service({ writerDatabase: x.twinWriter() }), input = x.input();
    const [a, b] = await Promise.all([x.api.saveVersion(x.request("editor-a", true), input), twin.saveVersion(x.request("editor-a", true), input)]);
    assert.deepEqual(a, b); assert.equal(a.version, 1); assert.equal((await x.counts()).versions, "1");
    const parent = { id: a.id, contentHash: a.contentHash };
    const first = x.input("race-a", 1, parent), second = x.input("race-b", 1, parent), beforeFirst = canonicalJson(first), beforeSecond = canonicalJson(second);
    second.sections[0].paragraphs[0] = "ဒုတိယ အယ်ဒီတာ၏ ပြင်ဆင်ချက် ဖြစ်သည်။";
    const changedSecond = canonicalJson(second);
    const results = await Promise.allSettled([x.api.saveVersion(x.request("editor-a", true), first), twin.saveVersion(x.request("editor-b", true), second)]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    const failure = results.find(row => row.status === "rejected"); assert.ok(failure?.status === "rejected" && failure.reason instanceof StudioVersionError && failure.reason.code === "R4_REVISION_CONFLICT");
    assert.equal(canonicalJson(first), beforeFirst); assert.notEqual(changedSecond, beforeSecond); assert.equal(canonicalJson(second), changedSecond);
    assert.deepEqual(await x.api.saveVersion(x.request("editor-a", true), input), a, "original request is duplicate-safe even after head advances");
    const conflict = x.input(); conflict.sections[0].paragraphs[0] += " ပြောင်းလဲချက်။";
    await denied(() => x.api.saveVersion(x.request("editor-a", true), conflict), "R4_IDEMPOTENCY_CONFLICT");
    await denied(() => x.api.saveVersion(x.request("editor-a", true), x.input("stale-revision")), "R4_REVISION_CONFLICT");
    await denied(() => x.api.saveVersion(x.request("editor-a", true), x.input("bad-previous", 2, { id: a.id, contentHash: a.contentHash })), "R4_REVISION_CONFLICT");
    assert.equal((await x.counts()).versions, "2"); assert.equal((await x.counts()).fences, "0");
  } finally { await x.close(); }
});

test("R4 two real M4 originals isolate history, chain pointers and scoped idempotency", async () => {
  const x = await studioVersionFixture();
  try {
    const first = await x.api.saveVersion(x.request("editor-a", true), x.input());
    const other = await x.anotherOriginalForTest();
    assert.notEqual(other.binding.original.id, x.original.id); assert.notEqual(other.binding.analysis.candidateHash, x.originalView.binding.analysis.candidateHash);
    const input = x.input(); input.binding = structuredClone(other.binding); input.sections = other.sections.map(row => ({ sectionId: row.sectionId, paragraphs: [...row.paragraphs] }));
    await denied(() => x.api.saveVersion(x.request("editor-a", true), input), "R4_IDEMPOTENCY_CONFLICT");
    input.idempotencyKey = "other-original-edit";
    const second = await x.api.saveVersion(x.request("editor-a", true), input); assert.equal(second.version, 1);
    const otherRead = { scope: x.scope, original: { id: other.binding.original.id, draftHash: other.binding.original.draftHash } };
    await denied(() => x.api.readVersion(x.request(), { ...otherRead, versionId: first.id }), "R4_NOT_FOUND");
    const history = await x.api.listVersions(x.request(), { ...otherRead, afterVersion: 0, limit: 50 }); assert.deepEqual(history.versions.map(row => row.id), [second.id]);
    const wrongPrevious = { ...input, idempotencyKey: "wrong-original-previous", expectedRevision: 1, previousVersion: { id: first.id, contentHash: first.contentHash } };
    await denied(() => x.api.saveVersion(x.request("editor-a", true), wrongPrevious), "R4_REVISION_CONFLICT");
    assert.equal((await x.counts()).versions, "2"); assert.equal(x.wire.calls(), 2, "only the two explicit fixture seed analyses use the fake wire");
  } finally { await x.close(); }
});

for (const drift of ["CHINESE", "STUDIO"] as const) test(`R4 ${drift} writer between preflight and fence prevents stale publication`, async () => {
  const x = await studioVersionFixture(), entered = gate(), proceed = gate();
  let run: Promise<unknown> | undefined;
  try {
    const before = await x.counts(), api = x.service({ beforeFenceForTest: async () => { entered.release(); await proceed.promise; } });
    run = api.saveVersion(x.request("editor-a", true), x.input()); const rejection = denied(() => run!, "R4_SOURCE_STALE");
    await Promise.race([entered.promise, run.then(() => assert.fail("Missing fence hook"))]);
    if (drift === "CHINESE") await x.f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: "Concurrent Chinese source revision" } }));
    else await x.f.runtime.storylineStudio.update({ where: { id: x.scope.studioId }, data: { revision: { increment: 1 } } });
    proceed.release(); await rejection; assert.deepEqual(await x.counts(), before);
  } finally { proceed.release(); await Promise.allSettled([run]); await x.close(); }
});

test("R4 source fence lasts through insertion/commit; later source writer marks historical edit stale", async () => {
  const x = await studioVersionFixture(), entered = gate(), finish = gate();
  let run: Promise<unknown> | undefined, changing: Promise<unknown> | undefined;
  try {
    const [{ pid }] = await x.f.runtime.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
    const api = x.service({ afterInsertForTest: async () => { entered.release(); await finish.promise; } });
    const saving = api.saveVersion(x.request("editor-a", true), x.input()); run = saving;
    await Promise.race([entered.promise, saving.then(() => assert.fail("Missing insert hook"))]);
    changing = x.f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Writer after edited-version commit" } }));
    await waitForLock(x, pid); finish.release(); const saved = await saving; await changing;
    const read = await x.api.readVersion(x.request(), { scope: x.scope, original: x.original, versionId: saved.id });
    assert.deepEqual(read, { ...saved, currentness: "STALE_DEPENDENCIES" }); assert.equal((await x.counts()).versions, "1");
  } finally { finish.release(); await Promise.allSettled([run, changing]); await x.close(); }
});

test("R4 database grant revocation serializes after the authorized transaction", async () => {
  const x = await studioVersionFixture(), entered = gate(), finish = gate(), control = await x.f.owned.securityAdministrator();
  let run: Promise<unknown> | undefined, changing: Promise<unknown> | undefined;
  try {
    const pid = (await control.query(`SELECT pg_backend_pid() pid`)).rows[0].pid;
    const api = x.service({ afterInsertForTest: async () => { entered.release(); await finish.promise; } });
    const saving = api.saveVersion(x.request("editor-a", true), x.input()); run = saving;
    await Promise.race([entered.promise, saving.then(() => assert.fail("Missing insert hook"))]);
    changing = control.query(`UPDATE public."StoryR4Access" SET "canSave"=false WHERE login=$1 AND "sessionId"='session-editor-a'`, [x.writerLogin]);
    await waitForLock(x, pid); finish.release(); const saved = await saving; await changing;
    await denied(() => x.api.saveVersion(x.request("editor-a", true), x.input("revoked-db-grant", 1, { id: saved.id, contentHash: saved.contentHash })), "R4_FORBIDDEN");
    assert.equal((await x.counts()).versions, "1");
  } finally { finish.release(); await Promise.allSettled([run, changing]); await control.end(); await x.close(); }
});

for (const drift of ["CHINESE", "TRANSLATION", "QC", "MEDIA", "STUDIO", "SCRIPT"] as const)
  test(`R4 ${drift} drift rejects save and preserves authorized immutable historical reads`, async () => {
    const x = await studioVersionFixture();
    try {
      const saved = await x.api.saveVersion(x.request("editor-a", true), x.input()), before = await x.counts();
      if (drift === "CHINESE") await x.f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: "Changed Chinese synthetic source" } }));
      if (drift === "TRANSLATION") await x.f.mutateSource(tx => tx.translatedSegment.update({ where: { id: "target-0" }, data: { text: "ပြောင်းလဲထားသော စာသား။" } }));
      if (drift === "QC") await x.f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed QC fixture" } }));
      if (drift === "MEDIA") x.f.media.setInvalid(true);
      if (drift === "STUDIO") await x.f.runtime.storylineStudio.update({ where: { id: x.scope.studioId }, data: { revision: { increment: 1 } } });
      if (drift === "SCRIPT") await x.f.runtime.storylineStudio.update({ where: { id: x.scope.studioId }, data: { currentScriptVersionId: null } });
      const next = x.input("after-drift", 1, { id: saved.id, contentHash: saved.contentHash });
      await denied(() => x.api.saveVersion(x.request("editor-a", true), next), "R4_SOURCE_STALE");
      const readInput = { scope: x.scope, original: x.original };
      const original = await x.api.readOriginal(x.request(), readInput); assert.equal(original.currentness, "STALE_DEPENDENCIES");
      const historical = await x.api.readVersion(x.request("reader"), { ...readInput, versionId: saved.id });
      assert.deepEqual(historical, { ...saved, currentness: "STALE_DEPENDENCIES" });
      assert.equal((await x.api.listVersions(x.request(), { ...readInput, afterVersion: 0, limit: 50 })).currentness, "STALE_DEPENDENCIES");
      assert.deepEqual(await x.counts(), before); assert.equal(x.wire.calls(), 1);
    } finally { await x.close(); }
  });

test("R4 partial insert, final media failure and session revocation fully roll back", async t => {
  const x = await studioVersionFixture();
  try {
    const before = await x.counts();
    const transient = createSyntheticStudioAuthenticationForTest({ mode: "DISPOSABLE_SYNTHETIC_ONLY", allowedOrigin: origin, sessions: x.sessions });
    const failures = [
      { name: "after-insert exception", options: { afterInsertForTest: async () => { throw new Error("secret synthetic storage/path/driver diagnostic"); } }, code: "R4_TRANSACTION_FAILED" },
      { name: "final media check", options: { afterInsertForTest: async () => { x.f.media.setChanged(true); } }, code: "R4_SOURCE_STALE" },
      { name: "session revoked after insert", options: { authentication: transient, afterInsertForTest: async () => { transient.revokeSessionForTest("session-editor-a"); } }, code: "R4_SESSION_INVALID" },
    ] as const;
    for (const { name, options, code } of failures) await t.test(name, async () => {
      const service = x.service(options);
      try { await service.saveVersion(x.request("editor-a", true), x.input()); assert.fail("Expected rollback"); }
      catch (error) { assert.ok(error instanceof StudioVersionError); assert.equal(error.code, code); assert.doesNotMatch(JSON.stringify(error), /secret|storage|driver|path/); }
      x.f.media.setChanged(false); assert.deepEqual(await x.counts(), before);
    });
    const saved = await x.api.saveVersion(x.request("editor-a", true), x.input()); assert.equal(saved.version, 1); assert.equal(x.wire.calls(), 1);
  } finally { await x.close(); }
});

test("R4 final asynchronous source/media check revalidates session before commit", async () => {
  const x = await studioVersionFixture();
  try {
    const before = await x.counts(), authentication = createSyntheticStudioAuthenticationForTest({ mode: "DISPOSABLE_SYNTHETIC_ONLY", allowedOrigin: origin, sessions: x.sessions });
    let inserted = false;
    const api = x.service({ authentication, afterInsertForTest: async () => { inserted = true; },
      inspectMedia: async storageKey => {
        const media = await x.f.media.inspect(storageKey);
        return { ...media, assertUnchanged: async () => { await media.assertUnchanged(); if (inserted) authentication.revokeSessionForTest("session-editor-a"); } };
      } });
    await denied(() => api.saveVersion(x.request("editor-a", true), x.input()), "R4_SESSION_INVALID");
    assert.equal(inserted, true); assert.deepEqual(await x.counts(), before);
  } finally { await x.close(); }
});

test("R4 authenticated identity cannot switch across awaits during reads or saves", async t => {
  const x = await studioVersionFixture();
  try {
    const before = await x.counts();
    await t.test("read remains bound to its original verified session", async () => {
      const request = x.request(), other = x.request("editor-b");
      const api = x.service({ inspectMedia: async storageKey => {
        const media = await x.f.media.inspect(storageKey); request.headers.set("cookie", other.headers.get("cookie")!); return media;
      } });
      await denied(() => api.readOriginal(request, { scope: x.scope, original: x.original }), "R4_SESSION_INVALID");
    });
    await t.test("post-insert identity switch rolls back and cannot misattribute an edit", async () => {
      const request = x.request("editor-a", true), other = x.request("editor-b", true);
      const api = x.service({ afterInsertForTest: async () => {
        request.headers.set("cookie", other.headers.get("cookie")!); request.headers.set("x-story-r4-csrf", other.headers.get("x-story-r4-csrf")!);
      } });
      await denied(() => api.saveVersion(request, x.input()), "R4_SESSION_INVALID");
    });
    assert.deepEqual(await x.counts(), before);
  } finally { await x.close(); }
});

test("R4 real privileges, immutable history, constraints and unsafe credential rejection", async t => {
  const x = await studioVersionFixture();
  try {
    const saved = await x.api.saveVersion(x.request("editor-a", true), x.input()), before = await x.counts();
    await t.test("original and saved history reject owner updates/deletes/truncation", async () => {
      for (const table of ["StoryNarrationDraft", "StoryR4EditedVersion"]) {
        for (const sql of [`UPDATE public."${table}" SET id=id`, `DELETE FROM public."${table}"`]) await assert.rejects(() => x.f.admin.query(sql), { code: "23514" });
        await assert.rejects(() => x.f.admin.query(`TRUNCATE public."${table}"`), { code: table === "StoryNarrationDraft" ? "0A000" : "23514" });
      }
      await assert.rejects(() => x.f.admin.query(`TRUNCATE public."StoryNarrationDraft",public."StoryR4EditedVersion"`), { code: "23514" });
    });
    await t.test("runtime/reader/writer cannot directly access private state or write tables", async () => {
      for (const database of [x.readerDatabase, x.writerDatabase, x.f.runtime, x.f.admission]) for (const table of ["StoryR4EditedVersion", "StoryR4ValidationKey", "StoryR4Access", "StoryR4SaveFence"]) {
        await assert.rejects(() => database.$queryRawUnsafe(`SELECT * FROM public."${table}"`));
        await assert.rejects(() => database.$executeRawUnsafe(`DELETE FROM public."${table}"`));
      }
      await assert.rejects(() => x.readerDatabase.$queryRaw`SELECT public.story_r4_save_open(${'{}'},${"0".repeat(64)},${'{}'})`);
      await assert.rejects(() => x.writerDatabase.$queryRaw`SELECT public.story_r4_authorize(${'{}'},${"0".repeat(64)},true)`);
      await assert.rejects(() => x.writerDatabase.$queryRaw`SELECT public.story_r4_read(${'{}'},${"0".repeat(64)})`);
      await assert.rejects(() => x.writerDatabase.$executeRaw`ALTER TABLE public."StoryR4EditedVersion" DISABLE TRIGGER ALL`);
      await assert.rejects(() => x.writerDatabase.$executeRaw`SET ROLE storyline_migration_owner`);
    });
    await t.test("unsafe owner-like/source-writer and wrong reader/writer bootstrap fail closed", async () => {
      await denied(() => x.service({ readerDatabase: x.f.runtime }).readOriginal(x.request(), { scope: x.scope, original: x.original }), "R4_DATABASE_UNSAFE");
      await denied(() => x.service({ writerDatabase: x.readerDatabase }).saveVersion(x.request("editor-a", true), x.input("unsafe-role", 1, { id: saved.id, contentHash: saved.contentHash })), "R4_DATABASE_UNSAFE");
    });
    await t.test("column grants and extra security-definer capabilities are detected", async () => {
      await x.f.admin.query(`GRANT SELECT(secret) ON public."StoryR4ValidationKey" TO "${x.writerLogin}"`);
      await denied(() => x.api.saveVersion(x.request("editor-a", true), x.input("column-grant", 1, { id: saved.id, contentHash: saved.contentHash })), "R4_DATABASE_UNSAFE");
      await x.f.admin.query(`REVOKE SELECT(secret) ON public."StoryR4ValidationKey" FROM "${x.writerLogin}"`);
      await x.f.admin.query(`GRANT EXECUTE ON FUNCTION public.story_m1_verification_append(text,text,text) TO "${x.writerLogin}"`);
      await denied(() => x.api.saveVersion(x.request("editor-a", true), x.input("issuer-grant", 1, { id: saved.id, contentHash: saved.contentHash })), "R4_DATABASE_UNSAFE");
      await x.f.admin.query(`REVOKE EXECUTE ON FUNCTION public.story_m1_verification_append(text,text,text) FROM "${x.writerLogin}"`);
    });
    await t.test("mismatched validation key cannot read or save", async () => {
      const wrong = x.service({ validationKey: Buffer.alloc(32, 7) });
      await denied(() => wrong.readOriginal(x.request(), { scope: x.scope, original: x.original }), "R4_FORBIDDEN");
      await denied(() => wrong.saveVersion(x.request("editor-a", true), x.input()), "R4_FORBIDDEN");
    });
    await t.test("database independently enforces content hashes, parent FK and chain metadata", async () => {
      for (const patch of [{ contentHash: "0".repeat(64) }, { version: 0 }, { expectedRevision: 3 }, { originalId: "missing-original" }]) await assert.rejects(() => x.f.admin.query(`INSERT INTO public."StoryR4EditedVersion"
        SELECT (jsonb_populate_record(NULL::public."StoryR4EditedVersion",to_jsonb(v)||$2::jsonb||jsonb_build_object('id','invalid-copy'))).* FROM public."StoryR4EditedVersion" v WHERE id=$1`, [saved.id, JSON.stringify(patch)]));
      const row = (await x.f.admin.query(`SELECT "canonicalPayload" FROM public."StoryR4EditedVersion" WHERE id=$1`, [saved.id])).rows[0];
      for (const fault of ["original-fk", "previous-fk", "approval", "source-verification"] as const) {
        const payload = JSON.parse(row.canonicalPayload);
        Object.assign(payload, { id: `invalid-${fault}`, version: 2, expectedRevision: 1,
          previousVersion: { id: saved.id, contentHash: saved.contentHash }, idempotencyKey: `key-${fault}` });
        if (fault === "original-fk") payload.binding.original.id = "missing-original";
        if (fault === "previous-fk") payload.previousVersion.contentHash = "0".repeat(64);
        if (fault === "approval") payload.review.humanApproval = "APPROVED";
        if (fault === "source-verification") payload.review.sourceVerified = true;
        const proposal = Object.fromEntries(["scope", "binding", "expectedRevision", "previousVersion", "idempotencyKey", "sections"].map(key => [key, payload[key]]));
        const patch = { id: payload.id, version: 2, expectedRevision: 1, originalId: payload.binding.original.id,
          previousId: payload.previousVersion.id, previousHash: payload.previousVersion.contentHash, idempotencyKey: payload.idempotencyKey,
          proposalCanonical: canonicalJson(proposal), proposalHash: contractHash(STUDIO_EDIT.proposalDomain, proposal),
          canonicalPayload: canonicalJson(payload), contentHash: contractHash(STUDIO_EDIT.hashDomain, payload) };
        await assert.rejects(() => x.f.admin.query(`INSERT INTO public."StoryR4EditedVersion"
          SELECT (jsonb_populate_record(NULL::public."StoryR4EditedVersion",to_jsonb(v)||$2::jsonb)).* FROM public."StoryR4EditedVersion" v WHERE id=$1`,
        [saved.id, JSON.stringify(patch)]), { code: fault.endsWith("fk") ? "23503" : "23514" });
      }
    });
    assert.deepEqual(await x.counts(), before); assert.equal(before.verification, "0"); assert.equal(x.wire.calls(), 1);
  } finally { await x.close(); }
});
