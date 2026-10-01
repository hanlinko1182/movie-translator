import { randomUUID } from "node:crypto";
import { dirname, extname, resolve } from "node:path";

import { isAllowedMovieExtension } from "@/lib/movie-upload-policy";

export const LOCAL_STORAGE_ROOT = resolve(process.cwd(), "storage");
export const MOVIE_STORAGE_DIRECTORY = resolve(LOCAL_STORAGE_ROOT, "movies");

export function createMovieStorageKey(
  extension: ".mp4" | ".mkv" | ".mov" | ".webm",
) {
  return `movies/${randomUUID()}${extension}`;
}

export function resolveMovieStorageKey(storageKey: string) {
  const parts = storageKey.split("/");
  if (parts.length !== 2 || parts[0] !== "movies") {
    throw new Error("Invalid local movie storage key.");
  }

  const filename = parts[1];
  const extension = extname(filename).toLowerCase();
  const generatedFilename =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

  if (
    !generatedFilename.test(filename) ||
    !isAllowedMovieExtension(extension)
  ) {
    throw new Error("Invalid local movie storage key.");
  }

  const directory = resolve(MOVIE_STORAGE_DIRECTORY);
  const destination = resolve(directory, filename);

  if (dirname(destination) !== directory) {
    throw new Error("Invalid local movie storage key.");
  }

  return destination;
}
