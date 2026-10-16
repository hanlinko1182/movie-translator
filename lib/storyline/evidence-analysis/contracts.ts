import type { Confidence } from "@/lib/character-analysis/types";
import type { Immutable, SourceAnchor, TranslationContextRef } from "../contracts";

export const EVIDENCE_ANALYSIS = {
  version: "story-evidence-candidate-v1",
  hashDomain: "story-evidence-candidate-v1",
  maxBytes: 512 * 1024,
  maxFindings: 200,
  maxEvidencePerFinding: 8,
  maxContextPerFinding: 8,
  maxContradictions: 100,
} as const;

export type CandidateEvidence =
  | { kind: "CHINESE_QUOTE"; anchor: SourceAnchor; segmentId: string; sceneId: string; quote: string }
  | { kind: "CAPTURED_OBSERVATION"; anchor: SourceAnchor; segmentId: string; sceneId: string; observationId: string };

export type CandidateSubject = {
  characterIds: string[];
  relationshipId: string | null;
};

export type CandidateFinding = {
  id: string;
  classification: "OBSERVED" | "INFERRED";
  category: "DIALOGUE" | "ACTION" | "BEHAVIOR" | "MOTIVATION" | "TRAIT" | "RELATIONSHIP" | "CONFLICT" | "DECISION" | "CONSEQUENCE";
  subject: CandidateSubject;
  statement: string;
  confidence: Confidence;
  uncertainty: "NONE" | "POSSIBLE" | "COMPETING";
  evidence: CandidateEvidence[];
  translationContextRefs: TranslationContextRef[];
  observedBasisIds: string[];
  qualification: string | null;
};

export type EvidenceAnalysisCandidate = {
  schemaVersion: typeof EVIDENCE_ANALYSIS.version;
  origin: "MODEL_CANDIDATE" | "SYNTHETIC_TEST";
  task: { taskId: string; generation: number; recipeHash: string };
  source: { projectId: string; movieId: string; studioId: string; snapshotId: string; contentHash: string; contextHash: string; dependencyHash: string; bindingHash: string };
  model: { providerId: string; modelId: string; profileId: string; profileVersion: string; responseSchemaVersion: string };
  findings: CandidateFinding[];
  contradictions: { firstFindingId: string; secondFindingId: string; explanation: string }[];
  openQuestions: { id: string; reason: "INSUFFICIENT_EVIDENCE" | "CONTRADICTORY_SOURCE" | "UNKNOWN_ATTRIBUTION"; question: string; anchor: SourceAnchor | null }[];
};

/** Structural grounding only. Never a human source-verification or approval receipt. */
export type ValidatedEvidenceAnalysisCandidate = Immutable<{
  payload: EvidenceAnalysisCandidate;
  candidateHash: string;
  trust: "PROVISIONAL_CANDIDATE";
}>;
