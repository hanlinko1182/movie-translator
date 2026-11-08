import "server-only";
import type { FixtureCase } from "./contracts";

export type HostBlocker = "UNSUPPORTED_PLATFORM" | "ROOT_EXECUTION_DENIED" |
  "CGROUP_MOUNT_READ_ONLY" | "CGROUP_V2_UNAVAILABLE" | "DELEGATION_UNAVAILABLE" |
  "FIXTURE_COMPILER_UNAVAILABLE" | "HOST_IDENTITY_UNAVAILABLE" | "FIXTURE_BUILD_FAILED" |
  "FIXTURE_IDENTITY_DENIED" | "ISOLATION_CHECK_FAILED" | "CLEANUP_UNPROVEN" | "QUALIFICATION_BUSY";
export type Check = Readonly<{
  case: FixtureCase;
  passed: boolean;
  detail: string;
  controls?: readonly string[];
}>;
export type HostIdentity = Readonly<{ host: string; implementation: string; fixture: string; policy: string }>;

export type Qualification = Readonly<{
  status: "HOST_ENFORCEMENT_NOT_RUN" | "HOST_ENFORCEMENT_BLOCKED" | "HOST_ENFORCEMENT_VERIFIED";
  blocker?: HostBlocker;
  identity?: HostIdentity;
  checks: readonly Check[];
  qualificationScope: "HARMLESS_FIXTURE_ONLY";
}>;

export function qualification(checks: readonly Check[], blocker?: HostBlocker, identity?: HostIdentity): Qualification {
  return Object.freeze({
    status: blocker ? "HOST_ENFORCEMENT_BLOCKED" : "HOST_ENFORCEMENT_NOT_RUN",
    ...(blocker && { blocker }),
    ...(identity && { identity: Object.freeze({ ...identity }) }),
    checks: Object.freeze(checks.map(check => Object.freeze({ ...check }))),
    qualificationScope: "HARMLESS_FIXTURE_ONLY",
  });
}

const handoff = Object.freeze({
  status: "REAL_MEDIA_PROBE_BLOCKED",
  probeExecutionAuthorized: false,
  realMediaVerified: false,
  sourceRightsVerified: false,
  clipsExtracted: false,
  narrationSyncVerified: false,
  rendered: false,
  productionEligible: false,
  requires: Object.freeze([
    "SEPARATE_SOURCE_AND_USAGE_APPROVAL",
    "CURRENT_SOURCE_IDENTITY_AND_AUTHORIZED_READ",
    "EXACT_REVIEWED_PROBE_EXECUTABLE_AND_DEPENDENCIES",
    "MATCHING_CURRENT_HOST_AND_POLICY_ENFORCEMENT",
    "AUTHORIZED_READ_ONLY_DESCRIPTOR_AND_FIXED_ARGUMENTS",
    "OS_NETWORK_FILESYSTEM_RESOURCE_AND_OUTPUT_LIMITS",
    "INDEPENDENT_RESULT_VALIDATION_WITH_REDACTION",
  ]),
} as const);

export function buildMediaSandboxHandoff(...authority: never[]) {
  if (authority.length) throw new Error("UNSUPPORTED_PROBE_AUTHORITY");
  return handoff;
}
