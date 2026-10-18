import assert from "node:assert/strict";
import { before, after, mock, test } from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { createFakeVoiceHarness, createSyntheticVoiceAdapterForTest } from "@/lib/storyline/voice/foundation/fake-adapter";
import { productionVoiceCapabilities, syntheticVoiceCapability, parseSyntheticVoiceCapability } from "@/lib/storyline/voice/foundation/capability";
import { planMyanmarVoice } from "@/lib/storyline/voice/foundation/chunk-plan";
import { VOICE_FOUNDATION as V } from "@/lib/storyline/voice/foundation/contracts";
import { voiceFoundationFixture } from "./fixture";
let networkCalls = 0;
before(() => {
  const forbidden = () => { networkCalls++; assert.fail("No provider or network call is allowed in M5-01"); };
  mock.method(globalThis, "fetch", forbidden);
  for (const target of [http, https]) { mock.method(target, "request", forbidden); mock.method(target, "get", forbidden); }
  mock.method(net, "connect", forbidden); mock.method(net, "createConnection", forbidden); mock.method(tls, "connect", forbidden);
});
after(() => { mock.restoreAll(); assert.equal(networkCalls, 0); });
const f = voiceFoundationFixture();
function fixture(scenario: "FIXTURE_BYTES" | "UNKNOWN" | "DEFINITIVE_FAILURE" = "FIXTURE_BYTES") {
  const wire = createSyntheticVoiceAdapterForTest({ capability: f.capability, scenario });
  return { ...wire, service: createFakeVoiceHarness({ adapter: wire.adapter, scope: f.scope }) };
}
test("M5-01 fake capability data is isolated, exact, permanently unverified; real registry remains empty", () => {
  assert.deepEqual(productionVoiceCapabilities, []); assert.equal(Object.isFrozen(productionVoiceCapabilities), true);
  assert.equal(f.capability.support, "UNVERIFIED_SYNTHETIC_FIXTURE"); assert.equal(f.capability.cloning, "NONE");
  assert.deepEqual(parseSyntheticVoiceCapability(f.capability), f.capability);
  for (const changed of [{ ...f.capability, support: "VERIFIED" }, { ...f.capability, execution: "PRODUCTION" },
    { ...f.capability, providerId: "live-provider" }, { ...f.capability, cloning: "ALLOWED" },
    { ...f.capability, profileHash: "0".repeat(64) }, { ...f.capability, apiKey: "forged" }, { ...f.capability, originalMovieAudio: "INCLUDED" }]) assert.throws(() => parseSyntheticVoiceCapability(changed));
});
test("M5-01 only genuine process-registered fake adapters are usable; no serialized, Boolean, role or type authority", () => {
  const x = fixture();
  for (const adapter of [true, {}, { kind: "REGISTERED_FAKE_ONLY" }, { ...x.adapter }, { approved: true, role: "admin" }]) assert.throws(() => createFakeVoiceHarness({ adapter, scope: f.scope }));
  assert.throws(() => JSON.stringify(x.adapter)); assert.equal(x.calls(), 0);
  assert.throws(() => createSyntheticVoiceAdapterForTest({ capability: f.capability, scenario: "FIXTURE_BYTES", send: () => assert.fail("callback") }));
});
test("M5-01 deterministic fixture result binds actual audio bytes, request, recipe, section/chunk and full provenance", () => {
  const x = fixture(), first = x.service.submit(f.request), again = x.service.submit(structuredClone(f.request));
  assert.deepEqual(first, again); assert.equal(x.calls(), 1); assert.ok(first.bytes);
  assert.equal(first.result.outcome, "FIXTURE_BYTES"); if (first.result.outcome !== "FIXTURE_BYTES") assert.fail();
  const m = first.result.metadata;
  assert.equal(m.audioSha256, createHash("sha256").update(first.bytes).digest("hex"));
  assert.equal(m.nativeAudioSha256, m.audioSha256); assert.equal(m.bytes, first.bytes.byteLength);
  assert.deepEqual(m.reference, f.plan.plan.reference); assert.deepEqual(m.voice, f.capability); assert.deepEqual(m.chunk, f.plan.plan.chunks[0]);
  assert.equal(m.planHash, f.plan.planHash); assert.equal(m.requestHash, first.result.requestHash);
  assert.equal(m.recipeHash, contractHash(V.recipe, { reference: f.plan.plan.reference, planHash: f.plan.planHash, chunkIndex: 0, capability: f.capability }));
  assert.equal(first.result.metadataHash, contractHash(V.artifact, m));
  assert.equal(m.formatVerification, "UNVERIFIED_FIXTURE");
  assert.equal(m.measurement.durationMs, null); assert.equal(m.measurement.status, "UNVERIFIED_FIXTURE");
  assert.equal(m.restrictions.humanApproval, "NONE"); assert.equal(m.restrictions.sourceVerified, false);
  assert.equal(m.restrictions.eligibleForRealTts, false); assert.equal(m.restrictions.eligibleForPublication, false); assert.equal(m.restrictions.spendingAuthority, "NONE");
  assert.equal(Object.isFrozen(m), true); assert.equal(Object.isFrozen(m.reference), true);
  first.bytes.fill(255); assert.notDeepEqual(first.bytes, x.service.submit(f.request).bytes);
  const independent = fixture().service.submit(f.request); assert.deepEqual(again, independent, "no random timestamp, identity or mutable buffers in output");
});
test("M5-01 changing text/source/candidate/voice/plan/chunk conflicts within one scoped idempotency slot", async t => {
  const x = fixture(); x.service.submit(f.request);
  const changes = [
    { ...f.input, sections: f.input.sections.map((s, i) => i ? s : { ...s, paragraphs: s.paragraphs.map(p => p + "က") }) },
    { ...f.input, reference: { ...f.input.reference, source: { ...f.input.reference.source, contextHash: "f".repeat(64) } } },
    { ...f.input, reference: { ...f.input.reference, analysis: { ...f.input.reference.analysis, candidateHash: "e".repeat(64) } } },
    { ...f.input, capability: syntheticVoiceCapability({ maxChunkBytes: 90, voiceId: "fixture-alternate" }) },
    { ...f.input, capability: syntheticVoiceCapability({ maxChunkBytes: 91, voiceId: "fixture-neutral" }) },
  ];
  for (const [i, input] of changes.entries()) await t.test(`changed proposal ${i}`, () => assert.throws(() => x.service.submit({ ...f.request, plan: planMyanmarVoice(input) }), { fieldPath: "voice.fake.idempotencyConflict" }));
  assert.throws(() => x.service.submit({ ...f.request, chunkIndex: 1 }), { fieldPath: "voice.fake.idempotencyConflict" });
  assert.equal(x.calls(), 1);
});
test("M5-01 UNKNOWN and definitive failure are sticky; fresh keys/harnesses cannot retry the original recipe", () => {
  for (const scenario of ["UNKNOWN", "DEFINITIVE_FAILURE"] as const) {
    const x = fixture(scenario), initial = x.service.submit(f.request);
    assert.equal(initial.result.outcome, scenario); assert.equal(initial.bytes, null);
    assert.deepEqual(x.service.submit(f.request), initial);
    assert.deepEqual(x.service.submit({ ...f.request, idempotencyKey: "refreshed-key" }), initial);
    const another = createFakeVoiceHarness({ adapter: x.adapter, scope: f.scope });
    assert.deepEqual(another.submit({ ...f.request, idempotencyKey: "another-harness" }), initial);
    assert.equal(x.calls(), 1); assert.equal(initial.result.restrictions.eligibleForRealTts, false);
  }
});
test("M5-01 fake execution rejects wrong scope, unavailable capabilities, enabled flags, forged durations/approval/spending and fake-to-real promotion", () => {
  const x = fixture(), future = planMyanmarVoice({ ...f.input, reference: f.future });
  const result = x.service.submit({ ...f.request, plan: future });
  assert.equal(result.result.restrictions.eligibleForRealTts, false); assert.equal(result.result.restrictions.humanApproval, "NONE");
  for (const patch of [{ execution: "ENABLED" }, { execution: "PRODUCTION" }, { approval: { id: "forged" } }, { spending: { confirmed: true } }, { measuredDurationMs: 10 }]) assert.throws(() => x.service.submit({ ...f.request, idempotencyKey: "new", ...patch }));
  const other = createFakeVoiceHarness({ adapter: x.adapter, scope: { ...f.scope, movieId: "other-movie" } }); assert.throws(() => other.submit(f.request));
  assert.throws(() => x.service.submit({ ...f.request, idempotencyKey: "new", plan: planMyanmarVoice({ ...f.input, capability: syntheticVoiceCapability({ maxChunkBytes: 30, voiceId: "fixture-alternate" }) }) }));
  assert.throws(() => x.service.submit({ ...f.request, chunkIndex: -1 }));
  const mutated = JSON.parse(canonicalJson(f.request)); mutated.plan.plan.estimatedDurationMs = 100; mutated.plan.planHash = contractHash(V.plan, mutated.plan.plan);
  assert.throws(() => x.service.submit(mutated));
});
test("M5-01 request capture and response immutability prevent caller mutation and unsafe method execution", () => {
  const x = fixture(); let called = false;
  assert.throws(() => x.service.submit(Object.defineProperty({}, "schemaVersion", { enumerable: true, get() { called = true; return V.request; } })));
  assert.equal(called, false); assert.equal(x.calls(), 0);
  const result = x.service.submit(f.request); assert.throws(() => { Object.assign(result.result.restrictions, { eligibleForRealTts: true }); });
  assert.equal(x.service.submit(f.request).result.restrictions.eligibleForRealTts, false);
});
test("M5-01 request cache is bounded and new keys cannot manufacture additional identical fake calls", () => {
  const x = fixture();
  for (let i = 0; i < V.maxRequests; i++) x.service.submit({ ...f.request, idempotencyKey: `key-${i}` });
  assert.equal(x.calls(), 1); assert.throws(() => x.service.submit({ ...f.request, idempotencyKey: "over-capacity" }));
  assert.equal(x.service.submit({ ...f.request, idempotencyKey: "key-0" }).result.outcome, "FIXTURE_BYTES");
});
