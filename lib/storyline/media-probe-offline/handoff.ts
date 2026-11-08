import "server-only";
import { freeze } from "../validation";
import { capture, choice, deny, fields, MEDIA_PROBE, pendingEvidence, restrictions, sha256, sourceBinding } from "./contracts";
import { sandboxRequirements } from "./sandbox";

/** A redacted reference to a previous observation can be carried as data for later independent checks. */
export function buildOfflineProbeHandoff(value: unknown) {
  const reference = fields(capture(value), ["source", "metadataHash", "evidence"]);
  const source = sourceBinding(reference.source);
  const metadataHash = reference.metadataHash === null ? null : sha256(reference.metadataHash);
  const evidence = choice(reference.evidence, ["LOCAL_FILE_BYTES_VERIFIED", "PROBE_RESULT_SYNTHETIC"] as const);
  if ((evidence === "LOCAL_FILE_BYTES_VERIFIED") !== (metadataHash !== null)) deny("SOURCE_REFERENCE_MISMATCH");
  return freeze({
    schemaVersion: MEDIA_PROBE.handoff,
    status: "BLOCKED",
    source: { ...source, metadataHash, reportedEvidence: evidence, currentness: "RECHECK_REQUIRED" },
    sandboxPolicyVersion: MEDIA_PROBE.profile,
    allowedOutputSchema: MEDIA_PROBE.result,
    maxMetadataBytes: MEDIA_PROBE.maxMetadataBytes,
    outputTrust: "PROBE_RESULT_SYNTHETIC",
    requirements: {
      exactSourceBytes: "INDEPENDENT_REVERIFICATION_AT_USE",
      sourceRightsAndUsage: "INDEPENDENT_ADMISSION_REQUIRED",
      timebaseAndTimestamps: "INDEPENDENT_RATIONAL_MEASUREMENT_REQUIRED",
      codecFormatAndTopology: "INDEPENDENT_VERIFICATION_REQUIRED",
      runner: "INDEPENDENT_OS_QUALIFICATION_REQUIRED",
      sandbox: sandboxRequirements,
    },
    blockers: pendingEvidence,
    restrictions,
  } as const);
}
