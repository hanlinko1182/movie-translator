import { MovieStatus } from "@/generated/prisma/client";
import {
  extractMovieAudio,
  inspectMovie,
  MediaProcessingError,
  resolveMovieSource,
} from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { isPrismaError, jsonError } from "@/lib/project-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  if (process.env.NODE_ENV === "production") {
    return jsonError("MEDIA_PROCESSING_DISABLED", "Manual media processing is available only in development", 403);
  }

  const { id } = await context.params;
  let processingVersion: Date | undefined;
  let previousStatus: MovieStatus | undefined;

  try {
    const movie = await prisma.movie.findUnique({
      where: { id },
      select: { id: true, storageKey: true, status: true, updatedAt: true },
    });
    if (!movie) return jsonError("MOVIE_NOT_FOUND", "Movie not found", 404);
    if (!movie.storageKey) {
      return jsonError("MOVIE_STORAGE_REQUIRED", "The movie has no stored source file", 409);
    }
    if (movie.status === MovieStatus.PROCESSING) {
      return jsonError("MOVIE_ALREADY_PROCESSING", "The movie is already processing", 409);
    }

    const source = await resolveMovieSource(movie.storageKey);
    previousStatus = movie.status;
    // Optimistic claim prevents simultaneous requests from processing a movie.
    const claimed = await prisma.movie.update({
      where: { id, updatedAt: movie.updatedAt, status: movie.status },
      data: { status: MovieStatus.PROCESSING },
      select: { updatedAt: true },
    });
    processingVersion = claimed.updatedAt;

    const metadata = await inspectMovie(source);

    // Movie.durationSeconds is Int; retain exact probe duration in the response.
    const durationSeconds = Math.round(metadata.durationSeconds);
    const inspected = await prisma.movie.update({
      where: { id, status: MovieStatus.PROCESSING, updatedAt: processingVersion },
      data: { durationSeconds },
      select: { updatedAt: true },
    });
    processingVersion = inspected.updatedAt;

    if (!metadata.hasAudio) throw new MediaProcessingError("AUDIO_STREAM_NOT_FOUND");
    const audio = await extractMovieAudio(source, movie.id);
    await prisma.movie.update({
      where: { id, status: MovieStatus.PROCESSING, updatedAt: processingVersion },
      data: { status: previousStatus },
    });
    processingVersion = undefined;

    // Preprocessing does not complete transcription/translation. Restore the
    // original pipeline status and leave processingProgress untouched.
    return Response.json({ data: { movieId: id, durationSeconds, audio, metadata } });
  } catch (error) {
    if (processingVersion && previousStatus) {
      await prisma.movie.updateMany({
        where: { id, status: MovieStatus.PROCESSING, updatedAt: processingVersion },
        data: { status: previousStatus },
      }).catch(() => {
        console.error("Movie status could not be restored after media processing.");
      });
    }

    if (error instanceof MediaProcessingError) {
      return jsonError(error.code, error.message, error.status);
    }
    if (isPrismaError(error, "P2025")) {
      return jsonError("MOVIE_CHANGED", "The movie changed during processing; refresh before retrying", 409);
    }
    return jsonError("MEDIA_PROCESSING_FAILED", "Unable to process movie media", 500);
  }
}
