export const CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
export const EVIDENCE_TYPES = ["MENTION", "SELF_IDENTIFICATION", "BEHAVIOR", "SPEECH_STYLE", "ACTION_INFERENCE", "RELATIONSHIP_CLUE"] as const;
export const RELATIONSHIP_TYPES = ["FAMILY", "FRIEND", "ALLY", "RIVAL", "ROMANTIC", "PROFESSIONAL", "UNKNOWN", "OTHER"] as const;
export type Confidence = typeof CONFIDENCES[number];
export type EvidenceType = typeof EVIDENCE_TYPES[number];
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];
export type Evidence = { sceneSequence: number; segmentSequences: number[]; type: EvidenceType; evidence: string; inference: string; confidence: Confidence };
export type CharacterCandidate = { temporaryId: string; name: string; aliases: string[]; evidence: Evidence[] };
export type RelationshipCandidate = { characterA: string; characterB: string; type: RelationshipType; summary: string; confidence: Confidence; evidence: Evidence[] };
export type CharacterOutput = { characters: CharacterCandidate[]; relationships: RelationshipCandidate[] };
export type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number };
export type AnalysisBatch = { scenes: { sequence: number; startMs: number; endMs: number; segments: { sequence: number; startMs: number; endMs: number; text: string; targetText?: string }[] }[]; knownCharacters: { name: string; aliases: string[] }[] };
export type BatchResult = { output: CharacterOutput; provider: string; model: string; runtimeMs: number; usage?: Usage };
export type NormalizedCharacter = { key: string; name: string; aliases: string[]; uncertain: boolean; evidence: Evidence[] };
export type NormalizedRelationship = { characterA: string; characterB: string; type: RelationshipType; summary: string; confidence: Confidence; evidence: Evidence[] };
export type AnalysisResult = { characters: NormalizedCharacter[]; relationships: NormalizedRelationship[]; provider: string; model: string; runtimeMs: number; modelCalls: number; usage?: Usage };
export type AnalysisReceipt = { movieId: string; analysisRunId: string; characterCount: number; relationshipCount: number; evidenceCount: number; provider: string; model: string; runtimeMs: number; modelCalls: number; usage?: Usage; alreadyApplied?: boolean };
const errors = {
  MOVIE_NOT_FOUND: [404, "Movie not found"],
  TRANSCRIPT_NOT_FOUND: [409, "A source transcript is required for character analysis"],
  CHARACTER_SOURCE_INVALID: [422, "Transcript or scene timing is invalid for character analysis"],
  TRANSCRIPT_EMPTY: [409, "Transcript has no usable text"],
  SCENES_REQUIRED: [409, "Detect scenes before analyzing characters"],
  CHARACTER_ANALYSIS_NOT_CONFIGURED: [503, "Character analysis model/provider is not configured"],
  CHARACTER_SOURCE_CHANGED: [409, "Analysis source changed; reload and submit the current source"],
  CHARACTER_INVALID_RESPONSE: [502, "Character provider returned unsupported or ungrounded output"],
  CHARACTER_PROVIDER_REJECTED: [502, "Character analysis provider rejected the request"],
  CHARACTER_PROVIDER_ERROR: [502, "Character analysis provider request failed"],
  CHARACTER_JOB_FAILED: [409, "The retained analysis job failed; inspect configuration before retrying"],
  CHARACTER_JOB_INVALID: [400, "Invalid character analysis job reference"],
} as const;
export class CharacterAnalysisError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) { super(errors[code][1]); this.name = "CharacterAnalysisError"; this.status = errors[code][0]; }
}
