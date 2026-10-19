import type { Immutable, StorySourcePayload } from "../contracts";
import type { CandidateEvidence, CandidateFinding } from "../evidence-analysis/contracts";
import type { NarrationDraft, SyntheticNarrationContext } from "../narration/contracts";
import type { EditedVersionPayload } from "../studio-versions/contracts";
import type { NarrationReference, fakeVoiceRestrictions } from "../voice/foundation/contracts";

export const HIGHLIGHTS = {
  input: "story-highlight-input-v1", source: "story-highlight-source-v1", candidate: "story-highlight-candidate-v1",
  rubric: "story-highlight-rubric-v1", policy: "story-highlight-policy-v1", plan: "story-highlight-plan-v1",
  capture: "story-highlight-synthetic-capture-v1", audio: "story-highlight-synthetic-audio-ref-v1",
  maxBytes: 2 * 1024 * 1024, captureBytes: 24 * 1024 * 1024, maxCandidates: 1600, maxClips: 64,
} as const;
export const highlightRestrictions = Object.freeze({
  execution: "SYNTHETIC_ONLY", persistence: "NOT_PERSISTED", humanApproval: "NONE", sourceVerified: false,
  eligibleForRealTts: false, eligibleForPublication: false, originalMovieAudio: "EXCLUDED", voiceSynchronization: "UNSUPPORTED",
} as const);
export type HighlightCurrentness = { sourceRevision: number; narrationRevision: number; observedAt: string };
export type HighlightSourceReference = {
  schemaVersion: typeof HIGHLIGHTS.source; narration: NarrationReference;
  media: StorySourcePayload["media"]; currentness: HighlightCurrentness;
};
/** A structural test reference only, never audio bytes, measured timing or authority. */
export type HighlightAudioReference = {
  schemaVersion: typeof HIGHLIGHTS.audio; artifactId: string; artifactHash: string; planHash: string;
  reference: NarrationReference; execution: "FAKE_ONLY"; evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY";
  speech: "NOT_VERIFIED"; verification: "REFERENCE_ONLY"; restrictions: typeof fakeVoiceRestrictions;
};
export type HighlightPolicy = {
  schemaVersion: typeof HIGHLIGHTS.policy; rubricVersion: typeof HIGHLIGHTS.rubric;
  maxClips: number; maxTotalSourceMs: number; minClipMs: number; maxClipMs: number;
  coverage: { characterIds: string[]; relationshipIds: string[]; mode: "REQUIRE" };
  overlap: "REJECT"; transition: "CUT_ONLY"; presentation: "SOURCE_CHRONOLOGY" | "SCORE_ORDER";
};
export type HighlightInput = {
  schemaVersion: typeof HIGHLIGHTS.input; execution: "SYNTHETIC_ONLY";
  source: HighlightSourceReference; policy: HighlightPolicy; audio: HighlightAudioReference | null;
};
export type SyntheticHighlightCapture = {
  schemaVersion: typeof HIGHLIGHTS.capture; execution: "SYNTHETIC_ONLY";
  context: SyntheticNarrationContext; original: NarrationDraft; storedOriginal: { id: string; draftHash: string };
  edit: { payload: EditedVersionPayload; contentHash: string } | null;
  current: HighlightSourceReference;
};
export const RESOLUTION_FAILURES = ["STALE_SOURCE", "STALE_MEDIA", "CHANGED_CANDIDATE", "CHANGED_NARRATION",
  "MISSING_EVIDENCE", "UNAUTHORIZED", "UNSUPPORTED", "INSUFFICIENT_INFORMATION", "INVALID_CAPTURE"] as const;
export type HighlightResolutionFailure = typeof RESOLUTION_FAILURES[number];
export type HighlightResolution = { status: "CAPTURED_SYNTHETIC"; capture: SyntheticHighlightCapture }
  | { status: HighlightResolutionFailure };
/** Inject only from an isolated fixture owner. This interface is not production authentication. */
export interface SyntheticHighlightResolver {
  resolve(scope: Immutable<NarrationReference["scope"]>): HighlightResolution;
}
export type HighlightFactor = "evidenceReliability" | "development" | "behavior" | "relationship" | "narrative"
  | "confidence" | "certainty" | "contradictionSafety" | "diversity" | "availability";
export type HighlightScoringRubric = { schemaVersion: typeof HIGHLIGHTS.rubric; maxFactor: 3; weights: Record<HighlightFactor, number> };
export const HIGHLIGHT_RUBRIC: Immutable<HighlightScoringRubric> = Object.freeze({
  schemaVersion: HIGHLIGHTS.rubric, maxFactor: 3,
  weights: Object.freeze({ evidenceReliability: 4, development: 3, behavior: 2, relationship: 2, narrative: 2,
    confidence: 2, certainty: 2, contradictionSafety: 3, diversity: 1, availability: 1 }),
});
export type HighlightEvidence = { reference: CandidateEvidence; startMs: number; endMs: number; sourceText: string };
export type HighlightCandidate = {
  schemaVersion: typeof HIGHLIGHTS.candidate; id: string; findingId: string; claimIds: string[];
  startMs: number; endMs: number; intervalPolicy: "CONNECTED_EVIDENCE_INTERSECTIONS";
  characterIds: string[]; relationshipId: string | null;
  classification: CandidateFinding["classification"]; category: CandidateFinding["category"]; statement: string;
  confidence: CandidateFinding["confidence"]; uncertainty: CandidateFinding["uncertainty"]; qualification: string | null;
  observedBasisIds: string[]; evidence: HighlightEvidence[];
  contradictions: { findingId: string; explanation: string }[];
  factors: Record<HighlightFactor, number>; totalScore: number; explanations: string[];
};
export type HighlightDecision = { candidateId: string; status: "SELECTED" | "EXCLUDED";
  reason: "SELECTED_BY_RUBRIC" | "NO_NARRATION_CLAIM" | "NO_SOURCE_INTERVAL" | "BELOW_MIN_DURATION" | "ABOVE_MAX_DURATION"
    | "DUPLICATE_INTERVAL" | "OVERLAP" | "CLIP_LIMIT" | "DURATION_BUDGET" };
export type HighlightPlanPayload = {
  schemaVersion: typeof HIGHLIGHTS.plan; input: HighlightInput; inputHash: string;
  restrictions: typeof highlightRestrictions; rubric: typeof HIGHLIGHT_RUBRIC;
  status: "PLANNED" | "INSUFFICIENT_INFORMATION";
  candidates: HighlightCandidate[]; decisions: HighlightDecision[];
  sourceOrder: string[]; presentationOrder: string[];
  gaps: { afterCandidateId: string; beforeCandidateId: string; startMs: number; endMs: number; kind: "INTENTIONAL_SOURCE_OMISSION" }[];
  totalSourceMs: number;
  coverage: { characterIds: string[]; relationshipIds: string[]; missingCharacterIds: string[]; missingRelationshipIds: string[] };
};
export type HighlightPlan = Immutable<{ plan: HighlightPlanPayload; planHash: string }>;
export class HighlightError extends Error {
  constructor(readonly code: HighlightResolutionFailure | "INVALID_INPUT" | "INVALID_PLAN") {
    super("Synthetic highlight planning rejected"); this.name = "HighlightError";
  }
}
