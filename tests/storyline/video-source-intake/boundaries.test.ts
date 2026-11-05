import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir } from "node:fs/promises";
import * as api from "../../../lib/storyline/video-source-intake";
import { auditRuntimeGraph, auditProductionReferences } from "./production-audit.mjs";

test("runtime graph admits filesystem access only in readonly reader; handoff graph has no privileged file access", async () => {
  assert.equal(await auditRuntimeGraph(), 7); assert.equal(await auditRuntimeGraph(true), 5);
});
test("no application/barrel/route/worker/script imports the source inspector or issuer", async () => {
  assert.ok((await auditProductionReferences()).sources > 300);
});
test("public API exposes no metadata constructor, descriptor authority, source-byte return or raw inspection handle", async () => {
  assert.deepEqual(Object.keys(api).sort(), ["VIDEO_SOURCE_INTAKE", "evidenceClasses", "restrictions", "VideoSourceIntakeError",
    "authorizePrivateVideoSourceInspection", "verifyVideoSourceMetadata", "buildVideoProbeHandoff", "verifyVideoProbeHandoff", "futureProbeRequirements"].sort());
  for (const directory of ["lib/storyline/video-source-intake", "tests/storyline/video-source-intake"]) for (const entry of await readdir(directory)) assert.match(entry, /\.(?:ts|mjs)$/);
});
