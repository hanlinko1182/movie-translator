import type { Immutable } from "../contracts";

/** M5 handoff only. No provider, approved voice, cost or authority is installed. */
export const VOICE_HANDOFF = { version: "story-voice-request-proposal-v1", hashDomain: "story-voice-request-proposal-v1",
  maxBytes: 16384, maxChunks: 720, language: "my", locale: "my-MM" } as const;
export type VoiceApprovalReference = { approvalId: string; approvalHash: string; policyVersion: string; verificationDependencyHash: string };
export type VoiceRequestProposal = {
  schemaVersion: typeof VOICE_HANDOFF.version; execution: "DISABLED_HANDOFF_ONLY";
  scope: { projectId: string; movieId: string; studioId: string };
  narration: { draftId: string; draftHash: string; sectionId: string; sectionOrder: number;
    chunkIndex: number; chunkCount: number; textHash: string };
  source: { snapshotId: string; contentHash: string; contextHash: string; dependencyHash: string; bindingHash: string; mediaSha256: string; studioRevision: number };
  analysis: { candidateId: string; candidateHash: string; taskId: string; generation: number; resultId: string; resultHash: string; recipeHash: string };
  approval: VoiceApprovalReference | null;
  language: typeof VOICE_HANDOFF.language; locale: typeof VOICE_HANDOFF.locale;
  voice: { providerId: string; modelId: string; voiceId: string; profileId: string; profileHash: string;
    capabilityEvidenceHash: string; delivery: "MEASURED" | "REFLECTIVE" | "TENSE"; cloning: "NONE" };
  audio: { format: "WAV_PCM16"; sampleRateHz: 24000 | 48000; channels: 1 };
  cost: { quoteId: string; policyVersion: string; currency: "USD"; estimatedUsdMicros: number;
    maxUsdMicros: number; expiresAt: string } | null;
  spending: { decisionId: string; confirmationId: string; scopeHash: string; expiresAt: string } | null;
};
export type ParsedVoiceProposal = Immutable<{ proposal: VoiceRequestProposal; proposalHash: string; executable: false }>;

/** Future server-resolved provider capability evidence. No entries currently
 * exist. Burmese language/voice/style/format must be tested per exact version. */
export type VoiceCapabilityManifest = Immutable<{
  providerId: string; modelId: string; voiceId: string; profileId: string; profileHash: string;
  language: "my"; locale: "my-MM"; deliveries: VoiceRequestProposal["voice"]["delivery"][];
  audioFormats: VoiceRequestProposal["audio"][]; supportEvidenceHash: string; verifiedAt: string;
  maxTextBytes: number; maxConcurrentRequests: number; quotePolicyVersion: string;
}>;

/** Future provider-neutral adapter contract, not an implemented send path.
 * Only a checkpoint service may eventually issue the non-serializable permit;
 * no such issuer exists in this milestone. */
declare const voicePermit: unique symbol;
export type VoiceSendPermit = { readonly [voicePermit]: true };
export interface FutureVoiceAdapter {
  synthesize(input: Readonly<{ requestHash: string; submissionId: string; exactMyanmarText: string;
    voice: VoiceRequestProposal["voice"]; audio: VoiceRequestProposal["audio"] }>,
    permit: VoiceSendPermit, signal: AbortSignal): Promise<
      | { outcome: "DEFINITIVE_AUDIO"; bytes: Uint8Array; providerRequestId: string | null; reportedUsdMicros: number | null }
      | { outcome: "DEFINITIVE_FAILURE"; safeCode: string }
      | { outcome: "UNKNOWN"; reason: "TIMEOUT" | "CONNECTION_LOST" | "AMBIGUOUS_RESPONSE" }
    >;
}

/** Proposed safe artifact metadata after independent byte/duration validation.
 * Never use a script estimate as measured duration or return a private path. */
export type VoiceAudioArtifact = Immutable<{
  schemaVersion: "story-voice-audio-artifact-v1"; artifactId: string;
  narrationDraftId: string; narrationDraftHash: string; sectionId: string; sectionOrder: number;
  chunkIndex: number; chunkCount: number; textHash: string; requestHash: string; submissionId: string;
  providerId: string; modelId: string; voiceId: string; profileHash: string; approvalHash: string;
  sourceContextHash: string; nativeAudioSha256: string; audioSha256: string; bytes: number;
  format: VoiceRequestProposal["audio"];
  measured: { durationMs: number; method: "FFPROBE"; measuredAt: string };
  originalMovieAudio: "EXCLUDED"; clonedVoice: false;
}>;
