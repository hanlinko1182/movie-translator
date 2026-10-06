import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";

import { UnrecoverableError, Worker } from "bullmq";

import { redisConnection } from "@/lib/queue/connection";
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

export async function main() {
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

  await workerLifecycle(worker, "translation");
}
