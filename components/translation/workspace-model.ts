import type { ReviewRow, TranslationReview } from "@/lib/translation-qc/types";

export type SourceRow = { sequence: number; startMs: number; endMs: number; text: string };
export type TranslationJob = { state: string; attemptsMade: number | null } | null;
export type WorkspaceSnapshot = {
  movie: { id: string; title: string; filename: string | null; durationSeconds: number | null; sourceLanguage: string };
  source: { id: string; rows: SourceRow[] } | null;
  translation: { sourceTranscriptId: string; provider: string; model: string; savedAt: string; rows: SourceRow[] } | null;
  review: TranslationReview | null;
  reviewUnavailable: boolean;
  job: TranslationJob;
  jobAvailable: boolean;
};
export const POLL_INTERVAL_MS = 5_000;
export const SELECTION_LIMIT = 24;
export const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-40";
export const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-40";
export const filters = [
  ["ALL", "All"], ["UNREVIEWED", "Unreviewed"], ["NEEDS_REVIEW", "Needs Review"], ["APPROVED", "Approved"],
  ["MANUAL", "Manual"], ["REFINED", "Refined"], ["QC", "QC Issues"],
] as const;
export type RowFilter = typeof filters[number][0];
export const runningJob = (job: TranslationJob) => !!job && ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(job.state);
export const activeIssues = (row: ReviewRow) => row.issues.filter((issue) => !issue.resolvedAt);
export function matchesFilter(row: ReviewRow | undefined, filter: RowFilter) {
  if (filter === "ALL") return true;
  if (!row) return false;
  return filter === "QC" ? activeIssues(row).length > 0 : filter === "MANUAL" || filter === "REFINED" ? row.origin === filter : row.reviewStatus === filter;
}
export function provenance(row: ReviewRow) {
  return row.origin === "MANUAL" ? "Human edited" : row.origin === "TRANSLATION_MEMORY" ? "Translation Memory" : row.origin === "REFINED" ? "Refined" : row.origin === "MODEL" ? "Model" : "Legacy origin";
}
export function workspaceStatus(snapshot: WorkspaceSnapshot, review: TranslationReview | null, job: TranslationJob) {
  const sources = snapshot.source?.rows ?? [];
  const targets = review?.rows ?? snapshot.translation?.rows ?? [];
  const targetBySequence = new Map(targets.map((row) => [row.sequence, row]));
  const translated = snapshot.source && snapshot.translation?.sourceTranscriptId === snapshot.source.id
    ? sources.filter((source) => { const target = targetBySequence.get(source.sequence); return target?.text.trim() && target.startMs === source.startMs && target.endMs === source.endMs; }).length : 0;
  const approved = review?.rows.filter((row) => row.reviewStatus === "APPROVED").length ?? 0;
  const issues = review?.rows.reduce((count, row) => count + activeIssues(row).length, 0) ?? null;
  const state = (status: string, tone: "Processing" | "Failed" | "Needs Attention" | "Waiting" | "Ready" | "Completed", message: string, action: "start" | "refresh" | "transcript" | "review", label: string) => ({ status, tone, message, action, label, translated, sourceCount: sources.length, approved, issues });
  if (runningJob(job)) return state(job?.state === "active" ? "Translating" : "Queued", "Processing", "Translation is in progress. Saved rows are shown below; the worker does not publish exact model progress.", "refresh", "Refresh Status");
  if (job?.state === "failed") return state("Failed", "Failed", "Translation could not be completed. Saved work remains readable. The existing API cannot restart a retained failed job; check worker configuration before retrying.", "refresh", "Refresh Status");
  if (!sources.length) return state("Not started", "Waiting", "Transcription is required before translation.", "transcript", "Open Transcription");
  if (review && translated === sources.length) return approved < sources.length || issues ? state("Needs Review", "Needs Attention", "Translation is ready for human review. QC findings are signals to inspect, not proof of an error.", "review", "Continue Review") : state("Completed", "Completed", "Every source segment is translated and explicitly approved by a human.", "review", "Inspect Translation");
  if (snapshot.translation || snapshot.reviewUnavailable || job?.state === "completed") return state("Needs Review", "Needs Attention", "Saved translation does not fully align with the current transcript, or review data is unavailable. Inspect the saved rows and refresh before editing.", "refresh", "Refresh Status");
  if (!snapshot.jobAvailable) return state("Status unavailable", "Needs Attention", "Live job status could not be checked. Refresh before starting another translation request.", "refresh", "Refresh Status");
  return state("Not started", "Ready", "Your Chinese transcript is ready. Start the initial Myanmar translation, then inspect QC and review the result.", "start", "Start Translation");
}

// Only controlled public API codes are surfaced. Never display raw provider diagnostics.
export function requestError(code: unknown) {
  const messages: Record<string, string> = {
    STALE_TRANSLATION_SEGMENT: "The saved translation changed. Your draft is retained; compare the latest text before saving again.",
    INVALID_TRANSLATION_TEXT: "Enter non-empty Myanmar text of at most 32,000 characters.",
    INVALID_REVIEW_STATUS: "Save text changes before approving the current translation.",
    MANUAL_EDIT_PROTECTED: "Human-edited rows are protected from AI refinement.",
    REFINEMENT_SELECTION_TOO_BROAD: "Select a subset of rows. Whole-movie refinement is not supported.",
    REFINEMENT_SEQUENCES_INVALID: "Select 1 to 24 eligible rows for refinement.",
    REFINEMENT_STALE: "The source or translation changed. Refresh and review your selection before refining.",
    REFINEMENT_ALIGNMENT_INVALID: "Translation does not align with the current transcript. Refresh before editing.",
    TRANSLATION_JOB_FAILED: "The retained translation job failed. Check the worker setup; this workspace cannot restart that job.",
    REFINEMENT_JOB_FAILED: "The retained refinement job failed. Check the worker setup before retrying.",
    TRANSLATION_NOT_CONFIGURED: "Translation is not configured. Check the server configuration.",
    REFINEMENT_NOT_CONFIGURED: "Selective refinement is not configured. Check the server configuration.",
  };
  return typeof code === "string" && messages[code] ? messages[code] : "The request could not be completed. Refresh saved data and check the processing setup before trying again.";
}
