import { log } from "@/lib/logger";
import "server-only";

import { Queue } from "bullmq";

import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import {
  TRANSCRIPTION_JOB_NAME,
  TRANSCRIPTION_QUEUE_NAME,
  transcriptionJobId,
  type TranscriptionJobData,
} from "@/lib/queue/types";
import { assertMovieTranscriptionReady } from "@/lib/transcription/transcribe-movie";
import type { PersistedTranscriptionSummary } from "@/lib/transcription/persist-transcript";
import { TranscriptionError } from "@/lib/transcription/types";

export function createTranscriptionQueue() {
  const queue = new Queue<
    TranscriptionJobData,
    PersistedTranscriptionSummary,
    typeof TRANSCRIPTION_JOB_NAME
  >(TRANSCRIPTION_QUEUE_NAME, {
    connection: redisConnection("producer"),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    },
  });
  queue.on("error", () => log("error", "queue_transcription_queue_diagnostic"));
  return queue;
}

export async function enqueueMovieTranscription(movieId: string) {
  await assertMovieTranscriptionReady(movieId);

  const queue = createTranscriptionQueue();
  const jobId = transcriptionJobId(movieId);
  try {
    await queue.waitUntilReady();
    const existing = await queue.getJob(jobId);
    if (existing) {
      return {
        movieId,
        jobId,
        state: await existing.getState(),
      };
    }

    // BullMQ adds custom job IDs atomically, so concurrent producers converge
    // on this one retained job without requiring a second paid request.
    const job = await queue.add(TRANSCRIPTION_JOB_NAME, { movieId }, { jobId });
    return { movieId, jobId, state: await job.getState() };
  } finally {
    await queue.close().catch(() => {
      log("error", "transcription_queue_diagnostic");
    });
  }
}

export async function getMovieTranscriptionJob(movieId: string) {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: { id: true },
  });
  if (!movie) {
    throw new TranscriptionError("MOVIE_NOT_FOUND");
  }

  const queue = createTranscriptionQueue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(transcriptionJobId(movieId));
    if (!job) return null;

    const state = await job.getState();
    return {
      jobId: job.id,
      state,
      attemptsMade: job.attemptsMade,
      ...(state === "completed" && typeof job.returnvalue?.transcriptId === "string"
        ? { result: {
          movieId: job.returnvalue.movieId,
          transcriptId: job.returnvalue.transcriptId,
          provider: job.returnvalue.provider,
          model: job.returnvalue.model,
          segmentCount: job.returnvalue.segmentCount,
          durationMs: job.returnvalue.durationMs,
        } }
        : {}),
    };
  } finally {
    await queue.close().catch(() => {
      log("error", "transcription_queue_diagnostic");
    });
  }
}
