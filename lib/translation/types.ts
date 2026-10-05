export type TranslationSegment = {
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type TranslationRequest = {
  sourceLanguage: string;
  targetLanguage: "my";
  segments: TranslationSegment[];
};

export type TranslatedSegment = TranslationSegment;

export type TranslationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export type TranslationResult = {
  provider: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: "my";
  segments: TranslatedSegment[];
  runtimeMs: number;
  usage?: TranslationUsage;
};

const errorMessages = {
  MOVIE_NOT_FOUND: "Movie not found",
  TRANSCRIPT_NOT_FOUND: "Transcript not found",
  TRANSLATION_NOT_CONFIGURED: "Translation benchmark is not configured",
  TRANSLATION_PROVIDER_ERROR: "Translation provider request failed",
  TRANSLATION_INVALID_RESPONSE: "Translation provider returned an invalid response",
} as const;

export type TranslationErrorCode = keyof typeof errorMessages;

export class TranslationError extends Error {
  constructor(readonly code: TranslationErrorCode) {
    super(errorMessages[code]);
    this.name = "TranslationError";
  }
}
