import "server-only";
import { randomUUID } from "node:crypto";
import { canonicalJson, contractHash } from "../../canonical";
import { fail, freeze, id, integer, record } from "../../validation";
import { validateVoicePlan } from "../foundation/chunk-plan";
import { captureVoiceJson } from "../foundation/reference";
import { fakeVoiceRestrictions, type VoicePlan } from "../foundation/contracts";
import { AUDIO_VERIFICATION as A, type SyntheticAudioReceipt } from "../audio-verification/contracts";
import { parseSyntheticAudioReceipt } from "../audio-verification/receipt";
import { verifySyntheticAudioCollection } from "../audio-verification/collection";
import { capturePcmBytes } from "../audio-verification/wav";
import { PRIVATE_FAKE_AUDIO as P, type FakeOwnerCapability, type FakeSubmissionCapability, type FakeSubmissionState, type PrivateArtifactPayload, type PrivateArtifactView, type PrivateCollectionView } from "./contracts";

function scope(value: unknown) {
  const r = record(captureVoiceJson(value), ["projectId", "movieId", "studioId"], "private.scope");
  return freeze({ projectId: id(r.projectId, "private.project"), movieId: id(r.movieId, "private.movie"), studioId: id(r.studioId, "private.studio") });
}
function opaque() { return Object.freeze({ toJSON(): never { fail("UNTRUSTED_RECEIPT", "private.serialization"); } }); }
type Owner = { ownerId: string; scope: ReturnType<typeof scope>; generation: number; expiresAtTick: number; disposed: boolean };
type Expected = {
  owner: Owner; generation: number; plan: VoicePlan; chunkIndex: number; receipt: SyntheticAudioReceipt;
  expectedHash: string; state: FakeSubmissionState; capability: FakeSubmissionCapability; artifactId: string | null;
};
type Stored = { expected: Expected; bytes: Uint8Array; view: PrivateArtifactView };

/** Explicit test harness root; all ownership, clocks and bytes are closure-local.
 * No production authentication, provider, permit, storage or module registration. */
export function createPrivateFakeAudioStoreForTest(value: unknown) {
  const options = record(captureVoiceJson(value), ["maxOwners", "maxSubmissions", "maxArtifacts", "maxAudioBytes"], "private.options");
  const limits = { owners: integer(options.maxOwners, "private.limit.owners", P.maxOwners), submissions: integer(options.maxSubmissions, "private.limit.submissions", P.maxSubmissions),
    artifacts: integer(options.maxArtifacts, "private.limit.artifacts", P.maxArtifacts), bytes: integer(options.maxAudioBytes, "private.limit.bytes", P.maxAudioBytes) };
  if (Object.values(limits).some(n => !n)) fail("SIZE_LIMIT", "private.options");
  const ownerCaps = new WeakMap<object, { owner: Owner; generation: number }>(), submissionCaps = new WeakMap<object, Expected>();
  const owners = new Map<string, Owner>(), keys = new Map<string, Expected>(), recipes = new Map<string, Expected>(), artifacts = new Map<string, Stored>();
  const plans = new Map<string, VoicePlan>();
  let tick = 0, audioBytes = 0, metadataBytes = 0;
  function authorized(capability: unknown) {
    const bound = capability && typeof capability === "object" ? ownerCaps.get(capability) : undefined;
    if (!bound || bound.owner.disposed || bound.generation !== bound.owner.generation || tick >= bound.owner.expiresAtTick) fail("UNTRUSTED_RECEIPT", "private.owner");
    return bound.owner;
  }
  function expectationPayload(e: Pick<Expected, "owner" | "generation" | "plan" | "chunkIndex" | "receipt">) {
    return { schemaVersion: P.expectation, execution: "FAKE_ONLY", ownerId: e.owner.ownerId, generation: e.generation,
      expiresAtTick: e.owner.expiresAtTick, scope: e.owner.scope, planHash: e.plan.planHash, chunkIndex: e.chunkIndex, verified: e.receipt, restrictions: fakeVoiceRestrictions };
  }
  function bound(ownerCapability: unknown, submissionCapability: unknown) {
    const owner = authorized(ownerCapability), e = submissionCapability && typeof submissionCapability === "object" ? submissionCaps.get(submissionCapability) : undefined;
    if (!e || e.owner !== owner || e.generation !== owner.generation) fail("UNTRUSTED_RECEIPT", "private.submission");
    if (contractHash(P.expectation, expectationPayload(e)) !== e.expectedHash) fail("RECEIPT_BINDING_INVALID", "private.expectedIntegrity");
    return e;
  }
  function context(e: Expected, value: unknown, fields: string[]) {
    const r = record(value, ["scope", "generation", ...fields], "private.operation");
    if (canonicalJson(scope(r.scope)) !== canonicalJson(e.owner.scope) || integer(r.generation, "private.generation", 1000000) !== e.generation) fail("SCOPE_MISMATCH", "private.operation");
    return r;
  }
  function project(e: Expected, artifactId: string): PrivateArtifactView {
    const artifact: PrivateArtifactPayload = { schemaVersion: P.artifact, execution: "FAKE_ONLY", storage: "EPHEMERAL_PROCESS_MEMORY", artifactId,
      owner: { ownerId: e.owner.ownerId, generation: e.generation, expiresAtTick: e.owner.expiresAtTick }, scope: e.owner.scope,
      expectedHash: e.expectedHash, planHash: e.plan.planHash, verified: e.receipt, restrictions: fakeVoiceRestrictions };
    return freeze({ artifact, ownershipHash: contractHash(P.ownership, artifact) });
  }
  function replay(e: Expected, artifactId: unknown) {
    const stored = artifacts.get(id(artifactId, "private.artifactId"));
    if (e.state !== "SUCCESS" || !stored || stored.expected !== e || e.artifactId !== artifactId) fail("UNTRUSTED_RECEIPT", "private.artifact");
    const receipt = parseSyntheticAudioReceipt(stored.view.artifact.verified, { plan: e.plan, chunkIndex: e.chunkIndex, bytes: stored.bytes });
    if (canonicalJson(receipt) !== canonicalJson(e.receipt) || canonicalJson(project(e, artifactId as string)) !== canonicalJson(stored.view)) fail("RECEIPT_BINDING_INVALID", "private.artifactIntegrity");
    return { metadata: stored.view, bytes: new Uint8Array(stored.bytes) };
  }
  const control = Object.freeze({
    ...opaque(),
    createOwner(input: unknown): FakeOwnerCapability {
      const r = record(captureVoiceJson(input), ["ownerId", "scope", "generation", "expiresAtTick"], "private.newOwner");
      const owner: Owner = { ownerId: id(r.ownerId, "private.ownerId"), scope: scope(r.scope), generation: integer(r.generation, "private.generation", 1000000),
        expiresAtTick: integer(r.expiresAtTick, "private.expiry", P.maxTick), disposed: false };
      if (!owner.generation || owner.expiresAtTick <= tick || owners.has(owner.ownerId) || owners.size >= limits.owners) fail("UNTRUSTED_RECEIPT", "private.newOwner");
      const capability = opaque(); owners.set(owner.ownerId, owner); ownerCaps.set(capability, { owner, generation: owner.generation }); return capability;
    },
    /** Trusted fixture setup captures expected bytes/receipt before admission.
     * No ordinary store operation can create or replace an expectation. */
    expect(ownerCapability: unknown, input: unknown): FakeSubmissionCapability {
      const owner = authorized(ownerCapability), r = record(input, ["idempotencyKey", "plan", "chunkIndex", "receipt", "bytes"], "private.expected");
      const key = canonicalJson([owner.scope, id(r.idempotencyKey, "private.key")]), plan = validateVoicePlan(r.plan);
      if (canonicalJson(plan.plan.reference.scope) !== canonicalJson(owner.scope)) fail("SCOPE_MISMATCH", "private.expected");
      const chunkIndex = integer(r.chunkIndex, "private.chunk", 719), receipt = parseSyntheticAudioReceipt(r.receipt, { plan, chunkIndex, bytes: r.bytes });
      const proposal = { owner, generation: owner.generation, plan, chunkIndex, receipt };
      const expectedHash = contractHash(P.expectation, expectationPayload(proposal));
      const recipeKey = canonicalJson([owner.scope, plan.planHash, receipt.receipt.fake.requestHash, receipt.receipt.fake.submissionId]);
      const keyed = keys.get(key), previous = keyed ?? recipes.get(recipeKey);
      if (previous) {
        if (previous.owner !== owner || previous.generation !== owner.generation || previous.expectedHash !== expectedHash || contractHash(P.expectation, expectationPayload(previous)) !== expectedHash) fail("RECEIPT_BINDING_INVALID", "private.idempotencyConflict");
        if (!keyed) { if (keys.size >= limits.submissions) fail("SIZE_LIMIT", "private.submissions"); keys.set(key, previous); }
        return previous.capability;
      }
      const canonicalPlan = plans.get(plan.planHash), metadataCost = Buffer.byteLength(canonicalJson(receipt, A.maxReceiptBytes)) + (canonicalPlan ? 0 : Buffer.byteLength(canonicalJson(plan)));
      if (keys.size >= limits.submissions || metadataBytes + metadataCost > P.maxMetadataBytes) fail("SIZE_LIMIT", "private.submissions");
      const capability = opaque(), e: Expected = { ...proposal, plan: canonicalPlan ?? plan, expectedHash, state: "PENDING", capability, artifactId: null };
      plans.set(plan.planHash, e.plan); submissionCaps.set(capability, e); keys.set(key, e); recipes.set(recipeKey, e); metadataBytes += metadataCost;
      return capability;
    },
    rotateGeneration(ownerCapability: unknown): FakeOwnerCapability {
      const owner = authorized(ownerCapability); if (owner.generation >= 1000000) fail("SIZE_LIMIT", "private.generation");
      owner.generation++; const capability = opaque(); ownerCaps.set(capability, { owner, generation: owner.generation }); return capability;
    },
    disposeOwner(ownerCapability: unknown) { authorized(ownerCapability).disposed = true; },
    advanceClockForTest(delta: unknown) { const n = integer(delta, "private.tick", P.maxTick); if (tick + n > P.maxTick) fail("SIZE_LIMIT", "private.tick"); tick += n; },
    inspectCountsForTest() { return freeze({ owners: owners.size, reservations: keys.size, submissions: recipes.size, artifacts: artifacts.size, audioBytes, metadataBytes, tick }); },
    /** Fault injection exposes no backing buffers and grants no store rights. */
    corruptStoredBytesForTest(artifactId: unknown) { const a = artifacts.get(id(artifactId, "private.artifactId")); if (!a) fail("INVALID_ANCHOR", "private.fault"); a.bytes[44] ^= 1; },
    corruptExpectedAnchorForTest(submissionCapability: unknown) { const e = submissionCapability && typeof submissionCapability === "object" ? submissionCaps.get(submissionCapability) : undefined;
      if (!e) fail("UNTRUSTED_RECEIPT", "private.fault"); e.expectedHash = "0".repeat(64); },
  });
  const store = Object.freeze({
    ...opaque(),
    admit(ownerCapability: unknown, submissionCapability: unknown, input: unknown) {
      const e = bound(ownerCapability, submissionCapability), r = context(e, input, ["receipt", "bytes"]);
      if (!["PENDING", "SUCCESS"].includes(e.state)) fail("UNTRUSTED_RECEIPT", "private.submissionState");
      const bytes = capturePcmBytes(r.bytes), receipt = parseSyntheticAudioReceipt(r.receipt, { plan: e.plan, chunkIndex: e.chunkIndex, bytes });
      if (canonicalJson(receipt) !== canonicalJson(e.receipt)) fail("RECEIPT_BINDING_INVALID", "private.admissionConflict");
      if (e.state === "SUCCESS") return replay(e, e.artifactId);
      if (artifacts.size >= limits.artifacts || audioBytes + bytes.length > limits.bytes) fail("SIZE_LIMIT", "private.capacity");
      const artifactId = `fake-private-${randomUUID()}`;
      if (artifacts.has(artifactId)) fail("DUPLICATE_ID", "private.artifactId");
      const view = project(e, artifactId);
      artifacts.set(artifactId, { expected: e, bytes, view }); audioBytes += bytes.length; e.artifactId = artifactId; e.state = "SUCCESS";
      return { metadata: view, bytes: new Uint8Array(bytes) };
    },
    replay(ownerCapability: unknown, submissionCapability: unknown, input: unknown) {
      const e = bound(ownerCapability, submissionCapability), r = context(e, input, ["artifactId"]); return replay(e, r.artifactId);
    },
    settle(ownerCapability: unknown, submissionCapability: unknown, input: unknown) {
      const e = bound(ownerCapability, submissionCapability), r = context(e, input, ["outcome"]);
      if (r.outcome !== "UNKNOWN" && r.outcome !== "DEFINITIVE_FAILURE" && r.outcome !== "CANCELLED") fail("INVALID_ENUM", "private.outcome");
      if (e.state !== "PENDING" && e.state !== r.outcome) fail("UNTRUSTED_RECEIPT", "private.submissionState");
      e.state = r.outcome; return freeze({ state: e.state, restrictions: fakeVoiceRestrictions });
    },
    inspect(ownerCapability: unknown, submissionCapability: unknown, input: unknown) {
      const e = bound(ownerCapability, submissionCapability); context(e, input, []);
      return freeze({ state: e.state, expectedHash: e.expectedHash, artifactId: e.artifactId, generation: e.generation, restrictions: fakeVoiceRestrictions });
    },
    replayCollection(ownerCapability: unknown, input: unknown): PrivateCollectionView {
      const owner = authorized(ownerCapability), r = record(input, ["scope", "generation", "plan", "entries"], "private.collection");
      const plan = validateVoicePlan(r.plan);
      if (canonicalJson(scope(r.scope)) !== canonicalJson(owner.scope) || canonicalJson(plan.plan.reference.scope) !== canonicalJson(owner.scope) || r.generation !== owner.generation) fail("SCOPE_MISMATCH", "private.collection");
      if (!Array.isArray(r.entries) || Object.getPrototypeOf(r.entries) !== Array.prototype || r.entries.length !== plan.plan.chunks.length || Reflect.ownKeys(r.entries).length !== r.entries.length + 1) fail("SIZE_LIMIT", "private.coverage");
      const replayed = [];
      for (let i = 0; i < r.entries.length; i++) {
        const d = Object.getOwnPropertyDescriptor(r.entries, i); if (!d || !("value" in d)) fail("INVALID_OBJECT", "private.collection");
        const entry = record(d.value, ["submission", "artifactId"], "private.collection.entry"), e = bound(ownerCapability, entry.submission);
        if (e.plan.planHash !== plan.planHash) fail("RECEIPT_BINDING_INVALID", "private.collection");
        replayed.push(replay(e, entry.artifactId));
      }
      const collection = verifySyntheticAudioCollection({ plan, items: replayed.map(item => ({ receipt: item.metadata.artifact.verified, bytes: item.bytes })) });
      return freeze({ schemaVersion: P.collection, execution: "FAKE_ONLY", storage: "EPHEMERAL_PROCESS_MEMORY", scope: owner.scope, ownerId: owner.ownerId, generation: owner.generation,
        collection, artifacts: replayed.map(item => ({ chunkIndex: item.metadata.artifact.verified.receipt.chunk.index, artifactId: item.metadata.artifact.artifactId,
          ownershipHash: item.metadata.ownershipHash, expectedHash: item.metadata.artifact.expectedHash })).sort((a, b) => a.chunkIndex - b.chunkIndex), restrictions: fakeVoiceRestrictions });
    },
  });
  return Object.freeze({ ...opaque(), control, store });
}
