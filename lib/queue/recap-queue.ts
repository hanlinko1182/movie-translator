import { log } from "@/lib/logger";
import "server-only";
import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "./connection";
import { loadRecapSource } from "@/lib/recap/source";
import { getRecapProvider } from "@/lib/recap";
import { RecapError, type RecapReceipt } from "@/lib/recap/types";
import { parseRecapRetry, recapFailureToken, validRecapJobId } from "@/lib/recap/recovery";
import { retryRecapAtomically } from "./recap-recovery";

export const RECAP_QUEUE_NAME = "movie-recap";
export const RECAP_JOB_NAME = "generate-recap";
export type RecapJobData = { movieId: string; sourceHash: string };
export function recapJobId(movieId: string, sourceHash: string) { return `recap-${encodeURIComponent(movieId)}-${sourceHash}`; }
export function createRecapQueue() {
  const queue = new Queue<RecapJobData, RecapReceipt, typeof RECAP_JOB_NAME>(RECAP_QUEUE_NAME, { connection: redisConnection("producer"), defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } } });
  queue.on("error", () => log("error", "queue_recap_queue_diagnostic"));
  return queue;
}
export async function enqueueRecap(movieId: string) {
  const source = await loadRecapSource(movieId);
  getRecapProvider(); // Validate configuration without contacting the provider.
  const queue = createRecapQueue();
  const jobId = recapJobId(movieId, source.sourceHash);
  try {
    await queue.waitUntilReady();
    const existing = await queue.getJob(jobId);
    if (existing && await existing.getState() === "failed") throw new RecapError("RECAP_JOB_FAILED");
    const job = existing ?? await queue.add(RECAP_JOB_NAME, { movieId, sourceHash: source.sourceHash }, { jobId });
    return { movieId, jobId, state: await job.getState() };
  } finally { await queue.close().catch(() => log("error", "queue_recap_queue_diagnostic")); }
}
const recoveryDependencies = { source: loadRecapSource, provider: getRecapProvider, queue: createRecapQueue, retry: retryRecapAtomically };
export async function retryRecap(movieId: string, body: unknown, deps = recoveryDependencies) {
  const request = parseRecapRetry(body, movieId);
  const source = await deps.source(movieId);
  if (request.jobId !== recapJobId(movieId, source.sourceHash)) throw new RecapError("RECAP_SOURCE_CHANGED");
  deps.provider(); // Configuration only; never calls the provider.
  const queue = deps.queue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(request.jobId);
    if (!job || job.name !== RECAP_JOB_NAME || job.data.movieId !== movieId || job.data.sourceHash !== source.sourceHash) throw new RecapError("RECAP_RETRY_UNSUPPORTED");
    const result = await deps.retry(queue, request.jobId, request.failureToken);
    if (result === -4) throw new RecapError("RECAP_RETRY_STALE");
    if (result !== 0 && result !== 1) throw new RecapError("RECAP_RETRY_UNSUPPORTED");
    const current = await queue.getJob(request.jobId);
    const state = await current?.getState();
    if (!current || !state || state === "unknown") throw new RecapError("RECAP_RETRY_UNSUPPORTED");
    // A duplicate request may reuse waiting/active/completed, but must not retry
    // a new failure that occurred after the acknowledged attempt.
    if (result === 0 && state === "failed") throw new RecapError("RECAP_RETRY_STALE");
    return { movieId, jobId: request.jobId, state };
  } finally { await queue.close().catch(() => log("error", "queue_recap_queue_diagnostic")); }
}
export async function getRecapJob(movieId: string, requestedId?: string | null) {
  if (!await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } })) throw new RecapError("MOVIE_NOT_FOUND");
  let jobId = requestedId;
  if (jobId) {
    if (!validRecapJobId(movieId, jobId)) throw new RecapError("RECAP_JOB_INVALID");
  } else jobId = recapJobId(movieId, (await loadRecapSource(movieId)).sourceHash);
  const queue = createRecapQueue();
  try {
    await queue.waitUntilReady();
    let job = await queue.getJob(jobId);
    if (!job) return null;
    let state = await job.getState();
    // A worker may finish between getJob and getState. Read terminal metadata
    // again so the newly failed attempt is recoverable without a page reload.
    if (state === "failed" || state === "completed") {
      job = await queue.getJob(jobId);
      if (!job) return null;
      state = await job.getState();
    }
    const receipt = job.returnvalue;
    return { jobId: job.id!, state, attemptsMade: job.attemptsMade,
      ...(state === "completed" && receipt ? { result: { movieId: receipt.movieId, recapId: receipt.recapId, sectionCount: receipt.sectionCount, characterInsightCount: receipt.characterInsightCount, relationshipInsightCount: receipt.relationshipInsightCount, provider: receipt.provider, model: receipt.model, runtimeMs: receipt.runtimeMs, modelCalls: receipt.modelCalls, strategy: receipt.strategy, usage: receipt.usage } } : {}),
      ...(state === "failed" ? {
        error: "Recap generation failed. Review the failure before explicitly retrying; OpenRouter usage may incur a cost.",
        errorCode: safeFailureCode(job.failedReason),
        failureToken: recapFailureToken(job),
      } : {}),
    };
  } finally { await queue.close().catch(() => log("error", "queue_recap_queue_diagnostic")); }
}
export type RecapJobStatus = Awaited<ReturnType<typeof getRecapJob>>;
function safeFailureCode(reason: string) {
  const codes = ["RECAP_INVALID_RESPONSE", "RECAP_PROVIDER_ERROR", "RECAP_PROVIDER_REJECTED", "RECAP_NOT_CONFIGURED", "RECAP_SOURCE_CHANGED", "RECAP_SOURCE_INVALID", "RECAP_JOB_INVALID", "RECAP_PROCESSING_FAILED", "MOVIE_NOT_FOUND", "TRANSCRIPT_NOT_FOUND", "TRANSCRIPT_EMPTY", "SCENES_REQUIRED"];
  return codes.includes(reason) ? reason : "RECAP_PROCESSING_FAILED";
}
