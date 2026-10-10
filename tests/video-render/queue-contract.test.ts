import assert from "node:assert/strict";
import { test } from "node:test";
import { BURN_IN_PROFILE, RenderError } from "@/lib/video-render/contracts";
import { parseRenderReference, parseRenderSubmission, renderQueueJobId } from "@/lib/video-render/job-contract";
import { validateRuntime } from "@/lib/env";

test("strict submission maps exportMode to the unchanged foundation scope contract", () => {
  const body = { mode: "BURN_IN", exportMode: "APPROVED_ONLY", profileId: BURN_IN_PROFILE.id };
  assert.equal(parseRenderSubmission("project-1", "movie-1", body).scope, "APPROVED_ONLY");
  for (const input of [null, [], {}, { ...body, scope: "ALL_CURRENT" }, { ...body, projectId: "other" }, { ...body, options: ["-vf"] }, { ...body, exportMode: "all" }, { ...body, mode: "SOFT" }, { ...body, profileId: "custom" }]) assert.throws(() => parseRenderSubmission("project-1", "movie-1", input), RenderError);
});
test("Redis payload contains only the job reference and generation; IDs are deterministic", () => {
  const reference = { renderJobId: "00000000-0000-4000-8000-000000000001", generation: 0 };
  assert.deepEqual(parseRenderReference(reference), reference);
  assert.equal(renderQueueJobId(reference), renderQueueJobId({ ...reference }));
  assert.notEqual(renderQueueJobId(reference), renderQueueJobId({ ...reference, generation: 1 }));
  assert.ok(!renderQueueJobId(reference).includes(":"));
  for (const input of [null, [], { ...reference, path: "/private" }, { ...reference, text: "subtitle" }, { ...reference, generation: -1 }, { ...reference, generation: "0" }, { ...reference, generation: 1.1 }, { ...reference, renderJobId: "../secret" }]) assert.throws(() => parseRenderReference(input), RenderError);
});
test("render runtime requires no AI credentials", () => {
  assert.doesNotThrow(() => validateRuntime("render", { DATABASE_URL: "postgresql://localhost/test", REDIS_URL: "redis://localhost:6379" }));
});
