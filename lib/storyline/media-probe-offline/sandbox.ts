import "server-only";
import { canonicalJson } from "../canonical";
import { freeze } from "../validation";
import { capture, choice, deny, fields, MEDIA_PROBE, restrictions, sha256 } from "./contracts";

export const fixedProbeExecutable = "/opt/movie-translator/media-probe/bin/ffprobe";

export const sandboxRequirements = freeze({
  executableIdentity: "PIN_VERSION_AND_SHA256_BEFORE_LAUNCH",
  shell: "FORBIDDEN",
  environment: "EMPTY",
  credentials: "FORBIDDEN",
  network: "ISOLATED_NAMESPACE_AND_SOCKET_DENIAL",
  protocols: "FIXED_LOCAL_DESCRIPTOR_ONLY",
  input: "ONE_CURRENT_AUTHORIZED_READ_ONLY_DESCRIPTOR",
  mounts: "MINIMAL_READ_ONLY_ALLOWLIST",
  narrationStore: "INACCESSIBLE",
  repository: "INACCESSIBLE",
  identity: "DEDICATED_NON_ROOT_UID_NO_CAPABILITIES_NO_NEW_PRIVILEGES",
  applicationIsolation: "SEPARATE_PROCESS_AND_PID_NAMESPACE",
  syscalls: "KERNEL_SECCOMP_ALLOWLIST",
  resourceEnforcement: "OS_ENFORCED_CPU_MEMORY_PIDS_AND_SUPERVISED_WALL_TIME",
  termination: "TERMINATE_ISOLATED_GROUP_DRAIN_BOUNDED_PIPES_AND_REAP",
  output: "BOUNDED_STDOUT_STDERR_ONLY",
  diagnostics: "REDACTED_CODES_ONLY",
  limits: { cpuSeconds: 2, wallMs: 5000, memoryBytes: 128 * 1024 * 1024, processes: 4,
    stdoutBytes: MEDIA_PROBE.maxMetadataBytes, stderrBytes: 8192 },
} as const);

export function validateSandboxProfile(value: unknown) {
  const profile = fields(capture(value), ["schemaVersion", "executable", "requirements"]);
  if (profile.schemaVersion !== MEDIA_PROBE.profile || canonicalJson(profile.requirements) !== canonicalJson(sandboxRequirements)) {
    deny("UNSUPPORTED_SANDBOX_POLICY");
  }
  const executable = fields(profile.executable, ["path", "version", "sha256"]);
  if (executable.path !== fixedProbeExecutable ||
    typeof executable.version !== "string" || !/^(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/.test(executable.version)) {
    deny("INVALID_EXECUTABLE_PIN");
  }
  return freeze({
    schemaVersion: MEDIA_PROBE.profile,
    executable: { path: fixedProbeExecutable, version: executable.version, sha256: sha256(executable.sha256) },
    requirements: sandboxRequirements,
    status: "SANDBOX_NOT_QUALIFIED",
    restrictions,
  } as const);
}

export const linuxHintNames = Object.freeze([
  "userNamespace", "mountNamespace", "networkNamespace", "pidNamespace",
  "unprivilegedUserNamespacePolicy", "seccompInterface", "cgroupCpu", "cgroupMemory", "cgroupPids",
] as const);
type HintName = typeof linuxHintNames[number];
const hintStates = ["VISIBLE", "ABSENT_OR_DISABLED", "UNKNOWN"] as const;
export type LinuxHintState = typeof hintStates[number];

/** Availability hints are inputs to review. There is no qualification state in this assessor. */
export function assessSandboxReadiness(value: unknown) {
  const input = fields(capture(value), ["schemaVersion", "platform", "identity", "interfaces"]);
  if (input.schemaVersion !== MEDIA_PROBE.hostHints) deny("INVALID_HOST_HINTS");
  const platform = choice(input.platform, ["LINUX", "OTHER"] as const);
  const identity = choice(input.identity, ["NON_ROOT", "ROOT", "UNKNOWN"] as const);
  const reported = fields(input.interfaces, linuxHintNames);
  const interfaces = {} as Record<HintName, LinuxHintState>;
  for (const name of linuxHintNames) interfaces[name] = choice(reported[name], hintStates);

  return freeze({
    schemaVersion: MEDIA_PROBE.sandbox,
    status: "SANDBOX_NOT_QUALIFIED",
    evidence: "AVAILABILITY_HINTS_ONLY",
    platform,
    identity,
    interfaces,
    unavailableOrUnknown: linuxHintNames.filter(name => interfaces[name] !== "VISIBLE"),
    blockers: [
      ...(platform === "LINUX" ? [] : ["LINUX_REQUIRED"]),
      ...(identity === "NON_ROOT" ? [] : ["NON_ROOT_IDENTITY_UNCONFIRMED"]),
      "RUNNER_ENFORCEMENT_UNVERIFIED",
      "INDEPENDENT_SANDBOX_QUALIFICATION_REQUIRED",
    ],
    restrictions,
  } as const);
}
