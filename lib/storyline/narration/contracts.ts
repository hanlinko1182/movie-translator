import type { Immutable, StoryBeat, StorySourceSnapshot } from "../contracts";
import { LIMITS, STORYLINE } from "../contracts";
import type { AutoStoryPolicy } from "../duration-contracts";
import type { EvidenceAnalysisCandidate } from "../evidence-analysis/contracts";

/** M4 handoff types only. No parser, generator, persistence or approval issuer
 * is installed. An object satisfying these types never establishes authority. */
export const NARRATION_DRAFT = {
  version: "story-narration-draft-v1", hashDomain: "story-narration-draft-v1",
  language: "my", style: STORYLINE.style, durationMode: STORYLINE.durationMode,
  translationPolicy: STORYLINE.translationPolicy,
  maxBytes: LIMITS.scriptBytes, maxBeats: LIMITS.beats, maxClaimsPerBeat: LIMITS.claimsPerBeat,
  maxParagraphsPerBeat: LIMITS.claimsPerBeat, maxTextPerBeat: LIMITS.narrationPerBeat,
  maxTextTotal: LIMITS.narrationTotal,
} as const;

export type NarrationAnalysisDependency = {
  candidateId: string; candidateHash: string; candidateSchemaVersion: EvidenceAnalysisCandidate["schemaVersion"];
  candidateOrigin: EvidenceAnalysisCandidate["origin"];
  taskId: string; generation: number; resultId: string; resultHash: string; submissionId: string;
  recipeHash: string; profileDefinitionHash: string;
};
export type NarrationSourceBinding = EvidenceAnalysisCandidate["source"] & {
  expectedStudioRevision: number; mediaSha256: StorySourceSnapshot["payload"]["media"]["sha256"];
};

/** A missing supported budget stays null. Neither candidate count nor English
 * word count establishes voice duration. Measured TTS belongs to a later phase. */
export type NarrationDurationTarget =
  | { status: "UNAVAILABLE"; reason: "PENDING_SOURCE_VERIFICATION" | "INSUFFICIENT_VISUAL_COVERAGE" | "UNCALIBRATED_POLICY";
      planInputHash: null; verificationDependencyHash: null; policy: null; budgetMs: null }
  | { status: "SUPPORTED_PLANNING_BUDGET"; planInputHash: string; verificationDependencyHash: string;
      policy: AutoStoryPolicy; budgetMs: number };

export type NarrationSection = {
  beatId: string; order: number; heading: string;
  focus: "CHARACTER_BEHAVIOR" | "QUALIFIED_MOTIVATION" | "PSYCHOLOGICAL_TENSION" | "DECISION" | "RELATIONSHIP_CHANGE" | "CONSEQUENCE" | "RESOLUTION";
};
export type NarrationParagraphAnnotation = {
  beatId: string; paragraphIndex: number;
  uncertainty: "OBSERVED_ONLY" | "QUALIFIED_INFERENCE" | "COMPETING_INTERPRETATIONS" | "INSUFFICIENT_EVIDENCE";
  pacing: { intent: "MEASURED" | "REFLECTIVE" | "TENSE"; targetDurationMs: number | null };
};
export type NarrationClaimLineage = {
  claimId: string; candidateFindingIds: string[];
  change: "PRESERVED_INTERPRETATION" | "HUMAN_REVISED" | "NEW_HUMAN_CLAIM";
};

/** Generation/edit input cannot carry APPROVED or SOURCE_VERIFIED. M1 claims
 * preserve observed/inferred classification, cautious qualification, Chinese
 * anchors, character ownership, and advisory translation row hashes. */
export type NarrationDraftPayload = {
  schemaVersion: typeof NARRATION_DRAFT.version; id: string; version: number;
  parentDraft: { id: string; hash: string } | null;
  language: typeof NARRATION_DRAFT.language; style: typeof NARRATION_DRAFT.style;
  durationMode: typeof NARRATION_DRAFT.durationMode; translationContextPolicy: typeof NARRATION_DRAFT.translationPolicy;
  origin: "SYNTHETIC_TEST" | "MODEL_DRAFT" | "HUMAN_EDIT";
  source: NarrationSourceBinding; analysis: NarrationAnalysisDependency;
  // Exact Myanmar text lives in beat.narration; no second editable text copy.
  beats: StoryBeat[]; sections: NarrationSection[];
  paragraphs: NarrationParagraphAnnotation[]; claimLineage: NarrationClaimLineage[];
  duration: NarrationDurationTarget;
  review: { status: "UNREVIEWED" | "NEEDS_HUMAN_REVIEW"; approval: "PROVISIONAL" };
};
export type NarrationDraft = Immutable<{ payload: NarrationDraftPayload; draftHash: string }>;

/** Proposed future server-derived read DTO, never an approval request. Issuance
 * is not implemented. Synthetic lineage is permanently ineligible for approval. */
export type NarrationReviewView = Immutable<{
  draftId: string; draftHash: string; sourceContextHash: string;
  currentness: "CURRENT_AT_READ" | "STALE";
  sourceReview: "PENDING" | "BLOCKED" | "SOURCE_ELIGIBLE";
  blockingFindingCodes: string[];
} & (
  | { approval: "PROVISIONAL"; approvalBinding: null }
  | { approval: "APPROVED"; approvalBinding: {
      approvalId: string; draftHash: string; sourceContextHash: string;
      verificationDependencyHash: string; reviewPolicyVersion: string; approvedAt: string;
    } }
)>;
