import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { prisma, disconnectPrisma } from "@/lib/prisma";
import { localStorage, createMovieStorageKey } from "@/lib/storage";
import { createRenderJobSnapshot } from "@/lib/video-render/service";
import { BURN_IN_PROFILE } from "@/lib/video-render/contracts";
import { createRenderQueue, createRenderTransport } from "@/lib/queue/render-queue";
import { createRenderWorker, processRenderReference, stopActiveRenders } from "@/workers/render-worker";
import { renderQueueJobId } from "@/lib/video-render/job-contract";
import { claimRenderAttempt, completeRenderAttempt, deferRenderAttempt, operateRenderJob, recordPublication, recoverStaleRenderAttempt } from "@/lib/video-render/lifecycle";
import { GET as DOWNLOAD } from "@/app/api/projects/[id]/movies/[movieId]/renders/[renderId]/download/route";
import { POST as CANCEL } from "@/app/api/projects/[id]/movies/[movieId]/renders/[renderId]/cancel/route";
import { sha256, type PreparedRenderSnapshot } from "@/lib/video-render/snapshot";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { getExportableSubtitle } from "@/lib/subtitle-export/service";
import { GET as EXPORT } from "@/app/api/movies/[id]/export/subtitles/route";
import { withRenderCpuLock } from "@/lib/video-render/runner";
import { reconcileRenderDispatch } from "@/lib/video-render/dispatch";

const execute = promisify(execFile);
test("short real render: immutable Myanmar subtitles, lifecycle, recovery and scoped download", { skip: process.env.RUN_RENDER_EXECUTION_TESTS !== "1" }, async (t) => {
  const projectId = `render-execution-${randomUUID()}`;
  const prefix = `render-execution-${randomUUID()}`;
  const sourceKey = createMovieStorageKey(".mp4");
  const fixtureDirectory = await mkdtemp("/tmp/movie-translator-render-qa-");
  const queue = createRenderQueue(prefix);
  const outputs = new Set<string>();
  let motionSourceKey: string | undefined;
  let worker: ReturnType<typeof createRenderWorker> | undefined;
  const originalProjects = await prisma.project.findMany({ orderBy: { id: "asc" } });
  const originalMovies = await prisma.movie.findMany({ orderBy: { id: "asc" } });
  const originalRenderCount = await prisma.renderJob.count();
  try {
    await localStorage.initialize();
    await execute("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=0x183044:s=1280x720:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6",
      "-c:v", "libx264", "-preset", "ultrafast", "-threads:v", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-threads:a", "1", join(fixtureDirectory, "source.mp4")], { timeout: 30000, maxBuffer: 65536 });
    const originalBytes = await readFile(join(fixtureDirectory, "source.mp4"));
    await localStorage.put(sourceKey, Readable.from(originalBytes));
    await prisma.project.create({ data: { id: projectId, slug: projectId, name: "Temporary short Myanmar render verification" } });
    const movie = await prisma.movie.create({ data: { projectId, title: "Six-second synthetic Myanmar fixture", storageKey: sourceKey } });
    const times = [[0, 1500], [2000, 3500], [4500, 5800]];
    const sources = times.map(([startMs, endMs], sequence) => ({ sequence, startMs, endMs, text: ["你好", "再见", "谢谢"][sequence] }));
    const transcript = await prisma.transcript.create({ data: { movieId: movie.id, provider: "fixture", model: "fixture", text: "你好\n再见\n谢谢", segments: { create: sources } } });
    const translation = await prisma.translation.create({ data: { movieId: movie.id, sourceTranscriptId: transcript.id, provider: "fixture", model: "fixture", sourceLanguage: "zh", targetLanguage: "my", segments: { create: sources.map((row, i) => ({
      sequence: i, startMs: row.startMs, endMs: row.endMs, text: ["မင်္ဂလာပါ။ မြန်မာစာ စမ်းသပ်မှု", "စစ်ဆေးရန် စာတန်း", "ကျေးဇူးတင်ပါတယ်။"][i],
      origin: i === 0 ? "MANUAL" : "MODEL", manualSourceHash: i === 0 ? sourceTextHash(row.text) : null, reviewStatus: i === 1 ? "NEEDS_REVIEW" : "APPROVED",
    })) } } });
    const input = { projectId, movieId: movie.id, mode: "BURN_IN", scope: "APPROVED_ONLY", profileId: BURN_IN_PROFILE.id };
    const domain = () => prisma.translation.findUniqueOrThrow({ where: { id: translation.id }, include: { segments: { orderBy: { sequence: "asc" }, include: { qcIssues: true } } } });
    const before = await domain();
    const [job, duplicate] = await Promise.all([createRenderJobSnapshot(input), createRenderJobSnapshot(input)]);
    assert.equal(job.id, duplicate.id);
    const reference = { renderJobId: job.id, generation: 0 };
    const frozen = job.snapshot as unknown as PreparedRenderSnapshot["snapshot"];
    const context = (renderId = job.id, id = projectId, movieId = movie.id) => ({ params: Promise.resolve({ id, movieId, renderId }) });
    const download = (renderId = job.id) => DOWNLOAD(new Request("http://localhost/download"), context(renderId));
    const transport = createRenderTransport(prefix);
    await transport.publish(reference); await transport.close();

    await t.test("actual BullMQ worker produces verified H.264/AAC MP4 and retains the full six seconds", async () => {
      worker = createRenderWorker(prefix); worker.on("error", () => {}); await worker.waitUntilReady();
      const deadline = Date.now() + 30000;
      let current;
      do {
        current = await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id }, include: { output: true } });
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(current.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      await worker.close(); worker = undefined;
      assert.equal(current!.state, "COMPLETED", current!.errorCode ?? "render did not finish");
      const output = current!.output!; outputs.add(output.storageKey);
      assert.equal(output.videoCodec, "h264"); assert.equal(output.audioCodec, "aac");
      assert.ok(Math.abs(output.durationMs - 6000) <= 500); assert.equal(output.width, 1280); assert.equal(output.height, 720);
      assert.deepEqual(await domain(), before);
      assert.deepEqual(frozen.rows.map((row) => [row.sequence, row.startMs, row.endMs]), [[0, 0, 1500], [2, 4500, 5800]]);
      assert.equal(frozen.rows[0].origin, "MANUAL");
      const response = await download(); assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(sha256(bytes), output.sha256);
      assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.ok(response.headers.get("content-disposition")?.includes("attachment"));
      await writeFile(join(fixtureDirectory, "burn-in.mp4"), bytes);
      for (const [label, timestamp] of [["myanmar", "0.8"], ["approval-gap", "2.7"], ["final-cue", "4.9"]]) {
        await execute("ffmpeg", ["-v", "error", "-ss", timestamp, "-i", join(fixtureDirectory, "burn-in.mp4"), "-frames:v", "1", "-threads:v", "1", join(fixtureDirectory, `${label}.png`)], { timeout: 10000, maxBuffer: 65536 });
      }
      const audio = await execute("ffmpeg", ["-v", "error", "-i", join(fixtureDirectory, "burn-in.mp4"), "-map", "0:a:0", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"], { encoding: "buffer", timeout: 10000, maxBuffer: 1024 * 1024 });
      let energy = 0; let crossings = 0; let previous = 0;
      for (let offset = 0; offset + 4 <= audio.stdout.length; offset += 4) {
        const value = audio.stdout.readFloatLE(offset); energy += value * value;
        if (previous < 0 && value >= 0) crossings++; previous = value;
      }
      const seconds = audio.stdout.length / 4 / 8000;
      assert.ok(seconds >= 6 && seconds < 6.1);
      assert.ok(Math.sqrt(energy / (audio.stdout.length / 4)) > 0.05);
      assert.ok(Math.abs(crossings / seconds - 440) < 5, "source tone is retained");
      const countWhite = async (timestamp: string) => {
        const frame = await execute("ffmpeg", ["-v", "error", "-ss", timestamp, "-i", join(fixtureDirectory, "burn-in.mp4"), "-frames:v", "1", "-vf", "crop=1280:120:0:600", "-threads:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", timeout: 10000, maxBuffer: 1024 * 1024 });
        let white = 0;
        for (let i = 0; i < frame.stdout.length; i += 3) if (frame.stdout[i] > 180 && frame.stdout[i + 1] > 180 && frame.stdout[i + 2] > 180) white++;
        return white;
      };
      assert.ok(await countWhite("0.8") > 100);
      assert.equal(await countWhite("2.7"), 0);
      assert.ok(await countWhite("4.9") > 100);
      console.log(JSON.stringify({ qaArtifactDirectory: fixtureDirectory, durationMs: output.durationMs, sizeBytes: String(output.sizeBytes), videoCodec: output.videoCodec, audioCodec: output.audioCodec, width: output.width, height: output.height }));
    });
    await t.test("subtitle exports retain current/manual text, exact ASS bytes and approval gaps", async () => {
      const ass = await EXPORT(new Request("http://localhost/export?format=ass&mode=approved"), { params: Promise.resolve({ id: movie.id }) });
      const srt = await EXPORT(new Request("http://localhost/export?format=srt&mode=approved"), { params: Promise.resolve({ id: movie.id }) });
      assert.equal(ass.status, 200); assert.equal(srt.status, 200);
      assert.equal(await ass.text(), Buffer.from(frozen.subtitles.ass.bytesBase64, "base64").toString("utf8"));
      assert.equal(await srt.text(), Buffer.from(frozen.subtitles.srt.bytesBase64, "base64").toString("utf8"));
      assert.equal((await getExportableSubtitle({ movieId: movie.id, mode: "ALL_CURRENT" })).segments.length, 3);
    });
    await t.test("download scopes IDs and GET remains read only", async () => {
      const old = await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } });
      for (const ctx of [context(job.id, "unrelated-project"), context(job.id, projectId, randomUUID()), context(randomUUID())]) assert.equal((await DOWNLOAD(new Request("http://localhost/download"), ctx)).status, 404);
      const response = await download(); await response.arrayBuffer();
      assert.deepEqual(await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } }), old);
    });
    await t.test("publication crash recovers the verified candidate and fences the stale owner", async () => {
      const saved = await prisma.renderOutput.findUniqueOrThrow({ where: { renderJobId: job.id } });
      const publication = { storageKey: saved.storageKey, recipeHash: job.recipeHash, sha256: saved.sha256, sizeBytes: Number(saved.sizeBytes), durationMs: saved.durationMs, width: saved.width, height: saved.height, videoCodec: "h264" as const, audioCodec: "aac" as const };
      // Simulate the exact durable state at file-published / DB-not-completed.
      await prisma.$transaction(async (tx) => {
        await tx.renderOutput.delete({ where: { renderJobId: job.id } });
        await tx.renderJob.update({ where: { id: job.id }, data: { state: "ACTIVE", completedAt: null } });
        await tx.renderDispatch.update({ where: { renderJobId: job.id }, data: { activeToken: "old-owner", activeLeaseUntil: new Date(0), publication } });
      });
      assert.equal(await recoverStaleRenderAttempt(job.id), true);
      assert.equal(await completeRenderAttempt(reference, "old-owner", publication, projectId, sourceKey), false);
      assert.equal(await recordPublication(reference, "old-owner", publication), false);
      assert.equal((await processRenderReference(reference, renderQueueJobId(reference))).disposition, "IGNORED");
      const next = { ...reference, generation: 1 };
      await processRenderReference(next, renderQueueJobId(next));
      assert.equal((await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } })).state, "COMPLETED");
      assert.equal((await prisma.renderOutput.findUniqueOrThrow({ where: { renderJobId: job.id } })).sha256, saved.sha256);
    });
    await t.test("missing and corrupt completed files are controlled, with no false availability", async () => {
      const output = await prisma.renderOutput.findUniqueOrThrow({ where: { renderJobId: job.id } });
      const bytes = await readFile(join(fixtureDirectory, "burn-in.mp4"));
      await localStorage.put(output.storageKey, Readable.from("corrupt"), { replace: true });
      assert.equal((await download()).status, 410);
      await localStorage.delete(output.storageKey); assert.equal((await download()).status, 410);
      await localStorage.put(output.storageKey, Readable.from(bytes));
      const response = await download(); assert.equal(response.status, 200); await response.arrayBuffer();
    });
    const nextJob = async (label: string) => {
      await prisma.translatedSegment.update({ where: { translationId_sequence: { translationId: translation.id, sequence: 2 } }, data: { text: `ကျေးဇူးတင်ပါတယ်။ ${label}` } });
      return createRenderJobSnapshot(input);
    };
    await t.test("missing or checksum-changed sources fail without creating an output", async () => {
      for (const missing of [false, true]) {
        const pending = await nextJob(missing ? "missing" : "changed");
        if (missing) await localStorage.delete(sourceKey);
        else await localStorage.put(sourceKey, Readable.from(Buffer.concat([originalBytes, Buffer.from([0])])), { replace: true });
        const ref = { renderJobId: pending.id, generation: 0 }; await processRenderReference(ref, renderQueueJobId(ref));
        const state = await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id }, include: { output: true } });
        assert.equal(state.state, "FAILED"); assert.equal(state.errorCode, missing ? "SOURCE_MEDIA_MISSING" : "SOURCE_MEDIA_CHANGED"); assert.equal(state.output, null);
        if (!missing) await localStorage.delete(sourceKey);
        await localStorage.put(sourceKey, Readable.from(originalBytes));
      }
    });
    await t.test("queued cancellation, explicit legacy resumption and no completed state without output", async () => {
      const pending = await nextJob("cancel");
      const owner = await claimRenderAttempt({ renderJobId: pending.id, generation: 0 }); assert.equal(owner.disposition, "CLAIMED");
      if (owner.disposition === "CLAIMED") await deferRenderAttempt({ renderJobId: pending.id, generation: 0 }, owner.token);
      await operateRenderJob(projectId, movie.id, pending.id, "retry");
      const resumed = await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id }, include: { dispatch: true } });
      assert.equal(resumed.generation, 1); assert.equal(resumed.dispatch!.deferredAt, null);
      const cancelled = await CANCEL(new Request("http://localhost/cancel", { method: "POST", body: "{}" }), context(pending.id)); assert.equal(cancelled.status, 202);
      assert.equal((await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id } })).state, "CANCELLED");
      await assert.rejects(prisma.renderJob.update({ where: { id: pending.id }, data: { state: "COMPLETED" } }));
      assert.equal((await download(pending.id)).status, 409);
      const waiting = await nextJob("cancel-awaiting-quiescence");
      await withRenderCpuLock(async () => {
        await operateRenderJob(projectId, movie.id, waiting.id, "cancel");
        const pendingCancel = await prisma.renderJob.findUniqueOrThrow({ where: { id: waiting.id } });
        assert.equal(pendingCancel.state, "QUEUED"); assert.ok(pendingCancel.cancelRequestedAt);
        assert.equal((await claimRenderAttempt({ renderJobId: waiting.id, generation: 0 })).disposition, "IGNORED");
      });
      await reconcileRenderDispatch({ renderIds: [waiting.id] }, () => createRenderTransport(prefix));
      assert.equal((await prisma.renderJob.findUniqueOrThrow({ where: { id: waiting.id } })).state, "CANCELLED");
    });
    await t.test("active cancellation and worker shutdown terminate real encoding without publishing", async () => {
      motionSourceKey = createMovieStorageKey(".mp4");
      await execute("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=25:d=12", "-c:v", "libx264", "-preset", "ultrafast", "-threads:v", "2", join(fixtureDirectory, "motion.mp4")], { timeout: 30000, maxBuffer: 65536 });
      await localStorage.put(motionSourceKey, Readable.from(await readFile(join(fixtureDirectory, "motion.mp4"))));
      await prisma.movie.update({ where: { id: movie.id }, data: { storageKey: motionSourceKey } });
      for (const mode of ["cancel", "shutdown", "lease"] as const) {
        const shutdown = mode === "shutdown";
        const pending = await nextJob(mode);
        const ref = { renderJobId: pending.id, generation: 0 };
        const running = processRenderReference(ref, renderQueueJobId(ref));
        const deadline = Date.now() + 15000;
        let encoding = false;
        while (Date.now() < deadline) {
          const state = await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id } });
          if (state.phase === "encoding" && state.progressPercent !== null) { encoding = true; break; }
          if (state.state !== "ACTIVE" && state.state !== "QUEUED") break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal(encoding, true, "The test must interrupt an actual encoding child");
        if (mode === "lease") {
          await prisma.renderDispatch.update({ where: { renderJobId: pending.id }, data: { activeLeaseUntil: new Date(0) } });
          assert.equal(await recoverStaleRenderAttempt(pending.id), true);
        } else if (shutdown) stopActiveRenders();
        else assert.equal((await CANCEL(new Request("http://localhost/cancel", { method: "POST", body: "{}" }), context(pending.id))).status, 202);
        await running;
        const result = await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id }, include: { output: true } });
        assert.equal(result.state, mode === "cancel" ? "CANCELLED" : "QUEUED");
        assert.equal(result.output, null);
        if (mode !== "cancel") { assert.equal(result.generation, 1); await operateRenderJob(projectId, movie.id, pending.id, "cancel"); }
      }
      await prisma.movie.update({ where: { id: movie.id }, data: { storageKey: sourceKey } });
    });
  } finally {
    stopActiveRenders(); if (worker) await worker.close();
    await queue.obliterate({ force: false }); await queue.close();
    const records = await prisma.renderOutput.findMany({ where: { renderJob: { movie: { projectId } } } });
    for (const row of records) outputs.add(row.storageKey);
    for (const key of outputs) await localStorage.delete(key);
    await localStorage.delete(sourceKey);
    if (motionSourceKey) await localStorage.delete(motionSourceKey);
    await prisma.movie.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    try {
      assert.deepEqual(await prisma.project.findMany({ orderBy: { id: "asc" } }), originalProjects);
      assert.deepEqual(await prisma.movie.findMany({ orderBy: { id: "asc" } }), originalMovies);
      assert.equal(await prisma.renderJob.count(), originalRenderCount);
    } finally { await disconnectPrisma(); }
  }
});
