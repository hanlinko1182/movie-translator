export type SubtitleFormat = "srt" | "ass";
export type SubtitleExportMode = "ALL_CURRENT" | "APPROVED_ONLY";
export type SubtitleExportSegment = { sequence: number; startMs: number; endMs: number; text: string };
export type SubtitleReviewSummary = { total: number; approved: number; needsReview: number; unreviewed: number };

const errors = {
  MOVIE_NOT_FOUND: { status: 404, message: "Movie not found" },
  TRANSLATION_NOT_FOUND: { status: 404, message: "Translation not found" },
  INVALID_SUBTITLE_FORMAT: { status: 400, message: "Choose format=srt or format=ass" },
  INVALID_EXPORT_MODE: { status: 400, message: "Choose mode=all or mode=approved" },
  INVALID_EXPORT_QUERY: { status: 400, message: "Provide only one format and one mode parameter" },
  EMPTY_SUBTITLE_EXPORT: { status: 409, message: "No current translated subtitles to export" },
  NO_APPROVED_SUBTITLES: { status: 409, message: "No approved subtitles to export; approve rows in Translation first" },
  INVALID_SUBTITLE_SEGMENTS: { status: 422, message: "Saved subtitle sequence, timestamps or text are invalid for export" },
} as const;
export class SubtitleExportError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) {
    super(errors[code].message);
    this.name = "SubtitleExportError";
    this.status = errors[code].status;
  }
}
export function parseSubtitleFormat(value: string): SubtitleFormat {
  if (value !== "srt" && value !== "ass") throw new SubtitleExportError("INVALID_SUBTITLE_FORMAT");
  return value;
}
export function parseExportMode(value: string): SubtitleExportMode {
  if (value === "all") return "ALL_CURRENT";
  if (value === "approved") return "APPROVED_ONLY";
  throw new SubtitleExportError("INVALID_EXPORT_MODE");
}
