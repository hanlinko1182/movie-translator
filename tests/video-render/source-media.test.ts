import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { LocalStorageProvider } from "@/lib/storage/local";
import { fingerprintSourceMedia } from "@/lib/video-render/source-media";
import { RenderError } from "@/lib/video-render/contracts";

test("filesystem integration: missing, traversal, symlink, empty and corrupt media are controlled failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "render-source-test-"));
  const storage = new LocalStorageProvider(root);
  const key = "movies/00000000-0000-4000-8000-000000000001.mp4";
  const fails = (code: string) => (error: unknown) => error instanceof RenderError && error.code === code && !error.message.includes(root);
  try {
    await storage.initialize();
    await assert.rejects(fingerprintSourceMedia(null, storage), fails("SOURCE_MEDIA_MISSING"));
    await assert.rejects(fingerprintSourceMedia(key, storage), fails("SOURCE_MEDIA_MISSING"));
    for (const input of ["../video.mp4", "audio/movie.wav", "movies/https://host/video.mp4", "/etc/passwd"]) await assert.rejects(fingerprintSourceMedia(input, storage), fails("SOURCE_MEDIA_INVALID"));
    await symlink("/etc/passwd", storage.path(key));
    await assert.rejects(fingerprintSourceMedia(key, storage), fails("SOURCE_MEDIA_INVALID"));
    await rm(storage.path(key));
    await storage.put(key, Readable.from([]));
    await assert.rejects(fingerprintSourceMedia(key, storage), fails("SOURCE_MEDIA_INVALID"));
    await storage.put(key, Readable.from(["This is not an MP4 file"]), { replace: true });
    await assert.rejects(fingerprintSourceMedia(key, storage), fails("SOURCE_MEDIA_INVALID"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
