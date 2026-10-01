import "dotenv/config";
import "server-only";

import { UnrecoverableError, Worker } from "bullmq";
import { mediaFailureCode, permanentMediaFailure, processMovieMedia, recordMediaFailure } from "@/lib/media-processing";
import type { MediaProcessingResult } from "@/lib/media-processing";
import { prisma } from "@/lib/prisma";
import { redisConnection, RedisConfigurationError } from "@/lib/queue/connection";
import { MEDIA_JOB_NAME, MEDIA_QUEUE_NAME } from "@/lib/queue/types";
import type { MediaJobData } from "@/lib/queue/types";

async function main() {
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
          console.error("Media failure status could not be recorded.");
        });
        if (permanent) throw new UnrecoverableError(mediaFailureCode(error));
        throw new Error(mediaFailureCode(error));
      }
    },
    { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 },
  );

  const pendingEvents = new Set<Promise<void>>();
  worker.on("active", (job) => console.info("Media job active:", job.id));
  worker.on("completed", (job) => console.info("Media job completed:", job.id));
  worker.on("failed", (job) => {
    if (!job) return;
    console.error("Media job failed:", job.id, "attempts:", job.attemptsMade);
    // Covers terminal stalled failures that happen before the processor runs.
    const event = job.getState().then(async (state) => {
      if (state === "failed") await recordMediaFailure(job.data.movieId, true);
    }).catch(() => console.error("Terminal media job status could not be recorded."));
    pendingEvents.add(event);
    void event.finally(() => pendingEvents.delete(event));
  });
  worker.on("stalled", (jobId) => console.warn("Media job stalled; recovery scheduled:", jobId));
  worker.on("error", () => console.error("Media worker connection/lifecycle error; check Redis connectivity."));

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    console.info("Media worker shutting down after active jobs finish.");
    await worker.close();
    await Promise.allSettled([...pendingEvents]);
    await prisma.$disconnect();
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void close().catch(() => { console.error("Media worker shutdown failed."); process.exitCode = 1; });
    });
  }
  await worker.waitUntilReady();
  console.info("Media worker ready:", MEDIA_QUEUE_NAME);
}

void main().catch((error: unknown) => {
  console.error(error instanceof RedisConfigurationError ? error.message : "Media worker failed to start.");
  process.exitCode = 1;
});
