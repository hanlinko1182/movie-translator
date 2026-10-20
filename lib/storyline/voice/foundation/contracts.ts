import type { Immutable } from "../../contracts";
import type { NarrationAnalysisDependency, NarrationSourceBinding } from "../../narration/contracts";

/** New planning protocol. Existing disabled M5 v1 contracts are unchanged. */
export const VOICE_FOUNDATION = {
  reference: "story-voice-narration-reference-v2", plan: "story-voice-chunk-plan-v1",
  text: "story-voice-chunk-text-v1", section: "story-voice-section-text-v2",
  capability: "story-voice-synthetic-capability-v1", profile: "story-voice-fake-profile-v1",
  request: "story-voice-fake-request-v2", recipe: "story-voice-fake-recipe-v1",
  artifact: "story-voice-synthetic-audio-artifact-v2", maxBytes: 1048576,
  maxChunkBytes: 16384, maxChunks: 720, maxRequests: 256,
} as const;
export type M4Identity = { kind: "M4_ORIGINAL"; id: string; hash: string; hashDomain: "story-narration-draft-v1" };
export type EditedIdentity = { kind: "R4_EDITED"; id: string; hash: string; hashDomain: "story-edited-narration-v1";
  version: number; previous: { id: string; hash: string; hashDomain: "story-edited-narration-v1" } | null };
export type NarrationReference = {
  schemaVersion: typeof VOICE_FOUNDATION.reference;
  scope: { projectId: string; movieId: string; studioId: string };
  original: { id: string; hash: string; hashDomain: "story-narration-draft-v1"; payloadId: string;
    parentDraft: { id: string; hash: string; hashDomain: "story-narration-draft-v1" } | null };
  source: NarrationSourceBinding; analysis: NarrationAnalysisDependency;
  artifact: M4Identity | EditedIdentity | {
    kind: "FUTURE_APPROVED_REFERENCE"; id: string; hash: string; hashDomain: "story-approved-narration-v1";
    parent: M4Identity | EditedIdentity;
    approval: { id: string; hash: string; hashDomain: "story-narration-approval-v1"; policyVersion: string; verificationDependencyHash: string };
    verification: "NOT_VERIFIED_BY_PLANNING";
  };
};
export type VoiceSectionInput = { sectionId: string; order: number; paragraphs: string[]; separators: string[] };
export type SyntheticVoiceCapability = {
  schemaVersion: typeof VOICE_FOUNDATION.capability; execution: "FAKE_ONLY";
  providerId: "synthetic-voice"; voiceId: "fixture-neutral" | "fixture-alternate";
  profileId: "fixed-bytes-v1"; profileHash: string; language: "my"; locale: "my-MM";
  maxChunkBytes: number; declaredFormat: { container: "WAV"; codec: "PCM16_LE"; sampleRateHz: 24000; channels: 1 };
  support: "UNVERIFIED_SYNTHETIC_FIXTURE"; cloning: "NONE"; originalMovieAudio: "EXCLUDED";
};
export type VoicePlanInput = { reference: NarrationReference; sections: VoiceSectionInput[]; capability: SyntheticVoiceCapability };
export type VoiceChunk = { index: number; sectionId: string; sectionOrder: number; sectionChunkIndex: number; sectionChunkCount: number;
  startUtf16: number; endUtf16: number; text: string; utf8Bytes: number; textHash: string };
export type VoiceChunkPlan = Immutable<VoicePlanInput & {
  schemaVersion: typeof VOICE_FOUNDATION.plan; execution: "FAKE_ONLY";
  segmentation: { algorithm: "INTL_MY_EXTENDED_GRAPHEME"; unicodeVersion: string; icuVersion: string };
  sectionHashes: { sectionId: string; textHash: string }[]; chunks: VoiceChunk[];
  estimatedDurationMs: null;
}>;
export type VoicePlan = Immutable<{ plan: VoiceChunkPlan; planHash: string }>;
export const fakeVoiceRestrictions = Object.freeze({
  humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false, eligibleForPublication: false,
  spendingAuthority: "NONE", syntheticAncestry: true,
} as const);
export type FakeVoiceRequest = { schemaVersion: typeof VOICE_FOUNDATION.request; execution: "FAKE_ONLY";
  idempotencyKey: string; plan: VoicePlan; chunkIndex: number };
/** Future measured metadata needs a separately versioned validator/receipt.
 * M5-01 only constructs UNVERIFIED_FIXTURE, with duration strictly null. */
export type SyntheticAudioMetadata = Immutable<{
  schemaVersion: typeof VOICE_FOUNDATION.artifact; origin: "SYNTHETIC_TEST_AUDIO";
  artifactId: string; reference: NarrationReference; voice: SyntheticVoiceCapability;
  recipeHash: string; planHash: string; requestHash: string; requestId: string; fakeSubmissionId: string;
  chunk: VoiceChunk; audioSha256: string; nativeAudioSha256: string; bytes: number;
  format: SyntheticVoiceCapability["declaredFormat"]; formatVerification: "UNVERIFIED_FIXTURE";
  measurement: { status: "UNVERIFIED_FIXTURE"; durationMs: null };
  originalMovieAudio: "EXCLUDED"; cloning: "NONE"; restrictions: typeof fakeVoiceRestrictions;
}>;
export type FakeVoiceResult = Immutable<{
  schemaVersion: "story-voice-fake-result-v1"; requestId: string; fakeSubmissionId: string; requestHash: string;
  restrictions: typeof fakeVoiceRestrictions;
} & (
  | { outcome: "FIXTURE_BYTES"; metadata: SyntheticAudioMetadata; metadataHash: string }
  | { outcome: "UNKNOWN"; reason: "AMBIGUOUS_FAKE_COMPLETION" }
  | { outcome: "DEFINITIVE_FAILURE"; safeCode: "SYNTHETIC_FAILURE" }
)>;
