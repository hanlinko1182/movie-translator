import "server-only";
import type { Worker } from "bullmq";
import { disconnectPrisma } from "./prisma";
import { log } from "./logger";
import { numericConfig } from "./env";

export async function workerLifecycle<Data, Result, Name extends string>(worker: Worker<Data, Result, Name>, role: string, afterDrain: () => Promise<void> = async () => {}, beforeDrain: () => void = () => {}) {
  let closing = false;
  async function close(fatal: boolean) {
    if (fatal) process.exitCode = 1;
    if (closing) return;
    closing = true;
    beforeDrain();
    log("info", "worker_draining", { worker: role });
    const timeout = numericConfig("WORKER_SHUTDOWN_TIMEOUT_MS", 120000, 1000, 21600000);
    const deadline = setTimeout(() => {
      log("error", "worker_shutdown_timeout", { worker: role });
      // Supervisor must terminate the process group/container, including media children.
      process.exit(1);
    }, timeout);
    deadline.unref();
    try { await worker.close(); await afterDrain(); }
    catch { process.exitCode = 1; log("error", "worker_shutdown_failed", { worker: role }); }
    finally { await disconnectPrisma().catch(() => { process.exitCode = 1; }); clearTimeout(deadline); }
  }
  worker.on("active", (job) => log("info", "job_active", { worker: role, jobId: job.id, attempt: job.attemptsMade + 1 }));
  worker.on("completed", (job, result) => {
    const receipt = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const usage = receipt.usage && typeof receipt.usage === "object" ? receipt.usage as Record<string, unknown> : {};
    const metadata: Record<string, number> = {};
    for (const name of ["runtimeMs", "modelCalls"]) if (typeof receipt[name] === "number") metadata[name] = receipt[name];
    for (const name of ["inputTokens", "outputTokens", "totalTokens", "costUsd"]) if (typeof usage[name] === "number") metadata[name] = usage[name];
    log("info", "job_completed", { worker: role, jobId: job.id, attempt: job.attemptsMade, ...(typeof receipt.model === "string" ? { model: receipt.model } : {}), ...metadata });
  });
  worker.on("failed", (job, error) => log("error", "job_failed", { worker: role, jobId: job?.id, attempt: job?.attemptsMade, errorCode: /^[A-Z][A-Z0-9_]{0,100}$/.test(error.message) ? error.message : "JOB_FAILED" }));
  worker.on("stalled", (jobId) => log("warn", "job_stalled", { worker: role, jobId }));
  // BullMQ processor failures are handled above. Worker-level errors indicate lifecycle failure.
  worker.on("error", () => { log("error", "worker_runtime_failed", { worker: role }); void close(true); });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void close(false); });
  try { await worker.waitUntilReady(); log("info", "worker_ready", { worker: role }); }
  catch { await close(true); throw new Error("WORKER_STARTUP_FAILED"); }
}
