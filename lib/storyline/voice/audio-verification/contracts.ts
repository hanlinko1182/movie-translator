import type { Immutable } from "../../contracts";
import type { NarrationReference, SyntheticVoiceCapability, VoiceChunk, fakeVoiceRestrictions } from "../foundation/contracts";

export const AUDIO_VERIFICATION = {
  measurement: "story-synthetic-pcm-measurement-v1",
  receipt: "story-synthetic-audio-verification-v1",
  collection: "story-synthetic-audio-collection-v1",
  validator: "STRICT_RIFF_PCM16_MONO_V1",
  durationPolicy: "PCM_DURATION_US_NEAREST_TIES_UP_V1",
  maxAudioBytes: 4 * 1024 * 1024,
  maxCollectionAudioBytes: 16 * 1024 * 1024,
  maxReceiptBytes: 64 * 1024,
  maxManifestBytes: 2 * 1024 * 1024,
} as const;
export type PcmMeasurement = Immutable<{
  schemaVersion: typeof AUDIO_VERIFICATION.measurement;
  validator: typeof AUDIO_VERIFICATION.validator;
  format: { container: "WAV"; codec: "PCM16_LE"; sampleRateHz: 24000 | 48000; channels: 1; bitDepth: 16; blockAlign: 2; byteRate: number };
  fileBytes: number; dataBytes: number; dataOffset: number; audioSha256: string;
  sampleCount: number; durationUs: number; durationPolicy: typeof AUDIO_VERIFICATION.durationPolicy;
}>;
export type SyntheticVerificationPayload = Immutable<{
  schemaVersion: typeof AUDIO_VERIFICATION.receipt; execution: "FAKE_ONLY";
  evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY"; speech: "NOT_VERIFIED";
  planHash: string; reference: NarrationReference; voice: SyntheticVoiceCapability; chunk: VoiceChunk;
  fake: { requestHash: string; requestId: string; submissionId: string; recipeHash: string; sourceArtifactId: string; sourceMetadataHash: string };
  audio: PcmMeasurement; restrictions: typeof fakeVoiceRestrictions;
}>;
export type SyntheticAudioReceipt = Immutable<{ receipt: SyntheticVerificationPayload; receiptHash: string }>;
export type SyntheticCollectionPayload = Immutable<{
  schemaVersion: typeof AUDIO_VERIFICATION.collection; execution: "FAKE_ONLY";
  evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY"; speech: "NOT_VERIFIED";
  planHash: string; reference: NarrationReference; voice: SyntheticVoiceCapability;
  entries: { chunk: VoiceChunk; receiptHash: string; audioSha256: string; audioBytes: number; sampleCount: number; durationUs: number }[];
  totals: { fileBytes: number; dataBytes: number; sampleCount: number; sampleRateHz: 24000; durationUs: number; durationPolicy: typeof AUDIO_VERIFICATION.durationPolicy };
  restrictions: typeof fakeVoiceRestrictions;
}>;
export type SyntheticAudioCollection = Immutable<{ manifest: SyntheticCollectionPayload; manifestHash: string }>;
