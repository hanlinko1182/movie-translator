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
import type { Prisma } from "@/generated/prisma/client";

const createFields = [
  "projectId",
  "title",
  "sourceLanguage",
  "originalTitle",
  "filename",
  "storageKey",
  "durationSeconds",
  "fileSizeBytes",
  "status",
  "processingProgress",
] as const;

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");

  if (projectId !== null && !projectId.trim()) {
    return jsonError("INVALID_PROJECT_ID", "Project ID cannot be empty", 400);
  }

  try {
    const movies = await prisma.movie.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
      select: movieSelect,
    });

    return Response.json({ data: movies.map(movieResource) });
  } catch {
    return jsonError("MOVIES_FETCH_FAILED", "Unable to fetch movies", 500);
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);

  if (!body || !hasOnlyKeys(body, createFields)) {
    return jsonError("INVALID_MOVIE", "Invalid movie request body", 400);
  }

  const projectId = nonEmptyString(body.projectId);
  const title = nonEmptyString(body.title);
  const sourceLanguage = nonEmptyString(body.sourceLanguage);

  if (!projectId || !title || !sourceLanguage) {
    return jsonError(
      "INVALID_MOVIE",
      "Project ID, title, and source language are required",
      400,
    );
  }

  const data: Prisma.MovieCreateInput = {
    title,
    sourceLanguage,
    project: { connect: { id: projectId } },
  };

  if (Object.hasOwn(body, "originalTitle")) {
    const value = nullableString(body.originalTitle);
    if (!value.valid) {
      return jsonError("INVALID_MOVIE", "Invalid original title", 400);
    }
    data.originalTitle = value.value;
  }

  if (Object.hasOwn(body, "filename")) {
    const value = nullableString(body.filename);
    if (!value.valid) {
      return jsonError("INVALID_MOVIE", "Invalid filename", 400);
    }
    data.filename = value.value;
  }

  if (Object.hasOwn(body, "storageKey")) {
    const value = nullableString(body.storageKey);
    if (!value.valid) {
      return jsonError("INVALID_MOVIE", "Invalid storage key", 400);
    }
    data.storageKey = value.value;
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

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
    }

    const movie = await prisma.movie.create({ data, select: movieSelect });
    return Response.json({ data: movieResource(movie) }, { status: 201 });
  } catch (error) {
    if (isPrismaError(error, "P2003")) {
      return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
    }

    return jsonError("MOVIE_CREATE_FAILED", "Unable to create movie", 500);
  }
}
