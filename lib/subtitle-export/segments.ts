import { SubtitleExportError, type SubtitleExportSegment } from "./types";

export function normalizeLineEndings(text: string) { return text.replace(/\r\n?/g, "\n"); }

// Validate without retiming, sorting, trimming target text or mutating input rows.
export function normalizeExportSegments(segments: readonly SubtitleExportSegment[]): SubtitleExportSegment[] {
  if (!segments.length) throw new SubtitleExportError("EMPTY_SUBTITLE_EXPORT");
  let previousSequence = -1;
  let previousStart = -1;
  return segments.map((segment) => {
    if (!Number.isSafeInteger(segment.sequence) || segment.sequence <= previousSequence ||
      !Number.isSafeInteger(segment.startMs) || !Number.isSafeInteger(segment.endMs) ||
      segment.startMs < 0 || segment.startMs < previousStart || segment.endMs < segment.startMs ||
      typeof segment.text !== "string" || !segment.text.trim()) {
      throw new SubtitleExportError("INVALID_SUBTITLE_SEGMENTS");
    }
    previousSequence = segment.sequence;
    previousStart = segment.startMs;
    return { sequence: segment.sequence, startMs: segment.startMs, endMs: segment.endMs, text: normalizeLineEndings(segment.text) };
  });
}
