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
import { SOFT_SUBTITLE_PROFILE, BURN_IN_PROFILE } from "@/lib/video-render/contracts";
import { createRenderJobSnapshot } from "@/lib/video-render/service";
import { createRenderQueue, createRenderTransport } from "@/lib/queue/render-queue";
import { createRenderWorker, processRenderReference } from "@/workers/render-worker";
import { renderQueueJobId } from "@/lib/video-render/job-contract";
import { claimRenderAttempt, completeRenderAttempt, deferRenderAttempt, operateRenderJob, recoverStaleRenderAttempt, type Publication } from "@/lib/video-render/lifecycle";
import { POST, GET } from "@/app/api/projects/[id]/movies/[movieId]/renders/route";
import { GET as DOWNLOAD } from "@/app/api/projects/[id]/movies/[movieId]/renders/[renderId]/download/route";
import { sha256 } from "@/lib/video-render/snapshot";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { executeRenderAttempt } from "@/lib/video-render/execution";
import { reconcileRenderDispatch } from "@/lib/video-render/dispatch";
import { Prisma } from "@/generated/prisma/client";

const execute = promisify(execFile);
test("soft MP4 real API/queue/lifecycle/recovery/download with temporary synthetic records", { skip: process.env.RUN_SOFT_RENDER_TESTS !== "1" }, async (t) => {
  const projectId = `soft-test-${randomUUID()}`, prefix = `soft-test-${randomUUID()}`;
  const directory = await mkdtemp("/tmp/movie-translator-soft-lifecycle-qa-");
  const sourceKey = createMovieStorageKey(".mp4");
  const queue = createRenderQueue(prefix), productionQueue = createRenderQueue();
  const keys = new Set([sourceKey]);
  const original = { projects: await prisma.project.findMany({ orderBy: { id: "asc" } }), movies: await prisma.movie.findMany({ orderBy: { id: "asc" } }), jobs: await prisma.renderJob.findMany({ orderBy: { id: "asc" } }), outputs: await prisma.renderOutput.findMany({ orderBy: { id: "asc" } }) };
  try {
    await localStorage.initialize();
    await execute("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=s=320x240:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6", "-c:v", "libx264", "-threads:v", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-threads:a", "1", join(directory, "source.mp4")], { timeout: 30000 });
    const sourceBytes = await readFile(join(directory, "source.mp4"));
    await localStorage.put(sourceKey, Readable.from(sourceBytes));
    await prisma.project.create({ data: { id: projectId, slug: projectId, name: "Temporary soft subtitle lifecycle QA" } });
    const movie = await prisma.movie.create({ data: { projectId, title: "Older six-second soft sample", storageKey: sourceKey } });
    await prisma.movie.create({ data: { projectId, title: "Newer unselected movie" } });
    const times = [[200, 1500], [2200, 3500], [4500, 5800]];
    const segments = times.map(([startMs, endMs], sequence) => ({ startMs, endMs, sequence, text: ["你好", "再见", "谢谢"][sequence] }));
    const transcript = await prisma.transcript.create({ data: { movieId: movie.id, provider: "fixture", model: "fixture", text: "你好 再见 谢谢", segments: { create: segments } } });
    const translation = await prisma.translation.create({ data: { movieId: movie.id, sourceTranscriptId: transcript.id, sourceLanguage: "zh", targetLanguage: "my", provider: "fixture", model: "fixture", segments: { create: segments.map((s, i) => ({ sequence: i, startMs: s.startMs, endMs: s.endMs,
      text: ["မင်္ဂလာပါ။ <b>literal</b> &amp;", "စစ်ဆေးရန်", "ကျေးဇူးတင်ပါတယ်။ 中文 English"][i], origin: i === 0 ? "MANUAL" : "MODEL", manualSourceHash: i === 0 ? sourceTextHash(s.text) : null, reviewStatus: i === 1 ? "NEEDS_REVIEW" : "APPROVED" })) } } });
    const domain = () => prisma.translation.findUniqueOrThrow({ where: { id: translation.id }, include: { segments: { include: { qcIssues: true }, orderBy: { sequence: "asc" } } } });
    const before = await domain();
    const body = { mode: "SOFT_SUBTITLE", exportMode: "APPROVED_ONLY", profileId: SOFT_SUBTITLE_PROFILE.id };
    const input = { projectId, movieId: movie.id, mode: body.mode, scope: body.exportMode, profileId: body.profileId };
    const context = (id = projectId, movieId = movie.id) => ({ params: Promise.resolve({ id, movieId }) });
    const post = (payload: unknown = body, ctx = context()) => POST(new Request("http://localhost/renders", { method: "POST", body: JSON.stringify(payload) }), ctx);
    let id = "";
    await t.test("explicit concurrent POST deduplicates; wrong scope/profile rejected; GET read-only", async () => {
      const [a, b] = await Promise.all([post(), post()]); assert.equal(a.status, 202); assert.equal(b.status, 202);
      id = (await a.json()).data.id; assert.equal((await b.json()).data.id, id);
      assert.equal((await post({ ...body, profileId: BURN_IN_PROFILE.id })).status, 400);
      assert.equal((await post(body, context("wrong-project"))).status, 404);
      const jobs = await prisma.renderJob.findMany({ where: { movieId: movie.id } });
      const read = await GET(new Request("http://localhost/renders"), context()); assert.equal(read.status, 200);
      assert.equal((await read.json()).data.items[0].movieId, movie.id);
      assert.deepEqual(await prisma.renderJob.findMany({ where: { movieId: movie.id } }), jobs);
      assert.equal(jobs.length, 1);
    });
    await t.test("dedicated BullMQ worker executes frozen soft snapshot, no font renderer needed", async () => {
      await queue.waitUntilReady(); await queue.setGlobalConcurrency(1);
      const ref = { renderJobId: id, generation: 0 }; const transport = createRenderTransport(prefix);
      await transport.publish(ref); await transport.close();
      const worker = createRenderWorker(prefix); worker.on("error", () => {});
      try {
        await worker.waitUntilReady();
        const deadline = Date.now() + 30000;
        let job;
        do { job = await prisma.renderJob.findUniqueOrThrow({ where: { id }, include: { output: true } }); if (["FAILED", "COMPLETED"].includes(job.state)) break; await new Promise((r) => setTimeout(r, 50)); } while (Date.now() < deadline);
        assert.equal(job!.state, "COMPLETED", job!.errorCode ?? "not completed");
        const output = job!.output!; keys.add(output.storageKey);
        assert.equal((output.streamManifest as unknown as { subtitle: { cueCount: number } }).subtitle.cueCount, 2);
        assert.deepEqual(await domain(), before);
        const response = await DOWNLOAD(new Request("http://localhost/download"), { params: Promise.resolve({ id: projectId, movieId: movie.id, renderId: id }) });
        assert.equal(response.status, 200); const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(sha256(bytes), output.sha256);
        await writeFile(join(directory, "soft-subtitles.mp4"), bytes);
      } finally { await worker.close(); }
    });
    await t.test("scoped download is read-only and refuses unrelated IDs", async () => {
      const saved = await prisma.renderJob.findUniqueOrThrow({ where: { id } });
      for (const params of [{ id: "wrong", movieId: movie.id, renderId: id }, { id: projectId, movieId: randomUUID(), renderId: id }, { id: projectId, movieId: movie.id, renderId: randomUUID() }]) assert.equal((await DOWNLOAD(new Request("http://localhost/download"), { params: Promise.resolve(params) })).status, 404);
      assert.deepEqual(await prisma.renderJob.findUniqueOrThrow({ where: { id } }), saved);
    });
    await t.test("published candidate recovery re-verifies soft text; stale owner cannot complete", async () => {
      const saved = await prisma.renderOutput.findUniqueOrThrow({ where: { renderJobId: id } });
      const publication: Publication = { storageKey: saved.storageKey, recipeHash: (await prisma.renderJob.findUniqueOrThrow({ where: { id } })).recipeHash, sha256: saved.sha256, sizeBytes: Number(saved.sizeBytes), durationMs: saved.durationMs, width: saved.width, height: saved.height, videoCodec: "h264", audioCodec: "aac", streamManifest: saved.streamManifest as Publication["streamManifest"] };
      await prisma.$transaction(async (tx) => {
        await tx.renderOutput.delete({ where: { renderJobId: id } });
        await tx.renderJob.update({ where: { id }, data: { state: "ACTIVE", completedAt: null } });
        await tx.renderDispatch.update({ where: { renderJobId: id }, data: { activeToken: "old", activeLeaseUntil: new Date(0), publication } });
      });
      assert.equal(await recoverStaleRenderAttempt(id), true);
      assert.equal(await completeRenderAttempt({ renderJobId: id, generation: 0 }, "old", publication, projectId, sourceKey), false);
      await processRenderReference({ renderJobId: id, generation: 1 }, renderQueueJobId({ renderJobId: id, generation: 1 }));
      assert.equal((await prisma.renderJob.findUniqueOrThrow({ where: { id } })).state, "COMPLETED");
      assert.deepEqual((await prisma.renderOutput.findUniqueOrThrow({ where: { renderJobId: id } })).streamManifest, saved.streamManifest);
    });
    const next = async (label: string) => {
      await prisma.translatedSegment.update({ where: { translationId_sequence: { translationId: translation.id, sequence: 2 } }, data: { text: `ကျေးဇူးတင်ပါတယ်။ ${label}` } });
      return createRenderJobSnapshot(input);
    };
    await t.test("actual subtitle/source changes create new identities, not newer-movie fallback", async () => {
      const changed = await next("Changed"); assert.notEqual(changed.id, id); assert.equal(changed.movieId, movie.id);
      await localStorage.put(sourceKey, Readable.from(Buffer.concat([sourceBytes, Buffer.from([0])])), { replace: true });
      const sourceChanged = await createRenderJobSnapshot(input); assert.notEqual(changed.recipeHash, sourceChanged.recipeHash);
      await localStorage.put(sourceKey, Readable.from(sourceBytes), { replace: true });
    });
    await t.test("completion guard rejects missing/forged subtitle verification receipt", async () => {
      const pending = await next("Guard");
      await assert.rejects(prisma.renderJob.update({ where: { id: pending.id }, data: { state: "COMPLETED" } }));
      const saved = await prisma.renderOutput.findUniqueOrThrow({ where: { renderJobId: id } });
      const { id: _id, renderJobId: _job, ...fields } = saved; void _id; void _job;
      await prisma.renderOutput.create({ data: { ...fields, renderJobId: pending.id, storageKey: `renders/${randomUUID()}.mp4`, streamManifest: Prisma.DbNull } });
      await assert.rejects(prisma.renderJob.update({ where: { id: pending.id }, data: { state: "COMPLETED" } }));
      await prisma.renderOutput.update({ where: { renderJobId: pending.id }, data: { streamManifest: saved.streamManifest! } });
      // Correct metadata for a DIFFERENT subtitle snapshot must still fail.
      await assert.rejects(prisma.renderJob.update({ where: { id: pending.id }, data: { state: "COMPLETED" } }));
      await prisma.renderOutput.delete({ where: { renderJobId: pending.id } });
    });
    await t.test("cancellation during fast publication cannot complete or publish; explicit retry retains snapshot", async () => {
      const pending = await next("Cancel fast"); const ref = { renderJobId: pending.id, generation: 0 };
      const owner = await claimRenderAttempt(ref); assert.equal(owner.disposition, "CLAIMED"); if (owner.disposition !== "CLAIMED") return;
      const publish = localStorage.publishRenderFile.bind(localStorage);
      localStorage.publishRenderFile = async (...args) => {
        // No row lock reentry: set cancellation in the current publishing transaction
        // through abort, simulating the worker's cancellation control at this point.
        controller.abort(); return publish(...args);
      };
      const controller = new AbortController();
      try { await assert.rejects(executeRenderAttempt(ref, owner.token, controller)); }
      finally { localStorage.publishRenderFile = publish; }
      assert.equal(await prisma.renderOutput.count({ where: { renderJobId: pending.id } }), 0);
      await operateRenderJob(projectId, movie.id, pending.id, "cancel");
      const { failRenderAttempt } = await import("@/lib/video-render/lifecycle");
      await failRenderAttempt(ref, owner.token, "RENDER_FAILED", false);
      const cancelled = await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id } }); assert.equal(cancelled.state, "CANCELLED");
      await operateRenderJob(projectId, movie.id, pending.id, "retry");
      const retried = await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id } }); assert.equal(retried.generation, 1); assert.deepEqual(retried.snapshot, pending.snapshot);
      await operateRenderJob(projectId, movie.id, pending.id, "cancel");
    });
    await t.test("legacy deferred jobs never automatically resume", async () => {
      const pending = await next("Deferred"); const ref = { renderJobId: pending.id, generation: 0 }; const owner = await claimRenderAttempt(ref);
      assert.equal(owner.disposition, "CLAIMED"); if (owner.disposition === "CLAIMED") await deferRenderAttempt(ref, owner.token);
      await reconcileRenderDispatch({ renderIds: [pending.id] }, () => createRenderTransport(prefix));
      assert.equal((await processRenderReference(ref, renderQueueJobId(ref))).disposition, "IGNORED");
      const deferred = await prisma.renderJob.findUniqueOrThrow({ where: { id: pending.id }, include: { dispatch: true } }); assert.ok(deferred.dispatch!.deferredAt); assert.equal(deferred.state, "QUEUED");
    });
    console.log(JSON.stringify({ softLifecycleQaDirectory: directory, guiPlayerVerified: false }));
  } finally {
    await queue.obliterate({ force: false }); await queue.close();
    const jobs = await prisma.renderJob.findMany({ where: { movie: { projectId } }, include: { output: true, dispatch: true } });
    for (const job of jobs) {
      for (let generation = 0; generation <= job.generation; generation++) await (await productionQueue.getJob(renderQueueJobId({ renderJobId: job.id, generation })))?.remove();
      if (job.output) keys.add(job.output.storageKey);
      const publication = job.dispatch?.publication as { storageKey?: string } | null; if (publication?.storageKey) keys.add(publication.storageKey);
    }
    await productionQueue.close();
    for (const key of keys) await localStorage.delete(key);
    await prisma.movie.deleteMany({ where: { projectId } }); await prisma.project.deleteMany({ where: { id: projectId } });
    try {
      assert.deepEqual(await prisma.project.findMany({ orderBy: { id: "asc" } }), original.projects);
      assert.deepEqual(await prisma.movie.findMany({ orderBy: { id: "asc" } }), original.movies);
      assert.deepEqual(await prisma.renderJob.findMany({ orderBy: { id: "asc" } }), original.jobs);
      assert.deepEqual(await prisma.renderOutput.findMany({ orderBy: { id: "asc" } }), original.outputs);
    } finally { await disconnectPrisma(); }
  }
});
