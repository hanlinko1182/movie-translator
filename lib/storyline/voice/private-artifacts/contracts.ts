import type { Immutable } from "../../contracts";
import type { SyntheticAudioReceipt, SyntheticAudioCollection } from "../audio-verification/contracts";
import type { fakeVoiceRestrictions } from "../foundation/contracts";

export const PRIVATE_FAKE_AUDIO = {
  expectation: "story-private-fake-audio-expectation-v1",
  artifact: "story-private-fake-audio-artifact-v1",
  ownership: "story-private-fake-audio-ownership-v1",
  collection: "story-private-fake-audio-collection-v1",
  maxOwners: 32, maxSubmissions: 720, maxArtifacts: 720,
  maxAudioBytes: 16 * 1024 * 1024, maxMetadataBytes: 16 * 1024 * 1024,
  maxTick: 2147483647,
} as const;
/** Runtime membership in a factory-private WeakMap is mandatory. */
export type FakeOwnerCapability = Readonly<{ toJSON(): never }>;
export type FakeSubmissionCapability = Readonly<{ toJSON(): never }>;
export type FakeSubmissionState = "PENDING" | "SUCCESS" | "DEFINITIVE_FAILURE" | "UNKNOWN" | "CANCELLED";
export type PrivateArtifactPayload = Immutable<{
  schemaVersion: typeof PRIVATE_FAKE_AUDIO.artifact; execution: "FAKE_ONLY"; storage: "EPHEMERAL_PROCESS_MEMORY";
  artifactId: string; owner: { ownerId: string; generation: number; expiresAtTick: number };
  scope: { projectId: string; movieId: string; studioId: string };
  expectedHash: string; planHash: string; verified: SyntheticAudioReceipt;
  restrictions: typeof fakeVoiceRestrictions;
}>;
export type PrivateArtifactView = Immutable<{ artifact: PrivateArtifactPayload; ownershipHash: string }>;
export type PrivateCollectionView = Immutable<{
  schemaVersion: typeof PRIVATE_FAKE_AUDIO.collection; execution: "FAKE_ONLY"; storage: "EPHEMERAL_PROCESS_MEMORY";
  scope: { projectId: string; movieId: string; studioId: string }; ownerId: string; generation: number;
  collection: SyntheticAudioCollection;
  artifacts: { chunkIndex: number; artifactId: string; ownershipHash: string; expectedHash: string }[];
  restrictions: typeof fakeVoiceRestrictions;
}>;
