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
  contextBefore?: TranslationSegment[];
  contextAfter?: TranslationSegment[];
  contextOnly?: TranslationSegment[];
  glossary?: TranslationGlossaryRule[];
};

export type TranslationGlossaryRule = { sourceText: string; targetText: string };

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
  translationMemoryHits?: number;
  modelTranslatedSegments?: number;
  modelCalls?: number;
};

const errorDefinitions = {
  MOVIE_NOT_FOUND: { status: 404, message: "Movie not found" },
  TRANSCRIPT_NOT_FOUND: { status: 409, message: "Transcript not found" },
  TRANSCRIPT_EMPTY: { status: 409, message: "Transcript has no segments" },
  TRANSLATION_NOT_FOUND: { status: 404, message: "Translation not found" },
  TRANSLATION_JOB_FAILED: { status: 409, message: "The previous translation job failed; resolve the cause and remove that job before resubmitting" },
  TRANSLATION_NOT_CONFIGURED: { status: 503, message: "Translation is not configured" },
  TRANSLATION_SOURCE_INVALID: { status: 422, message: "Transcript segments are invalid for translation" },
  TRANSLATION_SOURCE_CHANGED: { status: 409, message: "Source transcript changed during translation" },
  TRANSLATION_PROVIDER_ERROR: { status: 502, message: "Translation provider request failed" },
  TRANSLATION_PROVIDER_REJECTED: { status: 502, message: "Translation provider rejected the request" },
  TRANSLATION_INVALID_RESPONSE: { status: 502, message: "Translation provider returned an invalid response" },
} as const;

export type TranslationErrorCode = keyof typeof errorDefinitions;

export class TranslationError extends Error {
  readonly status: number;

  constructor(readonly code: TranslationErrorCode) {
    super(errorDefinitions[code].message);
    this.name = "TranslationError";
    this.status = errorDefinitions[code].status;
  }
}
