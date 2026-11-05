import "server-only";
import { canonicalJson } from "../canonical";
import { record } from "../validation";

export const VIDEO_SOURCE_INTAKE = Object.freeze({ metadata: "story-private-video-source-bytes-v1",
  handoff: "story-private-video-probe-handoff-v1", maxFileBytes: 64 * 1024 * 1024,
  chunkBytes: 64 * 1024, maxReadCalls: 4097, maxMetadataBytes: 8192 });
export const evidenceClasses = Object.freeze(["OWNER_REPORTED_SOURCE", "LOCAL_FILE_BYTES_VERIFIED", "SOURCE_RIGHTS_PENDING",
  "SOURCE_MEDIA_FORMAT_NOT_VERIFIED", "SOURCE_DURATION_NOT_MEASURED", "MEDIA_SANDBOX_NOT_VERIFIED", "EXTRACTION_NOT_AUTHORIZED"] as const);
export const restrictions = Object.freeze({ execution: "PREVIEW_ONLY", productionEligible: false, publicationEligibility: false,
  sourceVerified: false, sourceRightsVerified: false, mediaDecoded: false, mediaTimebaseVerified: false,
  clipsExtracted: false, narrationSyncVerified: false, rendered: false, humanApproval: "NONE", spendingAuthority: "NONE" } as const);
export type SourceInspectionConfiguration = Readonly<{ authorization: "EXPLICIT_LOCAL_READ_ONLY";
  privateRoot: string; repositoryRoot: string; authorizedPath: string; provenance: "OWNER_REPORTED_SOURCE" }>;
export type SourceByteMetadata = Readonly<{ schemaVersion: typeof VIDEO_SOURCE_INTAKE.metadata; candidateSourceId: string; version: 1;
  sha256: string; byteCount: number; measurement: "LOCAL_FILE_BYTES_VERIFIED"; provenance: "OWNER_REPORTED_SOURCE";
  evidence: typeof evidenceClasses; rightsReview: "SOURCE_RIGHTS_PENDING"; permittedUseReview: "PENDING";
  sourcePossession: "BOUNDED_LOCAL_READ_OBSERVED_OWNERSHIP_PENDING"; mediaFormat: "SOURCE_MEDIA_FORMAT_NOT_VERIFIED";
  duration: null; durationEvidence: "SOURCE_DURATION_NOT_MEASURED"; timebase: null; timebaseStatus: "NOT_ESTABLISHED";
  sandbox: "MEDIA_SANDBOX_NOT_VERIFIED"; extraction: "EXTRACTION_NOT_AUTHORIZED";
  identityObservation: Readonly<{ policy: "AUTHORIZATION_FD_PATH_FENCES_V1"; matched: true; owner: "EFFECTIVE_UID_MATCHED";
    permissions: "OWNER_ONLY"; links: 1; completeFileRead: true; streaming: "BOUNDED_CHUNKS" }>;
  blockers: readonly string[]; restrictions: typeof restrictions }>;
declare const measurementBrand: unique symbol;
export type MeasuredVideoSource = Readonly<{ metadata: SourceByteMetadata; metadataHash: string; readonly [measurementBrand]: true }>;
export class VideoSourceIntakeError extends Error {
  constructor(readonly code: string) { super("Private video source inspection rejected"); this.name = "VideoSourceIntakeError"; }
}
export function deny(code: string): never { throw new VideoSourceIntakeError(code); }
export function capture(value: unknown): unknown {
  try { return JSON.parse(canonicalJson(value, VIDEO_SOURCE_INTAKE.maxMetadataBytes)); } catch { return deny("INVALID_CONTRACT"); }
}
export function exact(value: unknown, names: readonly string[]): Record<string, unknown> {
  try { return record(capture(value), names, "videoSource"); } catch { return deny("INVALID_CONTRACT"); }
}
export async function safe<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { if (error instanceof VideoSourceIntakeError) throw error; return deny("PRIVATE_FILE_UNAVAILABLE"); }
}
