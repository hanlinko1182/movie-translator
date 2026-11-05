import "server-only";
import { randomUUID } from "node:crypto";
import { canonicalJson } from "../canonical";
import { freeze } from "../validation";
import { deny, INTAKE, parseOwnerEvidence, restrictions, type OwnerEvidence, type WavMeasurement } from "./contracts";
import { requireMeasured } from "./wav";

export type NarrationMetadata = Readonly<{
  schemaVersion: typeof INTAKE.candidate; candidateId: string; measured: WavMeasurement;
  provenance: OwnerEvidence; evidence: readonly string[]; providerReceipt: "UNKNOWN";
  nativeGatewayResponseIdentity: "NOT_ESTABLISHED"; scriptCoverage: "NOT_VERIFIED";
  missingEvidence: readonly string[]; admissionBlockers: readonly string[]; restrictions: typeof restrictions;
}>;
declare const candidateBrand: unique symbol;
export type NarrationCandidate = Readonly<{ metadata: NarrationMetadata; readonly [candidateBrand]: true }>;
const candidates = new WeakMap<object, NarrationMetadata>();
export function requireCandidate(value: NarrationCandidate): NarrationMetadata {
  const metadata = candidates.get(value); if (!metadata) deny("UNTRUSTED_CANDIDATE"); return metadata;
}
/** Ephemeral bounded registry, no storage, scope grant, production adapter or durable ownership. */
export function createOfflineNarrationRegistry() {
  const byBytes = new Map<string, NarrationCandidate>(), byId = new Map<string, NarrationMetadata>();
  return Object.freeze({
    register(measurement: WavMeasurement, ownerEvidence: unknown): NarrationCandidate {
      const measured = requireMeasured(measurement), provenance = parseOwnerEvidence(ownerEvidence);
      const prior = byBytes.get(measured.sha256);
      if (prior) {
        if (canonicalJson(prior.metadata.provenance) !== canonicalJson(provenance) ||
          canonicalJson(prior.metadata.measured) !== canonicalJson(measured)) deny("CANDIDATE_CONFLICT");
        return prior;
      }
      if (byId.size >= INTAKE.maxCandidates) deny("CANDIDATE_LIMIT");
      const metadata: NarrationMetadata = freeze({ schemaVersion: INTAKE.candidate, candidateId: `ni-${randomUUID()}`,
        measured, provenance, evidence: ["LOCAL_AUDIO_INTEGRITY_VERIFIED", "SCRIPT_COVERAGE_NOT_VERIFIED",
          ...(provenance.providerClaim !== "NONE" ? ["OWNER_REPORTED"] : []),
          ...(provenance.listeningFeedback === "OWNER_SUPPLIED" ? ["LISTENING_FEEDBACK_OWNER_SUPPLIED"] : [])],
        providerReceipt: "UNKNOWN", nativeGatewayResponseIdentity: "NOT_ESTABLISHED", scriptCoverage: "NOT_VERIFIED",
        missingEvidence: ["EXACT_ORIGINAL_SCRIPT", "AUTHENTICATED_PROVIDER_RECEIPT", "NATIVE_RESPONSE_IDENTITY",
          "INDEPENDENT_QUALIFIED_SCRIPT_BASED_LISTENING"],
        admissionBlockers: ["ACCOUNT_ACCESS", "PRIVACY_ROUTING_ACCEPTANCE", "BOUNDED_BILLING", "SPENDING_AUTHORIZATION",
          "DURABLE_LIVE_REQUEST_OWNERSHIP", "HUMAN_APPROVAL", "PRODUCTION_ARTIFACT_PROTOCOL"], restrictions });
      const result = Object.freeze({ metadata }) as NarrationCandidate;
      candidates.set(result, metadata); byBytes.set(measured.sha256, result); byId.set(metadata.candidateId, metadata); return result;
    },
    /** Comparison only: an exact serialized copy cannot mint a candidate/preview capability. */
    checkMetadata(value: unknown): NarrationMetadata {
      let captured: NarrationMetadata;
      try { captured = JSON.parse(canonicalJson(value, INTAKE.maxMetadataBytes)); }
      catch { return deny("INVALID_METADATA"); }
      const original = captured && byId.get(captured.candidateId);
      if (!original || canonicalJson(original) !== canonicalJson(captured)) deny("CANDIDATE_CONFLICT");
      return original;
    },
  });
}
