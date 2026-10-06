import { log } from "@/lib/logger";
import "server-only";
import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "./connection";
import { loadRecapSource } from "@/lib/recap/source";
import { getRecapProvider } from "@/lib/recap";
import { RecapError, type RecapReceipt } from "@/lib/recap/types";

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
export async function getRecapJob(movieId: string, requestedId?: string | null) {
  if (!await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } })) throw new RecapError("MOVIE_NOT_FOUND");
  let jobId = requestedId;
  if (jobId) {
    const prefix = `recap-${encodeURIComponent(movieId)}-`;
    if (!jobId.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(jobId.slice(prefix.length))) throw new RecapError("RECAP_JOB_INVALID");
  } else jobId = recapJobId(movieId, (await loadRecapSource(movieId)).sourceHash);
  const queue = createRecapQueue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    const receipt = job.returnvalue;
    return { jobId: job.id!, state, attemptsMade: job.attemptsMade,
      ...(state === "completed" && receipt ? { result: { movieId: receipt.movieId, recapId: receipt.recapId, sectionCount: receipt.sectionCount, characterInsightCount: receipt.characterInsightCount, relationshipInsightCount: receipt.relationshipInsightCount, provider: receipt.provider, model: receipt.model, runtimeMs: receipt.runtimeMs, modelCalls: receipt.modelCalls, strategy: receipt.strategy, usage: receipt.usage } } : {}),
      ...(state === "failed" ? { error: "Recap generation failed. Inspect worker configuration and source data." } : {}),
    };
  } finally { await queue.close().catch(() => log("error", "queue_recap_queue_diagnostic")); }
}
export type RecapJobStatus = Awaited<ReturnType<typeof getRecapJob>>;
