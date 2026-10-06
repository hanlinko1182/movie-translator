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
  currentTranslations?: { sequence: number; text: string }[];
};

export type TranslationGlossaryRule = { sourceText: string; targetText: string };

export type TranslatedSegment = TranslationSegment & {
  provider?: string;
  model?: string;
  origin?: "MODEL" | "TRANSLATION_MEMORY" | "REFINED";
};

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
  SEGMENT_NOT_FOUND: { status: 404, message: "Translation segment not found" },
  INVALID_TRANSLATION_TEXT: { status: 400, message: "Provide non-empty target text of at most 32000 characters" },
  INVALID_REVIEW_STATUS: { status: 400, message: "Use UNREVIEWED, NEEDS_REVIEW or APPROVED; save changed text before approving" },
  INVALID_TRANSLATION_EDIT: { status: 400, message: "Provide only text and/or reviewStatus with the current version token" },
  STALE_TRANSLATION_SEGMENT: { status: 409, message: "Translation changed; reload the current rows before saving or reviewing" },
  MANUAL_EDIT_PROTECTED: { status: 409, message: "Human-edited segments are protected from automatic replacement or refinement" },
  TRANSLATION_NOT_FOUND: { status: 404, message: "Translation not found" },
  TRANSLATION_JOB_FAILED: { status: 409, message: "The previous translation job failed; resolve the cause and remove that job before resubmitting" },
  TRANSLATION_NOT_CONFIGURED: { status: 503, message: "Translation is not configured" },
  TRANSLATION_SOURCE_INVALID: { status: 422, message: "Transcript segments are invalid for translation" },
  TRANSLATION_SOURCE_CHANGED: { status: 409, message: "Source transcript changed during translation" },
  TRANSLATION_PROVIDER_ERROR: { status: 502, message: "Translation provider request failed" },
  TRANSLATION_PROVIDER_REJECTED: { status: 502, message: "Translation provider rejected the request" },
  TRANSLATION_INVALID_RESPONSE: { status: 502, message: "Translation provider returned an invalid response" },
  REFINEMENT_NOT_CONFIGURED: { status: 503, message: "Selective refinement is not configured" },
  REFINEMENT_SEQUENCES_INVALID: { status: 400, message: "Provide 1 to 24 nonnegative integer sequences" },
  REFINEMENT_SEQUENCE_NOT_FOUND: { status: 404, message: "A requested translation sequence does not exist" },
  REFINEMENT_SELECTION_TOO_BROAD: { status: 400, message: "Select a subset of segments; whole-movie refinement is not supported" },
  REFINEMENT_ALIGNMENT_INVALID: { status: 409, message: "Translation does not align with the current source transcript" },
  REFINEMENT_STALE: { status: 409, message: "Source or selected translation changed; review and resubmit" },
  REFINEMENT_JOB_FAILED: { status: 409, message: "The retained refinement job failed; resolve the cause and remove that specific job before retrying" },
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
