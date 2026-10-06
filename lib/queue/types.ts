export const MEDIA_QUEUE_NAME = "movie-processing";
export const MEDIA_JOB_NAME = "process-media";
export const TRANSCRIPTION_QUEUE_NAME = "movie-transcription";
export const TRANSCRIPTION_JOB_NAME = "transcribe-movie";
export const TRANSLATION_QUEUE_NAME = "movie-translation";
export const TRANSLATION_JOB_NAME = "translate-movie";

export type MediaJobData = { movieId: string };
export type TranscriptionJobData = { movieId: string };
export type TranslationJobData = { movieId: string };

export function mediaJobId(movieId: string) {
  // BullMQ custom IDs cannot contain colons.
  return `media-${encodeURIComponent(movieId)}`;
}

export function transcriptionJobId(movieId: string) {
  // BullMQ custom IDs cannot contain colons.
  return `transcription-${encodeURIComponent(movieId)}`;
}

export function translationJobId(movieId: string) {
  // BullMQ custom IDs cannot contain colons.
  return `translation-${encodeURIComponent(movieId)}`;
}
