import assert from "node:assert/strict";
import { test } from "node:test";
import { assessSandboxReadiness, buildOfflineProbeHandoff, MEDIA_PROBE, OfflineMediaProbeError,
  sandboxRequirements, validateSandboxProfile, validateSyntheticProbeResult } from "../../../lib/storyline/media-probe-offline";
import { hostFixture, probeFixture, profileFixture, sourceFixture } from "./fixtures";

test("profile pins one fixed absolute executable and retains all enforcement requirements", () => {
  const profile = validateSandboxProfile(profileFixture());
  assert.equal(profile.status, "SANDBOX_NOT_QUALIFIED");
  assert.equal(profile.restrictions.probeExecutionAuthorized, false);
  assert.equal(profile.requirements.environment, "EMPTY");
  assert.equal(profile.requirements.input, "ONE_CURRENT_AUTHORIZED_READ_ONLY_DESCRIPTOR");
  assert.equal(profile.requirements.output, "BOUNDED_STDOUT_STDERR_ONLY");
  assert.equal(profile.requirements.limits.stdoutBytes, MEDIA_PROBE.maxMetadataBytes);
  assert.ok(Object.isFrozen(profile.requirements.limits));
});

for (const [name, profile] of [
  ["shell command", { ...profileFixture(), command: "synthetic command marker" }],
  ["variable argv", { ...profileFixture(), args: ["marker"] }],
  ["credential environment", { ...profileFixture(), env: { PRIVATE_KEY_MARKER: "SYNTHETIC_VALUE" } }],
  ["private input path", { ...profileFixture(), input: "/private/PRIVATE_PATH_MARKER" }],
  ["relative executable", { ...profileFixture(), executable: { ...profileFixture().executable, path: "ffprobe" } }],
  ["different absolute executable", { ...profileFixture(), executable: { ...profileFixture().executable, path: "/bin/sh" } }],
  ["version suffix", { ...profileFixture(), executable: { ...profileFixture().executable, version: "7.1.1-custom" } }],
  ["bad identity hash", { ...profileFixture(), executable: { ...profileFixture().executable, sha256: "abc" } }],
  ["fake qualification", { ...profileFixture(), status: "SANDBOX_QUALIFIED" }],
  ["shell allowance", { ...profileFixture(), requirements: { ...sandboxRequirements, shell: "ALLOWED" } }],
  ["sandbox fallback", { ...profileFixture(), requirements: { ...sandboxRequirements, fallback: "UNSANDBOXED" } }],
  ["larger output limit", { ...profileFixture(), requirements: { ...sandboxRequirements, limits: { ...sandboxRequirements.limits, stdoutBytes: 999999 } } }],
] as const) {
  test(`profile rejects ${name} without echoing private input`, () => {
    assert.throws(() => validateSandboxProfile(profile), (error: unknown) =>
      error instanceof OfflineMediaProbeError &&
      !/PRIVATE_PATH_MARKER|SYNTHETIC_VALUE|PRIVATE_KEY_MARKER/.test(JSON.stringify(error) + String(error)));
  });
}

test("visible Linux interfaces never qualify a future runner", () => {
  const assessment = assessSandboxReadiness(hostFixture());
  assert.equal(assessment.status, "SANDBOX_NOT_QUALIFIED");
  assert.equal(assessment.evidence, "AVAILABILITY_HINTS_ONLY");
  assert.deepEqual(assessment.unavailableOrUnknown, []);
  assert.ok(assessment.blockers.includes("RUNNER_ENFORCEMENT_UNVERIFIED"));
});

test("absent, unknown, root and non-Linux observations fail closed", () => {
  for (const hint of ["ABSENT_OR_DISABLED", "UNKNOWN"] as const) {
    const assessment = assessSandboxReadiness({ ...hostFixture(hint), identity: "ROOT", platform: "OTHER" });
    assert.equal(assessment.status, "SANDBOX_NOT_QUALIFIED");
    assert.equal(assessment.unavailableOrUnknown.length, 9);
    assert.ok(assessment.blockers.includes("LINUX_REQUIRED"));
    assert.ok(assessment.blockers.includes("NON_ROOT_IDENTITY_UNCONFIRMED"));
  }
});

test("forged host success and claimed OS controls cannot be submitted", () => {
  assert.throws(() => assessSandboxReadiness({ ...hostFixture(), sandboxQualified: true }), OfflineMediaProbeError);
  assert.throws(() => assessSandboxReadiness({ ...hostFixture(), interfaces: { ...hostFixture().interfaces, seccompInterface: "ENFORCED" } }), OfflineMediaProbeError);
  assert.throws(() => assessSandboxReadiness({ ...hostFixture(), interfaces: {} }), OfflineMediaProbeError);
});

test("handoff carries an exact reference and independent recheck gates", () => {
  const source = sourceFixture();
  const handoff = buildOfflineProbeHandoff({ source, metadataHash: "d".repeat(64), evidence: "LOCAL_FILE_BYTES_VERIFIED" });
  assert.deepEqual(handoff.source, { ...source, metadataHash: "d".repeat(64), reportedEvidence: "LOCAL_FILE_BYTES_VERIFIED", currentness: "RECHECK_REQUIRED" });
  assert.equal(handoff.status, "BLOCKED");
  assert.equal(handoff.allowedOutputSchema, MEDIA_PROBE.result);
  assert.equal(handoff.sandboxPolicyVersion, MEDIA_PROBE.profile);
  assert.equal(handoff.maxMetadataBytes, MEDIA_PROBE.maxMetadataBytes);
  assert.ok(handoff.blockers.includes("SOURCE_RIGHTS_PENDING"));
  assert.ok(handoff.blockers.includes("EXTRACTION_NOT_AUTHORIZED"));
  for (const key of ["probeExecutionAuthorized", "realMediaVerified", "sourceRightsVerified", "clipsExtracted", "narrationSyncVerified", "productionEligible"] as const) {
    assert.equal(handoff.restrictions[key], false);
  }
});

test("handoff rejects verified-rights assertions, fake M8 evidence and incomplete observation bindings", () => {
  const base = { source: sourceFixture(), metadataHash: null, evidence: "PROBE_RESULT_SYNTHETIC" };
  assert.equal(buildOfflineProbeHandoff(base).status, "BLOCKED");
  for (const input of [{ ...base, sourceRightsVerified: true }, { ...base, evidence: "SOURCE_RIGHTS_VERIFIED" },
    { ...base, evidence: "LOCAL_FILE_BYTES_VERIFIED" }, { ...base, metadataHash: "e".repeat(64) },
    { schemaVersion: "story-recap-execution-artifact-v1", ...base }]) {
    assert.throws(() => buildOfflineProbeHandoff(input), OfflineMediaProbeError);
  }
});

test("synthetic result, sandbox hints and handoff cannot be used as an execution receipt", () => {
  const result = validateSyntheticProbeResult(sourceFixture(), probeFixture());
  const hints = assessSandboxReadiness(hostFixture());
  assert.equal(result.restrictions.probeExecutionAuthorized, false);
  assert.equal(hints.restrictions.probeExecutionAuthorized, false);
  assert.throws(() => buildOfflineProbeHandoff(result), OfflineMediaProbeError);
  assert.throws(() => validateSyntheticProbeResult(sourceFixture(), { schemaVersion: "story-recap-execution-artifact-v1",
    source: sourceFixture(), mediaVerified: true }), OfflineMediaProbeError);
});
