import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFile, rm, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { supportedSource, verifyOutput, type MediaProbe } from "@/lib/video-render/probe";
import { RenderError } from "@/lib/video-render/contracts";
import { assertShapingEvidence, prepareMyanmarFont } from "@/lib/video-render/fonts";
import { createAttemptDirectory, newOutputKey } from "@/lib/video-render/files";
import { localStorage } from "@/lib/storage";
import { progressPercent, runSupervised } from "@/lib/video-render/runner";
import { encodingArguments } from "@/lib/video-render/execution";

const source = (): MediaProbe => ({ format: { duration: "6", start_time: "0" }, streams: [
  { codec_type: "video", width: 1280, height: 720, avg_frame_rate: "25/1", sample_aspect_ratio: "1:1", color_space: "bt709" },
  { codec_type: "audio", channels: 1, sample_rate: "48000" },
] });
test("source profile rejects rotation, anamorphic, HDR, excessive dimensions/rate/audio and invalid timing", () => {
  assert.equal(supportedSource(source()).durationMs, 6000);
  for (const property of [{ tags: { rotate: "90" } }, { side_data_list: [{ rotation: -90 }] }, { sample_aspect_ratio: "4:3" },
    { color_transfer: "smpte2084" }, { color_primaries: "bt2020" }, { width: 4096 }, { height: 721 }, { avg_frame_rate: "120/1" }, { field_order: "tt" }, { start_time: "5" }]) {
    const data = source(); Object.assign(data.streams[0], property);
    assert.throws(() => supportedSource(data), (error: unknown) => error instanceof RenderError && error.code === "SOURCE_PROFILE_UNSUPPORTED");
  }
  for (const channels of [0, 6]) { const data = source(); data.streams[1].channels = channels; assert.throws(() => supportedSource(data), RenderError); }
  const missing = source(); missing.streams = []; assert.throws(() => supportedSource(missing), RenderError);
  const long = source(); long.format.duration = "999999"; assert.throws(() => supportedSource(long), RenderError);
});
test("bounded progress never reports 100 before publication and ignores malformed/unknown duration", () => {
  assert.equal(progressPercent("out_time_us=3000000", 6000), 50);
  assert.equal(progressPercent("out_time_us=6000000", 6000), 99);
  assert.equal(progressPercent("out_time_us=99999999999999999999999", 6000), null);
  assert.equal(progressPercent("out_time_us=1000", 0), null);
  assert.equal(progressPercent("progress=end", 6000), null);
});
test("Myanmar preflight rejects missing font, missing complex shaping and glyph errors", () => {
  assertShapingEvidence("Shaper: FriBidi HarfBuzz\nfontselect: sans-serif -> NotoSansMyanmar-Regular");
  for (const log of ["Shaper: simple\nfontselect: NotoSansMyanmar", "Shaper: HarfBuzz\nfontselect: DejaVuSans", "Shaper: HarfBuzz\nfontselect: NotoSansMyanmar\nGlyph 1000 not found"]) assert.throws(() => assertShapingEvidence(log), RenderError);
});
test("fixed encoder arguments contain no client options, no retiming/shortest, and explicit CPU limits", () => {
  const args = encodingArguments("source.mp4", true, 123456);
  assert.ok(args.includes("ass=subtitles.ass:shaping=complex"));
  assert.ok(args.includes("libx264")); assert.ok(args.includes("aac"));
  for (const flag of ["-shortest", "-ss", "-t", "-hwaccel"]) assert.ok(!args.includes(flag));
  assert.ok(encodingArguments("source.mp4", false, 123456).includes("-an"));
});
test("real supervised FFmpeg/font fixture: success, failure, timeout, cancellation and lock exclusion", async () => {
  const directory = await createAttemptDirectory();
  try {
    const savedPath = process.env.PATH;
    try {
      process.env.PATH = "/not-installed";
      await assert.rejects(prepareMyanmarFont(directory, "မြန်မာစာ", new AbortController().signal), (e: unknown) => e instanceof RenderError && e.code === "MYANMAR_FONT_UNAVAILABLE");
    } finally { process.env.PATH = savedPath; }
    const fontConfig = await prepareMyanmarFont(directory, "မင်္ဂလာပါ။ မြန်မာစာ စမ်းသပ်မှု", new AbortController().signal);
    const options = { cwd: directory, fontConfig, signal: new AbortController().signal, durationMs: 1000, outputLimit: 16 * 1024 ** 2 };
    const short = ["-hide_banner", "-nostdin", "-threads", "2", "-filter_threads", "1", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=1", "-vf", "ass=font-check.ass:shaping=complex", "-c:v", "libx264", "-threads:v", "2", "-pix_fmt", "yuv420p", "-y", "fixture.mp4"];
    await runSupervised({ ...options, args: short });
    const verified = await verifyOutput(join(directory, "fixture.mp4"), { durationMs: 1000, width: 1280, height: 720, hasAudio: false });
    assert.ok(verified.sizeBytes > 0); assert.equal(verified.videoCodec, "h264");
    const outputKey = newOutputKey();
    await copyFile(join(directory, "fixture.mp4"), join(directory, "output.mp4"));
    await assert.rejects(localStorage.publishRenderFile(outputKey, join(directory, "output.mp4"), async () => false));
    assert.equal(await localStorage.exists(outputKey), false);
    await assert.rejects(localStorage.publishRenderFile(outputKey, "/outside/output.mp4", async () => true));
    await assert.rejects(runSupervised({ ...options, args: ["-not-a-real-flag"] }), (e: unknown) => e instanceof RenderError && e.code === "RENDER_FAILED");
    await assert.rejects(runSupervised({ ...options, args: short, authorize: async () => false }), (e: unknown) => e instanceof RenderError && e.code === "RENDER_FAILED");
    const slow = ["-nostdin", "-re", "-f", "lavfi", "-i", "color=s=640x360:d=10", "-f", "null", "-"];
    await assert.rejects(runSupervised({ ...options, args: slow, timeoutMs: 700 }), (e: unknown) => e instanceof RenderError && e.code === "RENDER_TIMEOUT");
    const control = new AbortController();
    const running = runSupervised({ ...options, args: slow, signal: control.signal });
    const cancelled = assert.rejects(running, RenderError);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await assert.rejects(runSupervised({ ...options, args: short }), (e: unknown) => e instanceof RenderError && e.code === "RENDER_RESOURCE_LIMIT");
    control.abort(); await cancelled;
    await runSupervised({ ...options, args: short }); // Lock and descendants released.
    const parent = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", resolve("tests/video-render/crash-parent.fixture.ts"), directory], {
      stdio: ["ignore", "pipe", "ignore"], env: { PATH: process.env.PATH, NODE_ENV: "development", LOCAL_STORAGE_ROOT: process.env.LOCAL_STORAGE_ROOT },
    });
    try {
      await new Promise<void>((resolveStarted, reject) => {
        const timeout = setTimeout(() => reject(new Error("Fixture did not reach encoding")), 5000);
        parent.stdout.on("data", (chunk: Buffer) => { if (chunk.toString().includes("ENCODING")) { clearTimeout(timeout); resolveStarted(); } });
        parent.once("error", reject);
      });
      const exited = new Promise<void>((resolveExited) => parent.once("close", () => resolveExited()));
      parent.kill("SIGKILL"); await exited;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2500));
      await runSupervised({ ...options, args: short }); // EOF killed orphan encoder and released flock.
    } finally { if (parent.exitCode === null && parent.signalCode === null) parent.kill("SIGKILL"); }
    await writeFile(join(directory, "broken.mp4"), "not a video");
    await assert.rejects(verifyOutput(join(directory, "broken.mp4"), { durationMs: 1000, width: 1280, height: 720, hasAudio: false }), RenderError);
    await assert.rejects(verifyOutput(join(directory, "absent.mp4"), { durationMs: 1000, width: 1280, height: 720, hasAudio: false }), RenderError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
