import { log } from "@/lib/logger";
import "server-only";

import { Queue } from "bullmq";
import { MovieStatus } from "@/generated/prisma/client";
import type { MediaProcessingResult } from "@/lib/media-processing";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import { MEDIA_JOB_NAME, MEDIA_QUEUE_NAME, mediaJobId } from "@/lib/queue/types";
import type { MediaJobData } from "@/lib/queue/types";

export class MediaQueueError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "MediaQueueError";
  }
}

export function createMediaQueue() {
  const queue = new Queue<MediaJobData, MediaProcessingResult, typeof MEDIA_JOB_NAME>(MEDIA_QUEUE_NAME, {
    connection: redisConnection("producer"),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    },
  });
  queue.on("error", () => log("error", "queue_media_queue_diagnostic"));
  return queue;
}

export async function enqueueMovieMedia(movieId: string) {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true, storageKey: true } });
  if (!movie) throw new MediaQueueError("MOVIE_NOT_FOUND", "Movie not found", 404);
  if (!movie.storageKey) throw new MediaQueueError("MOVIE_STORAGE_REQUIRED", "The movie has no stored source file", 409);

  const queue = createMediaQueue();
  const jobId = mediaJobId(movieId);
  let publishing = false;
  try {
    await queue.waitUntilReady();
    return await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${movieId} FOR UPDATE`;
      const current = await transaction.movie.findUnique({ where: { id: movieId } });
      if (!current) throw new MediaQueueError("MOVIE_NOT_FOUND", "Movie not found", 404);
      if (!current.storageKey) throw new MediaQueueError("MOVIE_STORAGE_REQUIRED", "The movie has no stored source file", 409);

      const existing = await queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "failed") {
          throw new MediaQueueError("MEDIA_JOB_FAILED", "The previous media job failed; resolve the cause and remove that job before resubmitting", 409);
        }
        return { movieId, jobId, status: current.status, state };
      }
      await transaction.movie.update({
        where: { id: movieId },
        data: { status: MovieStatus.QUEUED, processingProgress: 0 },
      });
      publishing = true;
      await queue.add(MEDIA_JOB_NAME, { movieId }, { jobId });
      return { movieId, jobId, status: MovieStatus.QUEUED, state: "waiting" };
    }, { timeout: 10_000 });
  } catch (error) {
    // Redis errors roll back QUEUED. A PostgreSQL commit failure attempts to
    // remove the published job. Workers wait on the lock and reject an
    // unqueued movie if publication survived a rolled-back transaction.
    if (publishing) {
      await queue.getJob(jobId).then((job) => job?.remove()).catch(() => {
        log("error", "media_queue_diagnostic");
      });
    }
    throw error;
  } finally {
    await queue.close().catch(() => log("error", "queue_media_queue_diagnostic"));
  }
}

export async function getMovieMediaJob(movieId: string) {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } });
  if (!movie) throw new MediaQueueError("MOVIE_NOT_FOUND", "Movie not found", 404);
  const queue = createMediaQueue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(mediaJobId(movieId));
    return job ? { jobId: job.id, state: await job.getState(), attemptsMade: job.attemptsMade } : null;
  } finally {
    await queue.close().catch(() => log("error", "queue_media_queue_diagnostic"));
  }
}
