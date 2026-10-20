import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { parseRenderPlanningInput, parseSyntheticRenderProfile, parseSyntheticSourceObservation, parseRenderRequestProposal, syntheticRenderProfile, RENDER_PLANNING as R } from "../../../lib/storyline/render-planning";
import { exactUnits } from "../../../lib/storyline/render-planning/input";
import { renderFixture, clone, sourceObservation } from "./fixture";

for (const field of ["sourcePath", "url", "commands", "filterGraph", "credentials", "sessionToken", "executionPermit", "replacementClips", "approval", "currentness", "audioTiming", "generation"]) test(`M8 input rejects caller ${field}`, async () => {
  const f = await renderFixture(); assert.throws(() => parseRenderPlanningInput({ ...f.input, [field]: "untrusted" }));
});
test("M8 wire domains are new, strict and domain-separated while existing M7 domains remain unchanged", async () => {
  const f = await renderFixture(); assert.deepEqual(parseRenderPlanningInput(f.input), f.input);
  const domains = [R.input, R.policy, R.profile, R.source, R.dependency, R.recipe, R.request]; assert.equal(new Set(domains).size, 7);
  assert.equal(new Set(domains.map(d => contractHash(d, { value: 1 }))).size, 7);
  assert.equal(f.input.timeline.recordHashDomain, "story-recap-timeline-saved-record-v1");
  assert.deepEqual(parseSyntheticRenderProfile(clone(syntheticRenderProfile)), syntheticRenderProfile);
});
for (const [name, mutate] of [
  ["unsupported schema", (v: Record<string, unknown>) => { v.schemaVersion = "v2"; }],
  ["missing saved record", (v: Record<string, unknown>) => { delete v.timeline; }],
  ["unsaved tl plan", (v: Record<string, unknown>) => { v.timeline = { id: "tl-unsaved" }; }],
  ["wrong record domain", (v: Record<string, unknown>) => { (v.timeline as Record<string, unknown>).recordHashDomain = "story-highlight-saved-record-v1"; }],
  ["wrong plan domain", (v: Record<string, unknown>) => { (v.timeline as Record<string, unknown>).planHashDomain = "story-highlight-plan-v1"; }],
  ["zero version", (v: Record<string, unknown>) => { (v.timeline as Record<string, unknown>).version = 0; }],
  ["unsafe version", (v: Record<string, unknown>) => { (v.timeline as Record<string, unknown>).version = Number.MAX_SAFE_INTEGER + 1; }],
  ["malformed hash", (v: Record<string, unknown>) => { (v.timeline as Record<string, unknown>).recordHash = "A".repeat(64); }],
  ["path as ID", (v: Record<string, unknown>) => { (v.timeline as Record<string, unknown>).id = "../secret"; }],
  ["promoted policy", (v: Record<string, unknown>) => { (v.policy as Record<string, unknown>).audio = "KEEP"; }],
] as const) test(`M8 input rejects ${name}`, async () => {
  const f = await renderFixture(), v = clone(f.input) as unknown as Record<string, unknown>; mutate(v); assert.throws(() => parseRenderPlanningInput(v));
});
test("M8 canonical boundary rejects getters without running them, prototypes, cycles, sparse arrays, unicode and oversized input", async () => {
  const f = await renderFixture(); let calls = 0;
  const getter = { ...f.input }; Object.defineProperty(getter, "timeline", { enumerable: true, get() { calls++; throw Error("getter"); } });
  const cyclic: Record<string, unknown> = { ...f.input }; cyclic.cycle = cyclic;
  for (const v of [getter, Object.assign(Object.create({ unsafe: true }), f.input), cyclic, { ...f.input, timeline: [1, , 3] },
    { ...f.input, scope: { ...f.input.scope, tenantId: "\ud800" } }, { ...f.input, extra: "x".repeat(R.inputBytes + 1) }]) assert.throws(() => parseRenderPlanningInput(v));
  assert.equal(calls, 0);
});
for (const value of [-0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) test(`M8 source rejects unsafe numeric value ${Object.is(value, -0) ? '-0' : value}`, () => {
  const v = sourceObservation({ sha256: "a".repeat(64), bytes: 1024, durationMs: 24000 }); v.fingerprint.bytes = value; assert.throws(() => parseSyntheticSourceObservation(v));
});
for (const [name, mutate] of [
  ["unknown codec", (v: ReturnType<typeof sourceObservation>) => { v.video.codec = "HEVC" as never; }],
  ["unknown container", (v: ReturnType<typeof sourceObservation>) => { v.container = "MKV" as never; }],
  ["wrong dimensions", (v: ReturnType<typeof sourceObservation>) => { v.video.width = 1280 as never; }],
  ["unknown pixel format", (v: ReturnType<typeof sourceObservation>) => { v.video.pixelFormat = "RGB" as never; }],
  ["rotation", (v: ReturnType<typeof sourceObservation>) => { v.video.rotation = 90 as never; }],
  ["VFR", (v: ReturnType<typeof sourceObservation>) => { v.video.variableFrameRate = true as never; }],
  ["encryption", (v: ReturnType<typeof sourceObservation>) => { v.encrypted = true as never; }],
  ["two videos", (v: ReturnType<typeof sourceObservation>) => { v.topology.video = 2 as never; }],
  ["two audios", (v: ReturnType<typeof sourceObservation>) => { v.topology.audio = 2; }],
  ["subtitle stream", (v: ReturnType<typeof sourceObservation>) => { v.topology.subtitle = 1 as never; }],
  ["data stream", (v: ReturnType<typeof sourceObservation>) => { v.topology.data = 1 as never; }],
  ["attachment", (v: ReturnType<typeof sourceObservation>) => { v.topology.attachment = 1 as never; }],
  ["nonzero stream index", (v: ReturnType<typeof sourceObservation>) => { v.video.streamIndex = 1 as never; }],
  ["nonzero origin", (v: ReturnType<typeof sourceObservation>) => { v.video.startTick = 1 as never; }],
  ["discontinuous timestamps", (v: ReturnType<typeof sourceObservation>) => { v.video.timestamps = "GUESSED" as never; }],
  ["false possession", (v: ReturnType<typeof sourceObservation>) => { v.possession = "OWNED" as never; }],
  ["probe claim", (v: ReturnType<typeof sourceObservation>) => { v.verification = "PROBED" as never; }],
  ["frame mismatch", (v: ReturnType<typeof sourceObservation>) => { v.video.frameCount++; }],
  ["tick mismatch", (v: ReturnType<typeof sourceObservation>) => { v.video.durationTicks++; }],
  ["fractional source duration", (v: ReturnType<typeof sourceObservation>) => { v.fingerprint.durationMs = 1.5; }],
  ["source duration beyond bound", (v: ReturnType<typeof sourceObservation>) => { v.fingerprint.durationMs = R.maxDurationMs + 40; }],
  ["source bytes beyond bound", (v: ReturnType<typeof sourceObservation>) => { v.fingerprint.bytes = R.maxSourceBytes + 1; }],
  ["noncanonical rate", (v: ReturnType<typeof sourceObservation>) => { v.video.frameRate = { numerator: 50, denominator: 2 }; }],
  ["zero denominator", (v: ReturnType<typeof sourceObservation>) => { v.video.frameRate.denominator = 0; }],
  ["wrong rate", (v: ReturnType<typeof sourceObservation>) => { v.video.frameRate.numerator = 30; }],
  ["wrong timebase", (v: ReturnType<typeof sourceObservation>) => { v.video.timebase.denominator = 90000; }],
  ["rational overflow", (v: ReturnType<typeof sourceObservation>) => { v.video.timebase.denominator = Number.MAX_SAFE_INTEGER; }],
] as const) test(`M8 declared source rejects ${name}`, () => {
  const v = sourceObservation({ sha256: "a".repeat(64), bytes: 1024, durationMs: 24000 }); mutate(v); assert.throws(() => parseSyntheticSourceObservation(v));
});
test("M8 BigInt conversion checks exact frames/ticks and safe output, never rounds or serializes BigInt", () => {
  assert.equal(exactUnits(40, { numerator: 25, denominator: 1 }, "FRAME_BOUNDARY_UNREPRESENTABLE"), 1);
  assert.equal(exactUnits(40, { numerator: 1000, denominator: 1 }, "UNSUPPORTED_TIMEBASE"), 40);
  assert.throws(() => exactUnits(1, { numerator: 25, denominator: 1 }, "FRAME_BOUNDARY_UNREPRESENTABLE"), { code: "FRAME_BOUNDARY_UNREPRESENTABLE" });
  assert.throws(() => exactUnits(40, { numerator: 1, denominator: 3 }, "UNSUPPORTED_TIMEBASE"), { code: "UNSUPPORTED_TIMEBASE" });
  assert.throws(() => exactUnits(Number.MAX_SAFE_INTEGER, { numerator: 1000000000, denominator: 1 }, "UNSUPPORTED_TIMEBASE"), { code: "RESOURCE_LIMIT" });
  assert.throws(() => canonicalJson({ frames: BigInt(1) }));
});
for (const field of ["executable", "engineAvailability", "encodingPolicy", "videoCodec", "outputStreams"]) test(`M8 fixed profile rejects promotion/change of ${field}`, () => {
  assert.throws(() => parseSyntheticRenderProfile({ ...syntheticRenderProfile, [field]: "CLAIMED_SUPPORTED" }));
});
test("M8 request cannot contain commands, executable permission, wrong domains, credentials or unscoped keys", async () => {
  const f = await renderFixture(), h = "a".repeat(64), request = { schemaVersion: R.request, scope: f.input.scope, recipeReference: { id: `rr-${h}`, hash: h, hashDomain: R.recipe }, dependencyReference: { id: `rrdep-${h}`, hash: h, hashDomain: R.dependency }, idempotencyKey: "key", execution: "DISABLED_HANDOFF_ONLY", executable: false };
  assert.equal(parseRenderRequestProposal(request).executable, false);
  for (const extra of [{ executable: true }, { execution: "RUN" }, { command: "forbidden" }, { secret: "forbidden" }, { idempotencyKey: "../key" }, { recipeReference: { ...request.recipeReference, hashDomain: R.dependency } }, { dependencyReference: { ...request.dependencyReference, id: "wrong" } }, { scope: { ...f.input.scope, tenantId: "" } }]) assert.throws(() => parseRenderRequestProposal({ ...request, ...extra }));
});
