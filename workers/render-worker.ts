import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import { createRenderQueue } from "@/lib/queue/render-queue";
import { log } from "@/lib/logger";
import { workerLifecycle } from "@/lib/worker-runtime";
import { RenderError } from "@/lib/video-render/contracts";
import { RECONCILE_INTERVAL_MS, RENDER_JOB_NAME, RENDER_QUEUE_NAME, parseRenderReference, renderQueueJobId, type RenderJobReference, type RenderTransportReceipt } from "@/lib/video-render/job-contract";
import { claimRenderAttempt, deferRenderAttempt, heartbeatRenderAttempt } from "@/lib/video-render/lifecycle";
import { reconcileRenderDispatch } from "@/lib/video-render/dispatch";

export async function processRenderReference(value: unknown, queueJobId: string | undefined): Promise<RenderTransportReceipt> {
  const reference = parseRenderReference(value);
  if (queueJobId !== renderQueueJobId(reference)) throw new RenderError("INVALID_RENDER_REQUEST");
  const claim = await claimRenderAttempt(reference);
  if (claim.disposition === "IGNORED") return { disposition: "IGNORED" };
  if (claim.disposition === "BUSY") throw new Error("RENDER_ATTEMPT_BUSY");
  let heartbeat = Promise.resolve(true);
  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    heartbeat = heartbeatRenderAttempt(reference, claim.token).catch(() => false).finally(() => { inFlight = false; });
  }, 15_000);
  timer.unref();
  try {
    // Phase 21.2B deliberately has no encoder or output-publication path.
    if (!await deferRenderAttempt(reference, claim.token)) return { disposition: "IGNORED" };
    log("info", "render_execution_deferred", { jobId: reference.renderJobId, errorCode: "RENDER_EXECUTION_UNAVAILABLE" });
    return { disposition: "DEFERRED" };
  } finally { clearInterval(timer); await heartbeat; }
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
  const queue = createRenderQueue();
  try { await queue.waitUntilReady(); await queue.setGlobalConcurrency(1); }
  finally { await queue.close(); }
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();
  const stop = () => { stopped = true; if (timer) clearTimeout(timer); };
  const cycle = () => {
    if (stopped) return;
    current = reconcileRenderDispatch().catch(() => log("warn", "render_reconciliation_unavailable")).finally(() => {
      if (!stopped) { timer = setTimeout(cycle, RECONCILE_INTERVAL_MS); timer.unref(); }
    });
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stop);
  const worker = createRenderWorker();
  cycle();
  await workerLifecycle(worker, "render", async () => { stop(); await current; });
}
