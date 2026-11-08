import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createPrivateNarrationStore, openPrivateNarrationStore, PrivateNarrationStoreError } from "../../../lib/storyline/narration-private-store";
import { noOwnerClaims, measureNarrationWav } from "../../../lib/storyline/narration-intake";
import { fixture, overwrite, reseal, wav } from "./fixture";

const denied = (e: unknown) => e instanceof PrivateNarrationStoreError && !String(e).includes("/");
test("valid import preserves source, exact copied bytes/hash/frames/duration and private permissions", async t => {
  const f = await fixture(t), before = await fs.readFile(f.sourcePath), m = await f.import();
  assert.deepEqual(await fs.readFile(f.sourcePath), before); assert.deepEqual(await fs.readFile(path.join(f.dir(m.artifactId), "audio.wav")), before);
  assert.deepEqual(m.measured, measureNarrationWav(before)); assert.deepEqual(m.measured.durationSeconds, { numerator: 101, denominator: 24000 });
  assert.equal((await fs.stat(f.config.root)).mode & 0o777, 0o700);
  for (const file of ["audio.wav", "manifest.json", "commit.json"]) assert.equal((await fs.stat(path.join(f.dir(m.artifactId), file))).mode & 0o777, 0o400);
  assert.equal((await fs.stat(path.join(f.config.root, ".owner.json"))).mode & 0o777, 0o400);
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.measured));
});
test("duplicate exact import returns original; changed evidence conflicts without overwrite", async t => {
  const f = await fixture(t), a = await f.import(), before = await fs.readFile(path.join(f.dir(a.artifactId), "manifest.json"));
  assert.deepEqual(await f.import(), a);
  await assert.rejects(f.store.importWav(f.source, { ...noOwnerClaims, listeningFeedback: "OWNER_SUPPLIED" }), denied);
  assert.deepEqual(await fs.readFile(path.join(f.dir(a.artifactId), "manifest.json")), before);
  assert.equal((await f.store.list()).artifacts.length, 1);
});
test("read-only reopening reconstructs trust by byte validation; preview remains exact and blocked", async t => {
  const f = await fixture(t), m = await f.import(), reader = await openPrivateNarrationStore(f.config);
  assert.equal("importWav" in reader, false); assert.deepEqual(await reader.lookup(m.artifactId), m);
  assert.deepEqual(await reader.list(), { artifacts: [m], unresolved: [] });
  const p = await reader.preview(m.artifactId, { numerator: 202, denominator: 48000 });
  assert.deepEqual(p.timing.end, { numerator: 101, denominator: 24000 }); assert.equal(p.timing.synchronization, "PREVIEW_ONLY");
  assert.equal(p.timing.restrictions.productionEligible, false); assert.equal(p.timing.restrictions.publicationEligibility, false);
  await assert.rejects(reader.preview(m.artifactId, { numerator: 1, denominator: 1 }), denied);
});
for (const kind of ["truncated", "modified", "additional", "missing"] as const) test(`stored WAV ${kind} is denied on lookup/list/preview`, async t => {
  const f = await fixture(t), m = await f.import(), file = path.join(f.dir(m.artifactId), "audio.wav");
  if (kind === "missing") await fs.unlink(file);
  else { const b = await fs.readFile(file); if (kind === "modified") b[50] ^= 1;
    await overwrite(file, kind === "truncated" ? b.subarray(0, b.length - 1) : kind === "additional" ? Buffer.concat([b, Buffer.from([0, 0])]) : b); }
  await assert.rejects(f.store.lookup(m.artifactId), denied); await assert.rejects(f.store.list(), denied); await assert.rejects(f.store.preview(m.artifactId), denied);
});
for (const target of ["manifest.json", "commit.json"] as const) test(`malformed ${target} cannot be trusted`, async t => {
  const f = await fixture(t), m = await f.import(); await overwrite(path.join(f.dir(m.artifactId), target), "{broken");
  await assert.rejects(f.store.lookup(m.artifactId), denied);
});
for (const [key, value] of [["providerReceipt", "PROVIDER_RECEIPT_VERIFIED"], ["scriptCoverage", "VERIFIED"], ["humanApproval", "APPROVED"],
  ["restrictions", { productionEligible: true }], ["listeningFeedback", "APPROVED"], ["createdAt", "not-a-date"]] as const) {
  test(`validly resealed forged metadata ${key} is still denied`, async t => {
    const f = await fixture(t), m = await f.import();
    await reseal(f.config.root, m.artifactId, r => { r[key] = value; }); await assert.rejects(f.store.lookup(m.artifactId), denied);
  });
}
for (const field of ["sha256", "sampleFrames", "durationSeconds", "byteCount"] as const) test(`valid MAC cannot replace measured ${field}`, async t => {
  const f = await fixture(t), m = await f.import();
  await reseal(f.config.root, m.artifactId, r => { const measured = r.measured as Record<string, unknown>;
    measured[field] = field === "sha256" ? "a".repeat(64) : field === "durationSeconds" ? { numerator: 1, denominator: 1 } : 1; });
  await assert.rejects(f.store.lookup(m.artifactId), denied);
});
test("outer rehashing without original local seal never authenticates manifest changes", async t => {
  const f = await fixture(t), m = await f.import(), file = path.join(f.dir(m.artifactId), "manifest.json");
  const json = JSON.parse(await fs.readFile(file, "utf8")); json.metadata.createdAt = "2026-01-01T00:00:00.000Z";
  await overwrite(file, JSON.stringify(json)); await assert.rejects(f.store.lookup(m.artifactId), denied);
});
test("copied manifests cannot cross artifact or store identities; copied entire root cannot reopen", async t => {
  const f = await fixture(t), a = await f.import(), other = await fixture(t), b = await other.import();
  await overwrite(path.join(other.dir(b.artifactId), "manifest.json"), await fs.readFile(path.join(f.dir(a.artifactId), "manifest.json")));
  await assert.rejects(other.store.lookup(b.artifactId), denied);
  const second = wav(102); await fs.writeFile(f.sourcePath, second); const c = await f.import();
  await overwrite(path.join(f.dir(c.artifactId), "manifest.json"), await fs.readFile(path.join(f.dir(a.artifactId), "manifest.json")));
  await assert.rejects(f.store.lookup(c.artifactId), denied);
  const rootCopy = path.join(f.parent, "copied-store"); await fs.cp(f.config.root, rootCopy, { recursive: true });
  await assert.rejects(openPrivateNarrationStore({ ...f.config, root: rootCopy }), denied);
});
test("private source mutation between measurement and copy is detected", async t => {
  const f = await fixture(t), original = fs.open.bind(fs); let sourceReads = 0;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    if (args[0] === f.sourcePath && ++sourceReads === 2) { const b = wav(); b[50] ^= 1; await fs.writeFile(f.sourcePath, b); }
    return original(...args);
  });
  await assert.rejects(f.import(), denied); assert.deepEqual((await f.store.list()).artifacts, []);
});
for (const kind of ["root", "objects", "audio.wav", "manifest.json", "commit.json", ".owner.json"] as const) test(`invalid permissions on ${kind} denied`, async t => {
  const f = await fixture(t), m = await f.import();
  const file = kind === "root" ? f.config.root : kind === "objects" || kind === ".owner.json" ? path.join(f.config.root, kind) : path.join(f.dir(m.artifactId), kind);
  await fs.chmod(file, kind === "root" || kind === "objects" ? 0o755 : 0o644); await assert.rejects(f.store.lookup(m.artifactId), denied);
});
test("invalid source permissions, symlinks, hardlinks and malformed WAV are denied without registration", async t => {
  const f = await fixture(t); await fs.chmod(f.sourcePath, 0o644); await assert.rejects(f.import(), denied);
  await fs.chmod(f.sourcePath, 0o600); const link = path.join(f.parent, "link.wav"); await fs.symlink(f.sourcePath, link);
  await assert.rejects(f.store.importWav({ ...f.source, authorizedPath: link }, noOwnerClaims), denied);
  const hard = path.join(f.parent, "hard.wav"); await fs.link(f.sourcePath, hard); await assert.rejects(f.import(), denied);
  await fs.unlink(hard); await fs.writeFile(f.sourcePath, Buffer.alloc(100)); await assert.rejects(f.import(), denied);
  assert.deepEqual((await f.store.list()).artifacts, []);
});
for (const kind of ["symlink", "hardlink"] as const) test(`stored ${kind} denied`, async t => {
  const f = await fixture(t), m = await f.import(), file = path.join(f.dir(m.artifactId), "audio.wav");
  if (kind === "symlink") { await fs.unlink(file); await fs.symlink(f.sourcePath, file); }
  else await fs.link(file, path.join(f.parent, "foreign-hardlink.wav"));
  await assert.rejects(f.store.lookup(m.artifactId), denied);
});
test("path traversal, repository overlap, existing root and unsafe root selection denied", async t => {
  const f = await fixture(t);
  for (const root of ["relative", "/", path.join(process.cwd(), "private-store"), f.parent + "/../escape", f.config.root]) {
    await assert.rejects(createPrivateNarrationStore({ ...f.config, root }), denied);
  }
  for (const id of ["../audio.wav", "/private/SECRET_MARKER", "na-bad", { hash: "a".repeat(64) }]) await assert.rejects(f.store.lookup(id as string), denied);
  const alias = path.join(f.parent, "store-alias"); await fs.symlink(f.config.root, alias);
  await assert.rejects(openPrivateNarrationStore({ ...f.config, root: alias }), denied);
});
test("trailing separators cannot bypass configured repository containment", async t => {
  const f = await fixture(t), repository = path.join(f.parent, "synthetic-repository"); await fs.mkdir(repository, { mode: 0o700 });
  await assert.rejects(createPrivateNarrationStore({ ...f.config, repositoryRoot: repository + path.sep, root: path.join(repository, "private-store") }), denied);
  await assert.rejects(createPrivateNarrationStore({ ...f.config, root: path.join(f.parent, "new-store") + path.sep }), denied);
  await assert.rejects(createPrivateNarrationStore({ ...f.config, repositoryRoot: "/", root: path.join(f.parent, "new-store") }), denied);
  assert.deepEqual(await fs.readdir(repository), []);
});
test("orphan directory never auto-registers, never auto-deletes and blocks new import", async t => {
  const f = await fixture(t), id = "na-11111111-1111-4111-8111-111111111111", dir = f.dir(id);
  await fs.mkdir(dir, { mode: 0o700 }); await fs.writeFile(path.join(dir, "audio.wav"), wav(), { mode: 0o400 });
  assert.deepEqual(await f.store.list(), { artifacts: [], unresolved: [{ artifactId: id, status: "UNCOMMITTED" }] });
  await assert.rejects(f.store.lookup(id), denied); await assert.rejects(f.import(), denied);
  assert.deepEqual(await fs.readFile(path.join(dir, "audio.wav")), wav());
});
test("unexpected named file and missing artifact are denied without revealing name/path", async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.config.root, "objects", "PRIVATE_NAME_MARKER"), "owned unexpected fixture");
  await assert.rejects(f.store.list(), e => { assert.ok(denied(e)); assert.ok(!String(e).includes("PRIVATE_NAME_MARKER")); return true; });
  await assert.rejects(f.store.lookup("na-11111111-1111-4111-8111-111111111111"), denied);
});
test("private metadata has no paths/payloads/logs and retains owner-supplied evidence restrictions", async t => {
  const f = await fixture(t); let calls = 0;
  for (const method of ["log", "warn", "info", "error"] as const) t.mock.method(console, method, () => { calls++; });
  t.mock.method(globalThis, "fetch", () => { throw Error("NO_NETWORK"); });
  const m = await f.store.importWav(f.source, { origin: "OWNER_DOWNLOADED_WAV", providerClaim: "OPENROUTER_GEMINI_KORE_OWNER_REPORTED", originalScript: "UNAVAILABLE", listeningFeedback: "OWNER_SUPPLIED" });
  const safe = JSON.stringify({ m, list: await f.store.list(), preview: await f.store.preview(m.artifactId) });
  assert.ok(!safe.includes(f.parent) && !safe.includes('"data":') && !safe.includes('"sealKey"') && !safe.includes('"storeId"'));
  assert.equal(calls, 0); assert.equal(m.scriptCoverage, "NOT_VERIFIED"); assert.equal(m.providerReceipt, "UNKNOWN");
  assert.equal(m.restrictions.audioVerified, false); assert.equal(m.restrictions.productionEligible, false);
  assert.ok(m.evidence.includes("LISTENING_FEEDBACK_OWNER_SUPPLIED"));
});
test("M5/M8 artifacts, copied metadata, provider receipts and human approvals cannot be imported", async t => {
  const f = await fixture(t);
  for (const evidence of [{ schemaVersion: "story-recap-execution-artifact-v1" }, { schemaVersion: "story-voice-audio-artifact-v1" },
    { ...noOwnerClaims, providerReceipt: "PROVIDER_RECEIPT_VERIFIED" }, { ...noOwnerClaims, humanApproval: "APPROVED" }]) await assert.rejects(f.store.importWav(f.source, evidence), denied);
  assert.deepEqual((await f.store.list()).artifacts, []);
});
test("source authorization and evidence are snapshotted before asynchronous work", async t => {
  const f = await fixture(t), evidence = { ...noOwnerClaims }, source = { ...f.source };
  const operation = f.store.importWav(source, evidence);
  evidence.listeningFeedback = "OWNER_SUPPLIED"; source.authorizedPath = path.join(f.parent, "NONEXISTENT_PRIVATE_MARKER");
  const m = await operation; assert.equal(m.provenance.listeningFeedback, "NOT_PROVIDED"); assert.equal(m.measured.sampleFrames, 101);
});
test("valid local MAC cannot upgrade nested owner listening or exact-script evidence", async t => {
  const f = await fixture(t), m = await f.import();
  await reseal(f.config.root, m.artifactId, r => { const provenance = r.provenance as Record<string, unknown>; provenance.listeningFeedback = "HUMAN_APPROVED"; provenance.originalScript = "VERIFIED"; });
  await assert.rejects(f.store.lookup(m.artifactId), denied);
});
test("unexpected committed artifact entries fail closed", async t => {
  const f = await fixture(t), m = await f.import(); await fs.writeFile(path.join(f.dir(m.artifactId), "UNEXPECTED_PRIVATE_ENTRY"), "fixture", { mode: 0o400 });
  await assert.rejects(f.store.lookup(m.artifactId), denied); await assert.rejects(f.store.list(), denied);
});
