import "server-only";
import { canonicalJson } from "../canonical";
import { record } from "../validation";

export const MEDIA_PROBE = Object.freeze({
  profile: "story-offline-probe-profile-v1",
  hostHints: "story-offline-probe-linux-hints-v1",
  sandbox: "story-offline-probe-sandbox-v1",
  result: "story-offline-probe-result-v1",
  handoff: "story-offline-probe-handoff-v1",
  maxMetadataBytes: 65536,
  maxSourceBytes: 64 * 1024 * 1024,
  maxFrames: 256,
});

export const restrictions = Object.freeze({
  execution: "PREVIEW_ONLY",
  probeExecutionAuthorized: false,
  realMediaVerified: false,
  sourceRightsVerified: false,
  clipsExtracted: false,
  narrationSyncVerified: false,
  rendered: false,
  productionEligible: false,
  publicationEligibility: false,
} as const);

export const pendingEvidence = Object.freeze([
  "SOURCE_RIGHTS_PENDING",
  "MEDIA_FORMAT_NOT_VERIFIED",
  "MEDIA_TIMEBASE_NOT_VERIFIED",
  "SANDBOX_NOT_QUALIFIED",
  "EXTRACTION_NOT_AUTHORIZED",
] as const);

export type ProbeSourceBinding = Readonly<{ sha256: string; byteCount: number }>;
export type ProbeRational = Readonly<{ numerator: number; denominator: number }>;

export class OfflineMediaProbeError extends Error {
  constructor(readonly code: string) {
    super("Offline media probe contract rejected");
    this.name = "OfflineMediaProbeError";
  }
}

export function deny(code: string): never {
  throw new OfflineMediaProbeError(code);
}

export function capture(value: unknown): unknown {
  try {
    return JSON.parse(canonicalJson(value, MEDIA_PROBE.maxMetadataBytes));
  } catch {
    return deny("INVALID_OR_OVERSIZED_METADATA");
  }
}

export function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    return record(value, keys, "offlineProbe");
  } catch {
    return deny("INVALID_FIELDS");
  }
}

export function choice<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) deny("INVALID_ENUM");
  return value as T[number];
}

export function boundedInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) {
    deny("INVALID_INTEGER");
  }
  return value;
}

export function sha256(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) deny("INVALID_SHA256");
  return value;
}

export function sourceBinding(value: unknown): ProbeSourceBinding {
  const source = fields(value, ["sha256", "byteCount"]);
  return Object.freeze({ sha256: sha256(source.sha256), byteCount: boundedInteger(source.byteCount, 1, MEDIA_PROBE.maxSourceBytes) });
}
