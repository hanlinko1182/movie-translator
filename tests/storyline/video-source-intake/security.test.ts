import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { contractHash } from "../../../lib/storyline/canonical";
import { authorizePrivateVideoSourceInspection as authorize, buildVideoProbeHandoff as handoff, verifyVideoProbeHandoff,
  verifyVideoSourceMetadata, evidenceClasses, VIDEO_SOURCE_INTAKE as V, type MeasuredVideoSource } from "../../../lib/storyline/video-source-intake";
import { createSyntheticVideoCatalog, buildOfflineHighlightPlan, type SyntheticVideoDescriptor } from "../../../lib/storyline/video-highlights-offline";
import { sourceInput, selection } from "../video-highlights-offline/fixture";
import { fixture, denied } from "./fixture";

test("opaque immutable metadata separates bytes from rights, media, duration, timebase, sandbox and extraction", async t => {
  const f = await fixture(t), measured = await f.inspect(), m = measured.metadata;
  assert.deepEqual(m.evidence, evidenceClasses); assert.equal(m.measurement, "LOCAL_FILE_BYTES_VERIFIED"); assert.equal(m.provenance, "OWNER_REPORTED_SOURCE");
  assert.equal(m.rightsReview, "SOURCE_RIGHTS_PENDING"); assert.equal(m.mediaFormat, "SOURCE_MEDIA_FORMAT_NOT_VERIFIED");
  assert.equal(m.duration, null); assert.equal(m.durationEvidence, "SOURCE_DURATION_NOT_MEASURED"); assert.equal(m.timebase, null);
  assert.equal(m.sandbox, "MEDIA_SANDBOX_NOT_VERIFIED"); assert.equal(m.extraction, "EXTRACTION_NOT_AUTHORIZED");
  assert.equal(m.restrictions.productionEligible, false); assert.equal(m.restrictions.sourceVerified, false); assert.equal(m.restrictions.sourceRightsVerified, false);
  assert.equal(measured.metadataHash, contractHash(V.metadata, m));
  function frozen(v: unknown) { if (v && typeof v === "object") { assert.ok(Object.isFrozen(v)); Object.values(v).forEach(frozen); } } frozen(measured); frozen(handoff(measured));
  assert.equal(Reflect.set(m, "duration", { numerator: 100, denominator: 1 }), false);
});
for (const [field, value] of [["authorization", "OWNER_APPROVED"], ["provenance", "SOURCE_RIGHTS_VERIFIED"], ["rightsReview", "VERIFIED"],
  ["identity", { ino: "claimed" }], ["expectedSha256", "a".repeat(64)], ["duration", 120], ["timebase", { numerator: 1, denominator: 25 }],
  ["filename", "PRIVATE_NAME_MARKER.mp4"], ["receipt", { schemaVersion: "story-recap-execution-artifact-v1" }], ["humanApproval", "APPROVED"]] as const) {
  test(`rejects caller-supplied authority/identity/extra field ${field}`, async t => {
    const f = await fixture(t); await assert.rejects(authorize({ ...f.config, [field]: value } as typeof f.config), denied);
  });
}
test("strict configuration rejects missing/getter/symbol/cyclic/oversized data without exposing it", async t => {
  const f = await fixture(t), cycle: { self?: unknown } = {}; cycle.self = cycle;
  for (const c of [{}, { ...f.config, [Symbol()]: 1 }, { ...f.config, get authorizedPath() { throw Error("MUST_NOT_EXECUTE"); } }, cycle,
    { ...f.config, authorizedPath: "x".repeat(9000) }]) await assert.rejects(authorize(c as typeof f.config), denied);
});
test("invalid paths, traversal, trailing separators, root escapes and repository overlap denied", async t => {
  const f = await fixture(t);
  for (const c of [{ ...f.config, authorizedPath: "relative.blob" }, { ...f.config, authorizedPath: f.root + "/../escape.blob" },
    { ...f.config, authorizedPath: f.file + "\0" }, { ...f.config, privateRoot: f.root + "/" }, { ...f.config, repositoryRoot: process.cwd() + "/" },
    { ...f.config, privateRoot: "/" }, { ...f.config, repositoryRoot: "/" }, { ...f.config, authorizedPath: path.join(f.parent, "outside.blob") },
    { ...f.config, repositoryRoot: f.root }, { ...f.config, privateRoot: process.cwd(), authorizedPath: path.join(process.cwd(), "private.blob") },
    { ...f.config, authorizedPath: f.root }]) await assert.rejects(authorize(c), denied);
});
test("missing file, directories, leaf/ancestor/root symlinks and hardlinks are never opened as sources", async t => {
  const f = await fixture(t);
  await assert.rejects(authorize({ ...f.config, authorizedPath: path.join(f.root, "MISSING_PRIVATE_MARKER") }), denied);
  const dir = path.join(f.root, "subdir"); await fs.mkdir(dir, { mode: 0o700 }); await assert.rejects(authorize({ ...f.config, authorizedPath: dir }), denied);
  const leaf = path.join(f.root, "link.blob"), alias = path.join(f.root, "alias"), rootAlias = path.join(f.parent, "root-alias");
  await fs.symlink(f.file, leaf); await fs.symlink(f.root, alias); await fs.symlink(f.root, rootAlias);
  for (const file of [leaf, path.join(alias, "non-media-source.blob")]) await assert.rejects(authorize({ ...f.config, authorizedPath: file }), denied);
  await assert.rejects(authorize({ ...f.config, privateRoot: rootAlias, authorizedPath: path.join(rootAlias, "non-media-source.blob") }), denied);
  await fs.link(f.file, path.join(f.root, "hardlink.blob")); await assert.rejects(f.inspect(), denied);
});
test("symlink substitution just before open is denied by no-follow rather than followed", async t => {
  const f = await fixture(t), permit = await authorize(f.config), open = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    await fs.rename(f.file, f.file + ".original"); await fs.symlink(f.file + ".original", f.file); return open(...args);
  });
  await assert.rejects(permit.inspect(), denied);
});
for (const [kind, mode] of [["file", 0o644], ["file", 0o660], ["file", 0o700], ["file", 0o000], ["root", 0o755], ["subdir", 0o750]] as const) {
  test(`restrictive permissions ${kind} ${mode.toString(8)} enforced`, async t => {
    const f = await fixture(t); let target = kind === "root" ? f.root : f.file, config = f.config;
    if (kind === "subdir") {
      target = path.join(f.root, "subdir"); await fs.mkdir(target, { mode: 0o700 }); const file = path.join(target, "source.blob");
      await fs.writeFile(file, f.content, { mode: 0o600 }); config = { ...f.config, authorizedPath: file };
    }
    await fs.chmod(target, mode); try { await assert.rejects(authorize(config), denied); } finally { await fs.chmod(target, kind === "file" ? 0o600 : 0o700); }
  });
}
test("read-only 0400 file and owned nested 0700 directories are supported", async t => {
  const f = await fixture(t), dir = path.join(f.root, "nested"); await fs.mkdir(dir, { mode: 0o700 }); const file = path.join(dir, "source.blob");
  await fs.writeFile(file, f.content, { mode: 0o400 }); assert.equal((await (await authorize({ ...f.config, authorizedPath: file })).inspect()).metadata.byteCount, f.content.length);
});
test("copies, mutations, rehashed metadata and cross-source observations cannot restore measurement capability", async t => {
  const f = await fixture(t), a = await f.inspect(), b = await f.inspect();
  assert.notEqual(a.metadata.candidateSourceId, b.metadata.candidateSourceId); assert.equal(a.metadata.sha256, b.metadata.sha256);
  await assert.rejects(Promise.resolve().then(() => verifyVideoSourceMetadata(a, b.metadata)), denied);
  for (const copied of [JSON.parse(JSON.stringify(a)), { ...a, metadata: { ...a.metadata, byteCount: 1 } }]) {
    copied.metadataHash = contractHash(V.metadata, copied.metadata);
    assert.throws(() => handoff(copied), denied); assert.throws(() => verifyVideoSourceMetadata(copied, a.metadata), denied);
  }
  for (const value of [{ ...a.metadata, sha256: "a".repeat(64) }, { ...a.metadata, duration: 120 }, { ...a.metadata, privatePath: "/private/PRIVATE_PATH_MARKER" }]) assert.throws(() => verifyVideoSourceMetadata(a, value), denied);
});
test("probe handoff stays blocked with exact source binding; claims cannot promote current evidence", async t => {
  const f = await fixture(t), m = await f.inspect(), h = handoff(m);
  assert.equal(h.source.sha256, m.metadata.sha256); assert.equal(h.source.metadataHash, m.metadataHash); assert.equal(h.status, "BLOCKED");
  assert.equal(h.sourceBackedHighlights, "NOT_AUTHORIZED"); assert.equal(h.duration, null); assert.equal(h.streams, null); assert.equal(h.timebase, null);
  assert.equal(verifyVideoProbeHandoff(m, JSON.parse(JSON.stringify(h))).status, "BLOCKED");
  for (const changed of [{ ...h, duration: { numerator: 120, denominator: 1 } }, { ...h, timebase: { numerator: 1, denominator: 25 } },
    { ...h, streams: [{ codec: "H264" }] }, { ...h, rights: "VERIFIED" }, { ...h, sandbox: "VERIFIED" }, { ...h, sourceBackedHighlights: "AUTHORIZED" },
    { ...h, source: { ...h.source, candidateSourceId: "copied" } }, { ...h, extractionPermit: true }]) assert.throws(() => verifyVideoProbeHandoff(m, changed), denied);
});
test("M10-04A synthetic descriptors, saved artifacts and M8 fake receipts cannot promote either direction", async t => {
  const f = await fixture(t), source = await f.inspect(), synthetic = createSyntheticVideoCatalog().register(sourceInput());
  for (const value of [synthetic, { schemaVersion: "story-recap-execution-artifact-v1" }, { schemaVersion: "story-private-narration-artifact-v1" }]) assert.throws(() => handoff(value as unknown as MeasuredVideoSource), denied);
  assert.throws(() => buildOfflineHighlightPlan(source as unknown as SyntheticVideoDescriptor, selection(synthetic)));
  assert.throws(() => createSyntheticVideoCatalog().register({ ...sourceInput(), origin: "LOCAL_FILE_BYTES_VERIFIED", sha256: source.metadata.sha256 }));
});
test("an mp4 extension and matching hash prove only actual file bytes; private paths/bytes/native errors never escape", async t => {
  const f = await fixture(t), named = path.join(f.root, "PRIVATE_MOVIE_NAME_MARKER.mp4"); await fs.rename(f.file, named); let logs = 0, network = 0;
  for (const k of ["log", "warn", "error", "info"] as const) t.mock.method(console, k, () => { logs++; });
  t.mock.method(globalThis, "fetch", () => { network++; throw Error("OFFLINE_NETWORK_DENIED"); });
  const m = await (await authorize({ ...f.config, authorizedPath: named })).inspect(), json = JSON.stringify({ m, h: handoff(m) });
  assert.doesNotMatch(json, /PRIVATE_MOVIE_NAME_MARKER|"data":|"inode"|"uid"|"path"/); assert.ok(!json.includes(f.parent));
  assert.equal(m.metadata.mediaFormat, "SOURCE_MEDIA_FORMAT_NOT_VERIFIED"); assert.equal(logs, 0); assert.equal(network, 0);
});
