export type Segment = { sequence: number; startMs: number; endMs: number; text: string };
export type SavedTranscript = {
  provider: string; model: string; language: string | null; durationMs: number | null;
  text: string; savedAt: string; segments: Segment[];
};
export type JobStatus = { state: string; attemptsMade: number | null } | null;
export type TranscriptionSnapshot = {
  movie: {
    id: string; title: string; filename: string | null; sourceLanguage: string;
    durationSeconds: number | null; status: string; processingProgress: number; sourceRecorded: boolean;
  };
  transcript: SavedTranscript | null;
  sourceAvailable: boolean | null;
  audioAvailable: boolean | null;
  mediaJob: JobStatus;
  transcriptionJob: JobStatus;
  mediaStatusAvailable: boolean;
  transcriptionStatusAvailable: boolean;
};
export function isRunningJob(job: JobStatus) {
  return !!job && ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(job.state);
}
export type TranscriptionView = {
  status: string;
  tone: "Completed" | "Processing" | "Needs Attention" | "Ready" | "Waiting" | "Failed";
  message: string;
  action: "prepare" | "transcribe" | "refresh" | "translate" | "overview";
  actionLabel: string;
  audioLabel: string;
};

// Presentation only. Retained terminal jobs cannot be restarted by the existing POST.
export function deriveTranscription(snapshot: TranscriptionSnapshot): TranscriptionView {
  const { movie, transcript, mediaJob, transcriptionJob, audioAvailable } = snapshot;
  const audioLabel = isRunningJob(mediaJob) ? "Preparing audio" : audioAvailable === true ? "Prepared" : audioAvailable === false ? "Not prepared" : "Availability unknown";
  const view = (status: string, tone: TranscriptionView["tone"], message: string, action: TranscriptionView["action"], actionLabel: string): TranscriptionView => ({ status, tone, message, action, actionLabel, audioLabel });
  if (isRunningJob(transcriptionJob)) {
    const active = transcriptionJob?.state === "active";
    return view(active ? "Transcribing" : "Queued", "Processing", active ? "Transcription is running. The Chinese source dialogue will appear when the worker saves it." : "Transcription is queued. The configured worker will process the prepared audio.", "refresh", "Refresh status");
  }
  if (transcriptionJob?.state === "failed") return view("Failed", "Failed", "Transcription could not be completed. Resolve the processing setup before retrying. This workspace cannot restart a retained failed job.", "refresh", "Refresh status");
  if (transcript?.segments.length) return view("Completed", "Completed", "Source transcript is ready. Inspect the timed dialogue, then continue to Myanmar translation.", "translate", "Continue to Translation");
  if (transcript || transcriptionJob?.state === "completed") return view("Transcript needs attention", "Needs Attention", "No readable timed segments are available for the completed transcript. Refresh to check the saved source data.", "refresh", "Refresh status");
  if (isRunningJob(mediaJob) || movie.status === "QUEUED" || movie.status === "PROCESSING") return view("Preparing audio", "Processing", "Local media processing is preparing the movie audio. Transcription can start once audio is available.", "refresh", "Refresh status");
  if (mediaJob?.state === "failed" || movie.status === "FAILED") return view("Failed", "Failed", "Media preparation could not be completed. Check the source media and processing setup before retrying.", "refresh", "Refresh status");
  if (!snapshot.transcriptionStatusAvailable || !snapshot.mediaStatusAvailable) return view("Status unavailable", "Needs Attention", "Live processing status could not be checked. Refresh before starting another processing action.", "refresh", "Refresh status");
  if (audioAvailable === true) return view("Ready to transcribe", "Ready", "Audio is ready. Start AI transcription to create the Chinese source transcript.", "transcribe", "Start Transcription");
  if (snapshot.sourceAvailable === true && audioAvailable === false && mediaJob?.state !== "completed") return view("Media not prepared", "Waiting", "Prepare the movie audio before transcription. This is local FFmpeg processing.", "prepare", "Prepare Media");
  if (mediaJob?.state === "completed") return view("Audio needs attention", "Needs Attention", "Media processing finished, but prepared audio is unavailable. Check media storage before starting transcription.", "refresh", "Refresh status");
  return view(movie.sourceRecorded ? "Media unavailable" : "No uploaded source", "Needs Attention", movie.sourceRecorded ? "Source media or audio availability could not be confirmed. Check this movie’s media setup before processing." : "This movie has metadata but no uploaded source file. Open the project overview to check the next step.", "overview", "Project overview");
}
export const POLL_INTERVAL_MS = 5_000;
export function pollingTarget(snapshot: TranscriptionSnapshot) {
  if (isRunningJob(snapshot.transcriptionJob)) return "transcription" as const;
  if (isRunningJob(snapshot.mediaJob)) return "media" as const;
  return null;
}
