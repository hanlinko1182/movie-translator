import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { freeze } from "../validation";
import { capture, deny, fields, integer, opaque, OFFLINE_VIDEO as V, restrictions,
  type SourceBinding, type SyntheticVideoDescriptor, type VideoSourceMetadata } from "./contracts";
import { compare, parseSeconds, ZERO_SECONDS } from "./rational";

const issued = new WeakMap<object, VideoSourceMetadata>();
export function requireDescriptor(value: SyntheticVideoDescriptor): VideoSourceMetadata {
  const metadata = issued.get(value); if (!metadata) deny("UNTRUSTED_DESCRIPTOR"); return metadata;
}
export function binding(value: SyntheticVideoDescriptor): SourceBinding {
  const m = requireDescriptor(value); return Object.freeze({ sourceId: m.sourceId, version: m.version, metadataHash: value.metadataHash });
}
/** Explicit synthetic-only issuance seam. Neither catalog membership nor a hash authenticates real media. */
export function createSyntheticVideoCatalog() {
  const versions = new Map<string, SyntheticVideoDescriptor>();
  return Object.freeze({ register(value: unknown): SyntheticVideoDescriptor {
    const r = fields(capture(value), ["schemaVersion", "sourceId", "version", "origin", "duration", "timebase", "rightsClaim"]);
    if (r.schemaVersion !== V.source || r.origin !== "SYNTHETIC_METADATA_ONLY" || r.timebase !== null ||
      !["NONE", "OWNER_REPORTED_PERMISSION"].includes(r.rightsClaim as string)) deny("UNSUPPORTED_SOURCE_OR_RIGHTS");
    const sourceId = opaque(r.sourceId, "vs"), version = integer(r.version, 1, 1000000), duration = parseSeconds(r.duration);
    if (compare(duration, ZERO_SECONDS) <= 0 || compare(duration, { numerator: V.maxSourceSeconds, denominator: 1 }) > 0) deny("SOURCE_DURATION_LIMIT");
    const metadata: VideoSourceMetadata = freeze({ schemaVersion: V.source, sourceId, version, origin: "SYNTHETIC_METADATA_ONLY",
      duration, durationEvidence: "SYNTHETIC_DECLARED_NOT_MEASURED", timebase: null, timebaseEvidence: "NOT_ESTABLISHED",
      rightsClaim: r.rightsClaim as VideoSourceMetadata["rightsClaim"], rightsReview: "PENDING_NOT_VERIFIED", sourceEvidence: "SYNTHETIC_METADATA_ONLY",
      blockers: ["SOURCE_RIGHTS_VERIFICATION", "SOURCE_POSSESSION", "VIDEO_BYTE_INTEGRITY", "INDEPENDENT_MEDIA_PROBE", "HOSTILE_MEDIA_SANDBOX", "EXTRACTION_AUTHORIZATION"], restrictions });
    const key = `${sourceId}:${version}`, prior = versions.get(key);
    if (prior) { if (canonicalJson(prior.metadata) !== canonicalJson(metadata)) deny("SOURCE_VERSION_CONFLICT"); return prior; }
    if (versions.size >= V.maxSources) deny("CATALOG_LIMIT");
    const descriptor = Object.freeze({ metadata, metadataHash: contractHash(V.source, metadata) }) as SyntheticVideoDescriptor;
    issued.set(descriptor, metadata); versions.set(key, descriptor); return descriptor;
  } });
}
