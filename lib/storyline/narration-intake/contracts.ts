import "server-only";
import { canonicalJson } from "../canonical";
import { freeze, record } from "../validation";

export const INTAKE = Object.freeze({ measurement: "story-narration-wav-measurement-v1",
  candidate: "story-narration-intake-candidate-v1", preview: "story-narration-timing-preview-v1",
  maxFileBytes: 8 * 1024 * 1024, maxMetadataBytes: 8192, maxCandidates: 16,
  sampleRatesHz: Object.freeze([8000, 16000, 22050, 24000, 44100, 48000]) });
export const evidenceClasses = Object.freeze(["OWNER_REPORTED", "LOCAL_AUDIO_INTEGRITY_VERIFIED",
  "PROVIDER_RECEIPT_VERIFIED", "SCRIPT_COVERAGE_NOT_VERIFIED", "LISTENING_FEEDBACK_OWNER_SUPPLIED"] as const);
export const restrictions = Object.freeze({ mode: "OFFLINE_INTAKE_ONLY", liveEligible: false,
  audioVerified: false, humanApproval: "NONE", sourceVerified: false,
  spendingAuthority: "NONE", publicationEligibility: false, productionEligible: false } as const);
export type RationalSeconds = Readonly<{ numerator: number; denominator: number }>;
export type WavMeasurement = Readonly<{
  schemaVersion: typeof INTAKE.measurement; format: "RIFF_WAVE_PCM_S16LE"; sha256: string;
  byteCount: number; dataByteCount: number; sampleRateHz: number; channels: 1; bitDepth: 16;
  sampleFrames: number; durationSeconds: RationalSeconds; integrity: "LOCAL_AUDIO_INTEGRITY_VERIFIED";
}>;
export type OwnerEvidence = Readonly<{ origin: "OWNER_DOWNLOADED_WAV" | "SYNTHETIC_TEST_WAV";
  providerClaim: "NONE" | "OPENROUTER_GEMINI_KORE_OWNER_REPORTED";
  originalScript: "UNAVAILABLE"; listeningFeedback: "NOT_PROVIDED" | "OWNER_SUPPLIED" }>;
export const noOwnerClaims: OwnerEvidence = Object.freeze({ origin: "SYNTHETIC_TEST_WAV",
  providerClaim: "NONE", originalScript: "UNAVAILABLE", listeningFeedback: "NOT_PROVIDED" });
export class NarrationIntakeError extends Error {
  constructor(readonly code: string) { super("Offline narration intake rejected"); this.name = "NarrationIntakeError"; }
}
export function deny(code: string): never { throw new NarrationIntakeError(code); }
/** Bounded JSON snapshot; accessors, symbols, cycles and extra fields are rejected without invocation. */
export function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try { return record(JSON.parse(canonicalJson(value, INTAKE.maxMetadataBytes)), keys, "intake"); }
  catch { return deny("INVALID_CONTRACT"); }
}
export function parseOwnerEvidence(value: unknown): OwnerEvidence {
  const r = exact(value, ["origin", "providerClaim", "originalScript", "listeningFeedback"]);
  if (!["OWNER_DOWNLOADED_WAV", "SYNTHETIC_TEST_WAV"].includes(r.origin as string) ||
    !["NONE", "OPENROUTER_GEMINI_KORE_OWNER_REPORTED"].includes(r.providerClaim as string) ||
    r.originalScript !== "UNAVAILABLE" || !["NOT_PROVIDED", "OWNER_SUPPLIED"].includes(r.listeningFeedback as string) ||
    r.origin === "SYNTHETIC_TEST_WAV" && r.providerClaim !== "NONE") deny("INVALID_EVIDENCE");
  return freeze(r) as OwnerEvidence;
}
export function rational(numerator: number, denominator: number): RationalSeconds {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || Object.is(numerator, -0) ||
    !Number.isSafeInteger(denominator) || denominator <= 0) deny("INVALID_DURATION");
  let a = numerator, b = denominator;
  while (b) { const r = a % b; a = b; b = r; }
  return Object.freeze({ numerator: numerator / a, denominator: denominator / a });
}
