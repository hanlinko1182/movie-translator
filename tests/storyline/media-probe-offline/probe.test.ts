import assert from "node:assert/strict";
import { test } from "node:test";
import { contractHash } from "../../../lib/storyline/canonical";
import { MEDIA_PROBE, OfflineMediaProbeError, parseProbeSeconds, parseProbeTimebase,
  validateProbeSegmentBoundaries, validateSyntheticProbeResult, type SyntheticProbeResult } from "../../../lib/storyline/media-probe-offline";
import { audioFixture, probeFixture, seconds, sourceFixture, videoFixture } from "./fixtures";

const validate = (input: unknown = probeFixture()) => validateSyntheticProbeResult(sourceFixture(), input);
const errorCode = (code: string) => (error: unknown) => error instanceof OfflineMediaProbeError && error.code === code;

test("video-only probe preserves exact rational timing and deterministic immutable metadata", () => {
  const input = probeFixture();
  const original = structuredClone(input);
  const result = validate(input);
  assert.deepEqual(input, original);
  assert.deepEqual(result.metadata.duration, seconds(3, 25));
  assert.deepEqual(result.metadata.streams[0].timebase, seconds(1, 1000));
  assert.equal(result.resultHash, contractHash(MEDIA_PROBE.result, result.metadata));
  assert.deepEqual(validate(result.metadata), result);
  assert.ok(Object.isFrozen(result.metadata.streams[0]));
  assert.equal(result.metadata.trust, "PROBE_RESULT_SYNTHETIC");
  assert.equal(result.sourceEvidence, "SYNTHETIC_BYTE_BINDING_ONLY");
  assert.equal(result.restrictions.realMediaVerified, false);
});

test("video and audio topology preserves independent timebases and container end", () => {
  const input = probeFixture();
  input.streams.push({ ...audioFixture(), duration: seconds(3, 20) });
  input.duration = seconds(3, 20);
  const result = validate(input);
  assert.deepEqual(result.metadata.streams.map(stream => stream.mediaType), ["VIDEO", "AUDIO"]);
  assert.deepEqual(result.metadata.streams[1].timebase, seconds(1, 48000));
  assert.throws(() => validateProbeSegmentBoundaries(result, 1, { start: seconds(0), end: seconds(3, 25) }), errorCode("VIDEO_STREAM_REQUIRED"));
  assert.throws(() => validateProbeSegmentBoundaries(result, 0, { start: seconds(0), end: seconds(3, 20) }), errorCode("INVALID_SEGMENT_INTERVAL"));
});

test("Matroska fixture accepts explicitly supported VP9 and Opus classifications", () => {
  const input = { ...probeFixture(), container: "MATROSKA",
    streams: [{ ...videoFixture(), codec: "VP9" }, { ...audioFixture(), codec: "OPUS" }] };
  assert.deepEqual(validate(input).metadata.streams.map(stream => stream.codec), ["VP9", "OPUS"]);
});

test("VFR retains variable frame intervals and does not infer boundaries from the declared rate", () => {
  const video = { ...videoFixture(), frameRateMode: "VARIABLE",
    frames: [{ pts: 0, dts: 0, durationTicks: 30 }, { pts: 30, dts: 30, durationTicks: 50 }, { pts: 80, dts: 80, durationTicks: 40 }] };
  const result = validate({ ...probeFixture(), streams: [video] });
  assert.ok(result.timingUncertainty.includes("CONSTANT_RATE_NOT_ESTABLISHED"));
  const interval = validateProbeSegmentBoundaries(result, 0, { start: seconds(3, 100), end: seconds(2, 25) });
  assert.deepEqual([interval.startTick, interval.endTick], [30, 80]);
  assert.equal(interval.status, "SYNTHETIC_INTERVAL_ONLY");
  assert.equal(interval.restrictions.clipsExtracted, false);
  assert.throws(() => validateProbeSegmentBoundaries(result, 0, { start: seconds(1, 25), end: seconds(2, 25) }),
    errorCode("SEGMENT_NOT_ON_SYNTHETIC_BOUNDARIES"));
});

test("decode-order records can have reordered presentation timestamps with exact presentation coverage", () => {
  const video = { ...videoFixture(), frames: [
    { pts: 0, dts: 0, durationTicks: 40 },
    { pts: 80, dts: 20, durationTicks: 40 },
    { pts: 40, dts: 40, durationTicks: 40 },
  ] };
  const result = validate({ ...probeFixture(), streams: [video] });
  assert.ok(result.timingUncertainty.includes("PRESENTATION_REORDERED"));
  const stream = result.metadata.streams[0];
  assert.ok(stream.mediaType === "VIDEO");
  assert.deepEqual(stream.frames?.map(frame => frame.pts), [0, 80, 40]);
  assert.equal(validateProbeSegmentBoundaries(result, 0, { start: seconds(1, 25), end: seconds(3, 25) }).endTick, 120);
});

test("missing timestamps remain explicit even when duration and nominal rate are supplied", () => {
  const result = validate({ ...probeFixture(), streams: [{ ...videoFixture(), frames: null }] });
  assert.ok(result.timingUncertainty.includes("PRESENTATION_TIMESTAMPS_MISSING"));
  assert.throws(() => validateProbeSegmentBoundaries(result, 0, { start: seconds(0), end: seconds(1, 25) }),
    errorCode("TIMESTAMP_EVIDENCE_MISSING"));
});

test("unknown frame rate with missing timestamps retains both uncertainties", () => {
  const result = validate({ ...probeFixture(), streams: [{ ...videoFixture(), frames: null, frameRateMode: "UNKNOWN", frameRate: null }] });
  assert.ok(result.timingUncertainty.includes("CONSTANT_RATE_NOT_ESTABLISHED"));
  assert.ok(result.timingUncertainty.includes("PRESENTATION_TIMESTAMPS_MISSING"));
});

test("nonzero presentation start and fractional tick conversion stay exact", () => {
  const video = { ...videoFixture(), timebase: seconds(1, 90000), start: seconds(1, 3), duration: seconds(1, 30),
    frameRate: seconds(30), frames: [{ pts: 30000, dts: 0, durationTicks: 3000 }] };
  const result = validate({ ...probeFixture(), duration: seconds(11, 30), streams: [video] });
  const interval = validateProbeSegmentBoundaries(result, 0, { start: seconds(1, 3), end: seconds(11, 30) });
  assert.deepEqual([interval.startTick, interval.endTick], [30000, 33000]);
  assert.throws(() => validateProbeSegmentBoundaries(result, 0, { start: seconds(1, 7), end: seconds(11, 30) }),
    errorCode("INVALID_SEGMENT_INTERVAL"));
  assert.throws(() => validateProbeSegmentBoundaries(result, 0, { start: seconds(4, 11), end: seconds(11, 30) }),
    errorCode("TIMESTAMP_NOT_REPRESENTABLE"));
});

test("rational parsers preserve reduced terms and do not round to milliseconds", () => {
  assert.deepEqual(parseProbeSeconds(seconds(1001, 30000)), seconds(1001, 30000));
  assert.deepEqual(parseProbeTimebase(seconds(1, 90000)), seconds(1, 90000));
});

for (const [name, value] of [
  ["negative", seconds(-1)], ["zero denominator", seconds(1, 0)], ["unreduced", seconds(2, 4)],
  ["fractional", seconds(0.5)], ["unsafe", seconds(Number.MAX_SAFE_INTEGER + 1)],
  ["NaN", seconds(NaN)], ["Infinity", seconds(Infinity)], ["negative zero", seconds(-0)],
  ["extra field", { ...seconds(1), unit: "ms" }],
] as const) {
  test(`rejects ${name} rational seconds`, () => assert.throws(() => parseProbeSeconds(value), OfflineMediaProbeError));
}

for (const [name, input] of [
  ["missing duration", { ...probeFixture(), duration: null }],
  ["negative duration", { ...probeFixture(), duration: seconds(-1) }],
  ["zero duration", { ...probeFixture(), duration: seconds(0) }],
  ["ambiguous duration", { ...probeFixture(), duration: seconds(1) }],
  ["duration limit", { ...probeFixture(), duration: seconds(86401) }],
  ["wrong hash", { ...probeFixture(), source: { ...sourceFixture(), sha256: "f".repeat(64) } }],
  ["wrong byte count", { ...probeFixture(), source: { ...sourceFixture(), byteCount: 4097 } }],
  ["unsafe source count", { ...probeFixture(), source: { ...sourceFixture(), byteCount: Number.MAX_SAFE_INTEGER + 1 } }],
  ["invalid source hash", { ...probeFixture(), source: { ...sourceFixture(), sha256: "not-a-hash" } }],
  ["source size cap", { ...probeFixture(), source: { ...sourceFixture(), byteCount: MEDIA_PROBE.maxSourceBytes + 1 } }],
  ["unsupported container", { ...probeFixture(), container: "OTHER" }],
  ["audio-only topology", { ...probeFixture(), streams: [audioFixture()] }],
  ["two video streams", { ...probeFixture(), streams: [videoFixture(), { ...videoFixture(), index: 1 }] }],
  ["oversized topology", { ...probeFixture(), streams: [videoFixture(), audioFixture(), audioFixture()] }],
  ["duplicate stream indexes", { ...probeFixture(), streams: [videoFixture(), { ...audioFixture(), index: 0 }] }],
  ["forged rights", { ...probeFixture(), sourceRightsVerified: true }],
  ["fake real media trust", { ...probeFixture(), trust: "REAL_VIDEO_PROBED" }],
  ["forged completeness", { ...probeFixture(), completeness: "DECODED_COMPLETE" }],
  ["wrong contract version", { ...probeFixture(), schemaVersion: "future" }],
  ["reinterpreted timestamp provenance", { ...probeFixture(), timestampProvenance: "INDEPENDENTLY_MEASURED" }],
  ["unsupported negative policy", { ...probeFixture(), negativeTimestampPolicy: "SHIFT_TO_ZERO" }],
  ["excessive output", { ...probeFixture(), diagnostic: "x".repeat(MEDIA_PROBE.maxMetadataBytes) }],
] as const) {
  test(`rejects probe fixture with ${name}`, () => assert.throws(() => validate(input), OfflineMediaProbeError));
}

for (const [name, changes] of [
  ["unsupported video codec", { codec: "RAW" }],
  ["container codec conflict", { codec: "VP9" }],
  ["unsupported stream type", { mediaType: "SUBTITLE" }],
  ["zero width", { width: 0 }],
  ["excessive height", { height: 8193 }],
  ["excessive pixel count", { width: 8192, height: 8192 }],
  ["fractional dimension", { width: 640.5 }],
  ["unsupported timebase", { timebase: seconds(2) }],
  ["zero timebase", { timebase: seconds(0) }],
  ["unrepresentable stream start", { start: seconds(1, 3) }],
  ["negative stream start", { start: seconds(-1) }],
  ["zero stream duration", { duration: seconds(0) }],
  ["missing constant frame rate", { frameRate: null }],
  ["oversized frame rate", { frameRate: seconds(241) }],
  ["CFR declaration conflicts with frame durations", { frameRate: seconds(30) }],
  ["frame ticks exceed stream end", { frames: [{ pts: 0, dts: 0, durationTicks: 121 }] }],
  ["unconfirmed frame coverage", { frames: [{ pts: 0, dts: 0, durationTicks: 40 }] }],
  ["presentation gap", { frames: [{ pts: 40, dts: 0, durationTicks: 40 }, { pts: 80, dts: 40, durationTicks: 40 }] }],
  ["duplicate PTS", { frames: [{ pts: 40, dts: 0, durationTicks: 40 }, { pts: 40, dts: 40, durationTicks: 40 }] }],
  ["duplicate DTS", { frames: [{ pts: 0, dts: 0, durationTicks: 40 }, { pts: 40, dts: 0, durationTicks: 40 }] }],
  ["DTS after PTS", { frames: [{ pts: 0, dts: 1, durationTicks: 40 }] }],
  ["negative DTS", { frames: [{ pts: 0, dts: -1, durationTicks: 40 }] }],
  ["negative PTS", { frames: [{ pts: -1, dts: 0, durationTicks: 40 }] }],
  ["missing individual PTS", { frames: [{ pts: null, dts: 0, durationTicks: 40 }] }],
  ["empty purported frame evidence", { frames: [] }],
  ["excessive frame entries", { frames: Array.from({ length: MEDIA_PROBE.maxFrames + 1 }, () => ({ pts: 0, dts: 0, durationTicks: 40 })) }],
] as const) {
  test(`rejects video stream with ${name}`, () => {
    assert.throws(() => validate({ ...probeFixture(), streams: [{ ...videoFixture(), ...changes }] }), OfflineMediaProbeError);
  });
}

test("strict audio fields reject invalid codec, sample rate and channels", () => {
  for (const audio of [{ ...audioFixture(), codec: "OPUS" }, { ...audioFixture(), channels: 0 },
    { ...audioFixture(), sampleRate: 0 }, { ...audioFixture(), width: 640 }]) {
    assert.throws(() => validate({ ...probeFixture(), streams: [videoFixture(), audio] }), OfflineMediaProbeError);
  }
});

test("segment validation requires original synthetic object and strict half-open boundaries", () => {
  const result = validate();
  const bounds = { start: seconds(0), end: seconds(3, 25) };
  assert.deepEqual(validateProbeSegmentBoundaries(result, 0, bounds).end, bounds.end);
  for (const value of [{ ...bounds, start: bounds.end }, { ...bounds, end: seconds(0) }, { ...bounds, approval: true }]) {
    assert.throws(() => validateProbeSegmentBoundaries(result, 0, value), OfflineMediaProbeError);
  }
  const copy = JSON.parse(JSON.stringify(result)) as SyntheticProbeResult;
  assert.throws(() => validateProbeSegmentBoundaries(copy, 0, bounds), errorCode("UNTRUSTED_SYNTHETIC_RESULT"));
});

test("source expectation rejects extra authority and source substitution", () => {
  assert.throws(() => validateSyntheticProbeResult({ ...sourceFixture(), sourceVerified: true }, probeFixture()), OfflineMediaProbeError);
  assert.throws(() => validateSyntheticProbeResult({ ...sourceFixture(), sha256: "c".repeat(64) }, probeFixture()), errorCode("SOURCE_BINDING_MISMATCH"));
});

test("strict snapshot rejects accessors without invoking them", () => {
  let calls = 0;
  const input = { ...probeFixture(), get duration() { calls++; return seconds(1); } };
  assert.throws(() => validate(input), OfflineMediaProbeError);
  assert.equal(calls, 0);
});
