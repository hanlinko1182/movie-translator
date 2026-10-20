import assert from "node:assert/strict";
import { test } from "node:test";
import { contractHash } from "../../../lib/storyline/canonical";
import { generateRenderRecipe as generate, validateRenderRecipe as validate, RENDER_PLANNING as R, RenderPlanningError, type RenderPlanningResolution, type RenderRecipe } from "../../../lib/storyline/render-planning";
import { parseRenderRecipe } from "../../../lib/storyline/render-planning/recipe";
import { timelineProposalHash, TIMELINE_STORE } from "../../../lib/storyline/timeline-persistence/contracts";
import { fakeVoiceRestrictions } from "../../../lib/storyline/voice/foundation/contracts";
import { renderFixture, clone } from "./fixture";

function set(v: unknown, path: string, value: unknown) {
  const keys = path.split("."); let r = v as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) r = r[k] as Record<string, unknown>;
  r[keys.at(-1)!] = value;
}
function reseal(p: ReturnType<typeof clone<RenderRecipe>>) {
  p.recipe.inputHash = contractHash(R.input, p.recipe.input); p.recipe.dependencyHash = contractHash(R.dependency, p.recipe.dependency);
  p.recipe.sourceObservationHash = contractHash(R.source, p.recipe.sourceObservation); p.recipe.dependency.sourceObservationHash = p.recipe.sourceObservationHash;
  p.recipe.dependencyHash = contractHash(R.dependency, p.recipe.dependency); p.recipe.profileHash = contractHash(R.profile, p.recipe.profile); p.recipe.policyHash = contractHash(R.policy, p.recipe.input.policy);
  p.recipeHash = contractHash(R.recipe, p.recipe); p.id = `rr-${p.recipeHash}`;
}
for (const [name, mutate] of [
  ["Chinese evidence", (v: unknown) => set(v, "recipe.segments.0.provenance.evidence.0.sourceText", "伪造中文证据")],
  ["character", (v: unknown) => set(v, "recipe.segments.0.provenance.characterIds.0", "other-character")],
  ["statement", (v: unknown) => set(v, "recipe.segments.0.provenance.statement", "မမှန်သော ဖော်ပြချက်")],
  ["finding", (v: unknown) => set(v, "recipe.segments.0.provenance.findingId", "other-finding")],
  ["confidence", (v: unknown) => set(v, "recipe.segments.0.provenance.confidence", "HIGH")],
  ["candidate", (v: unknown) => set(v, "recipe.segments.0.candidateId", "other-candidate")],
  ["candidate hash", (v: unknown) => set(v, "recipe.segments.0.candidateHash", "b".repeat(64))],
  ["M7 segment ID", (v: unknown) => set(v, "recipe.segments.0.timelineSegmentId", "tlseg-forged")],
  ["source interval", (v: unknown) => set(v, "recipe.segments.0.sourceStartMs", 40)],
  ["source overrun", (v: unknown) => set(v, "recipe.segments.0.sourceEndMs", R.maxDurationMs)],
  ["output gap", (v: unknown) => set(v, "recipe.segments.1.outputStartMs", 4000)],
  ["output overlap", (v: unknown) => set(v, "recipe.segments.1.outputStartMs", 0)],
  ["frame boundary", (v: unknown) => set(v, "recipe.segments.0.sourceStartFrame", 1)],
  ["frame count", (v: unknown) => set(v, "recipe.segments.0.frameCount", 1)],
  ["tick boundary", (v: unknown) => set(v, "recipe.segments.0.sourceEndTick", 1)],
  ["total time", (v: unknown) => set(v, "recipe.totalOutputMs", 12000)],
  ["total frames", (v: unknown) => set(v, "recipe.totalOutputFrames", 1)],
  ["total ticks", (v: unknown) => set(v, "recipe.totalOutputTicks", 1)],
  ["source chronology index", (v: unknown) => set(v, "recipe.segments.0.sourceChronologyIndex", 3)],
  ["M6 dependency", (v: unknown) => set(v, "recipe.dependency.m6Dependency.hash", "c".repeat(64))],
  ["M7 dependency", (v: unknown) => set(v, "recipe.dependency.m7Dependency.hash", "d".repeat(64))],
  ["M7 parent", (v: unknown) => set(v, "recipe.dependency.timelineParent", { id: "forged-parent", version: 1, recordHash: "a".repeat(64), recordHashDomain: "story-recap-timeline-saved-record-v1", planHash: "b".repeat(64), planHashDomain: "story-recap-timeline-plan-v1" })],
  ["saved revision substitution", (v: unknown) => set(v, "recipe.dependency.timelineHeadRevision", 2)],
] as const) test(`M8 complete replay rejects coordinated canonical ${name} forgery`, async () => {
  const f = await renderFixture(), good = await generate(f.input, f.resolver), hostile = clone(good); mutate(hostile); reseal(hostile);
  // These bodies pass complete shape/self-hash parsing. Independent regeneration must still reject.
  assert.deepEqual(parseRenderRecipe(hostile), hostile);
  await assert.rejects(validate(hostile, f.input, f.resolver), { code: "INTEGRITY_FAILED" }); assert.equal(f.calls(), 2);
});
test("M8 rejects self-consistent changed source, M7 identity and presentation-order envelopes", async () => {
  const f = await renderFixture(), good = await generate(f.input, f.resolver);
  for (const mode of ["source", "identity", "order"]) {
    const p = clone(good);
    if (mode === "source") { p.recipe.sourceObservation.fingerprint.sha256 = "c".repeat(64); p.recipe.dependency.source.media.sha256 = "c".repeat(64); }
    if (mode === "identity") { p.recipe.input.timeline.recordHash = "c".repeat(64); p.recipe.dependency.timeline.recordHash = "c".repeat(64); }
    if (mode === "order") { p.recipe.segments.reverse(); p.recipe.presentationOrder.reverse(); p.recipe.segments.forEach((s, i) => { s.presentationIndex = i; }); }
    reseal(p); parseRenderRecipe(p); await assert.rejects(validate(p, f.input, f.resolver), { code: "INTEGRITY_FAILED" });
  }
});
for (const [name, path, value] of [
  ["approval", "recipe.restrictions.humanApproval", "APPROVED"], ["source verification", "recipe.restrictions.sourceVerified", true],
  ["TTS eligibility", "recipe.restrictions.eligibleForRealTts", true], ["publication", "recipe.restrictions.eligibleForPublication", true],
  ["spend", "recipe.restrictions.spendingAuthority", "PAID"], ["execution", "recipe.restrictions.executable", true],
  ["audio inclusion", "recipe.audio", "KEEP"], ["audio track", "recipe.outputAudioTracks", 1],
  ["real capability", "recipe.profile.capability", "VERIFIED"], ["encoder", "recipe.profile.encodingPolicy", "ENABLED"],
  ["path", "recipe.sourceObservation.path", "/private/source.mp4"], ["filter graph", "recipe.segments.0.filterGraph", "forbidden"],
  ["unknown evidence field", "recipe.segments.0.provenance.evidence.0.credential", "forbidden"],
] as const) test(`M8 rejects rehashed ${name} promotion before resolution`, async () => {
  const f = await renderFixture(), p = clone(await generate(f.input, f.resolver)); set(p, path, value); reseal(p);
  await assert.rejects(validate(p, f.input, f.resolver)); assert.equal(f.calls(), 1);
});
for (const status of ["UNKNOWN", "NOT_FOUND", "UNSAVED", "UNAUTHORIZED", "STALE", "SUPERSEDED", "UNSUPPORTED"] as const) test(`M8 ${status} resolver fails closed in one call without substitution/retry`, async () => {
  const f = await renderFixture(); let calls = 0;
  await assert.rejects(generate(f.input, { resolve: () => { calls++; return { status }; } }), RenderPlanningError); assert.equal(calls, 1);
});
test("M8 resolver exception and malformed resolution expose no private details and never retry", async () => {
  const f = await renderFixture(); let calls = 0;
  await assert.rejects(generate(f.input, { resolve: () => { calls++; throw Error("private locator and credential"); } }), e => e instanceof RenderPlanningError && e.code === "RESOLUTION_UNAVAILABLE" && !e.message.includes("credential")); assert.equal(calls, 1);
  for (const v of [null, { status: "RESOLVED_SYNTHETIC", authority: true }, { status: "UNKNOWN", credentials: "private" }]) await assert.rejects(generate(f.input, { resolve: () => v as unknown as RenderPlanningResolution }));
});
for (const [name, path, value] of [
  ["M7 head revision", "head.revision", 2], ["M7 head identity", "head.identity.recordHash", "c".repeat(64)],
  ["M7 stale", "timeline.view.currentness", "STALE_DEPENDENCIES"], ["M7 superseded", "timeline.view.currentness", "SUPERSEDED"],
  ["M6 head", "currentM6.head.revision", 2], ["M6 source revision", "currentM6.current.source.currentness.sourceRevision", 99],
  ["M6 narration revision", "currentM6.current.source.currentness.narrationRevision", 99], ["M6 media", "currentM6.current.source.media.sha256", "c".repeat(64)],
  ["M6 candidate", "currentM6.current.source.narration.analysis.candidateHash", "d".repeat(64)],
  ["M6 policy disabled", "currentM6.current.policyEnabled", false], ["M7 policy disabled", "admission.m7PolicyEnabled", false],
  ["M6 scope disabled", "admission.m6ScopeEnabled", false], ["M7 scope disabled", "admission.m7ScopeEnabled", false],
  ["M7 policy substitution", "admission.m7PolicyVersion", "v2"],
  ["source fingerprint", "sourceObservation.fingerprint.sha256", "b".repeat(64)],
  ["source bytes", "sourceObservation.fingerprint.bytes", 1],
] as const) test(`M8 rejects independent ${name} drift after initial valid planning`, async () => {
  const f = await renderFixture(), good = await generate(f.input, f.resolver); set(f.observation, path, value);
  await assert.rejects(validate(good, f.input, f.resolver)); assert.equal(f.calls(), 2);
});
for (const field of ["tenantId", "projectId", "movieId", "studioId"] as const) test(`M8 independently rejects cross-scope ${field}`, async () => {
  const f = await renderFixture(); await assert.rejects(generate({ ...f.input, scope: { ...f.input.scope, [field]: "other" } }, f.resolver));
});
test("M8 immediate parent and independently captured M6 record cannot be replaced by a rehashed caller plan", async () => {
  const f = await renderFixture({}, undefined, 2), good = await generate(f.input, f.resolver);
  set(f.observation, "parent.view.record.plan.plan.segments.0.candidate.statement", "forged");
  await assert.rejects(validate(good, f.input, f.resolver));
  const other = await renderFixture(), p = await generate(other.input, other.resolver);
  set(other.observation, "timeline.dependency.m6Record.record.plan.plan.candidates.0.statement", "forged");
  await assert.rejects(validate(p, other.input, other.resolver));
});
for (const path of ["segments.0.candidate.statement", "segments.0.outputEndMs", "source.media.sha256"]) test(`M8 independently rejects coordinated saved M7 ${path} rehash`, async () => {
  const f = await renderFixture(), view = f.observation.timeline.view, r = view.record;
  set(r.plan.plan, path, path.includes("sha256") ? "c".repeat(64) : path.includes("statement") ? "forged statement" : 3000);
  r.plan.planHash = contractHash("story-recap-timeline-plan-v1", r.plan.plan); r.plan.id = `tl-${r.plan.planHash}`;
  r.proposalHash = timelineProposalHash({ schemaVersion: TIMELINE_STORE.proposal, scope: r.scope, idempotencyKey: r.idempotencyKey, expectedRevision: r.expectedRevision, previous: r.previous, plan: r.plan });
  view.recordHash = contractHash(TIMELINE_STORE.record, r);
  f.input.timeline.recordHash = view.recordHash; f.input.timeline.planHash = r.plan.planHash; f.observation.head.identity = clone(f.input.timeline);
  await assert.rejects(generate(f.input, f.resolver));
});
test("M8 fake historical silence cannot be promoted into verified speech by recomputing recipe hashes", async () => {
  const f = await renderFixture({}, f => { f.input.audio = { schemaVersion: "story-highlight-synthetic-audio-ref-v1", artifactId: "fake-reference", artifactHash: "a".repeat(64), planHash: "b".repeat(64), reference: f.input.source.narration,
    execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: fakeVoiceRestrictions }; });
  const p = clone(await generate(f.input, f.resolver)); set(p, "recipe.historicalFakeAudio.speech", "VERIFIED_MYANMAR_SPEECH"); reseal(p);
  await assert.rejects(validate(p, f.input, f.resolver)); assert.equal(f.calls(), 1);
});
test("M8 recipe rejects sparse arrays, unusual array prototypes and invalid Unicode before independent resolution", async () => {
  const f = await renderFixture(), good = await generate(f.input, f.resolver);
  const sparse = clone(good); delete (sparse.recipe.segments as unknown[])[0];
  const unusual = clone(good); Object.setPrototypeOf(unusual.recipe.segments, Object.create(Array.prototype));
  const unicode = clone(good); unicode.recipe.segments[0].provenance.statement = "\ud800";
  for (const p of [sparse, unusual, unicode]) await assert.rejects(validate(p, f.input, f.resolver)); assert.equal(f.calls(), 1);
});
