import { normalizeExportSegments } from "./segments";
import type { SubtitleExportSegment } from "./types";

export function formatSrtTimestamp(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1_000) % 60;
  const fraction = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(fraction).padStart(3, "0")}`;
}

export function formatSrt(segments: readonly SubtitleExportSegment[]): string {
  return normalizeExportSegments(segments).map((segment, index) =>
    `${index + 1}\n${formatSrtTimestamp(segment.startMs)} --> ${formatSrtTimestamp(segment.endMs)}\n${segment.text}\n`,
  ).join("\n");
}
