import "server-only";
import { lstat } from "node:fs/promises";
import { localStorage } from "@/lib/storage";
import { LocalStorageProvider, StorageError } from "@/lib/storage/local";
import { fingerprintSourceMedia } from "@/lib/video-render/source-media";
import { probeMedia, supportedSource } from "@/lib/video-render/probe";
import { RenderError } from "@/lib/video-render/contracts";
import type { StoryVideoMetadata } from "./contracts";
import { StorylinePreparationError } from "./preparation-errors";

export type InspectedStorylineMedia = {
  storageKey: string; sha256: string; sizeBytes: number; durationMs: number;
  video: StoryVideoMetadata;
  // Process-local ownership check, never serialized as snapshot data or exposed as a token.
  assertUnchanged: () => Promise<void>;
};
function safeMediaError(error: unknown): never {
  if (error instanceof StorylinePreparationError) throw error;
  if (error instanceof RenderError && ["SOURCE_MEDIA_MISSING", "SOURCE_MEDIA_INVALID", "SOURCE_MEDIA_CHANGED", "SOURCE_PROFILE_UNSUPPORTED", "STORAGE_UNAVAILABLE"].includes(error.code)) throw new StorylinePreparationError(error.code as "SOURCE_MEDIA_MISSING" | "SOURCE_MEDIA_INVALID" | "SOURCE_MEDIA_CHANGED" | "SOURCE_PROFILE_UNSUPPORTED" | "STORAGE_UNAVAILABLE");
  if (error instanceof StorageError) throw new StorylinePreparationError(error.code === "STORAGE_FILE_MISSING" ? "SOURCE_MEDIA_MISSING" : error.code === "INVALID_STORAGE_KEY" ? "SOURCE_MEDIA_INVALID" : "STORAGE_UNAVAILABLE");
  throw new StorylinePreparationError("STORAGE_UNAVAILABLE");
}
/** Inspection only: no encoding, storage initialization, chmod, writes or provider calls. */
export async function inspectStorylineMedia(storageKey: string | null, storage: LocalStorageProvider = localStorage,
  inspection: { fingerprint?: typeof fingerprintSourceMedia; probe?: typeof probeMedia } = {}): Promise<InspectedStorylineMedia> {
  if (!storageKey) throw new StorylinePreparationError("SOURCE_MEDIA_MISSING");
  if (!/^movies\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|mkv|webm)$/i.test(storageKey)) throw new StorylinePreparationError("SOURCE_MEDIA_INVALID");
  async function stamp() {
    const file = await storage.openFile(storageKey!);
    try {
      const stat = await file.stat({ bigint: true });
      const current = await lstat(await storage.localPath(storageKey!), { bigint: true });
      const identity = (s: typeof stat) => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String).join(":");
      if (!stat.isFile() || stat.size <= BigInt(0) || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new StorylinePreparationError("SOURCE_MEDIA_INVALID");
      if (identity(stat) !== identity(current)) throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED");
      return identity(stat);
    } finally { await file.close(); }
  }
  try {
    const before = await stamp();
    const fingerprint = await (inspection.fingerprint ?? fingerprintSourceMedia)(storageKey, storage);
    const data = await (inspection.probe ?? probeMedia)(await storage.localPath(storageKey));
    // Reuse the current CPU render inspection limits; this is not an encoding guarantee.
    const supported = supportedSource(data), video = data.streams.find(row => row.codec_type === "video")!;
    if (supported.durationMs !== fingerprint.durationMs || supported.width !== fingerprint.width || supported.height !== fingerprint.height || supported.hasAudio !== fingerprint.hasAudio ||
      !/^[a-z0-9_,]+$/i.test(data.format.format_name ?? "") || !/^[a-z0-9_]+$/i.test(video.codec_name ?? "") ||
      !/^[1-9]\d*\/[1-9]\d*$/.test(video.time_base ?? "") || !Number.isSafeInteger(video.index) || video.index! < 0) throw new StorylinePreparationError("SOURCE_MEDIA_INVALID");
    const formats = data.format.format_name!.split(",");
    if (!formats.some(name => ["mov", "mp4", "matroska", "webm"].includes(name))) throw new StorylinePreparationError("SOURCE_PROFILE_UNSUPPORTED");
    if (await stamp() !== before) throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED");
    return { storageKey, sha256: fingerprint.sha256, sizeBytes: fingerprint.sizeBytes, durationMs: fingerprint.durationMs,
      video: { format: data.format.format_name!, videoIndex: video.index!, videoCodec: video.codec_name!, width: supported.width, height: supported.height, timeBase: video.time_base!, frameRate: video.avg_frame_rate!, hasAudio: supported.hasAudio },
      assertUnchanged: async () => { try { if (await stamp() !== before) throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED"); } catch (error) { safeMediaError(error); } },
    };
  } catch (error) { safeMediaError(error); }
}
