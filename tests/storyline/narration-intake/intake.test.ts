import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { INTAKE, measureNarrationWav as measure, createOfflineNarrationRegistry, noOwnerClaims,
  buildNarrationTimingPreview as preview, NarrationIntakeError, type WavMeasurement,
  type NarrationCandidate } from "../../../lib/storyline/narration-intake";
import { candidate, wav } from "./fixture";

const rejected = (fn: () => unknown, code?: string) => assert.throws(fn, (e: unknown) =>
  e instanceof NarrationIntakeError && (!code || e.code === code));

test("exact signed PCM frame/rational duration and whole-file hash; input immutable", () => {
  const b = wav(101), original = Buffer.from(b), m = measure(b);
  assert.equal(m.sampleFrames, 101); assert.equal(m.byteCount, 246); assert.equal(m.dataByteCount, 202);
  assert.deepEqual(m.durationSeconds, { numerator: 101, denominator: 24000 });
  assert.equal(m.sha256, createHash("sha256").update(b).digest("hex"));
  assert.deepEqual(b, original); assert.equal(m.integrity, "LOCAL_AUDIO_INTEGRITY_VERIFIED");
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.durationSeconds));
  b.fill(0); assert.equal(m.sha256, createHash("sha256").update(original).digest("hex"));
});
for (const rate of INTAKE.sampleRatesHz) test(`explicit supported sample rate ${rate}`, () => {
  const m = measure(wav(rate, rate)); assert.equal(m.sampleRateHz, rate);
  assert.deepEqual(m.durationSeconds, { numerator: 1, denominator: 1 });
});
for (const [label, mutate] of [
  ["non RIFF", (b: Buffer) => b.write("RF64", 0)],
  ["non WAVE", (b: Buffer) => b.write("wave", 8)],
  ["high-bit spoofed ASCII", (b: Buffer) => b[0] |= 128],
  ["wrong RIFF length", (b: Buffer) => b.writeUInt32LE(b.length, 4)],
  ["extended fmt", (b: Buffer) => b.writeUInt32LE(18, 16)],
  ["float encoding", (b: Buffer) => b.writeUInt16LE(3, 20)],
  ["extensible encoding", (b: Buffer) => b.writeUInt16LE(65534, 20)],
  ["stereo", (b: Buffer) => b.writeUInt16LE(2, 22)],
  ["zero channels", (b: Buffer) => b.writeUInt16LE(0, 22)],
  ["unvalidated sample rate", (b: Buffer) => b.writeUInt32LE(24001, 24)],
  ["zero sample rate", (b: Buffer) => b.writeUInt32LE(0, 24)],
  ["wrong byte rate", (b: Buffer) => b.writeUInt32LE(1, 28)],
  ["wrong block alignment", (b: Buffer) => b.writeUInt16LE(4, 32)],
  ["wrong bit depth", (b: Buffer) => b.writeUInt16LE(8, 34)],
  ["unknown chunk", (b: Buffer) => b.write("JUNK", 36)],
  ["duplicate fmt instead of data", (b: Buffer) => b.write("fmt ", 36)],
  ["short data declaration", (b: Buffer) => b.writeUInt32LE(2, 40)],
  ["huge data declaration", (b: Buffer) => b.writeUInt32LE(0xffffffff, 40)],
] as const) test(`rejects ${label}`, () => { const b = wav(); mutate(b); rejected(() => measure(b)); });
test("every truncated prefix is denied, including headers/chunk payload and partial sample", () => {
  const b = wav(); for (let i = 0; i < b.length; i++) rejected(() => measure(b.subarray(0, i)));
});
test("odd-sized PCM frame rejected even with consistent RIFF/data declarations", () => {
  const b = wav().subarray(0, 245); b.writeUInt32LE(237, 4); b.writeUInt32LE(201, 40); rejected(() => measure(b), "UNSUPPORTED_PCM");
});
test("empty audio, raw native PCM and appended unexpected chunk rejected", () => {
  rejected(() => measure(wav(0))); rejected(() => measure(wav().subarray(44)));
  const b = Buffer.concat([wav(), Buffer.from("JUNK\0\0\0\0")]); b.writeUInt32LE(b.length - 8, 4); rejected(() => measure(b));
});
test("strict maximum file bytes accepts exact ceiling and rejects ceiling+1 before parse", () => {
  const b = wav((INTAKE.maxFileBytes - 44) / 2); assert.equal(measure(b).byteCount, INTAKE.maxFileBytes);
  rejected(() => measure(Buffer.concat([b, Buffer.alloc(1)])), "BYTE_LIMIT");
});
test("rejects non-byte, shared memory, proxy, custom prototype and accessor spoofing without invocation", () => {
  for (const v of [null, [], "RIFF", new DataView(new ArrayBuffer(100)), new Uint16Array(100),
    new Uint8Array(new SharedArrayBuffer(100)), new Proxy(wav(), {})]) rejected(() => measure(v));
  const b = wav(); Object.setPrototypeOf(b, {}); rejected(() => measure(b));
  const evil = { get byteLength() { throw new Error("MUST_NOT_EXECUTE"); } }; rejected(() => measure(evil));
  const ownAccessor = wav(); Object.defineProperty(ownAccessor, "buffer", { get() { throw Error("MUST_NOT_EXECUTE"); } });
  assert.equal(measure(ownAccessor).sampleFrames, 101);
});
test("all provenance facts stay separate and missing original script remains explicit", () => {
  const registry = createOfflineNarrationRegistry();
  const c = registry.register(measure(wav()), { origin: "OWNER_DOWNLOADED_WAV", providerClaim: "OPENROUTER_GEMINI_KORE_OWNER_REPORTED",
    originalScript: "UNAVAILABLE", listeningFeedback: "OWNER_SUPPLIED" });
  assert.deepEqual(c.metadata.evidence, ["LOCAL_AUDIO_INTEGRITY_VERIFIED", "SCRIPT_COVERAGE_NOT_VERIFIED", "OWNER_REPORTED", "LISTENING_FEEDBACK_OWNER_SUPPLIED"]);
  assert.equal(c.metadata.providerReceipt, "UNKNOWN"); assert.equal(c.metadata.nativeGatewayResponseIdentity, "NOT_ESTABLISHED");
  assert.equal(c.metadata.scriptCoverage, "NOT_VERIFIED"); assert.ok(c.metadata.missingEvidence.includes("EXACT_ORIGINAL_SCRIPT"));
  assert.equal(c.metadata.restrictions.audioVerified, false); assert.equal(c.metadata.restrictions.liveEligible, false);
  assert.equal(c.metadata.restrictions.humanApproval, "NONE"); assert.equal(c.metadata.restrictions.productionEligible, false);
  assert.ok(!JSON.stringify(c).includes("PROVIDER_RECEIPT_VERIFIED"));
});
for (const [field, value] of [
  ["providerReceipt", "PROVIDER_RECEIPT_VERIFIED"], ["humanApproval", "APPROVED"], ["sourceVerified", true],
  ["spendingAuthority", "GRANTED"], ["privatePath", "/private/SECRET_MARKER"], ["receipt", "PRIVATE_RECEIPT_MARKER"],
  ["originalScript", "VERIFIED"], ["origin", "ORIGINAL_GATEWAY_PCM"], ["model", "other-model"],
] as const) test(`owner evidence cannot promote/inject ${field}`, () => {
  const r = createOfflineNarrationRegistry(); rejected(() => r.register(measure(wav()), { ...noOwnerClaims, [field]: value }));
});
test("strict evidence rejects missing fields, accessors, symbols and oversized values", () => {
  const r = createOfflineNarrationRegistry(), m = measure(wav());
  for (const v of [{}, { ...noOwnerClaims, origin: "x".repeat(9000) }, { ...noOwnerClaims, [Symbol()]: 1 },
    { ...noOwnerClaims, get origin() { throw Error("MUST_NOT_EXECUTE"); } }]) rejected(() => r.register(m, v));
});
test("same audio/evidence deduplicates; changed immutable metadata conflicts", () => {
  const { registry, candidate: c } = candidate();
  assert.equal(registry.register(measure(wav()), noOwnerClaims), c);
  assert.equal(registry.checkMetadata(JSON.parse(JSON.stringify(c.metadata))), c.metadata);
  rejected(() => registry.register(measure(wav()), { ...noOwnerClaims, listeningFeedback: "OWNER_SUPPLIED" }), "CANDIDATE_CONFLICT");
  for (const v of [{ ...c.metadata, measured: { ...c.metadata.measured, sampleFrames: 2 } },
    { ...c.metadata, providerReceipt: "PROVIDER_RECEIPT_VERIFIED" }, { ...c.metadata, path: "/private/SECRET_MARKER" }]) {
    rejected(() => registry.checkMetadata(v), "CANDIDATE_CONFLICT");
  }
});
test("bounded registry never evicts candidates to admit new work", () => {
  const r = createOfflineNarrationRegistry(); for (let i = 1; i <= INTAKE.maxCandidates; i++) r.register(measure(wav(i)), noOwnerClaims);
  rejected(() => r.register(measure(wav(17)), noOwnerClaims), "CANDIDATE_LIMIT");
  assert.equal(r.register(measure(wav(1)), noOwnerClaims).metadata.measured.sampleFrames, 1);
});
test("pure preview uses exact measured rational duration; equivalent fractions accepted without rounding", () => {
  const { candidate: c } = candidate(), before = JSON.stringify(c);
  const a = preview(c), b = preview(c, { numerator: 202, denominator: 48000 });
  assert.deepEqual(a, b); assert.deepEqual(a.start, { numerator: 0, denominator: 1 });
  assert.deepEqual(a.end, { numerator: 101, denominator: 24000 }); assert.equal(a.synchronization, "PREVIEW_ONLY");
  assert.equal(a.track, "narration"); assert.equal(JSON.stringify(c), before); assert.ok(Object.isFrozen(a));
});
for (const v of [{ numerator: 1, denominator: 1 }, { numerator: 0, denominator: 0 }, { numerator: -1, denominator: 2 },
  { numerator: 1.5, denominator: 2 }, { numerator: 101, denominator: 24000, approval: true }, { durationMs: 4 }]) {
  test(`rejects conflicting/invalid caller duration ${JSON.stringify(v)}`, () => rejected(() => preview(candidate().candidate, v)));
}
test("serialized/rehashed measurements and candidates cannot mint local verification or preview", () => {
  const m = measure(wav()), r = createOfflineNarrationRegistry();
  rejected(() => r.register(JSON.parse(JSON.stringify(m)), noOwnerClaims), "UNTRUSTED_MEASUREMENT");
  rejected(() => r.register({ ...m, sha256: "a".repeat(64) } as WavMeasurement, noOwnerClaims), "UNTRUSTED_MEASUREMENT");
  rejected(() => preview(JSON.parse(JSON.stringify(candidate().candidate))), "UNTRUSTED_CANDIDATE");
  rejected(() => preview({} as NarrationCandidate), "UNTRUSTED_CANDIDATE");
});
test("M5/M8 fake artifacts and non-audio blobs cannot be promoted into narration candidate authority", () => {
  const r = createOfflineNarrationRegistry();
  for (const v of [{ schemaVersion: "story-recap-execution-artifact-v1", media: "SIMULATED_NOT_MEDIA" },
    { schemaVersion: "story-voice-audio-artifact-v1", approvalHash: "a".repeat(64) }]) {
    rejected(() => measure(v)); rejected(() => r.register(v as unknown as WavMeasurement, noOwnerClaims));
    rejected(() => r.checkMetadata(v)); rejected(() => preview(v as unknown as NarrationCandidate));
  }
  rejected(() => measure(Buffer.alloc(200, 65)));
});
