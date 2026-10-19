import type { Immutable } from "../contracts";
import type { HighlightCandidate, HighlightPlanPayload, HighlightAudioReference, HighlightSourceReference, SyntheticHighlightCapture } from "../highlights/contracts";
import type { HighlightRecordIdentity, HighlightRecordView, HighlightStoreScope } from "../highlights-persistence/contracts";

export const TIMELINE = {
  input: "story-recap-timeline-input-v1", policy: "story-recap-timeline-policy-v1",
  segment: "story-recap-timeline-segment-v1", plan: "story-recap-timeline-plan-v1",
  maxBytes: 2 * 1024 * 1024, resolutionBytes: 32 * 1024 * 1024,
} as const;
export const timelinePolicy = Object.freeze({ schemaVersion: TIMELINE.policy,
  timeUnit: "INTEGER_MILLISECONDS_V1", intervals: "HALF_OPEN", speedNumerator: 1, speedDenominator: 1,
  transition: "CUT_ONLY", placement: "CONTIGUOUS", sourceOverlap: "REJECT", filler: "NONE" } as const);
export const timelineRestrictions = Object.freeze({ execution: "SYNTHETIC_ONLY", persistence: "NOT_PERSISTED",
  rendering: "NOT_RENDERED", humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false,
  eligibleForPublication: false, spendingAuthority: "NONE", originalMovieAudio: "EXCLUDED",
  voiceSynchronization: "UNSUPPORTED", syntheticAncestry: true } as const);
export type TimelineRecordReference = HighlightRecordIdentity & {
  recordHashDomain: "story-highlight-saved-record-v1"; planHashDomain: "story-highlight-plan-v1";
};
export type RecapTimelineInput = { schemaVersion: typeof TIMELINE.input; execution: "SYNTHETIC_ONLY";
  scope: HighlightStoreScope; selected: TimelineRecordReference; policy: typeof timelinePolicy };
export type TimelineObservation = {
  status: "RESOLVED_SYNTHETIC"; view: HighlightRecordView;
  head: { scope: HighlightStoreScope; revision: number; identity: HighlightRecordIdentity | null };
  parent: HighlightRecordView | null;
  dependency: { id: string; hash: string; capture: SyntheticHighlightCapture };
  current: { dependencyId: string; dependencyHash: string; source: HighlightSourceReference;
    policyEnabled: boolean; policyVersion: "story-highlight-policy-v1"; rubricVersion: "story-highlight-rubric-v1" };
};
export type TimelineResolution = TimelineObservation | { status: "NOT_FOUND" | "UNAUTHORIZED" | "UNKNOWN" | "UNSAVED" };
/** Test-owner injection only, NOT authentication. No default, credentials or I/O implementation. */
export interface SyntheticTimelineResolver {
  resolve(input: Immutable<RecapTimelineInput>): TimelineResolution | Promise<TimelineResolution>;
}
export type TimelineSegmentBody = { schemaVersion: typeof TIMELINE.segment; scope: HighlightStoreScope;
  selected: TimelineRecordReference; source: HighlightSourceReference; candidate: HighlightCandidate;
  presentationIndex: number; sourceStartMs: number; sourceEndMs: number; durationMs: number;
  outputStartMs: number; outputEndMs: number; restrictions: typeof timelineRestrictions };
export type TimelineSegment = TimelineSegmentBody & { id: string };
export type RecapTimelinePayload = { schemaVersion: typeof TIMELINE.plan; input: RecapTimelineInput;
  inputHash: string; policyHash: string; headRevision: number; dependency: { id: string; hash: string };
  source: HighlightSourceReference; segments: TimelineSegment[]; sourceOrder: string[]; presentationOrder: string[];
  omissions: HighlightPlanPayload["gaps"]; audio: HighlightAudioReference | null; totalOutputMs: number;
  restrictions: typeof timelineRestrictions };
export type RecapTimelinePlan = Immutable<{ id: string; plan: RecapTimelinePayload; planHash: string }>;
export class TimelineError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "RESOLUTION_FAILED" | "INTEGRITY_FAILED" | "INELIGIBLE" | "STALE" | "INVALID_PLAN") {
    super("Synthetic recap timeline rejected"); this.name = "TimelineError";
  }
}
