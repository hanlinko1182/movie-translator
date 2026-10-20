import "server-only";
import type { Immutable } from "../contracts";
import type { HighlightAudioReference, HighlightCandidate, HighlightSourceReference } from "../highlights/contracts";
import type { TimelineObservation } from "../timeline/contracts";
import type { TimelineRecordIdentity, TimelineRecordView, TimelineStoreScope } from "../timeline-persistence/contracts";

export const RENDER_PLANNING = {
  input: "story-recap-render-planning-input-v1", policy: "story-recap-render-policy-v1",
  profile: "story-recap-render-profile-v1", source: "story-recap-render-source-observation-v1",
  dependency: "story-recap-render-dependency-snapshot-v1", recipe: "story-recap-render-recipe-v1",
  request: "story-recap-render-request-proposal-v1", inputBytes: 2 * 1024 * 1024,
  recipeBytes: 3 * 1024 * 1024, resolutionBytes: 32 * 1024 * 1024,
  maxDurationMs: 86400000, maxSourceBytes: 16 * 1024 * 1024 * 1024, maxRational: 1000000000,
} as const;
export const renderPolicy = Object.freeze({ schemaVersion: RENDER_PLANNING.policy,
  timeUnit: "INTEGER_MILLISECONDS_V1", intervals: "HALF_OPEN", speedNumerator: 1, speedDenominator: 1,
  transition: "CUT_ONLY", placement: "CONTIGUOUS", filler: "NONE", sourceOverlap: "REJECT",
  timingAdjustment: "REJECT_UNREPRESENTABLE", audio: "EXCLUDE_ALL" } as const);
export const renderRestrictions = Object.freeze({ execution: "SYNTHETIC_ONLY", executable: false,
  rendering: "NOT_RENDERED", humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false,
  eligibleForPublication: false, spendingAuthority: "NONE", originalMovieAudio: "EXCLUDED",
  synthesizedNarration: "NONE", voiceSynchronization: "UNSUPPORTED", syntheticAncestry: true } as const);
export const syntheticRenderProfile = Object.freeze({ schemaVersion: RENDER_PLANNING.profile,
  id: "SYNTHETIC_MP4_H264_640X360_25_V1", capability: "SYNTHETIC_UNVERIFIED", container: "MP4",
  videoCodec: "H264_AVC", pixelFormat: "YUV420P", width: 640, height: 360,
  frameRate: Object.freeze({ numerator: 25, denominator: 1 }), timebase: Object.freeze({ numerator: 1, denominator: 1000 }),
  outputStreams: Object.freeze({ video: 1, audio: 0, subtitle: 0, data: 0, attachment: 0 }),
  sourceAudio: "EXCLUDE_ZERO_OR_ONE_DECLARED_STREAM", rotation: 0, scaling: "NONE", cropping: "NONE",
  variableFrameRate: false, transition: "CUT_ONLY", engineAvailability: "NOT_ESTABLISHED", encodingPolicy: "DISABLED", executable: false } as const);
export type SyntheticRenderProfile = typeof syntheticRenderProfile;
export type ProfileReference = { id: typeof syntheticRenderProfile.id; hash: string; hashDomain: typeof RENDER_PLANNING.profile };
export type RenderPlanningInput = { schemaVersion: typeof RENDER_PLANNING.input; execution: "SYNTHETIC_ONLY";
  scope: TimelineStoreScope; timeline: TimelineRecordIdentity; policy: typeof renderPolicy; profileReference: ProfileReference };
export type Rational = { numerator: number; denominator: number };
export type SyntheticSourceObservation = { schemaVersion: typeof RENDER_PLANNING.source;
  execution: "SYNTHETIC_METADATA_ONLY"; verification: "NOT_PROBED"; possession: "POSSESSION_NOT_ESTABLISHED";
  fingerprint: HighlightSourceReference["media"]; container: "MP4"; encrypted: false;
  topology: { video: 1; audio: number; subtitle: 0; data: 0; attachment: 0 };
  video: { streamIndex: 0; codec: "H264_AVC"; pixelFormat: "YUV420P"; width: 640; height: 360;
    frameRate: Rational; timebase: Rational; startTick: 0; durationTicks: number; frameCount: number;
    rotation: 0; variableFrameRate: false; timestamps: "ZERO_ORIGIN_CONTIGUOUS_CFR" } };
/** Independently obtained metadata. Neither this view nor its status is production authentication. */
export type RenderTimelineCapture = { view: TimelineRecordView; dependency: unknown };
export type RenderPlanningObservation = { status: "RESOLVED_SYNTHETIC"; observedAt: string;
  timeline: RenderTimelineCapture; parent: RenderTimelineCapture | null;
  head: { scope: TimelineStoreScope; revision: number; identity: TimelineRecordIdentity | null };
  currentM6: TimelineObservation;
  admission: { scope: TimelineStoreScope; m7ScopeEnabled: boolean; m6ScopeEnabled: boolean;
    m7PolicyEnabled: boolean; m7PolicyVersion: "story-recap-timeline-policy-v1" };
  profile: SyntheticRenderProfile; sourceObservation: SyntheticSourceObservation };
export type RenderPlanningResolution = RenderPlanningObservation | {
  status: "NOT_FOUND" | "UNAUTHORIZED" | "UNKNOWN" | "UNSAVED" | "SUPERSEDED" | "STALE" | "UNSUPPORTED" };
/** Explicit fixture-owner seam only; no default, ambient activation or execution adapter. */
export interface SyntheticRenderPlanningResolver {
  resolve(input: Immutable<RenderPlanningInput>): RenderPlanningResolution | Promise<RenderPlanningResolution>;
}
export type RenderDependencySnapshot = { schemaVersion: typeof RENDER_PLANNING.dependency; scope: TimelineStoreScope;
  timeline: TimelineRecordIdentity; timelineHeadRevision: number; timelineParent: TimelineRecordIdentity | null;
  m7Dependency: { id: string; hash: string }; m6: import("../timeline/contracts").TimelineRecordReference;
  m6HeadRevision: number; m6Parent: import("../timeline/contracts").TimelineRecordReference | null;
  m6Dependency: { id: string; hash: string }; source: HighlightSourceReference;
  policies: { m7: "story-recap-timeline-policy-v1"; m6: "story-highlight-policy-v1"; rubric: "story-highlight-rubric-v1" };
  profileReference: ProfileReference; sourceObservationHash: string; restrictions: typeof renderRestrictions };
export type RenderProvenance = Immutable<Pick<HighlightCandidate, "findingId" | "claimIds" | "characterIds" | "relationshipId"
  | "classification" | "category" | "statement" | "confidence" | "uncertainty" | "qualification" | "observedBasisIds" | "evidence" | "contradictions">>;
export type RenderSegment = { timelineSegmentId: string; candidateId: string; candidateHash: string;
  presentationIndex: number; sourceChronologyIndex: number; sourceStartMs: number; sourceEndMs: number;
  outputStartMs: number; outputEndMs: number; durationMs: number;
  sourceStartFrame: number; sourceEndFrame: number; outputStartFrame: number; outputEndFrame: number; frameCount: number;
  sourceStartTick: number; sourceEndTick: number; outputStartTick: number; outputEndTick: number; durationTicks: number;
  transition: "CUT_ONLY"; provenance: RenderProvenance };
export type RenderRecipePayload = { schemaVersion: typeof RENDER_PLANNING.recipe; input: RenderPlanningInput; inputHash: string;
  timelinePlanHash: string; dependency: RenderDependencySnapshot; dependencyHash: string;
  sourceObservation: SyntheticSourceObservation; sourceObservationHash: string;
  profile: SyntheticRenderProfile; profileHash: string; policyHash: string;
  segments: RenderSegment[]; sourceOrder: readonly string[]; presentationOrder: readonly string[];
  totalOutputMs: number; totalOutputFrames: number; totalOutputTicks: number;
  audio: "EXCLUDE_ALL"; outputAudioTracks: 0; historicalFakeAudio: HighlightAudioReference | null;
  restrictions: typeof renderRestrictions };
export type RenderRecipe = Immutable<{ id: string; recipe: RenderRecipePayload; recipeHash: string }>;
export type RenderRequestProposal = { schemaVersion: typeof RENDER_PLANNING.request; scope: TimelineStoreScope;
  recipeReference: { id: string; hash: string; hashDomain: typeof RENDER_PLANNING.recipe };
  dependencyReference: { id: string; hash: string; hashDomain: typeof RENDER_PLANNING.dependency };
  idempotencyKey: string; execution: "DISABLED_HANDOFF_ONLY"; executable: false };
export class RenderPlanningError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "RESOLUTION_UNAVAILABLE" | "FORBIDDEN" | "UNSAVED_TIMELINE"
    | "STALE_DEPENDENCIES" | "INTEGRITY_FAILED" | "UNSUPPORTED_SOURCE_METADATA" | "UNSUPPORTED_CODEC_CONTAINER"
    | "UNSUPPORTED_TIMEBASE" | "FRAME_BOUNDARY_UNREPRESENTABLE" | "SOURCE_OUT_OF_BOUNDS" | "RESOURCE_LIMIT") {
    super("Synthetic render planning rejected"); this.name = "RenderPlanningError";
  }
}
