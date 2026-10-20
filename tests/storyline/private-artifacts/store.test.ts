import assert from "node:assert/strict";
import { test, before, after, mock } from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { PRIVATE_FAKE_AUDIO as P } from "@/lib/storyline/voice/private-artifacts/contracts";
import { VOICE_FOUNDATION as V } from "@/lib/storyline/voice/foundation/contracts";
import { planMyanmarVoice } from "@/lib/storyline/voice/foundation/chunk-plan";
import { syntheticVoiceCapability } from "@/lib/storyline/voice/foundation/capability";
import { createFakeVoiceHarness, createSyntheticVoiceAdapterForTest } from "@/lib/storyline/voice/foundation/fake-adapter";
import { verifyFakeVoiceOutput } from "@/lib/storyline/voice/audio-verification/receipt";
import { privateFixture } from "./fixture";
let networkCalls = 0;
before(() => {
  const forbidden = () => { networkCalls++; assert.fail("Private fake artifacts cannot access network/providers"); };
  mock.method(globalThis, "fetch", forbidden);
  for (const transport of [http, https]) { mock.method(transport, "request", forbidden); mock.method(transport, "get", forbidden); }
  mock.method(net, "connect", forbidden); mock.method(net, "createConnection", forbidden); mock.method(tls, "connect", forbidden);
});
after(() => { mock.restoreAll(); assert.equal(networkCalls, 0); });

test("M5-03 authorized admission/replay binds exact independent expectation and immutable byte/receipt provenance", () => {
  const f = privateFixture(), submission = f.prepare(), source = f.admission();
  const accepted = f.store.admit(f.owner, submission, source), view = accepted.metadata;
  assert.match(view.artifact.artifactId, /^fake-private-[a-f0-9-]{36}$/);
  assert.equal(view.ownershipHash, contractHash(P.ownership, view.artifact));
  assert.equal(view.artifact.owner.ownerId, "fixture-owner"); assert.equal(view.artifact.owner.generation, 1);
  assert.deepEqual(view.artifact.verified, f.items[0].receipt); assert.equal(view.artifact.planHash, f.plan.planHash);
  assert.deepEqual(view.artifact.scope, f.scope); assert.equal(view.artifact.storage, "EPHEMERAL_PROCESS_MEMORY");
  const input = { ...f.operation, artifactId: view.artifact.artifactId }, replay = f.store.replay(f.owner, submission, input);
  assert.deepEqual(replay, accepted); assert.notEqual(replay.bytes, accepted.bytes);
  assert.equal(Object.isFrozen(view.artifact.verified.receipt.audio), true);
  assert.throws(() => Object.assign(view.artifact, { planHash: "a".repeat(64) }));
  const expectedBytes = Uint8Array.from(source.bytes); source.bytes.fill(9); accepted.bytes.fill(8); replay.bytes.fill(7);
  assert.deepEqual(f.store.replay(f.owner, submission, input).bytes, expectedBytes);
  assert.equal(view.artifact.verified.receipt.audio.audioSha256, createHash("sha256").update(expectedBytes).digest("hex"));
  assert.equal(view.artifact.restrictions.humanApproval, "NONE"); assert.equal(view.artifact.restrictions.eligibleForRealTts, false);
  assert.equal(view.artifact.restrictions.eligibleForPublication, false); assert.equal(view.artifact.restrictions.sourceVerified, false);
  assert.equal(view.artifact.restrictions.spendingAuthority, "NONE"); assert.equal(view.artifact.restrictions.syntheticAncestry, true);
});
test("M5-03 structural objects, copied caps, IDs, public receipts and cross-store capabilities grant no ownership", () => {
  const f = privateFixture(), submission = f.prepare(), accepted = f.store.admit(f.owner, submission, f.admission());
  const other = privateFixture(), input = { ...f.operation, artifactId: accepted.metadata.artifact.artifactId };
  for (const cap of [true, {}, { ...f.owner }, f.items[0].receipt, accepted.metadata, accepted.metadata.artifact.artifactId, other.owner]) {
    assert.throws(() => f.store.replay(cap, submission, input));
    assert.throws(() => f.store.replay(f.owner, cap, input));
  }
  assert.throws(() => other.store.replay(f.owner, submission, input));
  assert.throws(() => f.store.replay(f.owner, { ...submission }, input));
  for (const cap of [f.owner, submission, f.control, f.store]) assert.throws(() => JSON.stringify(cap));
  const secondOwner = f.control.createOwner({ ownerId: "another-owner", scope: f.scope, generation: 1, expiresAtTick: 100 });
  assert.throws(() => f.store.replay(secondOwner, submission, input));
  assert.throws(() => f.control.expect(secondOwner, { ...f.expected(), idempotencyKey: "other-owner-key" }));
});
test("M5-03 wrong operation scope/generation, missing expectation and copied IDs fail before private replay", async t => {
  const f = privateFixture(), submission = f.prepare(), accepted = f.store.admit(f.owner, submission, f.admission());
  for (const field of ["projectId", "movieId", "studioId"]) await t.test(field, () => {
    const scope = { ...f.scope, [field]: "foreign-scope" };
    assert.throws(() => f.store.admit(f.owner, submission, { ...f.admission(), scope }));
    assert.throws(() => f.store.replay(f.owner, submission, { ...f.operation, scope, artifactId: accepted.metadata.artifact.artifactId }));
  });
  assert.throws(() => f.store.admit(f.owner, submission, { ...f.admission(), generation: 2 }));
  assert.throws(() => f.store.admit(f.owner, {}, f.admission()));
  assert.throws(() => f.store.replay(f.owner, submission, { ...f.operation, artifactId: "fake-private-foreign" }));
});
test("M5-03 self-consistent malicious audio and metadata cannot redefine a previously captured expectation", () => {
  const f = privateFixture(), submission = f.prepare(), output = f.harness.submit(f.request);
  assert.equal(output.result.outcome, "FIXTURE_BYTES"); if (output.result.outcome !== "FIXTURE_BYTES") assert.fail();
  const bytes = Uint8Array.from(output.bytes!); bytes[44] = 1;
  const audioSha256 = createHash("sha256").update(bytes).digest("hex");
  const metadata = { ...output.result.metadata, audioSha256, nativeAudioSha256: audioSha256 };
  const receipt = verifyFakeVoiceOutput({ plan: f.plan, chunkIndex: 0, output: { bytes, result: { ...output.result, metadata, metadataHash: contractHash(V.artifact, metadata) } } });
  assert.throws(() => f.store.admit(f.owner, submission, { ...f.operation, receipt, bytes }), { fieldPath: "private.admissionConflict" });
  assert.throws(() => f.control.expect(f.owner, { ...f.expected(), receipt, bytes }), { fieldPath: "private.idempotencyConflict" });
  assert.throws(() => f.control.expect(f.owner, { ...f.expected(), idempotencyKey: "new-key", receipt, bytes }));
  assert.equal(f.store.inspect(f.owner, submission, f.operation).state, "PENDING");
  assert.equal(f.control.inspectCountsForTest().artifacts, 0);
  assert.equal(f.store.admit(f.owner, submission, f.admission()).metadata.artifact.verified.receipt.audio.audioSha256, f.items[0].receipt.receipt.audio.audioSha256);
});
test("M5-03 independent plan rejects wrong domains/source/candidate/voice/profile and original/edited mixing", async t => {
  const f = privateFixture(), submission = f.prepare();
  const changes = [
    { ...f.input, ...f.edited },
    { ...f.input, reference: { ...f.input.reference, source: { ...f.input.reference.source, contextHash: "a".repeat(64) } } },
    { ...f.input, reference: { ...f.input.reference, analysis: { ...f.input.reference.analysis, candidateHash: "a".repeat(64) } } },
    { ...f.input, capability: syntheticVoiceCapability({ maxChunkBytes: 90, voiceId: "fixture-alternate" }) },
  ];
  for (const [i, input] of changes.entries()) await t.test(`foreign plan ${i}`, () => {
    const plan = planMyanmarVoice(input), fake = createSyntheticVoiceAdapterForTest({ capability: plan.plan.capability, scenario: "FIXTURE_BYTES" });
    const harness = createFakeVoiceHarness({ adapter: fake.adapter, scope: f.scope });
    const output = harness.submit({ ...f.request, idempotencyKey: `foreign-${i}`, plan });
    const receipt = verifyFakeVoiceOutput({ plan, chunkIndex: 0, output });
    assert.throws(() => f.store.admit(f.owner, submission, { ...f.operation, receipt, bytes: output.bytes }));
  });
  const forged = JSON.parse(canonicalJson(f.items[0].receipt)); forged.receipt.reference.artifact.hashDomain = "story-edited-narration-v1";
  forged.receiptHash = contractHash("story-synthetic-audio-verification-v1", forged.receipt);
  assert.throws(() => f.store.admit(f.owner, submission, { ...f.admission(), receipt: forged }));
  const profile = JSON.parse(canonicalJson(f.items[0].receipt)); profile.receipt.voice.profileHash = "a".repeat(64);
  profile.receiptHash = contractHash("story-synthetic-audio-verification-v1", profile.receipt);
  assert.throws(() => f.store.admit(f.owner, submission, { ...f.admission(), receipt: profile }));
});
test("M5-03 concurrent duplicates are one stable artifact; idempotency keys and plans cannot silently merge", async () => {
  const f = privateFixture(), submission = f.prepare();
  assert.equal(f.control.expect(f.owner, f.expected()), submission);
  assert.equal(f.control.expect(f.owner, { ...f.expected(), idempotencyKey: "alias" }), submission);
  const all = await Promise.all(Array.from({ length: 12 }, async () => f.store.admit(f.owner, submission, f.admission())));
  assert.equal(new Set(all.map(a => a.metadata.artifact.artifactId)).size, 1); assert.equal(f.control.inspectCountsForTest().artifacts, 1);
  assert.equal(new Set(all.map(a => a.bytes)).size, 12);
  assert.throws(() => f.control.expect(f.owner, { ...f.expected(1), idempotencyKey: "expected-0" }));
  const next = f.prepare(1), other = f.store.admit(f.owner, next, f.admission(1));
  assert.notEqual(other.metadata.artifact.artifactId, all[0].metadata.artifact.artifactId);
  assert.throws(() => f.store.replay(f.owner, next, { ...f.operation, artifactId: all[0].metadata.artifact.artifactId }));
});
test("M5-03 backing byte or independently captured expected-anchor corruption fails closed", () => {
  for (const corruption of ["bytes", "expected"]) {
    const f = privateFixture(), submission = f.prepare(), accepted = f.store.admit(f.owner, submission, f.admission());
    if (corruption === "bytes") f.control.corruptStoredBytesForTest(accepted.metadata.artifact.artifactId);
    else f.control.corruptExpectedAnchorForTest(submission);
    assert.throws(() => f.store.replay(f.owner, submission, { ...f.operation, artifactId: accepted.metadata.artifact.artifactId }));
    assert.throws(() => f.store.admit(f.owner, submission, f.admission()));
    assert.equal(f.control.inspectCountsForTest().artifacts, 1, "corruption never replaces/repairs/evicts the record");
  }
});
test("M5-03 captured expectation inputs cannot be mutated to replace identity; executable accessors reject", () => {
  const f = privateFixture(), expected = f.expected(), captured = JSON.parse(canonicalJson(expected.receipt));
  const plan = JSON.parse(canonicalJson(f.plan)), bytes = Uint8Array.from(expected.bytes);
  const submission = f.control.expect(f.owner, { ...expected, plan, receipt: captured, bytes });
  plan.plan.reference.scope.movieId = "other"; captured.receipt.audio.durationUs = 1; bytes[44] = 1;
  assert.doesNotThrow(() => f.store.admit(f.owner, submission, f.admission()));
  let called = false;
  assert.throws(() => f.store.admit(f.owner, submission, Object.defineProperty({}, "scope", { enumerable: true, get() { called = true; throw new Error(); } })));
  assert.equal(called, false);
});
