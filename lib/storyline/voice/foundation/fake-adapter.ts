import "server-only";
import { createHash } from "node:crypto";
import { canonicalJson, contractHash } from "../../canonical";
import { enumeration, fail, freeze, id, integer, record } from "../../validation";
import { captureVoiceJson } from "./reference";
import { parseSyntheticVoiceCapability } from "./capability";
import { validateVoicePlan } from "./chunk-plan";
import { VOICE_FOUNDATION as V, fakeVoiceRestrictions, type FakeVoiceResult, type SyntheticAudioMetadata } from "./contracts";

// Literal silent fixture, NOT generated speech and NOT independently probed.
// Header/format claims do not establish duration. No file/media API is used.
const fixtureHex = "524946462800000057415645666d74201000000001000100c05d000080bb000002001000646174610400000000000000";
const fixtureBytes = () => Uint8Array.from(Buffer.from(fixtureHex, "hex"));
type Scenario = "FIXTURE_BYTES" | "UNKNOWN" | "DEFINITIVE_FAILURE";
type Cached = { proposalHash: string; result: FakeVoiceResult };
type State = { capability: ReturnType<typeof parseSyntheticVoiceCapability>; scenario: Scenario; calls: number;
  keys: Map<string, Cached>; recipes: Map<string, FakeVoiceResult> };
const adapters = new WeakMap<object, State>();
export type SyntheticVoiceAdapter = Readonly<{ kind: "REGISTERED_FAKE_ONLY"; toJSON(): never }>;
/** Registration is fake execution only. This object is not and cannot mint a
 * production spending/send permit. No default, callback, SDK or env fallback. */
export function createSyntheticVoiceAdapterForTest(value: unknown) {
  const r = record(captureVoiceJson(value), ["capability", "scenario"], "voice.fake.options");
  const state: State = { capability: parseSyntheticVoiceCapability(r.capability), scenario: enumeration(r.scenario, ["FIXTURE_BYTES", "UNKNOWN", "DEFINITIVE_FAILURE"], "voice.fake.scenario"),
    calls: 0, keys: new Map(), recipes: new Map() };
  const adapter: SyntheticVoiceAdapter = Object.freeze({ kind: "REGISTERED_FAKE_ONLY", toJSON(): never { fail("UNTRUSTED_RECEIPT", "voice.fake.serialization"); } });
  adapters.set(adapter, state);
  return Object.freeze({ adapter, calls: () => state.calls });
}
function registered(value: unknown) {
  const state = value && typeof value === "object" ? adapters.get(value) : undefined;
  if (!state) fail("UNTRUSTED_RECEIPT", "voice.fake.adapter");
  return state;
}
/** Pure metadata only. Actual-byte hash, complete input provenance; no duration
 * measurement, storage, publication, decoder or approval assertion. */
function metadata(plan: ReturnType<typeof validateVoicePlan>, chunkIndex: number, requestHash: string, recipeHash: string): SyntheticAudioMetadata {
  const chunk = plan.plan.chunks[chunkIndex], audio = fixtureBytes();
  const audioSha256 = createHash("sha256").update(audio).digest("hex");
  return freeze({ schemaVersion: V.artifact, origin: "SYNTHETIC_TEST_AUDIO", artifactId: `fake-audio-${requestHash}`,
    reference: plan.plan.reference, voice: plan.plan.capability, recipeHash, planHash: plan.planHash,
    requestHash, requestId: `fake-request-${requestHash}`, fakeSubmissionId: `fake-submission-${requestHash}`, chunk,
    audioSha256, nativeAudioSha256: audioSha256, bytes: audio.byteLength, format: plan.plan.capability.declaredFormat, formatVerification: "UNVERIFIED_FIXTURE",
    measurement: { status: "UNVERIFIED_FIXTURE", durationMs: null }, originalMovieAudio: "EXCLUDED", cloning: "NONE", restrictions: fakeVoiceRestrictions });
}
/** Synchronous bounded in-memory simulation. No workers or submission ledger
 * installation. Duplicate/UNKNOWN receipts cannot cause a second invocation,
 * even under a fresh key or another harness using this registered adapter. */
export function createFakeVoiceHarness(value: { adapter: unknown; scope: unknown }) {
  const state = registered(value.adapter);
  const scope = record(captureVoiceJson(value.scope), ["projectId", "movieId", "studioId"], "voice.fake.scope");
  const scopeBytes = canonicalJson({ projectId: id(scope.projectId, "voice.project"), movieId: id(scope.movieId, "voice.movie"), studioId: id(scope.studioId, "voice.studio") });
  return Object.freeze({
    submit(input: unknown) {
      const r = record(captureVoiceJson(input), ["schemaVersion", "execution", "idempotencyKey", "plan", "chunkIndex"], "voice.fake.request");
      if (r.schemaVersion !== V.request || r.execution !== "FAKE_ONLY") fail("UNTRUSTED_RECEIPT", "voice.fake.execution");
      const plan = validateVoicePlan(r.plan), chunkIndex = integer(r.chunkIndex, "voice.chunkIndex", V.maxChunks - 1);
      if (!plan.plan.chunks[chunkIndex] || canonicalJson(plan.plan.reference.scope) !== scopeBytes) fail("SCOPE_MISMATCH", "voice.fake.scope");
      const proposal = { schemaVersion: V.request, execution: "FAKE_ONLY", planHash: plan.planHash, chunkIndex };
      const proposalHash = contractHash(V.request, proposal), key = canonicalJson([scopeBytes, id(r.idempotencyKey, "voice.key")]);
      const existing = state.keys.get(key);
      if (existing) {
        if (existing.proposalHash !== proposalHash) fail("RECEIPT_BINDING_INVALID", "voice.fake.idempotencyConflict");
        return output(existing.result);
      }
      if (canonicalJson(plan.plan.capability) !== canonicalJson(state.capability)) fail("UNTRUSTED_RECEIPT", "voice.fake.capability");
      if (state.keys.size >= V.maxRequests) fail("SIZE_LIMIT", "voice.fake.requests");
      const recipeHash = contractHash(V.recipe, { reference: plan.plan.reference, planHash: plan.planHash, chunkIndex, capability: state.capability });
      let result = state.recipes.get(recipeHash);
      if (!result) {
        state.calls++; // No await, callback, request or recovery between reservation and terminal result.
        const base = { schemaVersion: "story-voice-fake-result-v1" as const, requestId: `fake-request-${proposalHash}`, fakeSubmissionId: `fake-submission-${proposalHash}`, requestHash: proposalHash, restrictions: fakeVoiceRestrictions };
        if (state.scenario === "UNKNOWN") result = freeze({ ...base, outcome: "UNKNOWN", reason: "AMBIGUOUS_FAKE_COMPLETION" });
        else if (state.scenario === "DEFINITIVE_FAILURE") result = freeze({ ...base, outcome: "DEFINITIVE_FAILURE", safeCode: "SYNTHETIC_FAILURE" });
        else { const artifact = metadata(plan, chunkIndex, proposalHash, recipeHash);
          result = freeze({ ...base, outcome: "FIXTURE_BYTES", metadata: artifact, metadataHash: contractHash(V.artifact, artifact) }); }
        state.recipes.set(recipeHash, result);
      }
      state.keys.set(key, { proposalHash, result }); return output(result);
    },
  });
}
function output(result: FakeVoiceResult) {
  // A fresh copy prevents a caller from poisoning any cached fixture bytes.
  return { result, bytes: result.outcome === "FIXTURE_BYTES" ? fixtureBytes() : null };
}
