import "server-only";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { localInputArgs } from "@/lib/media";
import { RenderError, SOFT_SUBTITLE_PROFILE } from "./contracts";
import { probeMedia, supportedSource, type MediaProbe, type Stream, type VerifiedOutput } from "./probe";
import { hashFile } from "./files";

type Cue = { startMs: number; endMs: number; subtitleText: string };
type PacketReceipt = { count: number; payloadSha256: string; timingSha256: string; startMs: number; endMs: number };
export type SoftStreamPlan = {
  version: 1;
  video: { index: number; outputIndex: 0; width: number; height: number; timeBase: string; durationMs: number };
  audio: { index: number; outputIndex: number; channels: number; sampleRate: number; language: string; durationMs: number }[];
  packets: PacketReceipt[];
  subtitle: { outputIndex: number; codec: "mov_text"; language: "mya"; title: "Myanmar"; default: false; forced: false };
};
export type VerifiedStreamManifest = {
  version: 1; mode: "SOFT_SUBTITLE"; profileId: typeof SOFT_SUBTITLE_PROFILE.id;
  video: { index: 0; codec: "h264"; packets: PacketReceipt };
  audio: { index: number; codec: "aac"; channels: number; sampleRate: number; language: string; packets: PacketReceipt }[];
  subtitle: { index: number; codec: "mov_text"; language: "mya"; title: "Myanmar"; default: false; forced: false; cueCount: number; textTimingSha256: string; toleranceMs: 1 };
};
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const unsupported = () => new RenderError("SOURCE_PROFILE_UNSUPPORTED");
const invalid = () => new RenderError("OUTPUT_INVALID");

export function validateSoftCues(rows: readonly Cue[], durationMs: number) {
  if (!rows.length || rows.length > 50_000) throw new RenderError("SUBTITLE_PROFILE_UNSUPPORTED");
  let end = 0;
  for (const row of rows) {
    const text = row.subtitleText;
    // SRT demuxing trims cue-edge whitespace and blank lines. The raw-text
    // decoder escapes ASS control characters non-losslessly on supported FFmpeg.
    // Reject instead of modifying authoritative text. Interior spaces/newlines,
    // literal HTML-like tags/entities and mixed Unicode scripts remain literal.
    if (![row.startMs, row.endMs].every(Number.isSafeInteger) || row.startMs < end || row.startMs < 0 || row.endMs <= row.startMs || row.endMs > durationMs ||
      typeof text !== "string" || !text || text.trim() !== text || /[\\{}\u0000-\u0009\u000b-\u001f\u007f\r]/u.test(text) || /\n\s*\n/u.test(text) ||
      Buffer.byteLength(text, "utf8") > 60_000 || Buffer.from(text, "utf8").toString("utf8") !== text) throw new RenderError("SUBTITLE_PROFILE_UNSUPPORTED");
    end = row.endMs;
  }
}

export function softSourceLayout(data: MediaProbe): Omit<SoftStreamPlan, "packets"> {
  const video = data.streams.filter((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = data.streams.filter((s) => s.codec_type === "audio");
  if (data.streams.length > 32 || video.length !== 1 || audio.length > 8 ||
    data.streams.some((s) => !Number.isSafeInteger(s.index) || s.index! < 0 || s.index! > 255) || new Set(data.streams.map((s) => s.index)).size !== data.streams.length) throw unsupported();
  const v = video[0];
  // Keep burn-in's SDR/dimension/rate restrictions without its one-audio limit.
  const base = supportedSource({ ...data, streams: [v] });
  const durationMs = Math.round(Number(v.duration ?? data.format.duration) * 1000);
  if (v.side_data_list?.some((s) => s.rotation !== undefined && s.rotation !== 0) || v.codec_name !== "h264" || v.pix_fmt !== "yuv420p" || !/^[1-9]\d*\/[1-9]\d*$/.test(v.time_base ?? "") ||
    !Number.isSafeInteger(durationMs) || durationMs <= 0 || Math.abs(durationMs - base.durationMs) > 100 ||
    Math.abs(Number(v.start_time ?? data.format.start_time ?? 0)) > 0.001 || Math.abs(Number(data.format.start_time ?? 0)) > 0.001) throw unsupported();
  const tracks = audio.map((a, i) => {
    if (a.codec_name !== "aac" || a.profile !== "LC" || ![1, 2].includes(a.channels ?? 0) || !Number.isInteger(Number(a.sample_rate)) ||
      Number(a.sample_rate) < 8000 || Number(a.sample_rate) > 192000 || !Number.isFinite(Number(a.start_time ?? 0)) || Math.abs(Number(a.start_time ?? 0)) > 0.1) throw unsupported();
    return { index: a.index!, outputIndex: i + 1, channels: a.channels!, sampleRate: Number(a.sample_rate),
      language: /^[a-z]{3}$/.test(a.tags?.language ?? "") ? a.tags!.language! : "und", durationMs: 0 };
  });
  return { version: 1, video: { index: v.index!, outputIndex: 0, width: base.width, height: base.height, timeBase: v.time_base!, durationMs }, audio: tracks,
    subtitle: { outputIndex: 1 + tracks.length, codec: "mov_text", language: "mya", title: "Myanmar", default: false, forced: false } };
}

type Packet = Record<string, string>;
// Streaming compact FFprobe output: bounded line, packet count and wall time.
// Never buffers a full movie/packet listing. FFprobe stderr/paths never escape.
async function scanPackets(path: string, data: boolean, consume: (packet: Packet) => void, signal?: AbortSignal) {
  if (signal?.aborted) throw invalid();
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", ...localInputArgs(path), "-show_packets", ...(data ? ["-select_streams", "s:0", "-show_data"] : ["-show_data_hash", "sha256"]),
      "-show_entries", `packet=stream_index,pts_time,dts_time,duration_time,size,${data ? "data" : "data_hash"}`, "-of", "compact=p=0:nk=0"],
    { shell: false, stdio: ["ignore", "pipe", "ignore"], env: { PATH: process.env.PATH, LANG: "C.UTF-8", NODE_ENV: "production" } });
    let pending = ""; let count = 0; let failure = false;
    const stop = () => { failure = true; child.kill("SIGKILL"); };
    const timer = setTimeout(stop, 120_000);
    signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      if (pending.length > 1024 * 1024) { stop(); return; }
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        if (!line) continue;
        try {
          if (++count > (data ? 100_002 : 2_500_000)) throw invalid();
          const packet: Packet = {};
          // data is last and may contain escaped separators in its ASCII column.
          const marker = line.indexOf("|data=");
          const fields = marker < 0 ? line : line.slice(0, marker);
          for (const item of fields.split("|")) { const equal = item.indexOf("="); if (equal > 0) packet[item.slice(0, equal)] = item.slice(equal + 1); }
          if (marker >= 0) packet.data = line.slice(marker + 6);
          consume(packet);
        } catch { stop(); return; }
      }
    });
    child.once("error", stop);
    child.once("close", (code) => {
      clearTimeout(timer); signal?.removeEventListener("abort", stop);
      if (failure || code !== 0 || pending.trim()) reject(invalid()); else resolve();
    });
  });
}

async function mediaReceipts(path: string, indexes: number[], signal?: AbortSignal): Promise<PacketReceipt[]> {
  const stats = indexes.map(() => ({ count: 0, hash: createHash("sha256"), timing: createHash("sha256"), start: Infinity, end: -Infinity, dts: -Infinity }));
  await scanPackets(path, false, (packet) => {
    const i = indexes.indexOf(Number(packet.stream_index)); if (i < 0) return;
    const stat = stats[i]; const pts = Number(packet.pts_time) * 1000; const dts = Number(packet.dts_time) * 1000; const duration = Number(packet.duration_time) * 1000;
    if (![pts, dts, duration].every(Number.isFinite) || duration < 0 || duration > 1000 || dts < stat.dts ||
      stat.count && dts - stat.dts > 1000 || !/^SHA256:[a-f0-9]{64}$/.test(packet.data_hash)) throw invalid();
    stat.count++; stat.hash.update(packet.data_hash + "\n");
    stat.timing.update(JSON.stringify([pts, dts, duration].map((v) => Math.round(v * 1000))) + "\n"); stat.start = Math.min(stat.start, pts); stat.end = Math.max(stat.end, pts + duration); stat.dts = dts;
  }, signal);
  return stats.map((s) => {
    if (!s.count || s.start < -100 || s.end <= 0) throw invalid();
    return { count: s.count, payloadSha256: s.hash.digest("hex"), timingSha256: s.timing.digest("hex"), startMs: Math.round(s.start), endMs: Math.round(s.end) };
  });
}
export async function inspectSoftSource(path: string, signal?: AbortSignal): Promise<SoftStreamPlan> {
  try {
    const plan = softSourceLayout(await probeMedia(path, signal));
    const packets = await mediaReceipts(path, [plan.video.index, ...plan.audio.map((a) => a.index)], signal);
    if (Math.abs(packets[0].startMs) > 1 || Math.abs(packets[0].endMs - plan.video.durationMs) > 100 || packets.slice(1).some((p) => p.endMs > packets[0].endMs + 100)) throw unsupported();
    return { ...plan, video: { ...plan.video, durationMs: packets[0].endMs }, audio: plan.audio.map((a, i) => ({ ...a, durationMs: packets[i + 1].endMs - packets[i + 1].startMs })), packets };
  } catch { throw unsupported(); }
}

export function softEncodingArguments(source: string, plan: SoftStreamPlan, outputLimit: number) {
  return ["-hide_banner", "-nostdin", "-loglevel", "warning", "-n", "-max_alloc", "268435456", "-copyts", "-noautorotate", ...localInputArgs(source),
    "-protocol_whitelist", "file", "-f", "srt", "-c:s", "text", "-sub_charenc", "UTF-8", "-i", "subtitles.srt",
    "-map", `0:${plan.video.index}`, ...plan.audio.flatMap((a) => ["-map", `0:${a.index}`]), "-map", "1:s:0",
    "-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
    "-disposition:v:0", "default", ...plan.audio.flatMap((a, i) => [`-metadata:s:a:${i}`, `language=${a.language}`, `-disposition:a:${i}`, i === 0 ? "default" : "0"]),
    "-metadata:s:s:0", "language=mya", "-metadata:s:s:0", "title=Myanmar", "-metadata:s:s:0", "handler_name=Myanmar", "-disposition:s:0", "0",
    "-copytb", "1", "-avoid_negative_ts", "disabled", "-use_editlist", "1", "-write_tmcd", "0", "-movflags", "+faststart", "-fs", String(outputLimit),
    "-progress", "pipe:1", "-nostats", "-f", "mp4", "output.mp4"];
}

export function decodeMovTextPacket(data: string, size: number): string {
  const hex = data.split("\\n").flatMap((line) => {
    const match = /^[a-f0-9]{8}: ([a-f0-9 ]{39}) /i.exec(line); return match ? [match[1].replaceAll(" ", "")] : [];
  }).join("");
  const bytes = Buffer.from(hex, "hex");
  if (bytes.length !== size || size < 2 || size > 60_002 || bytes.readUInt16BE(0) !== size - 2) throw invalid();
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(2));
}
async function verifyCues(path: string, rows: readonly Cue[], signal?: AbortSignal) {
  let index = 0; let end = 0; let packets = 0;
  await scanPackets(path, true, (packet) => {
    const text = decodeMovTextPacket(packet.data ?? "", Number(packet.size));
    const start = Number(packet.pts_time) * 1000; const finish = start + Number(packet.duration_time) * 1000;
    if (![start, finish].every(Number.isFinite) || start < -1 || finish < start || start < end - 1) throw invalid();
    end = finish; packets++;
    if (!text) return; // MP4 muxer inserts empty samples to clear gaps.
    const row = rows[index++];
    if (!row || text !== row.subtitleText || Math.abs(start - row.startMs) > 1 || Math.abs(finish - row.endMs) > 1) throw invalid();
  }, signal);
  if (index !== rows.length || packets > rows.length * 2 + 2) throw invalid();
  return digest(JSON.stringify(rows.map((r) => [r.startMs, r.endMs, r.subtitleText])));
}
const audioMatches = (a: Stream, expected: SoftStreamPlan["audio"][number]) => a.codec_name === "aac" && a.profile === "LC" && a.channels === expected.channels && Number(a.sample_rate) === expected.sampleRate && (a.tags?.language ?? "und") === expected.language;
export async function verifySoftOutput(path: string, source: { width: number; height: number; durationMs: number }, plan: SoftStreamPlan, rows: readonly Cue[], signal?: AbortSignal): Promise<VerifiedOutput> {
  try {
    if (signal?.aborted) throw invalid();
    validateSoftCues(rows, plan.video.durationMs);
    const data = await probeMedia(path, signal);
    const v = data.streams[0]; const audios = data.streams.slice(1, 1 + plan.audio.length); const s = data.streams.at(-1)!;
    const durationMs = Math.round(Number(data.format.duration) * 1000);
    if (!data.format.format_name?.split(",").includes("mp4") || data.streams.length !== plan.audio.length + 2 || v?.codec_type !== "video" || v.index !== 0 ||
      v.codec_name !== "h264" || v.pix_fmt !== "yuv420p" || v.width !== source.width || v.height !== source.height ||
      Math.abs(Number(v.duration) * 1000 - plan.video.durationMs) > 100 || !Number.isFinite(Number(v.duration)) ||
      !Number.isSafeInteger(durationMs) || Math.abs(durationMs - source.durationMs) > 100 || audios.some((a, i) => a.codec_type !== "audio" || a.index !== i + 1 || !audioMatches(a, plan.audio[i])) ||
      s.codec_type !== "subtitle" || s.index !== plan.subtitle.outputIndex || s.codec_name !== "mov_text" || s.tags?.language !== "mya" || s.tags?.handler_name !== "Myanmar" || s.disposition?.default !== 0 || s.disposition?.forced !== 0) throw invalid();
    const receipts = await mediaReceipts(path, [0, ...plan.audio.map((a) => a.outputIndex)], signal);
    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i], original = plan.packets[i];
      if (!original || r.count !== original.count || r.payloadSha256 !== original.payloadSha256 || r.timingSha256 !== original.timingSha256 || Math.abs(r.startMs - original.startMs) > 1 || Math.abs(r.endMs - original.endMs) > 1) throw invalid();
    }
    const textTimingSha256 = await verifyCues(path, rows, signal);
    const measured = await hashFile(path);
    if (signal?.aborted) throw invalid();
    return { ...measured, durationMs, width: source.width, height: source.height, videoCodec: "h264", audioCodec: plan.audio.length ? "aac" : null,
      streamManifest: { version: 1, mode: "SOFT_SUBTITLE", profileId: SOFT_SUBTITLE_PROFILE.id,
        video: { index: 0, codec: "h264", packets: receipts[0] },
        audio: plan.audio.map((a, i) => ({ index: i + 1, codec: "aac", channels: a.channels, sampleRate: a.sampleRate, language: a.language, packets: receipts[i + 1] })),
        subtitle: { index: s.index!, codec: "mov_text", language: "mya", title: "Myanmar", default: false, forced: false, cueCount: rows.length, textTimingSha256, toleranceMs: 1 } } };
  } catch { throw invalid(); }
}
