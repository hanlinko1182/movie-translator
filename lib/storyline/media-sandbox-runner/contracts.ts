import "server-only";
import { createHash } from "node:crypto";

export const SANDBOX_POLICY = Object.freeze({
  schema: "story-media-sandbox-linux-x64-v1",
  uid: 65_534,
  cpuQuotaMicros: 50_000,
  cpuPeriodMicros: 100_000,
  cpuSeconds: 1,
  memoryBytes: 32 * 1024 * 1024,
  addressSpaceBytes: 128 * 1024 * 1024,
  pids: 4,
  wallMs: 5_000,
  nativeWatchdogSeconds: 6,
  watchdogObservationMs: 8_000,
  cleanupMs: 2_000,
  stdoutBytes: 64 * 1024,
  stderrBytes: 8 * 1024,
  protocols: "LOCAL_SYNTHETIC_DESCRIPTOR_ONLY",
} as const);

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const SANDBOX_POLICY_SHA256 = sha256(JSON.stringify(SANDBOX_POLICY));

export const QUALIFICATION_CASES = Object.freeze([
  "isolation", "pids", "cpu", "memory", "stdout", "stderr", "timeout", "watchdog", "exit",
] as const);
export type FixtureCase = typeof QUALIFICATION_CASES[number];
export type RunOutcome = "EXITED" | "START_FAILED" | "STDOUT_LIMIT" | "STDERR_LIMIT" |
  "TIMEOUT" | "CLEANUP_FAILED";
