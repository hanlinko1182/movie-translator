import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { localInputArgs } from "@/lib/media";
import { RenderError } from "./contracts";
import { hashFile } from "./files";

const execute = promisify(execFile);
type Stream = { codec_type?: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string; sample_aspect_ratio?: string;
  avg_frame_rate?: string; field_order?: string; color_space?: string; color_transfer?: string; color_primaries?: string;
  channels?: number; sample_rate?: string; start_time?: string; duration?: string; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] };
export type MediaProbe = { streams: Stream[]; format: { duration?: string; start_time?: string; format_name?: string } };
export async function probeMedia(path: string): Promise<MediaProbe> {
  try {
    const { stdout } = await execute("ffprobe", ["-v", "error", ...localInputArgs(path), "-show_streams", "-show_format", "-of", "json"], { shell: false, timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 });
    const data = JSON.parse(stdout);
    if (!Array.isArray(data.streams) || !data.format) throw new Error();
    return data;
  } catch { throw new RenderError("SOURCE_MEDIA_INVALID"); }
}
export function supportedSource(data: MediaProbe) {
  const videos = data.streams.filter((s) => s.codec_type === "video");
  const audios = data.streams.filter((s) => s.codec_type === "audio");
  const video = videos[0]; const audio = audios[0];
  const durationMs = Math.round(Number(data.format.duration) * 1000);
  const [numerator, denominator] = (video?.avg_frame_rate ?? "0/1").split("/").map(Number);
  const fps = numerator / denominator;
  const rotation = Number(video?.tags?.rotate ?? video?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0);
  if (videos.length !== 1 || audios.length > 1 || !video || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 6 * 60 * 60 * 1000 ||
    !Number.isInteger(video.width) || !Number.isInteger(video.height) || video.width! < 16 || video.height! < 16 || video.width! > 3840 || video.height! > 2160 || video.width! % 2 || video.height! % 2 ||
    !Number.isFinite(fps) || fps <= 0 || fps > 60 || rotation !== 0 || !["1:1", "N/A", undefined].includes(video.sample_aspect_ratio) ||
    !["progressive", "unknown", undefined].includes(video.field_order) ||
    [video.color_space, video.color_primaries].some((v) => v && !["unknown", "bt709", "smpte170m", "bt470bg", "smpte240m"].includes(v)) ||
    video.color_transfer && !["unknown", "bt709", "smpte170m", "bt470bg", "smpte240m", "iec61966-2-1"].includes(video.color_transfer) ||
    ![data.format.start_time ?? 0, video.start_time ?? 0].every((v) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 0.1) ||
    audio && (!Number.isInteger(audio.channels) || audio.channels! < 1 || audio.channels! > 2 || !Number.isFinite(Number(audio.sample_rate)) || Number(audio.sample_rate) < 8000 || Number(audio.sample_rate) > 192000 || !Number.isFinite(Number(audio.start_time ?? 0)) || Math.abs(Number(audio.start_time ?? 0)) > 0.1)) throw new RenderError("SOURCE_PROFILE_UNSUPPORTED");
  return { durationMs, width: video.width!, height: video.height!, hasAudio: !!audio };
}
export type VerifiedOutput = { sha256: string; sizeBytes: number; durationMs: number; width: number; height: number; videoCodec: "h264"; audioCodec: "aac" | null };
export async function verifyOutput(path: string, source: { durationMs: number; width: number; height: number; hasAudio: boolean }): Promise<VerifiedOutput> {
  try {
    const measured = await hashFile(path);
    const data = await probeMedia(path);
    const video = data.streams.filter((s) => s.codec_type === "video");
    const audio = data.streams.filter((s) => s.codec_type === "audio");
    const durationMs = Math.round(Number(data.format.duration) * 1000);
    // AAC padding and frame rounding: maximum 500 ms or 0.1%, capped at 2 s.
    const tolerance = Math.min(2000, Math.max(500, source.durationMs * 0.001));
    if (!data.format.format_name?.split(",").includes("mp4") || video.length !== 1 || video[0].codec_name !== "h264" || video[0].pix_fmt !== "yuv420p" ||
      video[0].width !== source.width || video[0].height !== source.height || !Number.isSafeInteger(durationMs) || Math.abs(durationMs - source.durationMs) > tolerance ||
      !Number.isFinite(Number(video[0].duration)) || Math.abs(Number(video[0].duration) * 1000 - source.durationMs) > tolerance ||
      audio.length !== (source.hasAudio ? 1 : 0) || audio.some((s) => s.codec_name !== "aac" || !Number.isFinite(Number(s.duration)) || Math.abs(Number(s.duration) * 1000 - source.durationMs) > tolerance)) throw new Error();
    return { ...measured, durationMs, width: source.width, height: source.height, videoCodec: "h264", audioCodec: source.hasAudio ? "aac" : null };
  } catch { throw new RenderError("OUTPUT_INVALID"); }
}
