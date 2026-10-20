import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { generateRenderRecipe as generate, validateRenderRecipe as validate, parseRenderRequestProposal, RENDER_PLANNING as R } from "../../../lib/storyline/render-planning";
import { fakeVoiceRestrictions } from "../../../lib/storyline/voice/foundation/contracts";
import { renderFixture, clone } from "./fixture";
import { inferredOptions } from "../timeline-studio/presentation.fixture";

function frozen(value: unknown) { if (value && typeof value === "object") { assert.ok(Object.isFrozen(value)); for (const v of Object.values(value)) frozen(v); } }
test("M8 deterministic full replay freezes exact saved identities, domains, frames, ticks and ancestry without mutation", async () => {
  const f = await renderFixture(), before = canonicalJson(f.observation), p = await generate(f.input, f.resolver);
  assert.equal(p.id, `rr-${contractHash(R.recipe, p.recipe)}`); frozen(p);
  assert.equal(canonicalJson(p), canonicalJson(await generate(f.input, f.resolver)));
  assert.deepEqual(await validate(p, f.input, f.resolver), p); assert.equal(f.calls(), 3);
  assert.equal(canonicalJson(f.observation), before);
  let end = 0, frames = 0;
  for (const s of p.recipe.segments) {
    assert.equal(s.outputStartMs, end); assert.equal(s.sourceStartFrame, s.sourceStartMs / 40);
    assert.equal(s.sourceEndFrame, s.sourceEndMs / 40); assert.equal(s.outputStartFrame, frames);
    assert.equal(s.frameCount, s.durationMs / 40); assert.equal(s.durationTicks, s.durationMs);
    assert.equal(s.sourceStartTick, s.sourceStartMs); assert.equal(s.transition, "CUT_ONLY");
    assert.deepEqual(s.provenance.evidence, f.observation.timeline.view.record.plan.plan.segments[s.presentationIndex].candidate.evidence);
    end = s.outputEndMs; frames = s.outputEndFrame;
  }
  assert.equal(p.recipe.totalOutputMs, end); assert.equal(p.recipe.totalOutputFrames, frames);
  assert.equal(p.recipe.totalOutputTicks, end); assert.equal(p.recipe.sourceObservation.topology.audio, 1);
  assert.equal(p.recipe.outputAudioTracks, 0); assert.equal(p.recipe.audio, "EXCLUDE_ALL");
  assert.equal(p.recipe.profile.encodingPolicy, "DISABLED"); assert.equal(p.recipe.profile.engineAvailability, "NOT_ESTABLISHED");
  assert.equal(p.recipe.restrictions.executable, false); assert.equal(p.recipe.restrictions.humanApproval, "NONE");
});
test("M8 preserves M7 revision two separately from M6 revision one and independently replays the immediate M7 parent", async () => {
  const f = await renderFixture({}, undefined, 2), p = await generate(f.input, f.resolver);
  assert.equal(p.recipe.dependency.timelineHeadRevision, 2); assert.equal(p.recipe.dependency.m6HeadRevision, 1);
  assert.equal(p.recipe.dependency.timelineParent?.version, 1); assert.equal(p.recipe.dependency.timeline.version, 2);
  assert.equal(p.recipe.dependency.m6Parent, null);
});
test("M8 nonchronological unequal cuts preserve qualified contradictory psychology and Chinese evidence", async () => {
  const f = await renderFixture({ ...inferredOptions, raw: r => { r.transcript.segments[0].endMs = 1000; } }, f => { f.input.policy.presentation = "SCORE_ORDER"; });
  const p = await generate(f.input, f.resolver); assert.notDeepEqual(p.recipe.sourceOrder, p.recipe.presentationOrder);
  assert.ok(new Set(p.recipe.segments.map(s => s.durationMs)).size > 1);
  const inference = p.recipe.segments.find(s => s.provenance.classification === "INFERRED")!;
  assert.ok(inference); assert.equal(inference.provenance.uncertainty, "COMPETING"); assert.ok(inference.provenance.qualification); assert.ok(inference.provenance.contradictions.length);
  assert.ok(inference.provenance.evidence.every(e => e.sourceText.length > 0));
  assert.deepEqual(await validate(p, f.input, f.resolver), p);
});
test("M8 accepts 40ms cuts, exact source end and touching half-open source intervals without filler", async () => {
  const f = await renderFixture({ raw: r => { r.transcript.segments[0].endMs = r.transcript.segments[2].startMs; } }, f => { f.input.policy.maxTotalSourceMs = 24000; });
  const p = await generate(f.input, f.resolver), source = [...p.recipe.segments].sort((a, b) => a.sourceStartMs - b.sourceStartMs);
  assert.ok(source.some((s, i) => i > 0 && source[i - 1].sourceEndMs === s.sourceStartMs));
  assert.equal(source.at(-1)!.sourceEndMs, p.recipe.sourceObservation.fingerprint.durationMs);
  const tiny = await renderFixture({ raw: r => { r.transcript.segments[0].endMs = 40; } });
  assert.ok((await generate(tiny.input, tiny.resolver)).recipe.segments.some(s => s.frameCount === 1));
});
test("M8 rejects a valid M7 1ms cut rather than rounding or modifying the saved M7 plan", async () => {
  const f = await renderFixture({ raw: r => { r.transcript.segments[0].endMs = 1; } }), before = canonicalJson(f.observation);
  assert.ok(f.observation.timeline.view.record.plan.plan.segments.some(s => s.durationMs === 1));
  await assert.rejects(generate(f.input, f.resolver), { code: "FRAME_BOUNDARY_UNREPRESENTABLE" }); assert.equal(canonicalJson(f.observation), before);
});
test("M8 fake audio remains reference-only historical ancestry and never controls time or adds output tracks", async () => {
  const f = await renderFixture({ edited: true }, f => { f.input.audio = { schemaVersion: "story-highlight-synthetic-audio-ref-v1", artifactId: "not-a-wave-file", artifactHash: "a".repeat(64), planHash: "b".repeat(64),
    reference: f.input.source.narration, execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: fakeVoiceRestrictions }; });
  const p = await generate(f.input, f.resolver); assert.deepEqual(p.recipe.historicalFakeAudio, f.observation.timeline.view.record.plan.plan.audio);
  assert.equal(p.recipe.historicalFakeAudio!.speech, "NOT_VERIFIED"); assert.equal(p.recipe.dependency.source.narration.artifact.hashDomain, "story-edited-narration-v1");
  assert.equal(p.recipe.totalOutputMs, f.observation.timeline.view.record.plan.plan.totalOutputMs); assert.equal(p.recipe.outputAudioTracks, 0);
});
test("M8 observation timestamps and request idempotency keys never enter stable recipe identity", async () => {
  const f = await renderFixture(), first = await generate(f.input, f.resolver); f.observation.observedAt = "2026-10-20T05:00:00.000Z";
  assert.deepEqual(await generate(f.input, f.resolver), first);
  const request = { schemaVersion: R.request, scope: f.input.scope, recipeReference: { id: first.id, hash: first.recipeHash, hashDomain: R.recipe },
    dependencyReference: { id: `rrdep-${first.recipe.dependencyHash}`, hash: first.recipe.dependencyHash, hashDomain: R.dependency }, idempotencyKey: "request-one", execution: "DISABLED_HANDOFF_ONLY", executable: false };
  const a = parseRenderRequestProposal(request), b = parseRenderRequestProposal({ ...request, idempotencyKey: "request-two" });
  assert.equal(a.executable, false); assert.deepEqual(a.recipeReference, b.recipeReference); assert.deepEqual(a, parseRenderRequestProposal(clone(a))); frozen(a);
  assert.notEqual(contractHash(R.request, a), contractHash(R.request, b));
});
test("M8 newly validated source fingerprint changes stable identity and cannot validate against the old saved reference", async () => {
  const a = await renderFixture(), b = await renderFixture({ raw: r => { r.media.sha256 = "e".repeat(64); } });
  const first = await generate(a.input, a.resolver), second = await generate(b.input, b.resolver);
  assert.notEqual(first.id, second.id); assert.notEqual(first.recipe.dependencyHash, second.recipe.dependencyHash);
  await assert.rejects(validate(first, a.input, b.resolver));
});
