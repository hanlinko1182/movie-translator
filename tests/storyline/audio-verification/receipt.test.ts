import assert from "node:assert/strict";
import { test, before, after, mock } from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { AUDIO_VERIFICATION as A } from "@/lib/storyline/voice/audio-verification/contracts";
import { parseSyntheticAudioReceipt, verifyFakeVoiceOutput } from "@/lib/storyline/voice/audio-verification/receipt";
import { createFakeVoiceHarness, createSyntheticVoiceAdapterForTest } from "@/lib/storyline/voice/foundation/fake-adapter";
import { planMyanmarVoice } from "@/lib/storyline/voice/foundation/chunk-plan";
import { syntheticVoiceCapability } from "@/lib/storyline/voice/foundation/capability";
import { VOICE_FOUNDATION as V } from "@/lib/storyline/voice/foundation/contracts";
import { pcmWav, verifiedFixture } from "./fixture";
let networkCalls = 0;
before(() => {
  const forbidden = () => { networkCalls++; assert.fail("No M5-02 network/provider calls"); };
  mock.method(globalThis, "fetch", forbidden);
  for (const transport of [http, https]) { mock.method(transport, "request", forbidden); mock.method(transport, "get", forbidden); }
  mock.method(net, "connect", forbidden); mock.method(net, "createConnection", forbidden); mock.method(tls, "connect", forbidden);
});
after(() => { mock.restoreAll(); assert.equal(networkCalls, 0); });

test("M5-02 independently verifies unchanged fake bytes, exact narration/source/profile/request linkage and immutable receipt", () => {
  const f = verifiedFixture(), { receipt, bytes } = f.items[0], r = receipt.receipt;
  assert.equal(r.audio.sampleCount, 2); assert.equal(r.audio.durationUs, 83); assert.equal(r.audio.fileBytes, 48);
  assert.equal(r.audio.audioSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(r.reference, f.plan.plan.reference); assert.deepEqual(r.voice, f.capability); assert.deepEqual(r.chunk, f.plan.plan.chunks[0]);
  assert.equal(r.planHash, f.plan.planHash); assert.equal(r.fake.requestId, `fake-request-${r.fake.requestHash}`);
  assert.equal(r.fake.submissionId, `fake-submission-${r.fake.requestHash}`);
  assert.equal(r.fake.requestHash, contractHash(V.request, { schemaVersion: V.request, execution: "FAKE_ONLY", planHash: f.plan.planHash, chunkIndex: 0 }));
  assert.equal(r.fake.recipeHash, contractHash(V.recipe, { reference: f.plan.plan.reference, planHash: f.plan.planHash, chunkIndex: 0, capability: f.capability }));
  assert.equal(receipt.receiptHash, contractHash(A.receipt, r)); assert.notEqual(receipt.receiptHash, r.audio.audioSha256);
  assert.notEqual(r.audio.audioSha256, r.chunk.textHash); assert.notEqual(r.audio.audioSha256, r.planHash);
  const replayed = parseSyntheticAudioReceipt(JSON.parse(canonicalJson(receipt)), { plan: f.plan, chunkIndex: 0, bytes });
  assert.deepEqual(replayed, receipt); assert.equal(Object.isFrozen(replayed.receipt.audio), true);
  assert.throws(() => Object.assign(replayed.receipt.audio, { durationUs: 999 }));
  assert.throws(() => Object.assign(replayed.receipt.restrictions, { eligibleForPublication: true }));
  assert.equal(r.restrictions.eligibleForRealTts, false); assert.equal(r.restrictions.eligibleForPublication, false);
  assert.equal(r.restrictions.humanApproval, "NONE"); assert.equal(r.restrictions.sourceVerified, false); assert.equal(r.restrictions.spendingAuthority, "NONE");
  assert.equal(r.speech, "NOT_VERIFIED");
  const original = f.harness.submit(f.request);
  assert.equal(original.result.outcome, "FIXTURE_BYTES");
  if (original.result.outcome === "FIXTURE_BYTES") {
    assert.equal(original.result.metadata.measurement.durationMs, null);
    assert.equal(original.result.metadata.formatVerification, "UNVERIFIED_FIXTURE");
    assert.equal(r.fake.sourceMetadataHash, original.result.metadataHash);
  }
});
test("M5-02 receipt parser rejects forged metadata even after recomputing its canonical outer hash", async t => {
  const f = verifiedFixture(), { receipt, bytes } = f.items[0];
  const changes: [string, (r: Record<string, unknown>) => void][] = [
    ["duration", r => { (r.audio as Record<string, unknown>).durationUs = 1; }],
    ["samples", r => { (r.audio as Record<string, unknown>).sampleCount = 1; }],
    ["audio hash", r => { (r.audio as Record<string, unknown>).audioSha256 = r.planHash; }],
    ["byte size", r => { (r.audio as Record<string, unknown>).fileBytes = 1; }],
    ["data offset", r => { (r.audio as Record<string, unknown>).dataOffset = 12; }],
    ["policy", r => { (r.audio as Record<string, unknown>).durationPolicy = "TRUST_HEADER"; }],
    ["validator", r => { (r.audio as Record<string, unknown>).validator = "UNVERIFIED"; }],
    ["format", r => { ((r.audio as Record<string, unknown>).format as Record<string, unknown>).channels = 2; }],
    ["chunk text hash", r => { (r.chunk as Record<string, unknown>).textHash = "a".repeat(64); }],
    ["chunk index", r => { (r.chunk as Record<string, unknown>).index = 1; }],
    ["submission", r => { (r.fake as Record<string, unknown>).submissionId = "foreign-submission"; }],
    ["metadata hash", r => { (r.fake as Record<string, unknown>).sourceMetadataHash = "a".repeat(64); }],
    ["voice", r => { (r.voice as Record<string, unknown>).voiceId = "fixture-alternate"; }],
    ["profile", r => { (r.voice as Record<string, unknown>).profileHash = "a".repeat(64); }],
    ["narration domain", r => { ((r.reference as Record<string, unknown>).artifact as Record<string, unknown>).hashDomain = "story-edited-narration-v1"; }],
    ["source", r => { ((r.reference as Record<string, unknown>).source as Record<string, unknown>).contentHash = "a".repeat(64); }],
    ["candidate", r => { ((r.reference as Record<string, unknown>).analysis as Record<string, unknown>).candidateId = "foreign-candidate"; }],
    ["scope", r => { ((r.reference as Record<string, unknown>).scope as Record<string, unknown>).movieId = "foreign-movie"; }],
    ["approval", r => { (r.restrictions as Record<string, unknown>).humanApproval = "APPROVED"; }],
    ["publication", r => { (r.restrictions as Record<string, unknown>).eligibleForPublication = true; }],
    ["unknown field", r => { r.providerReceipt = "forged"; }],
  ];
  for (const [name, change] of changes) await t.test(name, () => {
    const forged = JSON.parse(canonicalJson(receipt)); change(forged.receipt); forged.receiptHash = contractHash(A.receipt, forged.receipt);
    assert.throws(() => parseSyntheticAudioReceipt(forged, { plan: f.plan, chunkIndex: 0, bytes }));
  });
  assert.throws(() => parseSyntheticAudioReceipt(receipt, { plan: f.plan, chunkIndex: 0 }));
  const bytesChanged = Uint8Array.from(bytes); bytesChanged[44] = 1;
  assert.throws(() => parseSyntheticAudioReceipt(receipt, { plan: f.plan, chunkIndex: 0, bytes: bytesChanged }));
});
test("M5-02 wrong expected plan/narration/source/candidate/voice/scope cannot reuse a receipt", () => {
  const f = verifiedFixture(), { receipt, bytes } = f.items[0];
  const movieReference = { ...f.input.reference, scope: { ...f.scope, movieId: "other-movie" }, source: { ...f.input.reference.source, movieId: "other-movie" } };
  for (const input of [
    { ...f.input, ...f.edited },
    { ...f.input, reference: movieReference },
    { ...f.input, reference: { ...f.input.reference, source: { ...f.input.reference.source, contextHash: "a".repeat(64) } } },
    { ...f.input, reference: { ...f.input.reference, analysis: { ...f.input.reference.analysis, candidateHash: "b".repeat(64) } } },
    { ...f.input, capability: syntheticVoiceCapability({ maxChunkBytes: 90, voiceId: "fixture-alternate" }) },
  ]) assert.throws(() => parseSyntheticAudioReceipt(receipt, { plan: planMyanmarVoice(input), chunkIndex: 0, bytes }));
});
test("M5-02 actual R4 edited narration has distinct immutable identity and exact parent lineage", () => {
  const f = verifiedFixture(), plan = planMyanmarVoice({ ...f.edited, capability: f.capability });
  const output = f.harness.submit({ ...f.request, idempotencyKey: "r4-chunk-zero", plan });
  const verified = verifyFakeVoiceOutput({ plan, chunkIndex: 0, output });
  assert.equal(verified.receipt.reference.artifact.kind, "R4_EDITED");
  assert.equal(verified.receipt.reference.artifact.hashDomain, "story-edited-narration-v1");
  assert.deepEqual(verified.receipt.reference.original, f.m4.reference.original);
  assert.equal(verified.receipt.restrictions.syntheticAncestry, true);
});
test("M5-02 independent verification rejects supplied duration, corrupted bytes, 48 kHz plan mismatch and fake metadata as proof", () => {
  const f = verifiedFixture(), output = f.harness.submit(f.request);
  const original = canonicalJson(output.result);
  const claimed = JSON.parse(original); claimed.metadata.measurement = { status: "VERIFIED", durationMs: 100 };
  claimed.metadataHash = contractHash(V.artifact, claimed.metadata);
  assert.throws(() => verifyFakeVoiceOutput({ plan: f.plan, chunkIndex: 0, output: { result: claimed, bytes: output.bytes } }));
  for (const bytes of [null, Buffer.from([0]), pcmWav(2, 48000), pcmWav(3), Buffer.from(output.bytes!).fill(9)]) {
    assert.throws(() => verifyFakeVoiceOutput({ plan: f.plan, chunkIndex: 0, output: { result: output.result, bytes } }));
  }
  assert.throws(() => verifyFakeVoiceOutput({ plan: f.plan, chunkIndex: 1, output }));
  const future = planMyanmarVoice({ ...f.input, reference: f.future });
  assert.throws(() => verifyFakeVoiceOutput({ plan: future, chunkIndex: 0, output: f.harness.submit({ ...f.request, idempotencyKey: "future", plan: future }) }));
  assert.equal(canonicalJson(output.result), original);
});
test("M5-02 UNKNOWN and failure remain unresolved with zero verifier resends under new keys and harnesses", () => {
  const f = verifiedFixture();
  for (const scenario of ["UNKNOWN", "DEFINITIVE_FAILURE"] as const) {
    const fake = createSyntheticVoiceAdapterForTest({ capability: f.capability, scenario });
    const harness = createFakeVoiceHarness({ adapter: fake.adapter, scope: f.scope }), output = harness.submit(f.request);
    assert.throws(() => verifyFakeVoiceOutput({ plan: f.plan, chunkIndex: 0, output }));
    assert.throws(() => verifyFakeVoiceOutput({ plan: f.plan, chunkIndex: 0, output: { ...output, bytes: pcmWav() } }));
    const next = createFakeVoiceHarness({ adapter: fake.adapter, scope: f.scope }).submit({ ...f.request, idempotencyKey: "refreshed" });
    assert.deepEqual(next, output); assert.equal(fake.calls(), 1);
  }
});
test("M5-02 receipt capture rejects executable getters without invoking them", () => {
  const f = verifiedFixture(); let called = false;
  assert.throws(() => parseSyntheticAudioReceipt(Object.defineProperty({}, "receipt", { enumerable: true, get() { called = true; throw new Error(); } }), { plan: f.plan, chunkIndex: 0, bytes: f.items[0].bytes }));
  assert.throws(() => verifyFakeVoiceOutput(Object.defineProperty({}, "plan", { enumerable: true, get() { called = true; throw new Error(); } })));
  assert.equal(called, false);
});
