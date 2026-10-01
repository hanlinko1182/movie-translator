import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { MovieStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generatedSlugForAttempt,
  isPrismaError,
  jsonError,
  nonEmptyString,
  slugify,
} from "@/lib/project-api";
import { createMovieStorageKey, MOVIE_STORAGE_DIRECTORY, resolveMovieStorageKey } from "@/lib/storage";
import {
  ALLOWED_MOVIE_EXTENSIONS,
  isAllowedMovieExtension,
  isMovieMimeHintAllowed,
  MAX_MOVIE_UPLOAD_BYTES,
  MAX_MOVIE_UPLOAD_LABEL,
} from "@/lib/movie-upload-policy";

export const runtime = "nodejs";

const uploadFields = new Set(["name", "sourceLanguage", "targetLanguage", "movie"]);
const MAX_FORM_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    return jsonError("INVALID_UPLOAD", "A multipart movie upload is required", 400);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_MOVIE_UPLOAD_BYTES + MAX_FORM_OVERHEAD_BYTES
  ) {
    return tooLargeResponse();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("INVALID_UPLOAD", "The upload form could not be read", 400);
  }

  const entries = [...formData.entries()];
  if (
    entries.some(([key]) => !uploadFields.has(key)) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) {
    return jsonError("INVALID_UPLOAD", "Unexpected or duplicate upload fields", 400);
  }

  const name = nonEmptyString(formData.get("name"));
  const sourceLanguage = nonEmptyString(formData.get("sourceLanguage"));
  const targetLanguage = nonEmptyString(formData.get("targetLanguage"));
  const movieFile = formData.get("movie");

  if (!name || !sourceLanguage || !targetLanguage) {
    return jsonError(
      "INVALID_PROJECT",
      "Project name, source language, and target language are required",
      400,
    );
  }

  if (!(movieFile instanceof File)) {
    return jsonError("MOVIE_FILE_REQUIRED", "Choose a movie file to continue", 400);
  }

  if (!movieFile.name.trim()) {
    return jsonError("INVALID_MOVIE_FILENAME", "The movie filename is required", 400);
  }

  if (movieFile.size === 0) {
    return jsonError("EMPTY_MOVIE_FILE", "The selected movie file is empty", 400);
  }

  if (movieFile.size > MAX_MOVIE_UPLOAD_BYTES) {
    return tooLargeResponse();
  }

  const filename = movieFile.name
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "");

  if (!filename) {
    return jsonError("INVALID_MOVIE_FILENAME", "The movie filename is required", 400);
  }

  const extension = extname(filename).toLowerCase();
  if (!isAllowedMovieExtension(extension)) {
    return jsonError(
      "UNSUPPORTED_MOVIE_FORMAT",
      `Use one of these formats: ${ALLOWED_MOVIE_EXTENSIONS.join(", ")}`,
      400,
    );
  }

  if (!isMovieMimeHintAllowed(extension, movieFile.type.toLowerCase())) {
    return jsonError(
      "MOVIE_MIME_MISMATCH",
      "The file type does not match its movie filename",
      400,
    );
  }

  const title = filename
    .slice(0, -extension.length)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    return jsonError("INVALID_MOVIE_FILENAME", "The movie filename needs a title", 400);
  }

  // MIME type and extension are client supplied hints. This development flow
  // does not inspect media signatures; FFmpeg-based inspection is out of scope.
  const baseSlug = slugify(name) || "project";
  const storageKey = createMovieStorageKey(extension);
  const movieId = randomUUID();
  let project: { id: string; name: string; slug: string } | null = null;

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const slug = generatedSlugForAttempt(baseSlug, attempt);

    try {
      project = await prisma.project.create({
        data: { name, sourceLanguage, targetLanguage, slug },
        select: { id: true, name: true, slug: true },
      });
      break;
    } catch (error) {
      if (isPrismaError(error, "P2002")) continue;
      return jsonError("PROJECT_CREATE_FAILED", "Unable to create project", 500);
    }
  }

  if (!project) {
    return jsonError(
      "PROJECT_SLUG_COLLISION_LIMIT",
      "Unable to generate a unique project slug",
      409,
    );
  }

  try {
    await mkdir(MOVIE_STORAGE_DIRECTORY, { recursive: true });
    const destination = resolveMovieStorageKey(storageKey);
    await pipeline(
      Readable.fromWeb(movieFile.stream() as unknown as NodeReadableStream),
      createWriteStream(destination, { flags: "wx", mode: 0o600 }),
    );

    const movie = await prisma.movie.create({
      data: {
        id: movieId,
        project: { connect: { id: project.id } },
        title,
        filename,
        storageKey,
        fileSizeBytes: BigInt(movieFile.size),
        sourceLanguage,
        status: MovieStatus.UPLOADED,
        processingProgress: 0,
      },
      select: {
        id: true,
        title: true,
        filename: true,
        storageKey: true,
        fileSizeBytes: true,
        sourceLanguage: true,
        status: true,
        processingProgress: true,
        project: { select: { id: true, name: true, slug: true } },
      },
    });

    return Response.json(
      {
        data: {
          project,
          movie: {
            ...movie,
            fileSizeBytes: movie.fileSizeBytes?.toString() ?? null,
          },
        },
      },
      { status: 201 },
    );
  } catch {
    await cleanupFailedUpload(project.id, movieId, storageKey);
    return jsonError("PROJECT_UPLOAD_FAILED", "Unable to create project and store movie", 500);
  }
}

function tooLargeResponse() {
  return jsonError(
    "MOVIE_FILE_TOO_LARGE",
    `Movie files must be ${MAX_MOVIE_UPLOAD_LABEL} or smaller`,
    413,
  );
}

async function cleanupFailedUpload(
  projectId: string,
  movieId: string,
  storageKey: string,
) {
  let cleanupFailed = false;

  try {
    await unlink(resolveMovieStorageKey(storageKey));
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      cleanupFailed = true;
    }
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.movie.deleteMany({ where: { id: movieId, projectId } });
      await transaction.project.delete({ where: { id: projectId } });
    });
  } catch {
    cleanupFailed = true;
  }

  if (cleanupFailed) {
    console.error("Project movie upload rollback cleanup failed.");
  }
}
