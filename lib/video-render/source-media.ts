import "server-only";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { localInputArgs } from "@/lib/media";
import { localStorage } from "@/lib/storage";
import { LocalStorageProvider, StorageError } from "@/lib/storage/local";
import { RenderError } from "./contracts";
import type { SourceMediaIdentity } from "./snapshot";

function probe(path: string): Promise<{ durationMs: number; width: number; height: number; hasAudio: boolean }> {
  return new Promise((resolve, reject) => {
    execFile("ffprobe", ["-v", "error", ...localInputArgs(path), "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json"],
      { timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, (error, stdout) => {
        // Never propagate FFprobe stderr or absolute server paths.
        if (error) { reject(new RenderError("SOURCE_MEDIA_INVALID")); return; }
        try {
          const data = JSON.parse(stdout);
          const video = data.streams.find((stream: { codec_type?: string }) => stream.codec_type === "video");
          const durationMs = Math.round(Number(data.format.duration) * 1000);
          if (!video || ![durationMs, video.width, video.height].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error();
          resolve({ durationMs, width: video.width, height: video.height, hasAudio: data.streams.some((stream: { codec_type?: string }) => stream.codec_type === "audio") });
        } catch { reject(new RenderError("SOURCE_MEDIA_INVALID")); }
      });
  });
}

// Read-only, local CPU inspection. This never encodes media or calls a provider.
export async function fingerprintSourceMedia(storageKey: string | null, storage: LocalStorageProvider = localStorage): Promise<SourceMediaIdentity> {
  if (!storageKey) throw new RenderError("SOURCE_MEDIA_MISSING");
  // Audio keys are valid in shared storage but never valid render sources.
  if (!/^movies\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|mkv|webm)$/i.test(storageKey)) throw new RenderError("SOURCE_MEDIA_INVALID");
  try {
    const path = await storage.localPath(storageKey);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await file.stat({ bigint: true });
      if (!before.isFile() || before.size <= BigInt(0) || before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new RenderError("SOURCE_MEDIA_INVALID");
      const metadata = await probe(path);
      const hash = createHash("sha256");
      const buffer = Buffer.alloc(1024 * 1024);
      let position = 0;
      // Bound the read even if a local writer continuously appends to the source.
      const expectedSize = Number(before.size);
      while (position < expectedSize) {
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, expectedSize - position), position);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
      const after = await file.stat({ bigint: true });
      const current = await lstat(await storage.localPath(storageKey), { bigint: true });
      const same = (stat: typeof before) => stat.dev === before.dev && stat.ino === before.ino && stat.size === before.size && stat.mtimeNs === before.mtimeNs && stat.ctimeNs === before.ctimeNs;
      if (!same(after) || !same(current) || BigInt(position) !== before.size) throw new RenderError("SOURCE_MEDIA_CHANGED");
      return Object.freeze({ storageKey, sha256: hash.digest("hex"), sizeBytes: position, ...metadata });
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof RenderError) throw error;
    if (error instanceof StorageError) throw new RenderError(error.code === "STORAGE_FILE_MISSING" ? "SOURCE_MEDIA_MISSING" : error.code === "INVALID_STORAGE_KEY" ? "SOURCE_MEDIA_INVALID" : "STORAGE_UNAVAILABLE");
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") throw new RenderError("SOURCE_MEDIA_MISSING");
    throw new RenderError("STORAGE_UNAVAILABLE");
  }
}
