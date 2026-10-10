import "server-only";
import { prisma } from "@/lib/prisma";
import { subtitleFilename } from "./filename";
import { normalizeExportSegments } from "./segments";
import { selectSubtitleRows } from "./selection";
import { SubtitleExportError, type SubtitleExportMode, type SubtitleReviewSummary } from "./types";

export function summarizeSubtitleReview(rows: readonly { reviewStatus: string }[]): SubtitleReviewSummary {
  return {
    total: rows.length,
    approved: rows.filter((row) => row.reviewStatus === "APPROVED").length,
    needsReview: rows.filter((row) => row.reviewStatus === "NEEDS_REVIEW").length,
    unreviewed: rows.filter((row) => row.reviewStatus === "UNREVIEWED").length,
  };
}

export async function getExportableSubtitle({ movieId, mode }: { movieId: string; mode: SubtitleExportMode }) {
  // Repeatable read keeps metadata and segments coherent even if a save/rerun commits
  // between Prisma relation queries. No write delegate is used.
  const movie = await prisma.$transaction((transaction) => transaction.movie.findUnique({ where: { id: movieId }, select: {
    id: true, title: true, filename: true,
    translation: { select: { id: true, revision: true, segments: {
      orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true, reviewStatus: true },
    } } },
  } }), { isolationLevel: "RepeatableRead", timeout: 30_000 });
  if (!movie) throw new SubtitleExportError("MOVIE_NOT_FOUND");
  if (!movie.translation) throw new SubtitleExportError("TRANSLATION_NOT_FOUND");
  const rows = movie.translation.segments;
  const selected = selectSubtitleRows(rows, mode);
  return {
    movieId: movie.id, movieTitle: movie.title, translationId: movie.translation.id, revision: movie.translation.revision, mode,
    filenames: { srt: subtitleFilename(movie.filename, movie.title, "srt"), ass: subtitleFilename(movie.filename, movie.title, "ass") },
    summary: summarizeSubtitleReview(rows), segments: normalizeExportSegments(selected),
  };
}
