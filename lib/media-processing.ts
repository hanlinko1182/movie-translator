import "server-only";

import { MovieStatus } from "@/generated/prisma/client";
import { extractMovieAudio, inspectMovie, MediaProcessingError, resolveMovieSource } from "@/lib/media";
import type { MediaInspection } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export class MovieProcessingError extends Error {
  constructor(readonly code: "MOVIE_NOT_FOUND" | "MOVIE_STORAGE_REQUIRED" | "MOVIE_NOT_QUEUED") {
    super(code);
    this.name = "MovieProcessingError";
  }
}

export type MediaProcessingResult = {
  movieId: string;
  durationSeconds: number;
  audio: { storageKey: string };
  metadata: MediaInspection;
};

export async function processMovieMedia(movieId: string): Promise<MediaProcessingResult> {
  // Enqueue holds this same lock while publishing. Workers read only committed
  // QUEUED state. PROCESSING is also accepted for stalled-job recovery.
  const movie = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${movieId} FOR UPDATE`;
    const current = await transaction.movie.findUnique({ where: { id: movieId } });
    if (!current) throw new MovieProcessingError("MOVIE_NOT_FOUND");
    if (!current.storageKey) throw new MovieProcessingError("MOVIE_STORAGE_REQUIRED");
    if (current.status !== MovieStatus.QUEUED && current.status !== MovieStatus.PROCESSING) {
      throw new MovieProcessingError("MOVIE_NOT_QUEUED");
    }
    return transaction.movie.update({
      where: { id: movieId },
      data: { status: MovieStatus.PROCESSING, processingProgress: 0 },
    });
  });

  const source = await resolveMovieSource(movie.storageKey!);
  const metadata = await inspectMovie(source);
  const durationSeconds = Math.round(metadata.durationSeconds);
  const inspected = await prisma.movie.update({
    where: { id: movieId, status: MovieStatus.PROCESSING, updatedAt: movie.updatedAt },
    data: { durationSeconds },
    select: { updatedAt: true },
  });
  if (!metadata.hasAudio) throw new MediaProcessingError("AUDIO_STREAM_NOT_FOUND");
  const audio = await extractMovieAudio(source, movieId);
  await prisma.movie.update({
    where: { id: movieId, status: MovieStatus.PROCESSING, updatedAt: inspected.updatedAt },
    // Audio preprocessing is not a completed subtitle pipeline.
    data: { status: MovieStatus.UPLOADED, processingProgress: 0 },
  });
  return { movieId, durationSeconds, audio, metadata };
}

export function permanentMediaFailure(error: unknown) {
  return error instanceof MovieProcessingError || (
    error instanceof MediaProcessingError && [
      "MOVIE_FILE_MISSING", "INVALID_STORAGE_KEY", "AUDIO_STREAM_NOT_FOUND",
    ].includes(error.code)
  );
}

export function mediaFailureCode(error: unknown) {
  return error instanceof MovieProcessingError || error instanceof MediaProcessingError
    ? error.code : "MEDIA_PROCESSING_FAILED";
}

export async function recordMediaFailure(movieId: string, terminal: boolean) {
  await prisma.movie.updateMany({
    where: { id: movieId, status: { in: [MovieStatus.QUEUED, MovieStatus.PROCESSING] } },
    data: { status: terminal ? MovieStatus.FAILED : MovieStatus.QUEUED, processingProgress: 0 },
  });
}
