import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { AUDIO_VERIFICATION as A } from "@/lib/storyline/voice/audio-verification/contracts";
import { verifyFakeVoiceOutput } from "@/lib/storyline/voice/audio-verification/receipt";
import { parseSyntheticAudioCollection, verifySyntheticAudioCollection } from "@/lib/storyline/voice/audio-verification/collection";
import { VOICE_FOUNDATION as V } from "@/lib/storyline/voice/foundation/contracts";
import { planMyanmarVoice } from "@/lib/storyline/voice/foundation/chunk-plan";
import { syntheticVoiceCapability } from "@/lib/storyline/voice/foundation/capability";
import { createFakeVoiceHarness, createSyntheticVoiceAdapterForTest } from "@/lib/storyline/voice/foundation/fake-adapter";
import { pcmWav, verifiedFixture } from "./fixture";

test("M5-02 complete unique coverage orders receipt/hash linkage by plan index without concatenation", () => {
  const f = verifiedFixture(), context = { plan: f.plan, items: f.items };
  const result = verifySyntheticAudioCollection(context), reversed = verifySyntheticAudioCollection({ ...context, items: [...f.items].reverse() });
  assert.deepEqual(result, reversed); assert.equal(result.manifest.entries.length, f.plan.plan.chunks.length);
  assert.equal(result.manifestHash, contractHash(A.collection, result.manifest));
  assert.deepEqual(parseSyntheticAudioCollection(JSON.parse(canonicalJson(result)), context), result);
  const n = f.items.length;
  assert.deepEqual(result.manifest.totals, { fileBytes: 48 * n, dataBytes: 4 * n, sampleCount: 2 * n, sampleRateHz: 24000,
    durationUs: Number((BigInt(2 * n) * BigInt(1000000) + BigInt(12000)) / BigInt(24000)), durationPolicy: A.durationPolicy });
  assert.notEqual(result.manifest.totals.durationUs, n * 83, "total duration rounds once from exact sample counts");
  assert.equal(Object.isFrozen(result.manifest.entries), true); assert.equal(Object.isFrozen(result.manifest.entries[0].chunk), true);
  result.manifest.entries.forEach((entry, i) => {
    assert.deepEqual(entry.chunk, f.plan.plan.chunks[i]); assert.equal(entry.receiptHash, f.items[i].receipt.receiptHash);
    assert.equal(entry.audioSha256, f.items[i].receipt.receipt.audio.audioSha256);
  });
  assert.equal(result.manifest.restrictions.eligibleForPublication, false); assert.equal(result.manifest.speech, "NOT_VERIFIED");
  assert.equal(f.fake.calls(), n, "verification never invokes adapter");
});
test("M5-02 missing, duplicate, foreign, UNKNOWN, failure, mismatched bytes and malformed collection inputs reject", () => {
  const f = verifiedFixture(), context = { plan: f.plan, items: f.items };
  assert.ok(f.items.length > 2);
  for (const items of [[], f.items.slice(1), [...f.items, f.items[0]], [f.items[0], f.items[0], ...f.items.slice(2)],
    f.items.map((item, i) => i ? item : { ...item, bytes: null }),
    f.items.map((item, i) => i ? item : { ...item, bytes: pcmWav(3) }),
    f.items.map((item, i) => i ? item : { receipt: { outcome: "UNKNOWN" }, bytes: item.bytes }),
    f.items.map((item, i) => i ? item : { receipt: { outcome: "DEFINITIVE_FAILURE" }, bytes: item.bytes }),
    new Array(f.items.length)]) assert.throws(() => verifySyntheticAudioCollection({ ...context, items }));
  const foreign = planMyanmarVoice({ ...f.input, reference: { ...f.input.reference,
    scope: { ...f.scope, studioId: "other-studio" }, source: { ...f.input.reference.source, studioId: "other-studio" } } });
  assert.throws(() => verifySyntheticAudioCollection({ ...context, plan: foreign }));
  const changed = JSON.parse(canonicalJson(f.items[0].receipt)); changed.receipt.chunk.index = 999;
  changed.receiptHash = contractHash(A.receipt, changed.receipt);
  assert.throws(() => verifySyntheticAudioCollection({ ...context, items: [{ ...f.items[0], receipt: changed }, ...f.items.slice(1)] }));
  let getter = false;
  const items = f.items.slice(); Object.defineProperty(items, 0, { enumerable: true, get() { getter = true; throw new Error(); } });
  assert.throws(() => verifySyntheticAudioCollection({ ...context, items })); assert.equal(getter, false);
  const inherited = f.items.slice(); Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  assert.throws(() => verifySyntheticAudioCollection({ ...context, items: inherited }));
});
test("M5-02 collection parser rejects altered totals/receipt linkage/ordering/restrictions even with rehashed manifests", () => {
  const f = verifiedFixture(), context = { plan: f.plan, items: f.items }, result = verifySyntheticAudioCollection(context);
  for (const mutate of [
    (m: Record<string, unknown>) => { (m.totals as Record<string, unknown>).durationUs = 1; },
    (m: Record<string, unknown>) => { (m.entries as Record<string, unknown>[])[0].receiptHash = "a".repeat(64); },
    (m: Record<string, unknown>) => { (m.entries as Record<string, unknown>[])[0].audioSha256 = "a".repeat(64); },
    (m: Record<string, unknown>) => { (m.entries as unknown[]).reverse(); },
    (m: Record<string, unknown>) => { (m.restrictions as Record<string, unknown>).eligibleForPublication = true; },
  ]) {
    const forged = JSON.parse(canonicalJson(result)); mutate(forged.manifest); forged.manifestHash = contractHash(A.collection, forged.manifest);
    assert.throws(() => parseSyntheticAudioCollection(forged, context));
  }
});
test("M5-02 collection byte budget is bounded independently of chunk count; fake metadata cannot rescue invalid WAV", () => {
  const f = verifiedFixture(), capability = syntheticVoiceCapability({ maxChunkBytes: 3, voiceId: "fixture-neutral" });
  const plan = planMyanmarVoice({ ...f.input, capability, sections: [{ sectionId: "six-chunks", order: 0, paragraphs: ["က".repeat(6)], separators: [] }] });
  const fake = createSyntheticVoiceAdapterForTest({ capability, scenario: "FIXTURE_BYTES" }), harness = createFakeVoiceHarness({ adapter: fake.adapter, scope: f.scope });
  const bytes = pcmWav((A.maxAudioBytes - 44) / 2), audioSha256 = createHash("sha256").update(bytes).digest("hex");
  // Explicit captured synthetic records for bounds testing. Self-consistent
  // metadata is not authentication, and never bypasses actual byte validation.
  const items = plan.plan.chunks.map((_, chunkIndex) => {
    const output = harness.submit({ ...f.request, plan, chunkIndex, idempotencyKey: `large-${chunkIndex}` });
    assert.equal(output.result.outcome, "FIXTURE_BYTES"); if (output.result.outcome !== "FIXTURE_BYTES") assert.fail();
    const metadata = { ...output.result.metadata, audioSha256, nativeAudioSha256: audioSha256, bytes: bytes.length };
    const captured = { result: { ...output.result, metadata, metadataHash: contractHash(V.artifact, metadata) }, bytes };
    const receipt = verifyFakeVoiceOutput({ plan, chunkIndex, output: captured });
    const invalid = Buffer.from(bytes); invalid[0] = 0;
    const badHash = createHash("sha256").update(invalid).digest("hex");
    const badMetadata = { ...metadata, audioSha256: badHash, nativeAudioSha256: badHash };
    assert.throws(() => verifyFakeVoiceOutput({ plan, chunkIndex, output: { bytes: invalid, result: { ...captured.result, metadata: badMetadata, metadataHash: contractHash(V.artifact, badMetadata) } } }));
    return { receipt, bytes };
  });
  assert.throws(() => verifySyntheticAudioCollection({ plan, items }), { fieldPath: "audio.collection.bytes" });
});
