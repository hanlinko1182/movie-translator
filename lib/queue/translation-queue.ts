import { log } from "@/lib/logger";
import "server-only";

import { Queue } from "bullmq";

import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import {
  TRANSLATION_JOB_NAME,
  TRANSLATION_QUEUE_NAME,
  translationJobId,
  type TranslationJobData,
} from "@/lib/queue/types";
import type { PersistedTranslationSummary } from "@/lib/translation/persist-translation";
import { assertMovieTranslationReady } from "@/lib/translation/translate-movie";
import { TranslationError } from "@/lib/translation/types";

export function createTranslationQueue() {
  const queue = new Queue<
    TranslationJobData,
    PersistedTranslationSummary,
    typeof TRANSLATION_JOB_NAME
  >(TRANSLATION_QUEUE_NAME, {
    connection: redisConnection("producer"),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    },
  });
  queue.on("error", () => log("error", "queue_translation_queue_diagnostic"));
  return queue;
}

export async function enqueueMovieTranslation(movieId: string) {
  await assertMovieTranslationReady(movieId);

  const queue = createTranslationQueue();
  const jobId = translationJobId(movieId);
  try {
    await queue.waitUntilReady();
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "failed") throw new TranslationError("TRANSLATION_JOB_FAILED");
      return { movieId, jobId, state };
    }

    // A custom ID makes concurrent submissions converge on one retained job.
    const job = await queue.add(TRANSLATION_JOB_NAME, { movieId }, { jobId });
    return { movieId, jobId, state: await job.getState() };
  } finally {
    await queue.close().catch(() => log("error", "queue_translation_queue_diagnostic"));
  }
}

export async function getMovieTranslationJob(movieId: string) {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } });
  if (!movie) throw new TranslationError("MOVIE_NOT_FOUND");

  const queue = createTranslationQueue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(translationJobId(movieId));
    if (!job) return null;
    const state = await job.getState();
    return {
      jobId: job.id,
      state,
      attemptsMade: job.attemptsMade,
      ...(state === "completed" && typeof job.returnvalue?.translationId === "string"
        ? { result: {
          movieId: job.returnvalue.movieId,
          translationId: job.returnvalue.translationId,
          sourceTranscriptId: job.returnvalue.sourceTranscriptId,
          provider: job.returnvalue.provider,
          model: job.returnvalue.model,
          segmentCount: job.returnvalue.segmentCount,
          runtimeMs: job.returnvalue.runtimeMs,
          usage: job.returnvalue.usage,
          translationMemoryHits: job.returnvalue.translationMemoryHits,
          modelTranslatedSegments: job.returnvalue.modelTranslatedSegments,
          modelCalls: job.returnvalue.modelCalls,
        } }
        : {}),
    };
  } finally {
    await queue.close().catch(() => log("error", "queue_translation_queue_diagnostic"));
  }
}
