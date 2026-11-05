import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { createSyntheticVideoCatalog, buildOfflineHighlightPlan as build, validateOfflineHighlightPlan as validate,
  buildOfflineVideoTimelinePreview as preview, OFFLINE_VIDEO as V, OfflineVideoError, restrictions,
  type SyntheticVideoDescriptor, type OfflineHighlightPlan } from "../../../lib/storyline/video-highlights-offline";
import { fixture, sourceInput, segment, seconds, selection } from "./fixture";
const denied = (fn: () => unknown, code?: string) => assert.throws(fn, (e: unknown) => e instanceof OfflineVideoError && (!code || e.code === code));
const expected = (p: OfflineHighlightPlan) => ({ planId: p.planId, planHash: p.planHash, totalDuration: p.payload.totalDuration });

test("synthetic 120-second source: 8+12+12=32, exact half-open placement, deterministic hash and immutable originals", () => {
  const f = fixture(), before = canonicalJson({ input: f.input, request: f.request, source: f.source });
  const p = build(f.source, f.request), again = build(f.source, f.request);
  assert.deepEqual(p, again); assert.deepEqual(p.payload.segments.map(s => s.duration), [seconds(8), seconds(12), seconds(12)]);
  assert.deepEqual(p.payload.totalDuration, seconds(32)); assert.equal(p.planHash, contractHash(V.plan, p.payload)); assert.equal(p.planId, `vhl-${p.planHash}`);
  assert.equal(f.source.metadataHash, contractHash(V.source, f.source.metadata));
  assert.deepEqual(p.payload.segments.map(s => [s.outputStart, s.outputEnd]), [[seconds(0), seconds(8)], [seconds(8), seconds(20)], [seconds(20), seconds(32)]]);
  assert.equal(validate(p, f.source, expected(p)), p);
  const v = preview(p); assert.deepEqual(v.start, seconds(0)); assert.deepEqual(v.end, seconds(32)); assert.deepEqual(v.restrictions, restrictions);
  assert.equal(v.timestampPrecision, "MATHEMATICAL_ONLY_NOT_FRAME_VERIFIED");
  assert.equal(canonicalJson({ input: f.input, request: f.request, source: f.source }), before);
  function frozen(v: unknown) { if (v && typeof v === "object") { assert.ok(Object.isFrozen(v)); Object.values(v).forEach(frozen); } } frozen(p); frozen(v);
});
test("fractional seconds and touching boundaries remain exact, without milliseconds or frames", () => {
  const f = fixture(); f.request.segments = [segment(0, seconds(0), seconds(1, 3)), segment(1, seconds(1, 3), seconds(5, 6))];
  const p = build(f.source, f.request); assert.deepEqual(p.payload.segments.map(s => s.duration), [seconds(1, 3), seconds(1, 2)]);
  assert.deepEqual(p.payload.totalDuration, seconds(5, 6)); assert.deepEqual(p.payload.segments[1].outputEnd, seconds(5, 6));
  assert.equal(p.payload.sourceDuration.numerator, 120); assert.equal(p.payload.policy.intervals, "HALF_OPEN");
});
test("source zero and exact synthetic end accepted; end beyond rational source denied", () => {
  const f = fixture(); f.request.segments = [segment(0, seconds(0), seconds(120))]; assert.deepEqual(build(f.source, f.request).payload.totalDuration, seconds(120));
  f.request.segments[0].end = seconds(120001, 1000); denied(() => build(f.source, f.request), "INVALID_INTERVAL");
});
for (const [name, start, end] of [
  ["zero length", seconds(1), seconds(1)], ["negative", seconds(-1), seconds(1)], ["reverse", seconds(2), seconds(1)],
  ["fractional numerator", seconds(0.1), seconds(1)], ["fractional denominator", seconds(1, 1.5), seconds(2)],
  ["unsafe numerator", seconds(Number.MAX_SAFE_INTEGER + 1), seconds(1)], ["unsafe denominator", seconds(1, Number.MAX_SAFE_INTEGER + 1), seconds(2)],
  ["zero denominator", seconds(1, 0), seconds(2)], ["negative denominator", seconds(1, -2), seconds(2)],
  ["negative zero", seconds(-0), seconds(1)], ["NaN", seconds(NaN), seconds(1)], ["infinite", seconds(0), seconds(Infinity)],
  ["unreduced", seconds(0), seconds(2, 2)], ["noncanonical zero", seconds(0, 2), seconds(1)],
  ["term limit", seconds(0), seconds(1000000001, 1000000000)],
] as const) test(`rejects interval ${name}`, () => {
  const f = fixture(); f.request.segments = [segment(0, start, end)]; denied(() => build(f.source, f.request));
});
test("BigInt intermediates preserve valid large products and reject unrepresentable reduced totals", () => {
  const f = fixture(); f.request.segments = [segment(0, seconds(1, 999999937), seconds(2, 999999937))];
  assert.deepEqual(build(f.source, f.request).payload.totalDuration, seconds(1, 999999937));
  f.request.segments.push(segment(1, seconds(1), seconds(999999930, 999999929)));
  denied(() => build(f.source, f.request), "RATIONAL_OVERFLOW");
});
test("safe output terms larger than input term cap are valid exact expectations", () => {
  const f = fixture(); f.request.segments = [segment(0, seconds(0), seconds(1, 99991)), segment(1, seconds(1), seconds(99990, 99989))];
  const p = build(f.source, f.request); assert.ok(p.payload.totalDuration.denominator > V.maxInputTerm);
  assert.equal(validate(p, f.source, expected(p)), p);
});
for (const kind of ["reverse-source", "reordered-index", "gap-index", "duplicate-id", "overlap", "nested-overlap", "same-interval"] as const) {
  test(`rejects ${kind} without sorting or repairing selections`, () => {
    const f = fixture();
    if (kind === "reverse-source") f.request.segments = [segment(0, seconds(35), seconds(47)), segment(1, seconds(10), seconds(18))];
    if (kind === "reordered-index") f.request.segments[0].order = 1;
    if (kind === "gap-index") f.request.segments[1].order = 2;
    if (kind === "duplicate-id") f.request.segments[1].segmentId = f.request.segments[0].segmentId;
    if (kind === "overlap") f.request.segments[1].start = seconds(17);
    if (kind === "nested-overlap") { f.request.segments[0].end = seconds(60); }
    if (kind === "same-interval") { f.request.segments[1].start = seconds(10); f.request.segments[1].end = seconds(18); }
    const before = canonicalJson(f.request); denied(() => build(f.source, f.request)); assert.equal(canonicalJson(f.request), before);
  });
}
test("64 selections allowed; empty, 65, holes and oversized envelope rejected", () => {
  const f = fixture(); f.request.segments = Array.from({ length: 64 }, (_, i) => segment(i, seconds(i), seconds(i + 1)));
  assert.equal(build(f.source, f.request).payload.segments.length, 64);
  f.request.segments.push(segment(64, seconds(64), seconds(65))); denied(() => build(f.source, f.request), "SEGMENT_LIMIT");
  f.request.segments = []; denied(() => build(f.source, f.request));
  f.request.segments = new Array(2); denied(() => build(f.source, f.request));
  denied(() => build(f.source, { ...selection(f.source), unknown: "x".repeat(V.maxBytes + 1) }), "INVALID_CONTRACT");
});
test("aggregate 600 seconds allowed; greater aggregate rejected without eviction/truncation", () => {
  const cat = createSyntheticVideoCatalog(), source = cat.register({ ...sourceInput(), duration: seconds(1000) }), request = selection(source);
  request.segments = [segment(0, seconds(0), seconds(300)), segment(1, seconds(301), seconds(601))]; assert.deepEqual(build(source, request).payload.totalDuration, seconds(600));
  request.segments[1].end = seconds(602); denied(() => build(source, request), "PLAN_DURATION_LIMIT");
});
for (const [name, replacement] of [["duration", seconds(0)], ["duration", seconds(86401)], ["origin", "OWNER_REPORTED_REAL_MOVIE"],
  ["origin", "VERIFIED_REAL_VIDEO"], ["rightsClaim", "SOURCE_RIGHTS_VERIFIED"], ["rightsReview", "APPROVED"],
  ["sourceVerified", true], ["processingEligibility", "AUTHORIZED"], ["filename", "PRIVATE_FILE_MARKER.mp4"],
  ["metadataHash", "a".repeat(64)], ["timebase", { numerator: 1, denominator: 25 }], ["frameRate", 25]] as const) {
  test(`source rejects unsupported/forged ${name} ${JSON.stringify(replacement)}`, () => {
    denied(() => createSyntheticVideoCatalog().register({ ...sourceInput(), [name]: replacement }));
  });
}
test("owner-reported permission never establishes rights, possession, integrity, measured duration or extraction eligibility", () => {
  const source = createSyntheticVideoCatalog().register({ ...sourceInput(), rightsClaim: "OWNER_REPORTED_PERMISSION" });
  assert.equal(source.metadata.rightsReview, "PENDING_NOT_VERIFIED"); assert.equal(source.metadata.durationEvidence, "SYNTHETIC_DECLARED_NOT_MEASURED");
  assert.equal(source.metadata.timebase, null); assert.equal(source.metadata.restrictions.processingEligibility, "BLOCKED");
  assert.equal(source.metadata.restrictions.sourceRightsVerified, false); assert.equal(source.metadata.restrictions.clipsExtracted, false);
});
test("catalog deduplication, immutable source versions, independent revisions and bounded registration", () => {
  const f = fixture(); assert.equal(f.catalog.register(sourceInput()), f.source);
  denied(() => f.catalog.register({ ...sourceInput(), duration: seconds(121) }), "SOURCE_VERSION_CONFLICT");
  const v2 = f.catalog.register({ ...sourceInput(), version: 2 }); assert.notEqual(v2.metadataHash, f.source.metadataHash);
  for (let version = 3; version <= V.maxSources; version++) f.catalog.register({ ...sourceInput(), version });
  denied(() => f.catalog.register({ ...sourceInput(), version: 17 }), "CATALOG_LIMIT");
  assert.equal(f.catalog.register(sourceInput()), f.source);
});
test("cross-source/changed-hash binding and copied or rehashed descriptor cannot build or validate a plan", () => {
  const f = fixture(), other = f.catalog.register({ ...sourceInput(), sourceId: "vs-" + "2".repeat(32) }), p = build(f.source, f.request);
  denied(() => build(other, f.request), "SOURCE_BINDING_MISMATCH");
  denied(() => build(f.source, { ...f.request, source: { ...f.request.source, metadataHash: "a".repeat(64) } }));
  denied(() => build(JSON.parse(JSON.stringify(f.source)), f.request), "UNTRUSTED_DESCRIPTOR");
  const changed = { ...f.source, metadata: { ...f.source.metadata, duration: seconds(100) } };
  changed.metadataHash = contractHash(V.source, changed.metadata); denied(() => build(changed as SyntheticVideoDescriptor, f.request));
  denied(() => validate(p, createSyntheticVideoCatalog().register(sourceInput()), expected(p)), "ORIGINAL_DESCRIPTOR_MISMATCH");
});
test("copied, rehashed and cross-version plans or false expected identity/duration are never adopted", () => {
  const f = fixture(), p = build(f.source, f.request), v2 = f.catalog.register({ ...sourceInput(), version: 2 });
  denied(() => preview(JSON.parse(JSON.stringify(p))), "UNTRUSTED_PLAN");
  const rehashed = JSON.parse(JSON.stringify(p)); rehashed.payload.totalDuration = seconds(31); rehashed.planHash = contractHash(V.plan, rehashed.payload); rehashed.planId = `vhl-${rehashed.planHash}`;
  denied(() => validate(rehashed, f.source, expected(rehashed)), "UNTRUSTED_PLAN");
  denied(() => validate(p, v2, expected(p)), "ORIGINAL_DESCRIPTOR_MISMATCH");
  for (const e of [{ ...expected(p), planId: "vhl-" + "a".repeat(64) }, { ...expected(p), planHash: "a".repeat(64) },
    { ...expected(p), totalDuration: seconds(31) }, { ...expected(p), totalDuration: seconds(64, 2) }, { ...expected(p), approved: true }]) denied(() => validate(p, f.source, e));
});
test("strict schemas reject missing/extra fields, getters, symbols, cycles and authority envelopes", () => {
  const f = fixture();
  for (const v of [{}, { ...f.request, approved: true }, { ...f.request, overlap: "ALLOW" }, { ...f.request, [Symbol()]: 1 },
    { ...f.request, get segments() { throw Error("MUST_NOT_EXECUTE"); } }]) denied(() => build(f.source, v));
  const cyc: { self?: unknown } = {}; cyc.self = cyc; denied(() => build(f.source, cyc));
  for (const v of [{ ...f.request.segments[0], duration: seconds(8) }, { ...f.request.segments[0], label: "/private/SECRET_MARKER" }]) {
    denied(() => build(f.source, { ...f.request, segments: [v] }));
  }
  for (const artifact of [{ schemaVersion: "story-recap-execution-artifact-v1" }, { schemaVersion: "story-private-narration-artifact-v1" }]) {
    denied(() => build(artifact as unknown as SyntheticVideoDescriptor, f.request)); denied(() => preview(artifact as unknown as OfflineHighlightPlan));
  }
});
test("whitelisted descriptive labels supported; raw scripts, private paths and identifiers cannot become labels", () => {
  const f = fixture(); f.request.segments[0].label = "အစပိုင်း"; assert.equal(build(f.source, f.request).payload.segments[0].label, "အစပိုင်း");
  for (const label of ["private@example.invalid", "PRIVATE_SCRIPT_MARKER", "https://example.invalid/movie.mp4", "x".repeat(1000), "\u202eOpening"]) {
    f.request.segments[0].label = label; denied(() => build(f.source, f.request), "UNSAFE_LABEL");
  }
});
test("caller mutation after construction cannot alter source/plan snapshots or preview duration", () => {
  const f = fixture(), p = build(f.source, f.request), original = expected(p);
  f.request.segments[0].start.numerator = 17; f.input.duration.numerator = 1; f.request.source.version = 2;
  assert.deepEqual(preview(p).end, seconds(32)); assert.equal(validate(p, f.source, original), p);
  assert.equal(Reflect.set(f.source.metadata, "version", 2), false);
  assert.equal(Reflect.set(p.payload.totalDuration, "numerator", 31), false);
});
for (const [field, value] of [["sourceId", "../PRIVATE_MARKER"], ["sourceId", "vs-" + "x".repeat(32)], ["version", 0],
  ["version", 1.5], ["version", 1000001], ["version", Number.MAX_SAFE_INTEGER + 1]] as const) {
  test(`invalid source identity ${field} ${JSON.stringify(value)}`, () => denied(() => createSyntheticVideoCatalog().register({ ...sourceInput(), [field]: value })));
}
