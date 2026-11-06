import assert from "node:assert/strict";
import { test } from "node:test";
import * as probe from "../../../lib/storyline/media-probe-offline";
import { auditProbeGraph, auditProductionReferences } from "./production-audit.mjs";
import { hostFixture, probeFixture, profileFixture, seconds, sourceFixture } from "./fixtures";

test("transitive probe graph has only pure contracts and rational helpers", async () => {
  assert.deepEqual(await auditProbeGraph(), { runtimeFiles: 10, isolatedModules: 6 });
});

test("production sources contain no probe entry point or activation", async () => {
  assert.ok(await auditProductionReferences() > 300);
});

test("public exports expose validation and readiness without launch or promotion API", () => {
  assert.deepEqual(Object.keys(probe).sort(), [
    "MEDIA_PROBE", "restrictions", "pendingEvidence", "OfflineMediaProbeError",
    "assessSandboxReadiness", "validateSandboxProfile", "sandboxRequirements", "fixedProbeExecutable", "linuxHintNames",
    "parseProbeSeconds", "parseProbeTimebase", "validateSyntheticProbeResult",
    "validateProbeSegmentBoundaries", "buildOfflineProbeHandoff",
  ].sort());
});

test("offline operations neither fetch nor log private caller data", t => {
  const fetchMock = t.mock.method(globalThis, "fetch", () => { throw Error("OFFLINE_NETWORK_DENIED"); });
  const logs = (["log", "info", "warn", "error", "debug"] as const).map(name => t.mock.method(console, name, () => {}));
  const result = probe.validateSyntheticProbeResult(sourceFixture(), probeFixture());
  const interval = probe.validateProbeSegmentBoundaries(result, 0, { start: seconds(0), end: seconds(3, 25) });
  const outputs = [result, interval, probe.validateSandboxProfile(profileFixture()), probe.assessSandboxReadiness(hostFixture()),
    probe.buildOfflineProbeHandoff({ source: sourceFixture(), metadataHash: null, evidence: "PROBE_RESULT_SYNTHETIC" })];
  assert.throws(() => probe.validateSyntheticProbeResult(sourceFixture(), { ...probeFixture(), file: "/private/SYNTHETIC_PRIVATE_PATH" }),
    (error: unknown) => error instanceof probe.OfflineMediaProbeError && !String(error).includes("SYNTHETIC_PRIVATE_PATH"));
  assert.doesNotMatch(JSON.stringify(outputs), /SYNTHETIC_PRIVATE_PATH|PRIVATE_KEY_MARKER|sourceBytes/);
  assert.equal(fetchMock.mock.callCount(), 0);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});
