import type { ComponentProps } from "react";
import type RecapControls from "@/app/projects/[id]/recap/RecapControls";

export const movieId = "older-selected-movie";
export const hash = "a".repeat(64);
export const jobId = `recap-${movieId}-${hash}`;
export const failureToken = "1791697200000:1:1";
export const recapProps: ComponentProps<typeof RecapControls> = {
  projectId: "synthetic-project", projectName: "Synthetic recovery QA",
  movie: { id: movieId, title: "Older selected movie", filename: "synthetic.mp4", sourceRecorded: false, durationSeconds: 259 },
  initial: { recap: null },
  initialJob: { jobId, state: "failed", attemptsMade: 1, failureToken, errorCode: "RECAP_INVALID_RESPONSE", error: "Recap generation failed. Review before retrying." },
  scenes: [{ sequence: 0, startMs: 0, endMs: 259000, detectionMethod: "TRANSCRIPT_GAP", boundaryScore: null }],
  transcriptState: "READY", characterState: "CURRENT", sourceContext: "CURRENT", sourceReason: null,
  jobUnavailable: false, model: "synthetic-model",
  projectHref: `/projects/synthetic?movieId=${movieId}`, transcriptionHref: `/projects/synthetic/subtitles?movieId=${movieId}`,
  scenesHref: `/projects/synthetic/scenes?movieId=${movieId}`, exportHref: `/projects/synthetic/export?movieId=${movieId}`,
};
