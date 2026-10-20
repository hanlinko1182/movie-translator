import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/storyline/canonical";
import { AUDIO_VERIFICATION as A } from "@/lib/storyline/voice/audio-verification/contracts";
import { verifySyntheticPcmWav, pcmDurationUs } from "@/lib/storyline/voice/audio-verification/wav";
import { pcmWav, riffChunk, waveChunks } from "./fixture";

test("M5-02 actual 24/48 kHz mono PCM16 bytes establish sample count, exact SHA-256 and integer duration", () => {
  for (const rate of [24000, 48000]) {
    const bytes = pcmWav(rate, rate), m = verifySyntheticPcmWav(bytes);
    assert.deepEqual(m.format, { container: "WAV", codec: "PCM16_LE", sampleRateHz: rate, channels: 1, bitDepth: 16, blockAlign: 2, byteRate: rate * 2 });
    assert.equal(m.sampleCount, rate); assert.equal(m.durationUs, 1000000);
    assert.equal(m.fileBytes, bytes.length); assert.equal(m.dataBytes, rate * 2); assert.equal(m.dataOffset, 44);
    assert.equal(m.audioSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(m.durationPolicy, A.durationPolicy); assert.equal(Object.isFrozen(m.format), true);
    assert.doesNotThrow(() => canonicalJson(m));
  }
});
test("M5-02 duration is nearest integer microseconds, exact ties upward, never rounded-duration-derived", () => {
  for (const [samples, rate, expected] of [[1, 24000, 42], [2, 24000, 83], [3, 24000, 125], [1, 48000, 21], [2, 48000, 42], [3, 48000, 63], [5, 48000, 104], [47, 48000, 979], [49, 48000, 1021]]) {
    assert.equal(verifySyntheticPcmWav(pcmWav(samples, rate)).durationUs, expected);
    assert.equal(pcmDurationUs(samples, rate), expected);
  }
  for (const count of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => pcmDurationUs(count, 24000));
  assert.throws(() => pcmDurationUs(1, 44100));
});
test("M5-02 optional bounded JUNK and zero odd padding are explicit; fmt first and data last", () => {
  const bytes = pcmWav(3, 48000, Uint8Array.of(7, 8, 9)), m = verifySyntheticPcmWav(bytes);
  assert.equal(m.dataOffset, 56); assert.equal(m.sampleCount, 3); assert.equal(m.durationUs, 63);
  const corrupt = Buffer.from(bytes); corrupt[47] = 1; assert.throws(() => verifySyntheticPcmWav(corrupt));
  assert.throws(() => verifySyntheticPcmWav(pcmWav(3, 24000, new Uint8Array(1025))));
  const fmt = bytes.subarray(12, 36), data = riffChunk("data", Uint8Array.of(0, 0));
  for (const chunks of [[data, fmt], [riffChunk("JUNK", Uint8Array.of(0)), fmt, data], [fmt, data, riffChunk("JUNK", Uint8Array.of(0))],
    [fmt, fmt, data], [fmt, data, data], [fmt, riffChunk("JUNK", Uint8Array.of(0)), riffChunk("JUNK", Uint8Array.of(0)), data],
    [fmt, riffChunk("LIST", Uint8Array.of(0)), data], [fmt]]) assert.throws(() => verifySyntheticPcmWav(waveChunks(chunks)));
});
test("M5-02 malformed containers, headers, sample structure, unsupported profiles and size claims reject", async t => {
  const changes: [string, (b: Buffer) => Uint8Array][] = [
    ["empty", () => Buffer.alloc(0)], ["short header", b => b.subarray(0, 11)], ["truncated", b => b.subarray(0, b.length - 1)],
    ["RIFF identifier", b => { b[0] = 0; return b; }], ["WAVE identifier", b => { b[8] = 0; return b; }],
    ["huge declared size", b => { b.writeUInt32LE(0xffffffff, 4); return b; }], ["small declared size", b => { b.writeUInt32LE(2, 4); return b; }],
    ["trailing garbage", b => Buffer.concat([b, Buffer.from([0])])],
    ["unparsed partial chunk", b => { const v = Buffer.concat([b, Buffer.from([0])]); v.writeUInt32LE(v.length - 8, 4); return v; }],
    ["compressed codec", b => { b.writeUInt16LE(3, 20); return b; }], ["stereo", b => { b.writeUInt16LE(2, 22); return b; }],
    ["rate", b => { b.writeUInt32LE(44100, 24); return b; }], ["bits", b => { b.writeUInt16LE(8, 34); return b; }],
    ["alignment", b => { b.writeUInt16LE(4, 32); return b; }], ["byte rate", b => { b.writeUInt32LE(2, 28); return b; }],
    ["fmt extension", b => { b.writeUInt32LE(18, 16); return b; }], ["fmt too short", b => { b.writeUInt32LE(14, 16); return b; }],
    ["data overflow", b => { b.writeUInt32LE(0xffffffff, 40); return b; }], ["empty data", b => { b.writeUInt32LE(0, 40); return b; }],
    ["misaligned samples", b => { const v = b.subarray(0, 47); v.writeUInt32LE(39, 4); v.writeUInt32LE(3, 40); return v; }],
    ["misaligned samples with valid RIFF bounds and pad", b => { b.writeUInt32LE(3, 40); return b; }],
    ["unclaimed bytes", b => { b.writeUInt32LE(2, 40); return b; }], ["missing data", b => { b.write("JUNK", 36); return b; }],
  ];
  for (const [label, mutate] of changes) await t.test(label, () => assert.throws(() => verifySyntheticPcmWav(mutate(pcmWav()))));
  assert.throws(() => verifySyntheticPcmWav(new Uint8Array(A.maxAudioBytes + 1)));
  const maximum = pcmWav((A.maxAudioBytes - 44) / 2); assert.equal(verifySyntheticPcmWav(maximum).fileBytes, A.maxAudioBytes);
});
test("M5-02 byte capture rejects non-byte/shared/proxy storage and ignores malicious iterators/accessors", () => {
  for (const bytes of [[], {}, "RIFF", new Uint16Array(24), new DataView(new ArrayBuffer(48)), new Uint8Array(new SharedArrayBuffer(48)), new Proxy(pcmWav(), {})]) assert.throws(() => verifySyntheticPcmWav(bytes));
  const disguised = new Uint16Array(pcmWav()); Object.setPrototypeOf(disguised, Uint8Array.prototype);
  assert.throws(() => verifySyntheticPcmWav(disguised), "a forged prototype cannot turn 16-bit elements into exact byte capture");
  const source = new Uint8Array(pcmWav()); let called = false;
  Object.defineProperty(source, "byteLength", { get() { called = true; throw new Error(); } });
  Object.defineProperty(source, Symbol.iterator, { value() { called = true; throw new Error(); } });
  const m = verifySyntheticPcmWav(source); assert.equal(called, false); assert.equal(m.sampleCount, 2);
  source[44] = 1; assert.notEqual(verifySyntheticPcmWav(source).audioSha256, m.audioSha256, "PCM permits every sample bit pattern; exact hash detects changed bytes");
});
