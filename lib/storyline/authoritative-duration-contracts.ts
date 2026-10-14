import type { Immutable } from "./contracts";
import type { AutoStoryPolicy, StoryComplexityInventory } from "./duration-contracts";
import type { calculateUntrustedStoryDuration } from "./duration-engine";

export const AUTHORITATIVE_DURATION = Object.freeze({ version: "story-durable-duration-observation-v1", bytes: 2 * 1024 * 1024 } as const);
export type DurableDurationRequest = {
  projectId: string; movieId: string; studioId: string; sourceSnapshotId: string; scriptVersionId: string;
  expectedRevision: number; policyHash: string; inventory: StoryComplexityInventory;
};
export type DurationObservationBinding = {
  projectId: string; movieId: string; studioId: string; sourceSnapshotId: string; scriptVersionId: string;
  sourceContentHash: string; sourceContextHash: string; scriptHash: string; studioRevision: number;
  verificationPolicy: string; verificationBindingPolicy: string; receiptSchemaVersion: string; issuerPolicy: string; rubricVersion: string; ledgerHeadHash: string;
  verificationDependencyHash: string; durationPolicy: AutoStoryPolicy["id"]; durationPolicyHash: string;
  durationEngineVersion: string; inputHash: string; currentness: "CURRENT_AT_READ_SNAPSHOT";
};
export type AuthoritativeDurationObservation = Immutable<Omit<ReturnType<typeof calculateUntrustedStoryDuration>, "contextStatus"> & {
  observationVersion: typeof AUTHORITATIVE_DURATION.version; observationOnly: true;
  contextStatus: "AUTHORITATIVE_DURABLE_OBSERVATION"; observedAt: string; observationHash: string;
  binding: DurationObservationBinding;
  authorizesScriptApproval: false; authorizesVoice: false; authorizesExecution: false;
  contributionCounts: { supported: number; provisional: number; excluded: number };
  provisionalContributions: { eventId: string; reasons: string[] }[];
  excludedContributions: { eventId: string; reasons: string[] }[];
}>;
// Runtime ownership is a private per-service WeakMap, never this type assertion.
declare const durationView: unique symbol;
export type AuthoritativeDurationView = { readonly [durationView]: true };
export type DurationObservationRead = { view: AuthoritativeDurationView; result: AuthoritativeDurationObservation };
