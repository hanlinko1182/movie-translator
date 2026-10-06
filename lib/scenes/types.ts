export type VisualCut = { timeMs: number; score: number };
export type TranscriptTiming = { startMs: number; endMs: number };
export type SceneCandidate = { sequence: number; startMs: number; endMs: number; boundaryScore: number | null };
export type SceneDetectionResult = {
  movieId: string;
  durationMs: number;
  visualCandidateCount: number;
  transcriptGapCandidateCount: number;
  scenes: SceneCandidate[];
};
export type SceneReceipt = Omit<SceneDetectionResult, "scenes"> & { sceneCount: number };
export type SceneRow = SceneCandidate & { durationMs: number; detectionMethod: "VISUAL_TRANSCRIPT_HEURISTIC" };
export type SceneJobStatus = { jobId: string; state: string; attemptsMade: number; result?: SceneReceipt; error?: string };

const errors = {
  MOVIE_NOT_FOUND: [404, "Movie not found"],
  MOVIE_STORAGE_REQUIRED: [409, "Upload a source movie before detecting scenes"],
  INVALID_SCENE_CONFIGURATION: [503, "Scene detection configuration is invalid"],
  INVALID_SCENE_OUTPUT: [422, "Scene detection produced invalid timing or evidence"],
  INVALID_TRANSCRIPT_TIMING: [422, "Saved transcript timing is invalid"],
  SCENE_SOURCE_CHANGED: [409, "Movie or transcript timing changed during scene detection"],
  SCENE_MEDIA_INVALID: [422, "Unable to scan this movie; verify its video media"],
  SCENE_PROCESS_TIMEOUT: [503, "Local scene detection exceeded its time limit"],
  SCENE_PROCESS_UNAVAILABLE: [503, "Local scene detection process is unavailable"],
  SCENE_JOB_FAILED: [409, "The retained scene detection job failed; inspect worker configuration before retrying"],
} as const;
export class SceneDetectionError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) {
    super(errors[code][1]);
    this.name = "SceneDetectionError";
    this.status = errors[code][0];
  }
}
