import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isMovieStatus,
  isNonNegativeInteger,
  isProgress,
  movieResource,
  movieSelect,
  nullableString,
} from "@/lib/movie-api";
import {
  hasOnlyKeys,
  isPrismaError,
  jsonError,
  nonEmptyString,
  readJsonObject,
} from "@/lib/project-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateFields = [
  "title",
  "originalTitle",
  "filename",
  "storageKey",
  "durationSeconds",
  "fileSizeBytes",
  "sourceLanguage",
  "status",
  "processingProgress",
] as const;

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const movie = await prisma.movie.findUnique({
      where: { id },
      select: movieSelect,
    });

    if (!movie) {
      return jsonError("MOVIE_NOT_FOUND", "Movie not found", 404);
    }

    return Response.json({ data: movieResource(movie) });
  } catch {
    return jsonError("MOVIE_FETCH_FAILED", "Unable to fetch movie", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await readJsonObject(request);

  if (!body || !hasOnlyKeys(body, updateFields)) {
    return jsonError("INVALID_MOVIE", "Invalid movie request body", 400);
  }

  const data: Prisma.MovieUpdateInput = {};

  if (Object.hasOwn(body, "title")) {
    const title = nonEmptyString(body.title);
    if (!title) {
      return jsonError("INVALID_MOVIE", "Title cannot be empty", 400);
    }
    data.title = title;
  }

  if (Object.hasOwn(body, "sourceLanguage")) {
    const sourceLanguage = nonEmptyString(body.sourceLanguage);
    if (!sourceLanguage) {
      return jsonError("INVALID_MOVIE", "Source language cannot be empty", 400);
    }
    data.sourceLanguage = sourceLanguage;
  }

  for (const field of ["originalTitle", "filename", "storageKey"] as const) {
    if (!Object.hasOwn(body, field)) continue;

    const value = nullableString(body[field]);
    if (!value.valid) {
      return jsonError("INVALID_MOVIE", `Invalid ${field}`, 400);
    }
    data[field] = value.value;
  }

  if (Object.hasOwn(body, "durationSeconds")) {
    if (body.durationSeconds !== null && !isNonNegativeInteger(body.durationSeconds)) {
      return jsonError(
        "INVALID_DURATION",
        "Duration must be a non-negative integer or null",
        400,
      );
    }
    data.durationSeconds = body.durationSeconds as number | null;
  }

  if (Object.hasOwn(body, "fileSizeBytes")) {
    if (body.fileSizeBytes !== null && !isNonNegativeInteger(body.fileSizeBytes)) {
      return jsonError(
        "INVALID_FILE_SIZE",
        "File size must be a non-negative safe integer or null",
        400,
      );
    }
    data.fileSizeBytes =
      body.fileSizeBytes === null ? null : BigInt(body.fileSizeBytes as number);
  }

  if (Object.hasOwn(body, "status")) {
    if (!isMovieStatus(body.status)) {
      return jsonError("INVALID_MOVIE_STATUS", "Invalid movie status", 400);
    }
    data.status = body.status;
  }

  if (Object.hasOwn(body, "processingProgress")) {
    if (!isProgress(body.processingProgress)) {
      return jsonError(
        "INVALID_PROCESSING_PROGRESS",
        "Processing progress must be an integer from 0 to 100",
        400,
      );
    }
    data.processingProgress = body.processingProgress;
  }

  if (Object.keys(data).length === 0) {
    return jsonError("EMPTY_MOVIE_UPDATE", "No movie fields to update", 400);
  }

  try {
    const movie = await prisma.movie.update({
      where: { id },
      data,
      select: movieSelect,
    });

    return Response.json({ data: movieResource(movie) });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return jsonError("MOVIE_NOT_FOUND", "Movie not found", 404);
    }

    return jsonError("MOVIE_UPDATE_FAILED", "Unable to update movie", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await prisma.movie.delete({ where: { id } });
    return Response.json({ data: { id } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return jsonError("MOVIE_NOT_FOUND", "Movie not found", 404);
    }

    return jsonError("MOVIE_DELETE_FAILED", "Unable to delete movie", 500);
  }
}
