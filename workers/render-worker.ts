import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import { createRenderQueue } from "@/lib/queue/render-queue";
import { log } from "@/lib/logger";
import { workerLifecycle } from "@/lib/worker-runtime";
import { RenderError } from "@/lib/video-render/contracts";
import { RENDER_FAILURE_CODES, type RenderFailureCode } from "@/lib/video-render/contracts";
import { RECONCILE_INTERVAL_MS, RENDER_JOB_NAME, RENDER_QUEUE_NAME, parseRenderReference, renderQueueJobId, type RenderJobReference, type RenderTransportReceipt } from "@/lib/video-render/job-contract";
import { attemptControl, claimRenderAttempt, failRenderAttempt, heartbeatRenderAttempt } from "@/lib/video-render/lifecycle";
import { reconcileRenderDispatch } from "@/lib/video-render/dispatch";
import { executeRenderAttempt } from "@/lib/video-render/execution";
import { cleanOldAttempts, createAttemptDirectory, MAX_RUNTIME_MS } from "@/lib/video-render/files";
import { prepareMyanmarFont } from "@/lib/video-render/fonts";
import { rm } from "node:fs/promises";
import { cleanupRenderStorage, cleanupTerminalPublication } from "@/lib/video-render/cleanup";

const active = new Set<AbortController>();
export function stopActiveRenders() { for (const controller of active) controller.abort(); }

export async function processRenderReference(value: unknown, queueJobId: string | undefined): Promise<RenderTransportReceipt> {
  const reference = parseRenderReference(value);
  if (queueJobId !== renderQueueJobId(reference)) throw new RenderError("INVALID_RENDER_REQUEST");
  const claim = await claimRenderAttempt(reference);
  if (claim.disposition === "IGNORED") return { disposition: "IGNORED" };
  if (claim.disposition === "BUSY") throw new Error("RENDER_ATTEMPT_BUSY");
  const controller = new AbortController(); active.add(controller);
  let heartbeat = Promise.resolve(true);
  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    heartbeat = attemptControl(reference, claim.token).then(async (control) => {
      if (!control.owned || control.cancel) { controller.abort(); return false; }
      return heartbeatRenderAttempt(reference, claim.token);
    }).then((owned) => { if (!owned) controller.abort(); return owned; }).catch(() => { controller.abort(); return false; }).finally(() => { inFlight = false; });
  }, 5000);
  timer.unref();
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, MAX_RUNTIME_MS);
  try {
    await executeRenderAttempt(reference, claim.token, controller);
  } catch (error) {
    const code: RenderFailureCode = timedOut ? "RENDER_TIMEOUT" : error instanceof RenderError && (RENDER_FAILURE_CODES as readonly string[]).includes(error.code) ? error.code as RenderFailureCode : error instanceof RenderError ? "SOURCE_MEDIA_CHANGED" : "STORAGE_UNAVAILABLE";
    await failRenderAttempt(reference, claim.token, code, ["STORAGE_UNAVAILABLE", "RENDER_RESOURCE_LIMIT"].includes(code) || controller.signal.aborted && !timedOut);
    await cleanupTerminalPublication(reference.renderJobId);
    log("warn", "render_attempt_stopped", { jobId: reference.renderJobId, errorCode: code });
  } finally { clearInterval(timer); clearTimeout(deadline); await heartbeat; active.delete(controller); }
  return { disposition: "PROCESSED" };
}

export function createRenderWorker(prefix?: string) {
  return new Worker<RenderJobReference, RenderTransportReceipt, typeof RENDER_JOB_NAME>(RENDER_QUEUE_NAME, async (job) => {
    try {
      if (job.name !== RENDER_JOB_NAME) throw new RenderError("INVALID_RENDER_REQUEST");
      return await processRenderReference(job.data, job.id);
    } catch (error) {
      if (error instanceof RenderError) throw new UnrecoverableError("RENDER_JOB_INVALID");
      throw new Error(error instanceof Error && error.message === "RENDER_ATTEMPT_BUSY" ? "RENDER_ATTEMPT_BUSY" : "RENDER_WORKER_UNAVAILABLE");
    }
  }, { connection: redisConnection("worker"), ...(prefix ? { prefix } : {}), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000, lockDuration: 60_000 });
}

export async function main() {
  // Shared launcher has checked PostgreSQL and bounded Redis readiness already.
  // Check migration availability and establish the queue-wide limit BEFORE consuming.
  await prisma.renderDispatch.findFirst({ select: { renderJobId: true } });
  if (process.platform !== "linux") throw new RenderError("RENDER_RESOURCE_LIMIT");
  const preflight = await createAttemptDirectory();
  try { await prepareMyanmarFont(preflight, "မြန်မာစာ", new AbortController().signal); }
  finally { await rm(preflight, { recursive: true, force: true }); }
  await cleanOldAttempts();
  const queue = createRenderQueue();
  try { await queue.waitUntilReady(); await queue.setGlobalConcurrency(1); }
  finally { await queue.close(); }
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();
  const stop = () => { stopped = true; if (timer) clearTimeout(timer); stopActiveRenders(); };
  const cycle = () => {
    if (stopped) return;
    current = reconcileRenderDispatch().then(() => cleanupRenderStorage()).catch(() => log("warn", "render_reconciliation_unavailable")).finally(() => {
      if (!stopped) { timer = setTimeout(cycle, RECONCILE_INTERVAL_MS); timer.unref(); }
    });
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stop);
  const worker = createRenderWorker();
  cycle();
  await workerLifecycle(worker, "render", async () => { stop(); await current; }, stop);
}
