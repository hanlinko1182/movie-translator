import { RecapError } from "./types";

const STAGES = ["PROVIDER_RESPONSE", "JSON_PARSE", "OUTPUT_VALIDATION", "GENERATION", "SYNTHESIS", "PERSISTENCE", "WORKER"] as const;
const RULES = [
  "INVALID_OBJECT", "MISSING_FIELD", "UNKNOWN_FIELDS", "INVALID_TEXT", "EMPTY_TEXT", "TEXT_TOO_LONG",
  "INVALID_ARRAY", "TOO_FEW_ITEMS", "TOO_MANY_ITEMS", "INVALID_CONFIDENCE", "INVALID_SEQUENCE",
  "INVALID_SCENE_REFERENCE", "INVALID_SEGMENT_REFERENCE", "DUPLICATE_SEGMENT_REFERENCE", "DUPLICATE_EVIDENCE",
  "INVALID_SCENE_RANGE", "EVIDENCE_OUTSIDE_SECTION", "SECTION_ORDER", "INVALID_CHARACTER_REFERENCE",
  "DUPLICATE_CHARACTER_REFERENCE", "UNCERTAIN_CONFIDENCE", "CHARACTER_EVIDENCE_NOT_ALLOWED",
  "INVALID_RELATIONSHIP_REFERENCE", "DUPLICATE_RELATIONSHIP_REFERENCE", "INVALID_RELATIONSHIP_ENDPOINTS",
  "RELATIONSHIP_CONFIDENCE", "RELATIONSHIP_EVIDENCE_NOT_ALLOWED", "OUTPUT_TOO_LONG", "INVALID_JSON",
  "MISSING_CHOICES", "CHOICE_COUNT", "INCOMPLETE_OUTPUT", "PROVIDER_REFUSAL", "INVALID_CONTENT",
  "INVALID_USAGE", "SDK_RESPONSE_INVALID", "INVALID_RESULT_METADATA", "PROVIDER_MODEL_MISMATCH",
  "SYNTHESIS_NOT_REDUCING", "UNSPECIFIED_VALIDATION_FAILURE",
] as const;
const FINISH_REASONS = ["stop", "length", "content_filter", "tool_calls", "function_call", "error", "missing", "unknown"] as const;
const FIELDS = new Set([
  "output", "response", "choices", "message", "content", "refusal", "finishReason", "usage",
  "inputTokens", "outputTokens", "totalTokens", "costUsd", "title", "summary", "sections", "sequence",
  "sceneStartSequence", "sceneEndSequence", "heading", "confidence", "evidence", "sceneSequence",
  "segmentSequences", "note", "characterInsights", "characterRef", "observation", "relationshipInsights",
  "relationshipRef", "characterARef", "characterBRef", "result", "provider", "model", "runtimeMs",
  "modelCalls", "strategy", "summaries",
]);
export type RecapValidationStage = typeof STAGES[number];
export type RecapValidationDiagnostic = {
  stage: RecapValidationStage;
  rule: typeof RULES[number];
  fieldPath?: string;
  expectedLimit?: number;
  actualLength?: number;
  actualCount?: number;
  finishReason?: typeof FINISH_REASONS[number];
};
export function safeFinishReason(value: unknown): RecapValidationDiagnostic["finishReason"] {
  if (value == null) return "missing";
  return FINISH_REASONS.includes(value as typeof FINISH_REASONS[number]) ? value as typeof FINISH_REASONS[number] : "unknown";
}
// Reconstruct, never spread, diagnostic data at the logging/retention boundary.
// Paths contain only application-owned field names and numeric array indexes.
export function safeRecapDiagnostic(value: RecapValidationDiagnostic): RecapValidationDiagnostic {
  const safe: RecapValidationDiagnostic = {
    stage: STAGES.includes(value.stage) ? value.stage : "WORKER",
    rule: RULES.includes(value.rule) ? value.rule : "UNSPECIFIED_VALIDATION_FAILURE",
  };
  if (typeof value.fieldPath === "string" && value.fieldPath.length <= 200 &&
      /^[a-zA-Z]+(?:\[\d{1,6}\]|\.[a-zA-Z]+)*$/.test(value.fieldPath) &&
      value.fieldPath.split(/[.[\]]+/).filter(Boolean).every((part) => FIELDS.has(part) || /^\d{1,6}$/.test(part))) safe.fieldPath = value.fieldPath;
  for (const key of ["expectedLimit", "actualLength", "actualCount"] as const) {
    const number = value[key];
    if (typeof number === "number" && Number.isSafeInteger(number) && number >= 0) safe[key] = number;
  }
  if (value.finishReason !== undefined) safe.finishReason = safeFinishReason(value.finishReason);
  return safe;
}
export class RecapResponseValidationError extends RecapError {
  readonly diagnostic: Readonly<RecapValidationDiagnostic>;
  constructor(diagnostic: RecapValidationDiagnostic) {
    super("RECAP_INVALID_RESPONSE");
    this.diagnostic = Object.freeze(safeRecapDiagnostic(diagnostic));
  }
}
export function invalidRecapResponse(diagnostic: RecapValidationDiagnostic): never {
  throw new RecapResponseValidationError(diagnostic);
}
export function recapValidationLog(diagnostic: RecapValidationDiagnostic, jobId: string | undefined) {
  const safeJobId = typeof jobId === "string" && /^recap-[a-zA-Z0-9_%+-]{1,160}-[a-f0-9]{64}$/.test(jobId) && !/sk-/i.test(jobId) ? jobId : undefined;
  return { event: "recap_response_validation_failed", errorCode: "RECAP_INVALID_RESPONSE", ...safeRecapDiagnostic(diagnostic), ...(safeJobId ? { jobId: safeJobId } : {}) };
}
