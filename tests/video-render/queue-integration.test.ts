import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { prisma, disconnectPrisma } from "@/lib/prisma";
import { POST, GET } from "@/app/api/projects/[id]/movies/[movieId]/renders/route";
import { GET as GET_ONE } from "@/app/api/projects/[id]/movies/[movieId]/renders/[renderId]/route";
import { BURN_IN_PROFILE } from "@/lib/video-render/contracts";
import { createRenderJobSnapshot } from "@/lib/video-render/service";
import { submitRenderJob } from "@/lib/video-render/api";
import { publishRenderSubmission, reconcileRenderDispatch } from "@/lib/video-render/dispatch";
import { claimRenderAttempt, claimRenderDispatch, deferRenderAttempt, finishRenderDispatch, heartbeatRenderAttempt, recoverStaleRenderAttempt } from "@/lib/video-render/lifecycle";
import { renderQueueJobId } from "@/lib/video-render/job-contract";
import { createRenderQueue, createRenderTransport, type RenderTransport } from "@/lib/queue/render-queue";
import { createRenderWorker, processRenderReference } from "@/workers/render-worker";
import { localStorage } from "@/lib/storage";
import { createMovieStorageKey } from "@/lib/storage";

test("live PostgreSQL/Redis render lifecycle", { skip: process.env.RUN_RENDER_QUEUE_TESTS !== "1" }, async (t) => {
  const projectId = `render-queue-test-${randomUUID()}`;
  const prefix = `render-test-${randomUUID()}`;
  const originalProjects = await prisma.project.findMany({ orderBy: { id: "asc" } });
  const originalMovies = await prisma.movie.findMany({ orderBy: { id: "asc" } });
  const beforeJobs = await prisma.renderJob.count();
  const beforeOutputs = await prisma.renderOutput.count();
  const queue = createRenderQueue(prefix);
  const productionQueue = createRenderQueue(); // Only temporary IDs are ever removed here.
  const renderIds: string[] = [];
  let worker: ReturnType<typeof createRenderWorker> | undefined;
  let copiedSourceKey: string | undefined;
  try {
    await queue.waitUntilReady(); await queue.setGlobalConcurrency(1);
    const source = originalMovies.find((movie) => movie.id === "77721d20-f7a2-41af-8fb0-832207072432" && movie.storageKey) ?? originalMovies.find((movie) => movie.storageKey);
    assert.ok(source?.storageKey, "Real uploaded source required for this opt-in integration test");
    await prisma.project.create({ data: { id: projectId, slug: projectId, name: "Temporary render queue tests" } });
    const movie = await prisma.movie.create({ data: { projectId, title: "Temporary render queue source reference", storageKey: source.storageKey } });
    const transcript = await prisma.transcript.create({ data: { movieId: movie.id, provider: "fixture", model: "fixture", text: "你好", segments: { create: { sequence: 0, startMs: 0, endMs: 800, text: "你好" } } } });
    const translation = await prisma.translation.create({ data: { movieId: movie.id, sourceTranscriptId: transcript.id, sourceLanguage: "zh", targetLanguage: "my", provider: "fixture", model: "fixture", segments: { create: { sequence: 0, startMs: 0, endMs: 800, text: "မင်္ဂလာပါ", origin: "MODEL", reviewStatus: "APPROVED" } } } });
    const body = { mode: "BURN_IN", exportMode: "ALL_CURRENT", profileId: BURN_IN_PROFILE.id };
    const foundationRequest = { projectId, movieId: movie.id, mode: "BURN_IN", scope: "ALL_CURRENT", profileId: BURN_IN_PROFILE.id };
    const context = { params: Promise.resolve({ id: projectId, movieId: movie.id }) };
    const request = () => new Request("http://localhost/api/renders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const nextRecipe = async (label: string) => {
      await prisma.translatedSegment.update({ where: { translationId_sequence: { translationId: translation.id, sequence: 0 } }, data: { text: `မင်္ဂလာပါ ${label}` } });
      const job = await createRenderJobSnapshot(foundationRequest);
      renderIds.push(job.id);
      return job;
    };
    const due = async (id: string) => prisma.renderDispatch.update({ where: { renderJobId: id }, data: { nextDispatchAt: new Date(0) } });
    const factory = () => createRenderTransport(prefix);
    let firstId = "";

    await t.test("concurrent explicit POST is idempotent and returns safe durable metadata", async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => POST(request(), context)));
      const payloads = await Promise.all(results.map((response) => response.json()));
      results.forEach((response) => assert.equal(response.status, 202));
      firstId = payloads[0].data.id; renderIds.push(firstId);
      assert.ok(payloads.every((payload) => payload.data.id === firstId));
      assert.equal(await prisma.renderJob.count({ where: { movieId: movie.id } }), 1);
      assert.equal(await prisma.renderDispatch.count({ where: { renderJobId: firstId } }), 1);
      const saved = await productionQueue.getJob(renderQueueJobId({ renderJobId: firstId, generation: 0 }));
      assert.deepEqual(saved?.data, { renderJobId: firstId, generation: 0 });
      const serialized = JSON.stringify(payloads);
      for (const forbidden of ["storageKey", "snapshot", "activeToken", "dispatchToken", "bytesBase64", "DATABASE_URL", "OPENROUTER_API_KEY"]) assert.ok(!serialized.includes(forbidden));
    });
    await t.test("GET routes are scoped and read only, including malformed and missing identities", async () => {
      const before = await prisma.renderDispatch.findUniqueOrThrow({ where: { renderJobId: firstId } });
      const count = await prisma.renderJob.count();
      const queueCounts = await productionQueue.getJobCounts();
      assert.equal((await GET(new Request("http://localhost/api/renders"), context)).status, 200);
      const detail = { params: Promise.resolve({ id: projectId, movieId: movie.id, renderId: firstId }) };
      assert.equal((await GET_ONE(new Request("http://localhost/api/renders"), detail)).status, 200);
      for (const params of [{ id: "wrong-project", movieId: movie.id, renderId: firstId }, { id: projectId, movieId: "wrong-movie", renderId: firstId }, { id: projectId, movieId: movie.id, renderId: randomUUID() }]) assert.equal((await GET_ONE(new Request("http://localhost/api/renders"), { params: Promise.resolve(params) })).status, 404);
      assert.equal((await GET_ONE(new Request("http://localhost/api/renders"), { params: Promise.resolve({ id: projectId, movieId: movie.id, renderId: "bad/id" }) })).status, 400);
      const malformed = new Request("http://localhost/api/renders", { method: "POST", body: JSON.stringify({ ...body, sourcePath: "/private" }) });
      assert.equal((await POST(malformed, context)).status, 400);
      const wrongProject = await POST(request(), { params: Promise.resolve({ id: "wrong-project", movieId: movie.id }) });
      assert.equal(wrongProject.status, 404);
      assert.equal(await prisma.renderJob.count(), count);
      assert.deepEqual(await prisma.renderDispatch.findUniqueOrThrow({ where: { renderJobId: firstId } }), before);
      assert.deepEqual(await productionQueue.getJobCounts(), queueCounts);
    });
    await t.test("actual subtitle/source identity changes produce distinct recipes", async () => {
      const changed = await nextRecipe("changed-subtitle");
      assert.notEqual(changed.id, firstId);
      // Copy, never encode or alter the existing media. A different real stored
      // source identity must invalidate the recipe even with identical bytes.
      const extension = source.storageKey!.split(".").pop() as "mp4" | "mov" | "mkv" | "webm";
      copiedSourceKey = createMovieStorageKey(`.${extension}`);
      await localStorage.put(copiedSourceKey, await localStorage.open(source.storageKey!));
      await prisma.movie.update({ where: { id: movie.id }, data: { storageKey: copiedSourceKey } });
      const changedSource = await createRenderJobSnapshot(foundationRequest); renderIds.push(changedSource.id);
      assert.notEqual(changedSource.recipeHash, changed.recipeHash);
      await prisma.movie.update({ where: { id: movie.id }, data: { storageKey: source.storageKey } });
    });
    await t.test("database commit survives Redis failure and a fresh reconciler publishes after restart", async () => {
      const pending = await nextRecipe("redis-failure");
      const failure: RenderTransport = { publish: async (reference) => {
        assert.ok(await prisma.renderJob.findUnique({ where: { id: reference.renderJobId } }));
        assert.ok(await prisma.renderDispatch.findUnique({ where: { renderJobId: reference.renderJobId } }));
        throw new Error("Injected Redis outage");
      }, close: async () => {} };
      const accepted = await submitRenderJob(projectId, movie.id, body, (id) => publishRenderSubmission(id, () => failure));
      assert.equal(accepted.id, pending.id); assert.equal(accepted.state, "QUEUED");
      const intent = await prisma.renderDispatch.findUniqueOrThrow({ where: { renderJobId: pending.id } });
      assert.equal(intent.dispatchedAt, null); assert.equal(intent.dispatchFailures, 1);
      assert.ok(intent.nextDispatchAt > new Date());
      await due(pending.id);
      await reconcileRenderDispatch({ renderIds: [pending.id] }, factory);
      assert.ok(await queue.getJob(renderQueueJobId({ renderJobId: pending.id, generation: 0 })));
      assert.ok((await prisma.renderDispatch.findUniqueOrThrow({ where: { renderJobId: pending.id } })).dispatchedAt);
    });
    await t.test("duplicate publication and missing Redis receipt reconcile safely", async () => {
      const job = await nextRecipe("missing-receipt");
      const reference = { renderJobId: job.id, generation: 0 };
      await Promise.all([publishRenderSubmission(job.id, factory), publishRenderSubmission(job.id, factory)]);
      const queued = await queue.getJob(renderQueueJobId(reference)); assert.ok(queued);
      await queued.remove();
      await due(job.id); await reconcileRenderDispatch({ renderIds: [job.id] }, factory);
      assert.ok(await queue.getJob(renderQueueJobId(reference)));
      await due(job.id); await reconcileRenderDispatch({ renderIds: [job.id] }, factory);
      assert.equal((await queue.getJobs(["wait"])).filter((item) => item.id === renderQueueJobId(reference)).length, 1);
    });
    await t.test("stale dispatch acknowledgement cannot overwrite a new lease", async () => {
      const job = await nextRecipe("dispatch-lease");
      const stale = await claimRenderDispatch(job.id); assert.ok(stale);
      await prisma.renderDispatch.update({ where: { renderJobId: job.id }, data: { dispatchLeaseUntil: new Date(0) } });
      const fresh = await claimRenderDispatch(job.id); assert.ok(fresh);
      assert.equal(await finishRenderDispatch(stale.reference, stale.token, "PUBLISHED"), false);
      assert.equal((await prisma.renderDispatch.findUniqueOrThrow({ where: { renderJobId: job.id } })).dispatchToken, fresh.token);
      assert.equal(await finishRenderDispatch(fresh.reference, fresh.token, "PUBLISHED"), true);
    });
    await t.test("worker ownership races have one winner; heartbeat and deferral require the owner", async () => {
      const job = await nextRecipe("ownership");
      const reference = { renderJobId: job.id, generation: 0 };
      const claims = await Promise.all([claimRenderAttempt(reference), claimRenderAttempt(reference)]);
      const owner = claims.find((claim) => claim.disposition === "CLAIMED"); assert.ok(owner?.disposition === "CLAIMED");
      assert.equal(claims.filter((claim) => claim.disposition === "CLAIMED").length, 1);
      assert.equal(await heartbeatRenderAttempt(reference, "wrong-token"), false);
      assert.equal(await deferRenderAttempt(reference, "wrong-token"), false);
      assert.equal(await heartbeatRenderAttempt(reference, owner.token), true);
      assert.equal(await deferRenderAttempt(reference, owner.token), true);
      await due(job.id); await reconcileRenderDispatch({ renderIds: [job.id] }, factory);
      assert.equal(await queue.getJob(renderQueueJobId(reference)), undefined);
      const response = await GET_ONE(new Request("http://localhost/api/renders"), { params: Promise.resolve({ id: projectId, movieId: movie.id, renderId: job.id }) });
      assert.equal((await response.json()).data.execution, "DEFERRED");
    });
    await t.test("stale active attempts are generation-fenced; stale worker messages are ignored", async () => {
      const job = await nextRecipe("stale-active");
      const oldReference = { renderJobId: job.id, generation: 0 };
      const owner = await claimRenderAttempt(oldReference); assert.ok(owner.disposition === "CLAIMED");
      await prisma.renderDispatch.update({ where: { renderJobId: job.id }, data: { activeLeaseUntil: new Date(0) } });
      assert.equal(await recoverStaleRenderAttempt(job.id), true);
      assert.equal(await deferRenderAttempt(oldReference, owner.token), false);
      assert.equal(await heartbeatRenderAttempt(oldReference, owner.token), false);
      assert.equal((await processRenderReference(oldReference, renderQueueJobId(oldReference))).disposition, "IGNORED");
      await reconcileRenderDispatch({ renderIds: [job.id] }, factory);
      assert.ok(await queue.getJob(renderQueueJobId({ renderJobId: job.id, generation: 1 })));
      assert.equal((await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } })).generation, 1);
    });
    await t.test("FAILED and CANCELLED retained recipes are never restarted by POST", async () => {
      for (const state of ["FAILED", "CANCELLED"] as const) {
        const job = await nextRecipe(`terminal-${state}`);
        await prisma.renderJob.update({ where: { id: job.id }, data: { state } });
        const response = await POST(request(), context);
        assert.equal(response.status, 202);
        const metadata = (await response.json()).data;
        assert.equal(metadata.id, job.id); assert.equal(metadata.state, state); assert.equal(metadata.generation, 0);
        await due(job.id); await reconcileRenderDispatch({ renderIds: [job.id] }, factory);
        assert.equal(await queue.getJob(renderQueueJobId({ renderJobId: job.id, generation: 0 })), undefined);
      }
    });
    await t.test("expired attempt recovery is bounded across generations", async () => {
      const job = await nextRecipe("bounded-attempts");
      for (let generation = 0; generation < 3; generation++) {
        assert.equal((await claimRenderAttempt({ renderJobId: job.id, generation })).disposition, "CLAIMED");
        await prisma.renderDispatch.update({ where: { renderJobId: job.id }, data: { activeLeaseUntil: new Date(0) } });
        await recoverStaleRenderAttempt(job.id);
      }
      const failed = await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(failed.state, "FAILED"); assert.equal(failed.attempts, 3); assert.equal(failed.errorCode, "RENDER_FAILED");
      await reconcileRenderDispatch({ renderIds: [job.id] }, factory);
      assert.equal(await queue.getJob(renderQueueJobId({ renderJobId: job.id, generation: failed.generation })), undefined);
    });
    await t.test("terminal transport receipts cannot become video completion or endless republication", async () => {
      const job = await nextRecipe("terminal-transport");
      const terminal: RenderTransport = { publish: async () => "TERMINAL", close: async () => {} };
      await publishRenderSubmission(job.id, () => terminal);
      assert.equal((await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } })).state, "FAILED");
      await due(job.id); await reconcileRenderDispatch({ renderIds: [job.id] }, factory);
      assert.equal(await queue.getJob(renderQueueJobId({ renderJobId: job.id, generation: 0 })), undefined);
    });
    await t.test("DB completion guard and immutable snapshot trigger remain enforced", async () => {
      const job = await nextRecipe("completion-guard");
      await assert.rejects(prisma.renderJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } }));
      await assert.rejects(prisma.renderJob.update({ where: { id: job.id }, data: { snapshot: { modified: true } } }));
      const saved = await prisma.renderJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(saved.state, "QUEUED"); assert.deepEqual(saved.snapshot, job.snapshot);
      assert.equal(await prisma.renderOutput.count({ where: { renderJob: { movieId: movie.id } } }), 0);
    });
    await t.test("actual BullMQ worker leaves legacy deferred jobs paused; concurrency is one and shutdown drains", async () => {
      assert.equal(await queue.getGlobalConcurrency(), 1);
      // This regression fixture references existing media and MUST NOT encode it.
      // Model legacy Phase B deferral explicitly before starting the real worker.
      const pending = await prisma.renderJob.findMany({ where: { movieId: movie.id, state: "QUEUED", dispatch: { deferredAt: null } } });
      for (const job of pending) {
        const reference = { renderJobId: job.id, generation: job.generation };
        const owner = await claimRenderAttempt(reference);
        if (owner.disposition === "CLAIMED") await deferRenderAttempt(reference, owner.token);
      }
      worker = createRenderWorker(prefix);
      worker.on("error", () => {});
      await worker.waitUntilReady();
      assert.equal(worker.concurrency, 1);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const states = await queue.getJobCounts("waiting", "active", "delayed");
        if (!states.waiting && !states.active && !states.delayed) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const states = await queue.getJobCounts("waiting", "active", "delayed");
      assert.equal(states.waiting + states.active + states.delayed, 0);
      await worker.close(); worker = undefined;
      const deferred = await prisma.renderDispatch.count({ where: { renderJob: { movieId: movie.id }, deferredAt: { not: null } } });
      assert.ok(deferred > 1);
      assert.equal(await prisma.renderJob.count({ where: { movieId: movie.id, state: "COMPLETED" } }), 0);
      const count = await queue.count();
      const deferredIds = await prisma.renderDispatch.findMany({ where: { renderJob: { movieId: movie.id }, deferredAt: { not: null } }, select: { renderJobId: true } });
      await reconcileRenderDispatch({ renderIds: deferredIds.map((item) => item.renderJobId) }, factory);
      assert.equal(await queue.count(), count);
    });
  } finally {
    if (worker) await worker.close();
    // Clean only this test's queue namespace and render identities.
    for (const job of await queue.getJobs(["wait", "active", "delayed", "failed", "completed"])) await job.remove();
    await queue.obliterate(); // Unique random test prefix; never the production queue.
    for (const job of await prisma.renderJob.findMany({ where: { movie: { projectId } }, select: { id: true, generation: true } })) {
      for (let generation = 0; generation <= job.generation; generation++) {
        const queued = await productionQueue.getJob(renderQueueJobId({ renderJobId: job.id, generation }));
        if (queued) await queued.remove();
      }
    }
    await Promise.all([queue.close(), productionQueue.close()]);
    if (copiedSourceKey) await localStorage.delete(copiedSourceKey);
    await prisma.movie.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    try {
      assert.deepEqual(await prisma.project.findMany({ orderBy: { id: "asc" } }), originalProjects);
      assert.deepEqual(await prisma.movie.findMany({ orderBy: { id: "asc" } }), originalMovies);
      assert.equal(await prisma.renderJob.count(), beforeJobs);
      assert.equal(await prisma.renderOutput.count(), beforeOutputs);
    } finally { await disconnectPrisma(); }
  }
});
