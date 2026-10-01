export const ALLOWED_MOVIE_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".mov",
  ".webm",
] as const;

// A local development limit, kept below typical host memory ceilings.
export const MAX_MOVIE_UPLOAD_BYTES = 512 * 1024 * 1024;
export const MAX_MOVIE_UPLOAD_LABEL = "512 MiB";

export const MOVIE_MIME_TYPES_BY_EXTENSION: Record<
  (typeof ALLOWED_MOVIE_EXTENSIONS)[number],
  readonly string[]
> = {
  ".mp4": ["video/mp4", "application/mp4"],
  ".mkv": ["video/x-matroska", "video/matroska", "application/x-matroska"],
  ".mov": ["video/quicktime"],
  ".webm": ["video/webm"],
};

export function isAllowedMovieExtension(
  extension: string,
): extension is (typeof ALLOWED_MOVIE_EXTENSIONS)[number] {
  return ALLOWED_MOVIE_EXTENSIONS.includes(
    extension as (typeof ALLOWED_MOVIE_EXTENSIONS)[number],
  );
}

export function isMovieMimeHintAllowed(extension: string, mimeType: string) {
  if (!mimeType || mimeType === "application/octet-stream") return true;
  if (!isAllowedMovieExtension(extension)) return false;
  return MOVIE_MIME_TYPES_BY_EXTENSION[extension].includes(mimeType);
}
