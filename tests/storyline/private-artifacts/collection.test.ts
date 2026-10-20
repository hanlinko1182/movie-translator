import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson } from "@/lib/storyline/canonical";
import { planMyanmarVoice } from "@/lib/storyline/voice/foundation/chunk-plan";
import { verifyFakeVoiceOutput } from "@/lib/storyline/voice/audio-verification/receipt";
import { privateFixture } from "./fixture";

function collectionFixture() {
  const f = privateFixture();
  const entries = f.items.map((_, i) => {
    const submission = f.prepare(i), result = f.store.admit(f.owner, submission, f.admission(i));
    return { submission, artifactId: result.metadata.artifact.artifactId };
  });
  return { ...f, entries, collectionInput: { ...f.operation, plan: f.plan, entries } };
}
test("M5-03 complete private collection replay independently rechecks bytes and canonical coverage without audio assembly", () => {
  const f = collectionFixture(), before = f.control.inspectCountsForTest();
  const result = f.store.replayCollection(f.owner, f.collectionInput);
  const reversed = f.store.replayCollection(f.owner, { ...f.collectionInput, entries: [...f.entries].reverse() });
  assert.deepEqual(reversed, result); assert.equal(result.collection.manifest.entries.length, f.items.length);
  assert.equal(result.ownerId, "fixture-owner"); assert.equal(result.generation, 1); assert.equal(result.storage, "EPHEMERAL_PROCESS_MEMORY");
  assert.deepEqual(result.artifacts.map(a => a.chunkIndex), f.plan.plan.chunks.map(c => c.index));
  assert.equal(result.restrictions.eligibleForPublication, false); assert.equal(result.collection.manifest.speech, "NOT_VERIFIED");
  assert.equal(Object.isFrozen(result.artifacts[0]), true); assert.equal(Object.hasOwn(result, "bytes"), false);
  assert.throws(() => Object.assign(result.collection.manifest.restrictions, { sourceVerified: true }));
  assert.deepEqual(f.control.inspectCountsForTest(), before); assert.equal(f.fake.calls(), f.items.length);
});
test("M5-03 missing, duplicate, foreign and unauthorized entries block private complete collection", () => {
  const f = collectionFixture(), before = f.control.inspectCountsForTest(), other = collectionFixture();
  for (const entries of [[], f.entries.slice(1), [...f.entries, f.entries[0]], [f.entries[0], f.entries[0], ...f.entries.slice(2)],
    [{ ...f.entries[0], artifactId: f.entries[1].artifactId }, ...f.entries.slice(1)],
    [{ ...f.entries[0], submission: { ...f.entries[0].submission } }, ...f.entries.slice(1)],
    [other.entries[0], ...f.entries.slice(1)], new Array(f.entries.length)]) assert.throws(() => f.store.replayCollection(f.owner, { ...f.collectionInput, entries }));
  assert.throws(() => f.store.replayCollection(other.owner, f.collectionInput));
  assert.throws(() => f.store.replayCollection(f.owner, { ...f.collectionInput, generation: 2 }));
  assert.throws(() => f.store.replayCollection(f.owner, { ...f.collectionInput, scope: { ...f.scope, projectId: "foreign-project" } }));
  assert.deepEqual(f.control.inspectCountsForTest(), before);
});
test("M5-03 UNKNOWN/failure/cancelled/pending chunks never satisfy collection coverage", () => {
  for (const state of ["PENDING", "UNKNOWN", "DEFINITIVE_FAILURE", "CANCELLED"]) {
    const f = privateFixture();
    const entries = f.items.map((_, i) => {
      const submission = f.prepare(i);
      if (i) return { submission, artifactId: f.store.admit(f.owner, submission, f.admission(i)).metadata.artifact.artifactId };
      if (state !== "PENDING") f.store.settle(f.owner, submission, { ...f.operation, outcome: state });
      return { submission, artifactId: "claimed-private-artifact" };
    });
    assert.throws(() => f.store.replayCollection(f.owner, { ...f.operation, plan: f.plan, entries }));
    assert.equal(f.store.inspect(f.owner, entries[0].submission, f.operation).state, state);
  }
});
test("M5-03 selected plan/source/profile cannot be inferred from artifacts or replaced in a complete collection", () => {
  const f = collectionFixture();
  const plan = planMyanmarVoice({ ...f.input, reference: { ...f.input.reference, source: { ...f.input.reference.source, contextHash: "a".repeat(64) } } });
  assert.throws(() => f.store.replayCollection(f.owner, { ...f.collectionInput, plan }));
  assert.throws(() => f.store.replayCollection(f.owner, { ...f.collectionInput, plan: undefined }));
  f.control.corruptStoredBytesForTest(f.entries[1].artifactId);
  assert.throws(() => f.store.replayCollection(f.owner, f.collectionInput));
  assert.equal(f.control.inspectCountsForTest().artifacts, f.entries.length);
});
test("M5-03 current owner can capture and replay a separately selected R4 edited plan with exact original lineage", () => {
  const f = privateFixture(), plan = planMyanmarVoice({ ...f.edited, capability: f.capability });
  const entries = plan.plan.chunks.map((_, chunkIndex) => {
    const output = f.harness.submit({ ...f.request, plan, chunkIndex, idempotencyKey: `edit-${chunkIndex}` });
    const receipt = verifyFakeVoiceOutput({ plan, chunkIndex, output });
    const submission = f.control.expect(f.owner, { plan, chunkIndex, receipt, bytes: output.bytes, idempotencyKey: `edited-${chunkIndex}` });
    const stored = f.store.admit(f.owner, submission, { ...f.operation, receipt, bytes: output.bytes });
    return { submission, artifactId: stored.metadata.artifact.artifactId };
  });
  const result = f.store.replayCollection(f.owner, { ...f.operation, plan, entries });
  assert.equal(result.collection.manifest.reference.artifact.kind, "R4_EDITED");
  assert.equal(result.collection.manifest.reference.artifact.hashDomain, "story-edited-narration-v1");
  assert.deepEqual(result.collection.manifest.reference.original, f.m4.reference.original);
});
test("M5-03 collection snapshots reject accessors and cannot survive generation/disposal authorization changes", () => {
  const f = collectionFixture(), before = canonicalJson(f.control.inspectCountsForTest()); let called = false;
  const entries = f.entries.slice(); Object.defineProperty(entries, 0, { enumerable: true, get() { called = true; throw new Error(); } });
  assert.throws(() => f.store.replayCollection(f.owner, { ...f.collectionInput, entries })); assert.equal(called, false);
  const next = f.control.rotateGeneration(f.owner);
  assert.throws(() => f.store.replayCollection(f.owner, f.collectionInput));
  assert.throws(() => f.store.replayCollection(next, { ...f.collectionInput, generation: 2 }));
  f.control.disposeOwner(next); assert.throws(() => f.store.replayCollection(next, { ...f.collectionInput, generation: 2 }));
  assert.equal(canonicalJson(f.control.inspectCountsForTest()), before);
});
