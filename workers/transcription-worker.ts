import "dotenv/config";
import "server-only";

import { UnrecoverableError, Worker } from "bullmq";

import { prisma } from "@/lib/prisma";
import { redisConnection, RedisConfigurationError } from "@/lib/queue/connection";
import {
  TRANSCRIPTION_JOB_NAME,
  TRANSCRIPTION_QUEUE_NAME,
  type TranscriptionJobData,
} from "@/lib/queue/types";
import { transcribeMovieAudio } from "@/lib/transcription/transcribe-movie";
import {
  TranscriptionError,
  type TranscriptionErrorCode,
  type TranscriptionResult,
} from "@/lib/transcription/types";

const MAX_JOB_RESULT_BYTES = 10_000_000;
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

async function main() {
  const worker = new Worker<
    TranscriptionJobData,
    TranscriptionResult,
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
        if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_JOB_RESULT_BYTES) {
          throw new TranscriptionError("TRANSCRIPTION_RESPONSE_TOO_LARGE");
        }
        return result;
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

  worker.on("active", (job) => console.info("Transcription job active:", job.id));
  worker.on("completed", (job) => console.info("Transcription job completed:", job.id));
  worker.on("failed", (job) => {
    if (!job) return;
    console.error("Transcription job failed:", job.id, "attempts:", job.attemptsMade);
  });
  worker.on("stalled", (jobId) => {
    console.warn("Transcription job stalled; recovery scheduled:", jobId);
  });
  worker.on("error", () => {
    console.error("Transcription worker connection/lifecycle error; check Redis connectivity.");
  });

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    console.info("Transcription worker shutting down after active jobs finish.");
    await worker.close();
    await prisma.$disconnect();
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void close().catch(() => {
        console.error("Transcription worker shutdown failed.");
        process.exitCode = 1;
      });
    });
  }

  await worker.waitUntilReady();
  console.info("Transcription worker ready:", TRANSCRIPTION_QUEUE_NAME);
}

function permanentTranscriptionFailure(error: unknown) {
  return error instanceof TranscriptionError && permanentFailureCodes.has(error.code);
}

function transcriptionFailureCode(error: unknown) {
  return error instanceof TranscriptionError
    ? error.code
    : "TRANSCRIPTION_PROCESSING_FAILED";
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof RedisConfigurationError
      ? error.message
      : "Transcription worker failed to start.",
  );
  process.exitCode = 1;
});
