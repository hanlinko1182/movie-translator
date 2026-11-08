import "server-only";
import { randomUUID } from "node:crypto";
import { canonicalJson, contractHash } from "../canonical";
import { freeze } from "../validation";
import { capture, deny, evidenceClasses, restrictions, VIDEO_SOURCE_INTAKE as V, type MeasuredVideoSource, type SourceByteMetadata } from "./contracts";

const issued = new WeakMap<object, SourceByteMetadata>();
/** Internal trusted-reader completion only; not a public constructor, receipt importer or authentication seam. */
export function issueCompletedInspection(sha256: string, byteCount: number): MeasuredVideoSource {
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteCount) || byteCount <= 0 || byteCount > V.maxFileBytes) deny("INVALID_MEASUREMENT");
  const metadata: SourceByteMetadata = { schemaVersion: V.metadata, candidateSourceId: `vsrc-${randomUUID()}`, version: 1,
    sha256, byteCount, measurement: "LOCAL_FILE_BYTES_VERIFIED", provenance: "OWNER_REPORTED_SOURCE", evidence: evidenceClasses,
    rightsReview: "SOURCE_RIGHTS_PENDING", permittedUseReview: "PENDING", sourcePossession: "BOUNDED_LOCAL_READ_OBSERVED_OWNERSHIP_PENDING",
    mediaFormat: "SOURCE_MEDIA_FORMAT_NOT_VERIFIED", duration: null, durationEvidence: "SOURCE_DURATION_NOT_MEASURED",
    timebase: null, timebaseStatus: "NOT_ESTABLISHED", sandbox: "MEDIA_SANDBOX_NOT_VERIFIED", extraction: "EXTRACTION_NOT_AUTHORIZED",
    identityObservation: { policy: "AUTHORIZATION_FD_PATH_FENCES_V1", matched: true, owner: "EFFECTIVE_UID_MATCHED",
      permissions: "OWNER_ONLY", links: 1, completeFileRead: true, streaming: "BOUNDED_CHUNKS" },
    blockers: ["INDEPENDENT_SOURCE_OWNERSHIP", "PERMITTED_USE_AND_RIGHTS_REVIEW", "MEDIA_FORMAT_AND_CODEC_VERIFICATION",
      "INDEPENDENT_DURATION_AND_STREAM_TOPOLOGY", "MEDIA_TIMEBASE_AND_FRAME_TIMESTAMP_POLICY", "ISOLATED_PARSER_QUALIFICATION", "EXTRACTION_AUTHORIZATION"], restrictions };
  freeze(metadata);
  const result = Object.freeze({ metadata, metadataHash: contractHash(V.metadata, metadata) }) as MeasuredVideoSource;
  issued.set(result, metadata); return result;
}
export function requireMeasuredSource(value: MeasuredVideoSource): SourceByteMetadata {
  const metadata = issued.get(value); if (!metadata) deny("UNTRUSTED_MEASUREMENT"); return metadata;
}
/** Comparison only; a copied metadata record cannot mint or restore the process-local measurement capability. */
export function verifyVideoSourceMetadata(original: MeasuredVideoSource, value: unknown): SourceByteMetadata {
  const metadata = requireMeasuredSource(original);
  if (canonicalJson(capture(value)) !== canonicalJson(metadata)) deny("METADATA_MISMATCH");
  return metadata;
}
