import type { SubtitleExportMode } from "@/lib/subtitle-export/types";

// Version changes are required when any encoder, subtitle or font policy changes.
export const BURN_IN_PROFILE = Object.freeze({
  id: "myanmar-mp4-cpu-v1",
  version: 1,
  mode: "BURN_IN",
  container: "mp4",
  videoCodec: "libx264",
  pixelFormat: "yuv420p",
  preset: "medium",
  crf: 20,
  audioCodec: "aac",
  audioBitrate: "192k",
  fastStart: true,
  subtitleSerializer: "existing-ass-v1",
  fontPolicy: "system-myanmar-preflight-required-v1",
} as const);

export type RenderRequest = Readonly<{
  projectId: string; // Database identity, never the navigation slug.
  movieId: string;
  mode: "BURN_IN";
  scope: SubtitleExportMode;
  profileId: typeof BURN_IN_PROFILE.id;
}>;

export const RENDER_STATES = ["QUEUED", "ACTIVE", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type RenderState = typeof RENDER_STATES[number];
export const RENDER_FAILURE_CODES = [
  "SOURCE_MEDIA_MISSING", "SOURCE_MEDIA_INVALID", "SOURCE_MEDIA_CHANGED", "STORAGE_UNAVAILABLE",
  "SUBTITLE_SNAPSHOT_INVALID", "RENDER_FAILED", "RENDER_TIMEOUT", "OUTPUT_INVALID",
] as const;
export type RenderFailureCode = typeof RENDER_FAILURE_CODES[number];

const errors = {
  INVALID_RENDER_REQUEST: [400, "Provide only projectId, movieId, mode, scope and profileId"],
  INVALID_RENDER_IDENTITY: [400, "Provide valid project and movie database IDs"],
  UNSUPPORTED_RENDER_MODE: [400, "Only BURN_IN is supported"],
  INVALID_RENDER_SCOPE: [400, "Use ALL_CURRENT or APPROVED_ONLY"],
  UNSUPPORTED_RENDER_PROFILE: [400, "Use the fixed CPU Myanmar MP4 profile"],
  INVALID_RENDER_STATE: [400, "Invalid render state"],
  INVALID_RENDER_ERROR_CODE: [400, "Invalid render failure code"],
  INVALID_RENDER_TRANSITION: [409, "Invalid render state transition"],
  MOVIE_NOT_FOUND: [404, "Movie not found"],
  PROJECT_MOVIE_MISMATCH: [404, "Movie does not belong to this project"],
  SOURCE_MEDIA_MISSING: [409, "Stored source media is missing"],
  SOURCE_MEDIA_INVALID: [422, "Stored source media is invalid for rendering"],
  SOURCE_MEDIA_CHANGED: [409, "Source media changed during snapshot creation"],
  STORAGE_UNAVAILABLE: [503, "Private media storage is unavailable"],
  SUBTITLE_SNAPSHOT_INVALID: [409, "Saved translation does not safely align with its source"],
  RENDER_FAILED: [500, "Video rendering failed"],
  RENDER_TIMEOUT: [500, "Video rendering timed out"],
  OUTPUT_INVALID: [500, "Rendered output could not be verified"],
} as const;
export type RenderErrorCode = keyof typeof errors;
export class RenderError extends Error {
  readonly status: number;
  constructor(readonly code: RenderErrorCode) {
    super(errors[code][1]);
    this.name = "RenderError";
    this.status = errors[code][0];
  }
}

export function parseRenderRequest(value: unknown): RenderRequest {
  const keys = ["projectId", "movieId", "mode", "scope", "profileId"];
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
    throw new RenderError("INVALID_RENDER_REQUEST");
  }
  const input = value as Record<string, unknown>;
  for (const key of ["projectId", "movieId"]) {
    if (typeof input[key] !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(input[key])) throw new RenderError("INVALID_RENDER_IDENTITY");
  }
  if (input.mode !== "BURN_IN") throw new RenderError("UNSUPPORTED_RENDER_MODE");
  if (input.scope !== "ALL_CURRENT" && input.scope !== "APPROVED_ONLY") throw new RenderError("INVALID_RENDER_SCOPE");
  if (input.profileId !== BURN_IN_PROFILE.id) throw new RenderError("UNSUPPORTED_RENDER_PROFILE");
  return Object.freeze({ projectId: input.projectId as string, movieId: input.movieId as string, mode: input.mode, scope: input.scope, profileId: input.profileId });
}

export function parseRenderState(value: unknown): RenderState {
  if (!RENDER_STATES.some((state) => state === value)) throw new RenderError("INVALID_RENDER_STATE");
  return value as RenderState;
}
export function parseRenderFailureCode(value: unknown): RenderFailureCode {
  if (!RENDER_FAILURE_CODES.some((code) => code === value)) throw new RenderError("INVALID_RENDER_ERROR_CODE");
  return value as RenderFailureCode;
}
// Later retries must increment generation; terminal success cannot be overwritten.
export function assertRenderTransition(from: RenderState, to: RenderState) {
  const transitions: Record<RenderState, readonly RenderState[]> = {
    QUEUED: ["ACTIVE", "FAILED", "CANCELLED"], ACTIVE: ["COMPLETED", "FAILED", "CANCELLED"],
    COMPLETED: [], FAILED: ["QUEUED"], CANCELLED: ["QUEUED"],
  };
  if (!transitions[parseRenderState(from)].includes(parseRenderState(to))) throw new RenderError("INVALID_RENDER_TRANSITION");
}
