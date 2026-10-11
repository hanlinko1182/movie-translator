import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { LocalStorageProvider } from "../../lib/storage/local";
import { inspectStorylineMedia } from "../../lib/storyline/media";
import { StorylinePreparationError } from "../../lib/storyline/preparation-errors";
import type { MediaProbe } from "../../lib/video-render/probe";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No API/provider calls")); });
after(() => mock.restoreAll());
const key = "movies/00000000-0000-4000-8000-000000000023.mp4";
const controlled = (code: string, root: string) => (error: unknown) => error instanceof StorylinePreparationError && error.code === code && !error.message.includes(root);
async function fixture(run: (storage: LocalStorageProvider, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "storyline-inspection-")), storage = new LocalStorageProvider(root);
  try { await storage.initialize(); await run(storage, root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
function inspection(storage: LocalStorageProvider) {
  // Positive metadata is synthetic: no encoding, transcoding or existing movie reads.
  const data: MediaProbe = { streams: [{ index: 0, codec_type: "video", codec_name: "h264", width: 320, height: 240, time_base: "1/12800", avg_frame_rate: "25/1", field_order: "progressive" }], format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "24" } };
  return {
    fingerprint: async () => {
      const bytes = await readFile(await storage.localPath(key)); // Small disposable fixture only.
      return { storageKey: key, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length, durationMs: 24000, width: 320, height: 240, hasAudio: false };
    },
    probe: async () => data,
  };
}

test("real private filesystem: missing, traversal, symlink, empty and corrupt media fail safely", async () => fixture(async (storage, root) => {
  for (const input of [null, key]) await assert.rejects(inspectStorylineMedia(input, storage), controlled("SOURCE_MEDIA_MISSING", root));
  for (const input of ["../secret.mp4", "/etc/passwd", "audio/movie.wav", "movies/../../secret.mp4", "renders/00000000-0000-4000-8000-000000000023.mp4"]) await assert.rejects(inspectStorylineMedia(input, storage), controlled("SOURCE_MEDIA_INVALID", root));
  await symlink("/etc/passwd", storage.path(key));
  await assert.rejects(inspectStorylineMedia(key, storage), controlled("SOURCE_MEDIA_INVALID", root));
  await rm(storage.path(key));
  await storage.put(key, Readable.from([]));
  await assert.rejects(inspectStorylineMedia(key, storage), controlled("SOURCE_MEDIA_INVALID", root));
  await storage.put(key, Readable.from(["Corrupt disposable video"]), { replace: true });
  await assert.rejects(inspectStorylineMedia(key, storage), controlled("SOURCE_MEDIA_INVALID", root));
}));

test("private directory checks stay enforced without repairing permissions", async () => fixture(async (storage, root) => {
  await storage.put(key, Readable.from(["fixture"]));
  await chmod(join(root, "movies"), 0o755);
  await assert.rejects(inspectStorylineMedia(key, storage, inspection(storage)), controlled("STORAGE_UNAVAILABLE", root));
}));

test("identity and checksum are stable; inspection never rewrites source; final replacement is detected", async () => fixture(async (storage, root) => {
  const bytes = Buffer.from("Disposable source identity fixture"), fake = inspection(storage);
  await storage.put(key, Readable.from([bytes]));
  const first = await inspectStorylineMedia(key, storage, fake), second = await inspectStorylineMedia(key, storage, fake);
  assert.equal(first.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(second.sha256, first.sha256); assert.equal(first.sizeBytes, bytes.length); assert.equal(first.durationMs, 24000);
  assert.equal(first.video.videoCodec, "h264"); assert.equal(first.video.timeBase, "1/12800");
  await first.assertUnchanged(); assert.deepEqual(await readFile(storage.path(key)), bytes);
  await storage.put(key, Readable.from([bytes]), { replace: true }); // Same bytes, new inode.
  await assert.rejects(first.assertUnchanged(), controlled("SOURCE_MEDIA_CHANGED", root));
}));

test("source replacement during probing is detected, even with the same bytes", async () => fixture(async (storage, root) => {
  const bytes = Buffer.from("Disposable replacement fixture"), fake = inspection(storage);
  await storage.put(key, Readable.from([bytes]));
  await assert.rejects(inspectStorylineMedia(key, storage, { ...fake, probe: async () => {
    await storage.put(key, Readable.from([bytes]), { replace: true }); return fake.probe();
  } }), controlled("SOURCE_MEDIA_CHANGED", root));
}));

test("unsupported streams and conflicting measured metadata are rejected", async () => fixture(async (storage, root) => {
  await storage.put(key, Readable.from(["fixture"]));
  const fake = inspection(storage), data = await fake.probe();
  await assert.rejects(inspectStorylineMedia(key, storage, { ...fake, probe: async () => ({ ...data, streams: [...data.streams, ...data.streams] }) }), controlled("SOURCE_PROFILE_UNSUPPORTED", root));
  await assert.rejects(inspectStorylineMedia(key, storage, { ...fake, probe: async () => ({ ...data, format: { ...data.format, duration: "25" } }) }), controlled("SOURCE_MEDIA_INVALID", root));
}));
