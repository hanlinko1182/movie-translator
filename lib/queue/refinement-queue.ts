import "server-only";
import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import { getRefinementTranslationProvider } from "@/lib/translation";
import { TranslationError } from "@/lib/translation/types";
import { loadTranslationSnapshot } from "@/lib/translation-qc/service";
import type { RefinementReceipt } from "@/lib/translation-qc/types";
import { normalizeRefinementSequences, validateRefinementSelection, refinementJobId, refinementSnapshotHash, type RefinementJobData } from "@/lib/translation-refinement/service";

export const REFINEMENT_QUEUE_NAME = "translation-refinement";
export const REFINEMENT_JOB_NAME = "refine-translation";
export function createRefinementQueue() {
  const queue = new Queue<RefinementJobData, RefinementReceipt, typeof REFINEMENT_JOB_NAME>(REFINEMENT_QUEUE_NAME, {
    connection: redisConnection("producer"),
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: { count: 1_000 }, removeOnFail: { count: 1_000 } },
  });
  queue.on("error", () => console.error("Refinement queue Redis connection failed."));
  return queue;
}
export async function enqueueTranslationRefinement(movieId: string, value: unknown) {
  const sequences = normalizeRefinementSequences(value);
  const snapshot = await loadTranslationSnapshot(movieId);
  validateRefinementSelection(snapshot, sequences);
  const jobId = refinementJobId(snapshot, sequences);
  const queue = createRefinementQueue();
  try {
    await queue.waitUntilReady();
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "failed") throw new TranslationError("REFINEMENT_JOB_FAILED");
      return { movieId, jobId, state };
    }
    getRefinementTranslationProvider(); // Validate configuration, without sending a request.
    const data: RefinementJobData = { movieId, sequences, translationId: snapshot.translation.id, revision: snapshot.translation.revision, snapshotHash: refinementSnapshotHash(snapshot, sequences) };
    const job = await queue.add(REFINEMENT_JOB_NAME, data, { jobId });
    return { movieId, jobId, state: await job.getState() };
  } finally { await queue.close().catch(() => console.error("Refinement queue could not close.")); }
}
export async function getTranslationRefinementJob(movieId: string, jobId: string) {
  if (!await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } })) throw new TranslationError("MOVIE_NOT_FOUND");
  if (!/^translation-refinement-[^:]+-[a-f0-9]{64}$/u.test(jobId) || jobId.length > 300) throw new TranslationError("REFINEMENT_SEQUENCES_INVALID");
  const queue = createRefinementQueue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(jobId);
    if (!job || job.data.movieId !== movieId) return null;
    const state = await job.getState();
    const receipt = job.returnvalue;
    return { jobId: job.id, state, attemptsMade: job.attemptsMade, ...(state === "completed" && receipt ? { result: {
      movieId: receipt.movieId, translationId: receipt.translationId, sequences: receipt.sequences,
      segmentCount: receipt.segmentCount, model: receipt.model, runtimeMs: receipt.runtimeMs,
      modelCalls: receipt.modelCalls, alreadyApplied: receipt.alreadyApplied,
      ...(receipt.usage ? { usage: { inputTokens: receipt.usage.inputTokens, outputTokens: receipt.usage.outputTokens, totalTokens: receipt.usage.totalTokens, costUsd: receipt.usage.costUsd } } : {}),
    } } : {}) };
  } finally { await queue.close().catch(() => console.error("Refinement queue could not close.")); }
}
