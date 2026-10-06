import type { Confidence, Usage } from "@/lib/character-analysis/types";
export type { Confidence, Usage };
export const RECAP_LANGUAGE = "my";
export type RecapReference = { sceneSequence: number; segmentSequences: number[]; note: string };
export type RecapOutput = {
  title: string; summary: string;
  sections: { sequence: number; sceneStartSequence: number; sceneEndSequence: number; heading: string; summary: string; confidence: Confidence; evidence: RecapReference[] }[];
  characterInsights: { characterRef: string; observation: string; confidence: Confidence; evidence: RecapReference[] }[];
  relationshipInsights: { relationshipRef: string; characterARef: string; characterBRef: string; observation: string; confidence: Confidence; evidence: RecapReference[] }[];
};
export type SemanticEvidence = { sceneSequence: number; segmentSequence: number; evidence: string; inference: string; confidence: Confidence };
export type RecapCharacter = { ref: string; name: string; uncertain: boolean; aliases: string[]; evidence: SemanticEvidence[] };
export type RecapRelationship = { ref: string; characterARef: string; characterBRef: string; type: string; summary: string; confidence: Confidence; evidence: SemanticEvidence[] };
export type RecapScene = { sequence: number; startMs: number; endMs: number; segments: { sequence: number; startMs: number; endMs: number; text: string }[] };
export type RecapInput = {
  stage: "SCENES" | "SYNTHESIS";
  characterContext: "CURRENT" | "ABSENT" | "STALE";
  scenes: RecapScene[];
  characters: RecapCharacter[];
  relationships: RecapRelationship[];
  summaries: RecapOutput[];
};
export type RecapBatchResult = { output: RecapOutput; provider: string; model: string; runtimeMs: number; usage?: Usage };
export type RecapResult = RecapBatchResult & { modelCalls: number; strategy: "SINGLE_STAGE" | "HIERARCHICAL" };
export type RecapReceipt = { movieId: string; recapId: string; sectionCount: number; characterInsightCount: number; relationshipInsightCount: number; evidenceCount: number; provider: string; model: string; runtimeMs: number; modelCalls: number; strategy: RecapResult["strategy"]; usage?: Usage; alreadyApplied?: boolean };
const errors = {
  MOVIE_NOT_FOUND: [404, "Movie not found"],
  TRANSCRIPT_NOT_FOUND: [409, "A source transcript is required for recap generation"],
  TRANSCRIPT_EMPTY: [409, "Transcript has no usable text"],
  SCENES_REQUIRED: [409, "Detect scenes before generating a recap"],
  RECAP_SOURCE_INVALID: [422, "Transcript or scene evidence is invalid for recap generation"],
  RECAP_SOURCE_CHANGED: [409, "Recap source changed; reload and submit the current source"],
  RECAP_NOT_CONFIGURED: [503, "Recap model/provider is not configured"],
  RECAP_INVALID_RESPONSE: [502, "Recap provider returned unsupported or ungrounded output"],
  RECAP_PROVIDER_REJECTED: [502, "Recap provider rejected the request"],
  RECAP_PROVIDER_ERROR: [502, "Recap provider request failed"],
  RECAP_JOB_FAILED: [409, "The retained recap job failed; inspect configuration before retrying"],
  RECAP_JOB_INVALID: [400, "Invalid recap job reference"],
} as const;
export class RecapError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) { super(errors[code][1]); this.name = "RecapError"; this.status = errors[code][0]; }
}
