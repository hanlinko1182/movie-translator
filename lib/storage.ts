import "server-only";
import { randomUUID } from "node:crypto";
import { dirname, extname, resolve } from "node:path";

import { isAllowedMovieExtension } from "@/lib/movie-upload-policy";
import { storageConfig } from "@/lib/env";
import { LocalStorageProvider } from "@/lib/storage/local";
import type { StorageProvider } from "@/lib/storage/provider";

// Next imports route modules while collecting the build. Validate production
// requirements at runtime; a build only needs inert path constants, not a volume.
export const LOCAL_STORAGE_ROOT = storageConfig(process.env.NEXT_PHASE === "phase-production-build"
  ? { ...process.env, NODE_ENV: "development" }
  : process.env).root;
export const MOVIE_STORAGE_DIRECTORY = resolve(LOCAL_STORAGE_ROOT, "movies");
export const AUDIO_STORAGE_DIRECTORY = resolve(LOCAL_STORAGE_ROOT, "audio");
export const localStorage = new LocalStorageProvider(LOCAL_STORAGE_ROOT);
export const storage: StorageProvider = localStorage;

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

export function getAudioStorageKey(movieId: string) {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(movieId)) {
    throw new Error("Invalid local audio storage key.");
  }

  return `audio/${movieId}.wav`;
}

export function resolveAudioStorageKey(storageKey: string) {
  const parts = storageKey.split("/");
  if (
    parts.length !== 2 ||
    parts[0] !== "audio" ||
    !/^[a-z0-9][a-z0-9_-]{0,127}\.wav$/i.test(parts[1])
  ) {
    throw new Error("Invalid local audio storage key.");
  }

  const destination = resolve(AUDIO_STORAGE_DIRECTORY, parts[1]);
  if (dirname(destination) !== AUDIO_STORAGE_DIRECTORY) {
    throw new Error("Invalid local audio storage key.");
  }

  return destination;
}
