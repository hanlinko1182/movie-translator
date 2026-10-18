import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson } from "@/lib/storyline/canonical";
import { privateFixture } from "./fixture";

test("M5-03 pending, definitive success and duplicate callback states are explicit and immutable", () => {
  const f = privateFixture(), submission = f.prepare();
  assert.equal(f.store.inspect(f.owner, submission, f.operation).state, "PENDING");
  const first = f.store.admit(f.owner, submission, f.admission()), again = f.store.admit(f.owner, submission, f.admission());
  assert.deepEqual(first, again); assert.equal(f.store.inspect(f.owner, submission, f.operation).state, "SUCCESS");
  for (const outcome of ["UNKNOWN", "DEFINITIVE_FAILURE", "CANCELLED", "SUCCESS"]) assert.throws(() => f.store.settle(f.owner, submission, { ...f.operation, outcome }));
  assert.equal(f.control.inspectCountsForTest().artifacts, 1);
});
test("M5-03 UNKNOWN/failure/cancellation retain ownership and cannot become audio-shaped success", async t => {
  for (const outcome of ["UNKNOWN", "DEFINITIVE_FAILURE", "CANCELLED"]) await t.test(outcome, () => {
    const f = privateFixture(), submission = f.prepare(), before = f.fake.calls();
    const terminal = f.store.settle(f.owner, submission, { ...f.operation, outcome });
    assert.equal(terminal.state, outcome); assert.deepEqual(f.store.settle(f.owner, submission, { ...f.operation, outcome }), terminal);
    assert.throws(() => f.store.admit(f.owner, submission, f.admission()));
    assert.throws(() => f.store.replay(f.owner, submission, { ...f.operation, artifactId: "audio-shaped-claim" }));
    assert.equal(f.control.expect(f.owner, { ...f.expected(), idempotencyKey: "fresh-key" }), submission);
    for (const changed of ["UNKNOWN", "DEFINITIVE_FAILURE", "CANCELLED"].filter(s => s !== outcome)) assert.throws(() => f.store.settle(f.owner, submission, { ...f.operation, outcome: changed }));
    assert.equal(f.store.inspect(f.owner, submission, f.operation).state, outcome);
    assert.equal(f.fake.calls(), before); assert.equal(f.control.inspectCountsForTest().artifacts, 0);
  });
});
test("M5-03 late pending success is accepted only before expiry with the original owner/generation/submission", () => {
  const f = privateFixture(), submission = f.prepare(); f.control.advanceClockForTest(99);
  const accepted = f.store.admit(f.owner, submission, f.admission());
  assert.equal(accepted.metadata.artifact.owner.expiresAtTick, 100);
  f.control.advanceClockForTest(1);
  assert.throws(() => f.store.admit(f.owner, submission, f.admission()));
  assert.throws(() => f.store.replay(f.owner, submission, { ...f.operation, artifactId: accepted.metadata.artifact.artifactId }));
  assert.throws(() => f.control.rotateGeneration(f.owner));
  assert.equal(f.control.inspectCountsForTest().artifacts, 1);
});
test("M5-03 expiry of a pending owner never accepts a late result or evicts its reservation", () => {
  const f = privateFixture(), submission = f.prepare(); f.control.advanceClockForTest(100);
  assert.throws(() => f.store.admit(f.owner, submission, f.admission()));
  assert.throws(() => f.control.expect(f.owner, f.expected()));
  assert.equal(f.control.inspectCountsForTest().submissions, 1); assert.equal(f.control.inspectCountsForTest().artifacts, 0);
  for (const delta of [-1, 0.1, NaN, Infinity, 2147483647]) assert.throws(() => f.control.advanceClockForTest(delta));
  assert.equal(f.control.inspectCountsForTest().tick, 100);
});
test("M5-03 generation rotation revokes old capabilities and obsolete results; it cannot refresh an unresolved recipe", () => {
  for (const outcome of ["PENDING", "UNKNOWN", "DEFINITIVE_FAILURE", "CANCELLED", "SUCCESS"]) {
    const f = privateFixture(), submission = f.prepare();
    if (outcome === "SUCCESS") f.store.admit(f.owner, submission, f.admission());
    else if (outcome !== "PENDING") f.store.settle(f.owner, submission, { ...f.operation, outcome });
    const nextOwner = f.control.rotateGeneration(f.owner);
    assert.throws(() => f.store.admit(f.owner, submission, f.admission()));
    assert.throws(() => f.store.admit(nextOwner, submission, { ...f.admission(), generation: 2 }));
    assert.throws(() => f.control.expect(nextOwner, { ...f.expected(), idempotencyKey: "rotated-key" }));
    assert.throws(() => f.control.expect(nextOwner, f.expected()));
    const fresh = f.control.expect(nextOwner, f.expected(1));
    const accepted = f.store.admit(nextOwner, fresh, { ...f.admission(1), generation: 2 });
    assert.equal(accepted.metadata.artifact.owner.generation, 2); assert.equal(accepted.metadata.artifact.owner.expiresAtTick, 100);
  }
});
test("M5-03 disposal/revocation forbids new operations and retains original immutable artifacts/reservations", () => {
  const f = privateFixture(), submission = f.prepare(), accepted = f.store.admit(f.owner, submission, f.admission());
  const before = f.control.inspectCountsForTest(); f.control.disposeOwner(f.owner);
  assert.throws(() => f.store.replay(f.owner, submission, { ...f.operation, artifactId: accepted.metadata.artifact.artifactId }));
  assert.throws(() => f.store.admit(f.owner, submission, f.admission()));
  assert.throws(() => f.control.expect(f.owner, f.expected())); assert.throws(() => f.control.rotateGeneration(f.owner));
  assert.throws(() => f.control.createOwner({ ownerId: "fixture-owner", scope: f.scope, generation: 2, expiresAtTick: 200 }));
  assert.deepEqual(f.control.inspectCountsForTest(), before);
});
test("M5-03 expected setup/admission failures are atomic and retain retryable PENDING without replacing bytes", () => {
  const f = privateFixture(), pristine = f.control.inspectCountsForTest();
  assert.throws(() => f.control.expect(f.owner, { ...f.expected(), bytes: new Uint8Array(0) }));
  assert.deepEqual(f.control.inspectCountsForTest(), pristine);
  const submission = f.prepare(), before = f.control.inspectCountsForTest();
  for (const patch of [{ bytes: null }, { bytes: new Uint8Array(2) }, { receipt: {} }]) assert.throws(() => f.store.admit(f.owner, submission, { ...f.admission(), ...patch }));
  assert.deepEqual(f.control.inspectCountsForTest(), before);
  assert.equal(f.store.inspect(f.owner, submission, f.operation).state, "PENDING");
  const accepted = f.store.admit(f.owner, submission, f.admission()), finalCounts = f.control.inspectCountsForTest();
  const bytes = Uint8Array.from(f.items[0].bytes); bytes[44] = 1;
  assert.throws(() => f.store.admit(f.owner, submission, { ...f.admission(), bytes }));
  assert.deepEqual(f.control.inspectCountsForTest(), finalCounts);
  assert.deepEqual(f.store.replay(f.owner, submission, { ...f.operation, artifactId: accepted.metadata.artifact.artifactId }), accepted);
});
test("M5-03 artifact-count and byte exhaustion preserve previous artifacts and pending records", () => {
  for (const limits of [{ maxArtifacts: 1 }, { maxAudioBytes: 48 }]) {
    const f = privateFixture(limits), first = f.prepare(), second = f.prepare(1);
    const accepted = f.store.admit(f.owner, first, f.admission()), before = f.control.inspectCountsForTest();
    assert.throws(() => f.store.admit(f.owner, second, f.admission(1)), { fieldPath: "private.capacity" });
    assert.deepEqual(f.control.inspectCountsForTest(), before);
    assert.equal(f.store.inspect(f.owner, second, f.operation).state, "PENDING");
    assert.deepEqual(f.store.admit(f.owner, first, f.admission()), accepted);
  }
});
test("M5-03 reservation exhaustion does not evict UNKNOWN or manufacture ownership under a refreshed key", () => {
  const f = privateFixture({ maxSubmissions: 1 }), submission = f.prepare();
  f.store.settle(f.owner, submission, { ...f.operation, outcome: "UNKNOWN" });
  const before = f.control.inspectCountsForTest();
  assert.throws(() => f.control.expect(f.owner, f.expected(1)));
  assert.throws(() => f.control.expect(f.owner, { ...f.expected(), idempotencyKey: "new-key" }));
  assert.equal(f.control.expect(f.owner, f.expected()), submission);
  assert.deepEqual(f.control.inspectCountsForTest(), before);
  assert.equal(f.store.inspect(f.owner, submission, f.operation).state, "UNKNOWN");
});
test("M5-03 owner/option bounds and scope mismatches reject without partial registry entries", () => {
  const f = privateFixture({ maxOwners: 1 }), before = canonicalJson(f.control.inspectCountsForTest());
  assert.throws(() => f.control.createOwner({ ownerId: "next", scope: f.scope, generation: 1, expiresAtTick: 100 }));
  assert.equal(canonicalJson(f.control.inspectCountsForTest()), before);
  const other = privateFixture(), owner = other.control.createOwner({ ownerId: "different-scope", scope: { ...other.scope, movieId: "foreign-movie" }, generation: 1, expiresAtTick: 100 });
  const counts = other.control.inspectCountsForTest();
  assert.throws(() => other.control.expect(owner, other.expected())); assert.deepEqual(other.control.inspectCountsForTest(), counts);
});
