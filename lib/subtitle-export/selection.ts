import { SubtitleExportError, type SubtitleExportMode } from "./types";

// Shared by downloads and immutable render snapshots; filtering never closes gaps.
export function selectSubtitleRows<T extends { reviewStatus: string }>(rows: readonly T[], mode: SubtitleExportMode): T[] {
  const selected = mode === "APPROVED_ONLY" ? rows.filter((row) => row.reviewStatus === "APPROVED") : [...rows];
  if (!selected.length) throw new SubtitleExportError(mode === "APPROVED_ONLY" ? "NO_APPROVED_SUBTITLES" : "EMPTY_SUBTITLE_EXPORT");
  return selected;
}
