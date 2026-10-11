import type { Confidence, RelationshipType } from "@/lib/character-analysis/types";
import type { QcCategory, ReviewStatus } from "@/lib/translation-qc/types";
import type { RecapOutput } from "@/lib/recap/types";

export const STORYLINE = {
  sourceVersion: "story-source-v1", scriptVersion: "story-script-v1",
  verificationVersion: "story-source-verification-v1", durationVersion: "story-duration-v1",
  style: "CHARACTER_PSYCHOLOGY", durationMode: "AUTO_STORY_COMPLEXITY", translationPolicy: "ALL_CURRENT",
} as const;

// Versioned safety ceilings, not storytelling targets or calibrated duration coefficients.
export const LIMITS = {
  snapshotBytes: 16 * 1024 * 1024, scriptBytes: 512 * 1024, receiptBytes: 32 * 1024,
  segments: 10000, scenes: 10000, entities: 200, text: 6000, qcPerRow: 64,
  beats: 60, claimsPerBeat: 12, anchors: 8, narrationPerBeat: 1200,
  narrationTotal: 36000, events: 200, claimsPerEvent: 12, anchorPairs: 50000,
} as const;

export type Immutable<T> = T extends readonly (infer U)[] ? readonly Immutable<U>[]
  : T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export type Identity = { projectId: string; movieId: string };
export type SourceAnchor = { movieId: string; transcriptId: string; sceneSequence: number; segmentSequence: number };
export type TranscriptRow = { id: string; transcriptId: string; sequence: number; startMs: number; endMs: number; text: string };
export type SceneInterval = { id: string; movieId: string; sequence: number; startMs: number; endMs: number };
export type EvidenceAllowance = { anchor: SourceAnchor; confidence: Confidence; evidenceText: string; inference: string };
export type StoryCharacter = Identity & { id: string; name: string; uncertain: boolean; evidence: EvidenceAllowance[] };
export type StoryRelationship = Identity & {
  id: string; characterAId: string; characterBId: string; type: RelationshipType;
  summary: string; confidence: Confidence; evidence: EvidenceAllowance[];
};
export type QcMetadata = {
  id: string; translatedSegmentId: string; category: QcCategory; severity: "INFO" | "WARNING" | "ERROR";
  source: "HEURISTIC" | "MODEL" | "MANUAL"; message: string;
  createdAt: string; updatedAt: string; resolvedAt: string | null; resolution: string | null;
};
export type TranslationRow = {
  id: string; translationId: string; sequence: number; startMs: number; endMs: number; text: string;
  revision: number; origin: "UNKNOWN" | "MODEL" | "TRANSLATION_MEMORY" | "REFINED" | "MANUAL";
  provider: string | null; model: string | null; refinementJobId: string | null;
  reviewStatus: ReviewStatus; manualSourceHash: string | null;
  createdAt: string; editedAt: string | null; reviewedAt: string | null; qcIssues: QcMetadata[];
};
export type TranslationContext = {
  id: string; movieId: string; sourceTranscriptId: string; sourceLanguage: string; targetLanguage: string;
  revision: number; provider: string; model: string; createdAt: string; updatedAt: string;
  qcScannedAt: string | null; rows: TranslationRow[];
};
export type StorySourcePayload = Identity & {
  schemaVersion: typeof STORYLINE.sourceVersion; id: string; capturedAt: string;
  sourceLanguage: "zh" | "cmn"; targetLanguage: "my";
  media: { sha256: string; bytes: number; durationMs: number };
  transcript: { id: string; movieId: string; language: "zh" | "cmn"; segments: TranscriptRow[] };
  scenes: SceneInterval[];
  characterContext: "CURRENT"; characters: StoryCharacter[]; relationships: StoryRelationship[];
  translationContextPolicy: typeof STORYLINE.translationPolicy; translation: TranslationContext | null;
  preparation?: StoryPreparationContext;
};
// Optional for M1-A fixtures; authoritative M1-B candidates always include this section.
export type StoryVideoMetadata = {
  format: string; videoIndex: number; videoCodec: string; width: number; height: number;
  timeBase: string; frameRate: string; hasAudio: boolean;
};
export type StoryCapturedObservation = {
  id: string; ownerKind: "CHARACTER" | "RELATIONSHIP"; ownerId: string; anchor: SourceAnchor;
  sceneId: string; transcriptSegmentId: string; kind: string;
  evidenceText: string; inference: string; confidence: Confidence;
  relationshipType: RelationshipType | null; relationshipSummary: string | null;
  createdAt: string; updatedAt: string | null;
};
export type StoryLegacyRecap = {
  id: string; sourceHash: string; sourceTranscriptId: string; characterAnalysisRunId: string;
  provider: string; model: string; language: "my"; createdAt: string; updatedAt: string;
  childIds: { sections: string[]; characterInsights: string[]; relationshipInsights: string[]; evidence: string[] };
  output: RecapOutput;
};
export type StoryPreparationContext = {
  policyVersion: "story-source-preparation-v1"; dependencyHash: string; sourceBindingHash: string;
  translationQcState: "TRANSLATION_MISSING" | "UNSCANNED" | "SCAN_RECORDED";
  video: StoryVideoMetadata;
  characterAnalysis: { id: string; sourceHash: string; provider: string; model: string; createdAt: string; updatedAt: string };
  aliases: { characterId: string; values: string[] }[];
  observations: StoryCapturedObservation[];
  legacyRecapState: "ABSENT" | "EXCLUDED_STALE" | "EXCLUDED_INVALID" | "CURRENT_ADVISORY";
  legacyRecap: StoryLegacyRecap | null;
};
export type AdmissionReason = "MISSING" | "SOURCE_TRANSCRIPT_CHANGED" | "LANGUAGE_MISMATCH"
  | "TIMING_MISMATCH" | "EMPTY_TARGET" | "MANUAL_SOURCE_CHANGED" | "ORPHAN_SEQUENCE";
export type TranslationAdmission =
  | { status: "ADMITTED"; sequence: number; row: Immutable<TranslationRow>; rowContextHash: string }
  | { status: "MISSING"; sequence: number; reason: "MISSING"; rowId: null }
  | { status: "EXCLUDED_STALE" | "EXCLUDED_INVALID"; sequence: number; reason: AdmissionReason; rowId: string; rowContextHash: string };
export type StorySourceSnapshot = {
  payload: Immutable<StorySourcePayload>; admissions: readonly TranslationAdmission[];
  sourceContentHash: string; sourceContextHash: string;
};
export type TranslationContextRef = { translationSegmentId: string; rowContextHash: string };
type ClaimBase = {
  id: string; statement: string; confidence: Confidence; characterRefs: string[]; relationshipRef: string | null;
  evidence: SourceAnchor[]; translationContextRefs: TranslationContextRef[];
};
export type StoryClaim = (ClaimBase & { kind: "OBSERVED" }) | (ClaimBase & {
  kind: "INFERRED"; inferenceBasisClaimIds: string[]; qualification: string;
});
export const BEAT_CATEGORIES = ["SETUP", "OBSERVATION", "CONFLICT", "DECISION", "CONSEQUENCE", "RELATIONSHIP_CHANGE", "TURNING_POINT", "RESOLUTION"] as const;
export type StoryBeat = {
  id: string; order: number; category: typeof BEAT_CATEGORIES[number]; startMs: number; endMs: number;
  narration: { text: string; claimIds: string[] }[]; claims: StoryClaim[];
};
export type StoryScriptPayload = {
  schemaVersion: typeof STORYLINE.scriptVersion; id: string; version: number; parentVersionId: string | null;
  sourceSnapshotId: string; sourceContentHash: string; sourceContextHash: string;
  style: typeof STORYLINE.style; durationMode: typeof STORYLINE.durationMode;
  translationContextPolicy: typeof STORYLINE.translationPolicy; language: "my";
  origin: "MODEL" | "HUMAN"; beats: StoryBeat[];
};
export type StoryScriptVersion = { payload: Immutable<StoryScriptPayload>; scriptHash: string };
export const EVENT_KINDS = ["ACTION", "CONFLICT", "DECISION", "OUTCOME", "RELATIONSHIP_CHANGE"] as const;
export type StoryEvent = {
  id: string; kind: typeof EVENT_KINDS[number]; startMs: number; endMs: number;
  claimIds: string[]; precedingEventIds: string[];
};
export type SourceVerificationReceipt = Identity & {
  schemaVersion: typeof STORYLINE.verificationVersion; id: string; issuer: "HUMAN";
  sourceSnapshotId: string; sourceContentHash: string; sourceContextHash: string;
  claimId: string; claimContentHash: string; anchorSetHash: string; allowedAnchorSetHash: string;
  translationContextRefs: TranslationContextRef[]; basisClaimHashes: { claimId: string; hash: string }[];
  qualificationHash: string; policyVersion: typeof STORYLINE.verificationVersion;
  outcome: "SUPPORTED" | "UNSUPPORTED" | "INCONCLUSIVE";
  operatorLabel: string; rationale: string; verifiedAt: string;
};
export type ClaimReview = {
  claimId: string; verificationStatus: "PENDING_SOURCE_REVIEW" | "PROVISIONAL_TRANSLATION_CONTEXT" | "SOURCE_VERIFIED" | "UNSUPPORTED_OR_INVALID_EVIDENCE";
  reviewStatus: "NEEDS_HUMAN_REVIEW" | "ACCEPTED" | "BLOCKED"; receiptId: string | null;
};
// Server-owned adapter boundary. Never implement this by echoing request/provider receipts.
export type TrustedReceiptLookup = (receiptId: string) => unknown | undefined;
export type SourceReviewEligibility = {
  scriptHash: string; sourceContextHash: string; claims: readonly ClaimReview[];
  sourceEligible: boolean; dependencyHash: string;
};
export type AutoDurationPolicyIdentity = { id: "auto-story-v1"; coefficientSetId: string; calibrationId: string | null };
export type AutoDurationInput = {
  schemaVersion: typeof STORYLINE.durationVersion; mode: typeof STORYLINE.durationMode;
  sourceContextHash: string; scriptHash: string; verificationDependencyHash: string;
  policy: AutoDurationPolicyIdentity; sourceRuntimeMs: number;
  supportedEventIds: readonly string[]; pendingEventIds: readonly string[];
};
export type AutoDurationOutput = {
  schemaVersion: typeof STORYLINE.durationVersion; inputHash: string; policy: AutoDurationPolicyIdentity;
  status: "PENDING_SOURCE_VERIFICATION" | "BUDGET_AVAILABLE";
  softFloorMs: number | null; capMs: number | null; suggestedBudgetMs: number | null;
  estimatedVoiceDurationMs: number | null;
};
