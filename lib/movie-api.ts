import { MovieStatus, Prisma } from "@/generated/prisma/client";

export const movieSelect = {
  id: true,
  title: true,
  originalTitle: true,
  filename: true,
  storageKey: true,
  durationSeconds: true,
  fileSizeBytes: true,
  sourceLanguage: true,
  status: true,
  processingProgress: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} satisfies Prisma.MovieSelect;

export type MovieRecord = Prisma.MovieGetPayload<{ select: typeof movieSelect }>;

export function movieResource<T extends { fileSizeBytes: bigint | null }>(
  movie: T,
) {
  return {
    ...movie,
    fileSizeBytes: movie.fileSizeBytes?.toString() ?? null,
  };
}

export function isMovieStatus(value: unknown): value is MovieStatus {
  return (
    typeof value === "string" &&
    Object.values(MovieStatus).includes(value as MovieStatus)
  );
}

export function nullableString(value: unknown) {
  if (value === null) return { valid: true as const, value: null };
  if (typeof value !== "string") return { valid: false as const };

  const trimmed = value.trim();
  return { valid: true as const, value: trimmed || null };
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isProgress(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= 100;
}
