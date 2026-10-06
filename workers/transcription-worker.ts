import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";

import { UnrecoverableError, Worker } from "bullmq";

import { redisConnection } from "@/lib/queue/connection";
import {
  TRANSCRIPTION_JOB_NAME,
  TRANSCRIPTION_QUEUE_NAME,
  type TranscriptionJobData,
} from "@/lib/queue/types";
import { transcribeMovieAudio } from "@/lib/transcription/transcribe-movie";
import {
  persistTranscriptionResult,
  type PersistedTranscriptionSummary,
} from "@/lib/transcription/persist-transcript";
import {
  TranscriptionError,
  type TranscriptionErrorCode,
} from "@/lib/transcription/types";

const permanentFailureCodes = new Set<TranscriptionErrorCode>([
  "MOVIE_NOT_FOUND",
  "TRANSCRIPTION_NOT_CONFIGURED",
  "TRANSCRIPTION_MODEL_UNSUPPORTED",
  "TRANSCRIPTION_AUDIO_MISSING",
  "TRANSCRIPTION_AUDIO_INVALID",
  "TRANSCRIPTION_FILE_TOO_LARGE",
  "TRANSCRIPTION_TIMESTAMP_UNAVAILABLE",
  "TRANSCRIPTION_DEVELOPMENT_LIMIT",
  "TRANSCRIPTION_RESPONSE_TOO_LARGE",
]);

export async function main() {
  const worker = new Worker<
    TranscriptionJobData,
    PersistedTranscriptionSummary,
    typeof TRANSCRIPTION_JOB_NAME
  >(
    TRANSCRIPTION_QUEUE_NAME,
    async (job) => {
      if (
        job.name !== TRANSCRIPTION_JOB_NAME ||
        typeof job.data?.movieId !== "string" ||
        !job.data.movieId
      ) {
        throw new UnrecoverableError("INVALID_TRANSCRIPTION_JOB");
      }

      try {
        const result = await transcribeMovieAudio(job.data.movieId);
        return await persistTranscriptionResult(job.data.movieId, result);
      } catch (error) {
        const code = transcriptionFailureCode(error);
        if (permanentTranscriptionFailure(error)) {
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

  await workerLifecycle(worker, "transcription");
}

function permanentTranscriptionFailure(error: unknown) {
  return error instanceof TranscriptionError && permanentFailureCodes.has(error.code);
}

function transcriptionFailureCode(error: unknown) {
  return error instanceof TranscriptionError
    ? error.code
    : "TRANSCRIPTION_PROCESSING_FAILED";
}
