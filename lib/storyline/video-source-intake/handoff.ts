import "server-only";
import { canonicalJson } from "../canonical";
import { freeze } from "../validation";
import { capture, deny, restrictions, VIDEO_SOURCE_INTAKE as V, type MeasuredVideoSource } from "./contracts";
import { requireMeasuredSource } from "./measurement";

/** Future adapter requirements only. No probe result, executable port or permit is issued. */
export const futureProbeRequirements = Object.freeze({ exactSourceByteIdentity: "RECHECK_AT_FUTURE_USE",
  duration: "INDEPENDENTLY_MEASURED_RATIONAL_REQUIRED", streamTopology: "INDEPENDENTLY_VERIFIED_REQUIRED",
  timebase: "INDEPENDENTLY_VERIFIED_REQUIRED", frameTimestampPolicy: "EXPLICIT_REVIEW_REQUIRED",
  codecAndFormat: "INDEPENDENT_VERIFICATION_REQUIRED", sourceOwnershipAndUsage: "INDEPENDENT_AUTHORIZATION_REQUIRED",
  parserDecoderIsolation: "QUALIFIED_SANDBOX_REQUIRED" } as const);
export type FutureVideoProbeRequirements = typeof futureProbeRequirements;
export function buildVideoProbeHandoff(source: MeasuredVideoSource) {
  const m = requireMeasuredSource(source);
  return freeze({ schemaVersion: V.handoff, source: { candidateSourceId: m.candidateSourceId, version: m.version,
    sha256: m.sha256, byteCount: m.byteCount, metadataHash: source.metadataHash },
    status: "BLOCKED", sourceBackedHighlights: "NOT_AUTHORIZED", duration: null, streams: null, timebase: null,
    frameTimestampPolicy: "NOT_ESTABLISHED", codecAndFormat: "NOT_VERIFIED", rights: "PENDING", sandbox: "NOT_VERIFIED",
    requirements: futureProbeRequirements, restrictions });
}
/** Strict comparison against current evidence; a purported probe/rights/timebase claim cannot promote it. */
export function verifyVideoProbeHandoff(source: MeasuredVideoSource, value: unknown) {
  const original = buildVideoProbeHandoff(source);
  if (canonicalJson(capture(value)) !== canonicalJson(original)) deny("HANDOFF_MISMATCH");
  return original;
}
