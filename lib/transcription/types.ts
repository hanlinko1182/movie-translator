export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
};

export type TranscriptionUsage = {
  audioSeconds?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export type TranscriptionResult = {
  provider: string;
  model: string;
  text: string;
  language?: string;
  durationMs?: number;
  usage?: TranscriptionUsage;
  segments: TranscriptSegment[];
};

export type TranscriptionInput = {
  audioPath: string;
  language?: string;
};

const errorDefinitions = {
  MOVIE_NOT_FOUND: { status: 404, message: "Movie not found" },
  TRANSCRIPTION_NOT_CONFIGURED: { status: 503, message: "Transcription is not configured" },
  TRANSCRIPTION_MODEL_UNSUPPORTED: { status: 422, message: "The configured transcription model is not supported" },
  TRANSCRIPTION_AUDIO_MISSING: { status: 409, message: "Extracted audio is not available" },
  TRANSCRIPTION_AUDIO_INVALID: { status: 422, message: "Extracted audio is invalid" },
  TRANSCRIPTION_FILE_TOO_LARGE: { status: 413, message: "Audio exceeds the transcription request limit" },
  TRANSCRIPTION_PROVIDER_ERROR: { status: 502, message: "The transcription provider request failed" },
  TRANSCRIPTION_INVALID_RESPONSE: { status: 502, message: "The transcription provider returned an invalid response" },
  TRANSCRIPTION_TIMESTAMP_UNAVAILABLE: { status: 422, message: "The configured transcription model does not provide required timestamps" },
  TRANSCRIPTION_DEVELOPMENT_LIMIT: { status: 413, message: "Audio is too large for the synchronous development endpoint" },
  TRANSCRIPTION_RESPONSE_TOO_LARGE: { status: 413, message: "Transcript is too large for the development response" },
} as const;

export type TranscriptionErrorCode = keyof typeof errorDefinitions;

export class TranscriptionError extends Error {
  readonly status: number;

  constructor(readonly code: TranscriptionErrorCode) {
    super(errorDefinitions[code].message);
    this.name = "TranscriptionError";
    this.status = errorDefinitions[code].status;
  }
}
