import "server-only";
import { canonicalJson } from "../canonical";
import { record } from "../validation";

export const OFFLINE_VIDEO = Object.freeze({ source: "story-offline-video-source-v1",
  selection: "story-offline-video-selection-v1", plan: "story-offline-video-highlight-plan-v1",
  preview: "story-offline-video-timeline-preview-v1", compatibility: "story-offline-video-narration-compatibility-v1",
  maxBytes: 131072, maxSources: 16, maxSegments: 64, maxInputTerm: 1000000000,
  maxSourceSeconds: 86400, maxPlanSeconds: 600 });
export const restrictions = Object.freeze({ execution: "PREVIEW_ONLY", processingEligibility: "BLOCKED",
  sourceRightsVerified: false, sourceVerified: false, possession: "NOT_ESTABLISHED", videoIntegrity: "NOT_VERIFIED",
  hostileMediaSandbox: "NOT_ESTABLISHED", clipsExtracted: false, narrationSyncVerified: false,
  rendered: false, humanApproval: "NONE", spendingAuthority: "NONE", liveEligible: false,
  productionEligible: false, publicationEligibility: false } as const);
export const intervalPolicy = Object.freeze({ intervals: "HALF_OPEN", overlap: "REJECT",
  ordering: "SOURCE_CHRONOLOGY", placement: "CONTIGUOUS_PREVIEW_ONLY", unit: "EXACT_RATIONAL_SECONDS" } as const);
/** Closed vocabulary: free text, filenames, private paths and account identifiers are not accepted labels. */
export const safeLabels = Object.freeze(["Opening", "Turning point", "Reflection", "Conclusion", "အစပိုင်း", "သုံးသပ်ချက်"] as const);
export type ExactSeconds = Readonly<{ numerator: number; denominator: number }>;
export type SourceBinding = Readonly<{ sourceId: string; version: number; metadataHash: string }>;
export type VideoSourceMetadata = Readonly<{ schemaVersion: typeof OFFLINE_VIDEO.source; sourceId: string; version: number;
  origin: "SYNTHETIC_METADATA_ONLY"; duration: ExactSeconds; durationEvidence: "SYNTHETIC_DECLARED_NOT_MEASURED";
  timebase: null; timebaseEvidence: "NOT_ESTABLISHED"; rightsClaim: "NONE" | "OWNER_REPORTED_PERMISSION";
  rightsReview: "PENDING_NOT_VERIFIED"; sourceEvidence: "SYNTHETIC_METADATA_ONLY";
  blockers: readonly string[]; restrictions: typeof restrictions }>;
declare const descriptorBrand: unique symbol;
export type SyntheticVideoDescriptor = Readonly<{ metadata: VideoSourceMetadata; metadataHash: string; readonly [descriptorBrand]: true }>;
export type HighlightSegment = Readonly<{ segmentId: string; order: number; source: SourceBinding;
  start: ExactSeconds; end: ExactSeconds; duration: ExactSeconds; outputStart: ExactSeconds; outputEnd: ExactSeconds;
  label: typeof safeLabels[number] | null }>;
export type HighlightPayload = Readonly<{ schemaVersion: typeof OFFLINE_VIDEO.plan; source: SourceBinding;
  sourceDuration: ExactSeconds; durationEvidence: "SYNTHETIC_DECLARED_NOT_MEASURED";
  policy: typeof intervalPolicy; segments: readonly HighlightSegment[]; totalDuration: ExactSeconds; restrictions: typeof restrictions }>;
declare const planBrand: unique symbol;
export type OfflineHighlightPlan = Readonly<{ planId: string; planHash: string; payload: HighlightPayload; readonly [planBrand]: true }>;
export class OfflineVideoError extends Error {
  constructor(readonly code: string) { super("Offline synthetic video planning rejected"); this.name = "OfflineVideoError"; }
}
export function deny(code: string): never { throw new OfflineVideoError(code); }
export function capture(value: unknown): unknown {
  try { return JSON.parse(canonicalJson(value, OFFLINE_VIDEO.maxBytes)); } catch { return deny("INVALID_CONTRACT"); }
}
export function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  try { return record(value, names, "offlineVideo"); } catch { return deny("INVALID_FIELDS"); }
}
export function integer(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || (value as number) < min || (value as number) > max) deny("INVALID_INTEGER");
  return value as number;
}
export function opaque(value: unknown, prefix: "vs" | "seg"): string {
  if (typeof value !== "string" || !new RegExp(`^${prefix}-[a-f0-9]{32}$`).test(value)) deny("INVALID_ID");
  return value;
}
