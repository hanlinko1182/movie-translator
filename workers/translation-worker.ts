import "dotenv/config";
import "server-only";

import { UnrecoverableError, Worker } from "bullmq";

import { prisma } from "@/lib/prisma";
import { redisConnection, RedisConfigurationError } from "@/lib/queue/connection";
import {
  TRANSLATION_JOB_NAME,
  TRANSLATION_QUEUE_NAME,
  type TranslationJobData,
} from "@/lib/queue/types";
import {
  persistTranslationResult,
  type PersistedTranslationSummary,
} from "@/lib/translation/persist-translation";
import { translateMovieTranscript } from "@/lib/translation/translate-movie";
import { TranslationError, type TranslationErrorCode } from "@/lib/translation/types";

const permanentFailureCodes = new Set<TranslationErrorCode>([
  "MOVIE_NOT_FOUND",
  "TRANSCRIPT_NOT_FOUND",
  "TRANSCRIPT_EMPTY",
  "TRANSLATION_NOT_CONFIGURED",
  "TRANSLATION_SOURCE_INVALID",
  "TRANSLATION_SOURCE_CHANGED",
  "TRANSLATION_PROVIDER_REJECTED",
  "TRANSLATION_INVALID_RESPONSE",
]);

async function main() {
  const worker = new Worker<
    TranslationJobData,
    PersistedTranslationSummary,
    typeof TRANSLATION_JOB_NAME
  >(
    TRANSLATION_QUEUE_NAME,
    async (job) => {
      if (
        job.name !== TRANSLATION_JOB_NAME ||
        typeof job.data?.movieId !== "string" ||
        !job.data.movieId
      ) throw new UnrecoverableError("INVALID_TRANSLATION_JOB");

      try {
        const { source, result } = await translateMovieTranscript(job.data.movieId);
        return await persistTranslationResult(
          source.movieId,
          source.sourceTranscriptId,
          source.segments,
          result,
        );
      } catch (error) {
        const code = error instanceof TranslationError ? error.code : "TRANSLATION_PROCESSING_FAILED";
        if (error instanceof TranslationError && permanentFailureCodes.has(error.code)) {
          throw new UnrecoverableError(code);
        }
        throw new Error(code);
      }
    },
    {
      connection: redisConnection("worker"),
      concurrency: 1,
      maxStalledCount: 1,
      stalledInterval: 30_000,
    },
  );

  worker.on("active", (job) => console.info("Translation job active:", job.id));
  worker.on("completed", (job) => console.info("Translation job completed:", job.id));
  worker.on("failed", (job) => {
    if (job) console.error("Translation job failed:", job.id, "attempts:", job.attemptsMade);
  });
  worker.on("stalled", (jobId) => console.warn("Translation job stalled; recovery scheduled:", jobId));
  worker.on("error", () => console.error("Translation worker connection/lifecycle error; check Redis connectivity."));

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    console.info("Translation worker shutting down after active jobs finish.");
    await worker.close();
    await prisma.$disconnect();
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void close().catch(() => {
        console.error("Translation worker shutdown failed.");
        process.exitCode = 1;
      });
    });
  }

  await worker.waitUntilReady();
  console.info("Translation worker ready:", TRANSLATION_QUEUE_NAME);
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof RedisConfigurationError
      ? error.message
      : "Translation worker failed to start.",
  );
  process.exitCode = 1;
});
