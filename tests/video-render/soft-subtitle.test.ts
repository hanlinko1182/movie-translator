import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { BURN_IN_PROFILE, SOFT_SUBTITLE_PROFILE, parseRenderRequest, RenderError } from "@/lib/video-render/contracts";
import { parseRenderSubmission } from "@/lib/video-render/job-contract";
import { buildRenderSnapshot, sha256, type SourceMediaIdentity } from "@/lib/video-render/snapshot";
import { inspectSoftSource, softSourceLayout, softEncodingArguments, validateSoftCues, verifySoftOutput, type SoftStreamPlan } from "@/lib/video-render/soft-subtitle";
import { disableGeneratedSubtitle } from "@/lib/video-render/mp4-disposition";
import { probeMedia, type MediaProbe } from "@/lib/video-render/probe";
import { runSupervised } from "@/lib/video-render/runner";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { validatedSnapshot } from "@/lib/video-render/execution";
import { formatSrt } from "@/lib/subtitle-export/srt";
import type { TranslationSnapshot } from "@/lib/translation-qc/service";

const execute = promisify(execFile);
const request = { projectId: "project-1", movieId: "movie-1", mode: "SOFT_SUBTITLE" as const, scope: "ALL_CURRENT" as const, profileId: SOFT_SUBTITLE_PROFILE.id };
const probe = (): MediaProbe => ({ format: { duration: "6", start_time: "0", format_name: "mov,mp4" }, streams: [
  { index: 0, codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 320, height: 240, avg_frame_rate: "25/1", time_base: "1/12800", start_time: "0", duration: "6" },
  { index: 1, codec_type: "audio", codec_name: "aac", profile: "LC", channels: 1, sample_rate: "48000", duration: "6" },
] });
const plan = (): SoftStreamPlan => ({ ...softSourceLayout(probe()), packets: [0, 1].map(() => ({ count: 150, payloadSha256: sha256("packets"), timingSha256: sha256("timing"), startMs: 0, endMs: 6000 })) });
function fixture(): TranslationSnapshot {
  const date = new Date("2026-10-11T00:00:00Z");
  const sources = ["你好", "再见", "谢谢"].map((text, sequence) => ({ text, sequence, startMs: sequence * 2000, endMs: sequence * 2000 + 1500 }));
  return { id: request.movieId, projectId: request.projectId, sourceLanguage: "zh", transcript: { id: "transcript", segments: sources }, translation: {
    id: "translation", movieId: request.movieId, sourceTranscriptId: "transcript", sourceLanguage: "zh", targetLanguage: "my", provider: "fixture", model: "fixture", revision: 1, qcScannedAt: null, createdAt: date, updatedAt: date,
    segments: sources.map((s, i) => ({ id: `segment-${i}`, translationId: "translation", sequence: i, startMs: s.startMs, endMs: s.endMs, text: ["မင်္ဂလာပါ။ <b>literal</b> &amp; A < B", "စစ်ဆေးရန် စာတန်း", "ကျေးဇူးတင်ပါတယ်။ 中文 English"][i],
      origin: i === 0 ? "MANUAL" : "MODEL", manualSourceHash: i === 0 ? sourceTextHash(s.text) : null, reviewStatus: i === 1 ? "NEEDS_REVIEW" : "APPROVED", revision: 0, provider: null, model: null, refinementJobId: null, editedAt: i === 0 ? date : null, reviewedAt: date, createdAt: date, qcIssues: [] })) } };
}
const media: SourceMediaIdentity = { storageKey: "movies/00000000-0000-4000-8000-000000000001.mp4", sha256: sha256("source"), sizeBytes: 123, durationMs: 6000, width: 320, height: 240, hasAudio: true };
test("strict soft mode/profile, explicit API contract and burn-in regression", () => {
  assert.deepEqual(parseRenderRequest(request), request);
  assert.deepEqual(parseRenderSubmission(request.projectId, request.movieId, { mode: request.mode, exportMode: request.scope, profileId: request.profileId }), request);
  const burn = { ...request, mode: "BURN_IN", profileId: BURN_IN_PROFILE.id };
  assert.deepEqual(parseRenderRequest(burn), burn);
  for (const bad of [{ ...request, profileId: BURN_IN_PROFILE.id }, { ...burn, profileId: request.profileId }, { ...request, options: ["-vf"] }, { ...request, movieId: "../x" }, { ...request, mode: "MKV" }]) assert.throws(() => parseRenderRequest(bad), RenderError);
  const b = buildRenderSnapshot(parseRenderRequest(burn), fixture(), media); assert.equal(b.snapshot.version, 1); assert.equal(b.snapshot.recipe.profile.id, BURN_IN_PROFILE.id);
  assert.equal(b.recipeHash, buildRenderSnapshot(parseRenderRequest(burn), fixture(), media).recipeHash);
});
test("soft v2 snapshot, manual authority, approval gaps, frozen bytes and content identity", () => {
  const movie = fixture(); const source = { ...media, streamPlan: plan() }; const before = JSON.stringify(movie);
  const all = buildRenderSnapshot(request, movie, source);
  const approved = buildRenderSnapshot({ ...request, scope: "APPROVED_ONLY" }, movie, source);
  assert.equal(all.snapshot.version, 2); assert.equal(all.snapshot.rows[0].origin, "MANUAL");
  assert.deepEqual(approved.snapshot.rows.map((r) => [r.sequence, r.startMs, r.endMs]), [[0, 0, 1500], [2, 4000, 5500]]);
  assert.equal(JSON.stringify(movie), before);
  assert.equal(all.recipeHash, buildRenderSnapshot(request, movie, source, new Date(0)).recipeHash);
  assert.notEqual(all.recipeHash, approved.recipeHash);
  assert.notEqual(all.recipeHash, buildRenderSnapshot(request, movie, { ...source, sha256: sha256("changed") }).recipeHash);
  assert.notEqual(all.recipeHash, buildRenderSnapshot({ ...request, mode: "BURN_IN", profileId: BURN_IN_PROFILE.id }, movie, media).recipeHash);
  movie.translation.segments[0].text += " ပြင်ဆင်ချက်";
  assert.notEqual(all.recipeHash, buildRenderSnapshot(request, movie, source).recipeHash);
  assert.equal(validatedSnapshot(all.snapshot, { movieId: request.movieId, recipeHash: all.recipeHash }), all.snapshot);
  const broken = structuredClone(all.snapshot); broken.rows[0].subtitleText = "tampered";
  assert.throws(() => validatedSnapshot(broken, { movieId: request.movieId, recipeHash: all.recipeHash }), RenderError);
  assert.throws(() => buildRenderSnapshot({ ...request, projectId: "wrong" }, movie, source), RenderError);
});
test("cue representability rejects lossy/control/oversized/overlapping/out-of-video text without normalization", () => {
  const cue = { startMs: 1, endMs: 1000, subtitleText: "မြန်မာ <b>literal</b> &amp; 中文  English\nဒုတိယစာကြောင်း" };
  validateSoftCues([cue], 2000);
  for (const value of [" space", "space ", "a\n\nb", "a\\N", "{literal}", "a\u0000b", "a\tb", "x".repeat(60001), "\ud800"]) assert.throws(() => validateSoftCues([{ ...cue, subtitleText: value }], 2000), RenderError);
  for (const pair of [[0, 0], [-1, 10], [0, 3000]]) assert.throws(() => validateSoftCues([{ ...cue, startMs: pair[0], endMs: pair[1] }], 2000), RenderError);
  assert.throws(() => validateSoftCues([cue, { ...cue, startMs: 900, endMs: 1500 }], 2000), RenderError);
});
test("supported stream selection excludes covers/existing subtitles, accepts silent/multiple AAC and rejects codecs/rotation", () => {
  const p = probe(); p.streams.push({ ...p.streams[1], index: 2 }, { index: 3, codec_type: "subtitle", codec_name: "subrip" }, { index: 4, codec_type: "video", codec_name: "mjpeg", disposition: { attached_pic: 1 } });
  const selected = softSourceLayout(p); assert.deepEqual(selected.audio.map((a) => a.index), [1, 2]); assert.equal(selected.subtitle.outputIndex, 3);
  const silent = probe(); silent.streams = [silent.streams[0]]; assert.equal(softSourceLayout(silent).audio.length, 0);
  for (const property of [{ codec_name: "hevc" }, { pix_fmt: "yuv420p10le" }, { tags: { rotate: "90" } }, { side_data_list: [{ rotation: -90 }] }, { start_time: "2" }]) { const data = probe(); Object.assign(data.streams[0], property); assert.throws(() => softSourceLayout(data), RenderError); }
  for (const property of [{ codec_name: "opus" }, { profile: "HE-AAC" }, { channels: 6 }]) { const data = probe(); Object.assign(data.streams[1], property); assert.throws(() => softSourceLayout(data), RenderError); }
  const excessive = probe(); excessive.streams.push(...Array.from({ length: 8 }, (_, i) => ({ ...excessive.streams[1], index: i + 2 }))); assert.throws(() => softSourceLayout(excessive), RenderError);
  const args = softEncodingArguments("source.mp4", { ...selected, packets: [] }, 123456);
  assert.equal(args[args.indexOf("-c:v") + 1], "copy"); assert.equal(args[args.indexOf("-c:a") + 1], "copy");
  assert.ok(args.includes("0:2")); for (const forbidden of ["0:3", "0:4", "-vf", "-r", "-shortest", "-ss"]) assert.ok(!args.includes(forbidden));
});

test("real short FFmpeg copy/mov_text: Unicode, literal markup, audio tracks, silent video, verification and cancellation", async (t) => {
  const directory = await mkdtemp("/tmp/movie-translator-soft-qa-");
  const rows = [ { startMs: 200, endMs: 1500, subtitleText: "မင်္ဂလာပါ။ <b>literal</b> &amp; A < B" }, { startMs: 4500, endMs: 5800, subtitleText: "ကျေးဇူးတင်ပါတယ်။ 中文  English\nဒုတိယစာကြောင်း" } ];
  await writeFile(join(directory, "subtitles.srt"), formatSrt(rows.map((r, sequence) => ({ ...r, sequence, text: r.subtitleText }))));
  await execute("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=0x183044:s=320x240:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=5", "-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-threads:a", "1", "-metadata:s:a:0", "language=zho", join(directory, "source.mp4")], { timeout: 30000, maxBuffer: 65536 });
  for (const silent of [false, true]) await t.test(silent ? "silent" : "two AAC tracks with different durations", async () => {
    const sourceName = silent ? "silent.mp4" : "source.mp4";
    if (silent) await execute("ffmpeg", ["-v", "error", "-i", join(directory, "source.mp4"), "-map", "0:v:0", "-c", "copy", join(directory, sourceName)]);
    const plan = await inspectSoftSource(join(directory, sourceName));
    assert.equal(plan.audio.length, silent ? 0 : 2);
    await execute("ffmpeg", softEncodingArguments(sourceName, plan, 16 * 1024 ** 2), { cwd: directory, timeout: 30000, maxBuffer: 65536 });
    // Proves the FFmpeg auto-enabled bit is corrected and actual output checked.
    await disableGeneratedSubtitle(join(directory, "output.mp4"));
    const result = await verifySoftOutput(join(directory, "output.mp4"), { width: 320, height: 240, durationMs: 6000 }, plan, rows);
    assert.equal(result.streamManifest!.subtitle.cueCount, 2); assert.equal(result.streamManifest!.subtitle.default, false);
    assert.equal(result.streamManifest!.audio.length, silent ? 0 : 2);
    const streams = await probeMedia(join(directory, "output.mp4"));
    assert.equal(streams.streams.at(-1)!.tags!.language, "mya"); assert.equal(streams.streams.at(-1)!.disposition!.forced, 0);
    await assert.rejects(verifySoftOutput(join(directory, "output.mp4"), { width: 320, height: 240, durationMs: 6000 }, plan, [{ ...rows[0], subtitleText: "changed" }, rows[1]]), RenderError);
    await writeFile(join(directory, silent ? "silent-soft.mp4" : "soft-subtitles.mp4"), await readFile(join(directory, "output.mp4")));
    await (await import("node:fs/promises")).unlink(join(directory, "output.mp4"));
  });
  await t.test("existing source subtitle is excluded and VFR video packets remain untouched", async () => {
    await execute("ffmpeg", ["-v", "error", "-i", join(directory, "source.mp4"), "-f", "srt", "-i", join(directory, "subtitles.srt"), "-map", "0", "-map", "1:s:0", "-c", "copy", "-c:s", "mov_text", join(directory, "existing-subs.mp4")]);
    const plan = await inspectSoftSource(join(directory, "existing-subs.mp4"));
    await execute("ffmpeg", softEncodingArguments("existing-subs.mp4", plan, 16 * 1024 ** 2), { cwd: directory });
    await disableGeneratedSubtitle(join(directory, "output.mp4"));
    await verifySoftOutput(join(directory, "output.mp4"), { width: 320, height: 240, durationMs: 6000 }, plan, rows);
    await (await import("node:fs/promises")).unlink(join(directory, "output.mp4"));
    await execute("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=6", "-vf", "select='not(mod(n,2))+not(mod(n,5))'", "-fps_mode", "vfr", "-c:v", "libx264", "-threads:v", "1", join(directory, "vfr.mp4")]);
    const vfr = await inspectSoftSource(join(directory, "vfr.mp4"));
    await execute("ffmpeg", softEncodingArguments("vfr.mp4", vfr, 16 * 1024 ** 2), { cwd: directory });
    await disableGeneratedSubtitle(join(directory, "output.mp4"));
    await verifySoftOutput(join(directory, "output.mp4"), { width: 320, height: 240, durationMs: vfr.video.durationMs }, vfr, rows);
    await (await import("node:fs/promises")).unlink(join(directory, "output.mp4"));
  });
  const sourcePlan = await inspectSoftSource(join(directory, "source.mp4"));
  const controller = new AbortController();
  await assert.rejects(runSupervised({ cwd: directory, args: softEncodingArguments("source.mp4", sourcePlan, 16 * 1024 ** 2), signal: controller.signal, outputLimit: 16 * 1024 ** 2, durationMs: 6000,
    authorize: async () => { controller.abort(); return false; } }), RenderError);
  const duringCopy = new AbortController(); let observedProgress = false;
  await assert.rejects(runSupervised({ cwd: directory, args: softEncodingArguments("source.mp4", sourcePlan, 16 * 1024 ** 2), signal: duringCopy.signal, outputLimit: 16 * 1024 ** 2, durationMs: 6000,
    progress: () => { observedProgress = true; duringCopy.abort(); } }), RenderError);
  assert.equal(observedProgress, true, "interrupt actual fast FFmpeg execution");
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(verifySoftOutput(join(directory, "soft-subtitles.mp4"), { width: 320, height: 240, durationMs: 6000 }, sourcePlan, rows, cancelled.signal), RenderError);
  console.log(JSON.stringify({ softSubtitleQaDirectory: directory, guiPlayerVerified: false }));
});
