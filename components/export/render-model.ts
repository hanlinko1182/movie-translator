import { BURN_IN_PROFILE, RENDER_STATES, type RenderState } from "@/lib/video-render/contracts";
import type { SubtitleExportMode } from "@/lib/subtitle-export/types";

// Client-facing allowlist: never retain snapshots, paths or worker ownership data.
export type RenderItem = {
  id: string; movieId: string; state: RenderState; exportMode: SubtitleExportMode;
  execution: string; generation: number; createdAt: string;
  cancelRequestedAt: string | null; phase: string | null;
  progressPercent: number | null; errorCode: string | null;
};
export function renderBase(projectId: string, movieId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/movies/${encodeURIComponent(movieId)}/renders`;
}
export function renderDownloadUrl(base: string, job: RenderItem) {
  return job.state === "COMPLETED" ? `${base}/${encodeURIComponent(job.id)}/download` : null;
}
export function renderActions(job: RenderItem) {
  return {
    cancel: !job.cancelRequestedAt && (job.state === "QUEUED" || job.state === "ACTIVE"),
    retry: job.generation < 2_147_483_646 &&
      (job.state === "FAILED" || job.state === "CANCELLED" || job.state === "QUEUED" && job.execution === "DEFERRED"),
  };
}
export function needsRenderPolling(items: RenderItem[]) {
  return items.some((item) => (item.state === "ACTIVE" || item.state === "QUEUED") && item.execution !== "DEFERRED");
}
export function renderPrerequisite(hasMovie: boolean, selected: boolean, sourceAvailable: boolean | null, hasTranslation: boolean, count: number) {
  return !hasMovie ? "Upload a movie before rendering." : !selected ? "This project has multiple movies. Confirm the displayed movie before rendering." : sourceAvailable === false ? "The uploaded source file is missing. Restore it before rendering." : sourceAvailable === null ? "Source storage availability could not be checked. Refresh this page before rendering." : !hasTranslation || !count ? "A saved translation with rows in the selected scope is required." : "";
}
export function parseRenderItem(value: unknown, movieId: string): RenderItem {
  const row = value as Partial<RenderItem> | null;
  if (!row || typeof row.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(row.id) || row.movieId !== movieId ||
    !RENDER_STATES.includes(row.state as RenderState) || !["ALL_CURRENT", "APPROVED_ONLY"].includes(row.exportMode ?? "") ||
    !Number.isInteger(row.generation) || row.generation! < 0 || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) {
    throw new Error("Render backend returned invalid job metadata. Refresh to try again.");
  }
  return {
    id: row.id, movieId, state: row.state!, exportMode: row.exportMode!, generation: row.generation!, createdAt: row.createdAt,
    execution: row.execution === "DEFERRED" && row.state === "QUEUED" ? "DEFERRED" : row.state!,
    cancelRequestedAt: typeof row.cancelRequestedAt === "string" ? row.cancelRequestedAt : null,
    phase: ["preparing", "encoding", "verifying", "publishing"].includes(row.phase ?? "") ? row.phase! : null,
    progressPercent: typeof row.progressPercent === "number" && Number.isFinite(row.progressPercent) && row.progressPercent >= 0 && row.progressPercent <= 100 ? row.progressPercent : null,
    errorCode: typeof row.errorCode === "string" && /^[A-Z_]{1,64}$/.test(row.errorCode) ? row.errorCode : null,
  };
}
const errors: Record<string, string> = {
  MOVIE_NOT_FOUND: "The selected movie is unavailable in this project.",
  SOURCE_MEDIA_MISSING: "The uploaded source file is missing. Restore it before starting a render.",
  SOURCE_MEDIA_INVALID: "The source media cannot be rendered safely.",
  SOURCE_MEDIA_CHANGED: "The source changed. Refresh before submitting again.",
  TRANSLATION_NOT_FOUND: "A saved translation is required.",
  EMPTY_SUBTITLE_EXPORT: "No saved subtitle rows are available in this scope.",
  NO_APPROVED_SUBTITLES: "Approve subtitle rows before using Approved Only.",
  RENDER_OPERATION_CONFLICT: "The render state changed or this operation is unavailable. Refresh its status.",
  MYANMAR_FONT_UNAVAILABLE: "The render worker requires verified system Myanmar fonts.",
  SOURCE_PROFILE_UNSUPPORTED: "This source is outside the supported CPU rendering profile.",
  RENDER_RESOURCE_LIMIT: "Local rendering resources are unavailable.",
  SUBTITLE_SNAPSHOT_INVALID: "Saved subtitles do not align safely with the source. Review the translation first.",
};
export async function renderRequest(base: string, movieId: string, signal: AbortSignal, action?: { scope: SubtitleExportMode } | { job: RenderItem; operation: "retry" | "cancel" }, fetcher: typeof fetch = fetch): Promise<RenderItem[]> {
  if (action && "job" in action && (action.job.movieId !== movieId || !renderActions(action.job)[action.operation])) throw new Error("This render action is unavailable.");
  const url = action && "job" in action ? `${base}/${encodeURIComponent(action.job.id)}/${action.operation}` : base;
  const response = await fetcher(url, {
    method: action ? "POST" : "GET", cache: "no-store", signal,
    ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify("scope" in action ? { mode: "BURN_IN", exportMode: action.scope, profileId: BURN_IN_PROFILE.id } : {}) } : {}),
  }).catch(() => { throw new Error(signal.aborted ? "Render request cancelled." : "Render backend unavailable. Refresh status to try again."); });
  const body = await response.json().catch(() => { throw new Error("Render backend returned an unreadable response. Refresh status to try again."); });
  if (!response.ok) throw new Error(errors[body?.error?.code] ?? "Render backend unavailable. Refresh status or try the explicit action again.");
  const rows = action ? [body?.data] : body?.data?.items;
  if (!Array.isArray(rows) || rows.length > 50) throw new Error("Render history is unavailable.");
  return rows.map((row) => parseRenderItem(row, movieId));
}
