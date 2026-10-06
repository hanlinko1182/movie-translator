import { log } from "@/lib/logger";
import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";

import { UnrecoverableError, Worker } from "bullmq";
import { mediaFailureCode, permanentMediaFailure, processMovieMedia, recordMediaFailure } from "@/lib/media-processing";
import type { MediaProcessingResult } from "@/lib/media-processing";
import { redisConnection } from "@/lib/queue/connection";
import { MEDIA_JOB_NAME, MEDIA_QUEUE_NAME } from "@/lib/queue/types";
import type { MediaJobData } from "@/lib/queue/types";

export async function main() {
  const worker = new Worker<MediaJobData, MediaProcessingResult, typeof MEDIA_JOB_NAME>(
    MEDIA_QUEUE_NAME,
    async (job) => {
      if (job.name !== MEDIA_JOB_NAME || typeof job.data?.movieId !== "string" || !job.data.movieId) {
        throw new UnrecoverableError("INVALID_MEDIA_JOB");
      }
      try {
        return await processMovieMedia(job.data.movieId);
      } catch (error) {
        const permanent = permanentMediaFailure(error);
        const terminal = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        await recordMediaFailure(job.data.movieId, terminal).catch(() => {
          log("error", "media_worker_diagnostic");
        });
        if (permanent) throw new UnrecoverableError(mediaFailureCode(error));
        throw new Error(mediaFailureCode(error));
      }
    },
    { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 },
  );

  const pendingEvents = new Set<Promise<void>>();
  worker.on("failed", (job) => {
    if (!job) return;
    // Covers terminal stalled failures that happen before the processor runs.
    const event = job.getState().then(async (state) => {
      if (state === "failed") await recordMediaFailure(job.data.movieId, true);
    }).catch(() => log("error", "workers_media_worker_diagnostic"));
    pendingEvents.add(event);
    void event.finally(() => pendingEvents.delete(event));
  });
  await workerLifecycle(worker, "media", async () => { await Promise.allSettled([...pendingEvents]); });
}
