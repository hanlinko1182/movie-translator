import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { generateRecapTimelinePlan as generate, validateRecapTimelinePlan as validate, parseRecapTimelineInput, TIMELINE as T, timelineRestrictions, type RecapTimelinePlan } from "../../../lib/storyline/timeline";
import { fakeVoiceRestrictions } from "../../../lib/storyline/voice/foundation/contracts";
import { timelineFixture, reseal, clone } from "./fixture";

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Plan = Mutable<RecapTimelinePlan>;
function rehash(p: Plan) {
  for (const s of p.plan.segments) { const { id: _id, ...body } = s; void _id; s.id = `tlseg-${contractHash(T.segment, body)}`; }
  p.planHash = contractHash(T.plan, p.plan); p.id = `tl-${p.planHash}`;
}

test("exact saved M6 identity, evidence and prefix placement; immutable original and deterministic replay", async () => {
  const f = timelineFixture(), before = canonicalJson({ input: f.input, observation: f.observation, original: f.f.capture.original });
  const a = await generate(f.input, f.resolver), b = await generate(f.input, f.resolver);
  assert.deepEqual(a, b); assert.deepEqual(await validate(a, f.input, f.resolver), a);
  assert.equal(canonicalJson({ input: f.input, observation: f.observation, original: f.f.capture.original }), before);
  assert.equal(a.id, `tl-${a.planHash}`);
  assert.equal(a.plan.totalOutputMs, f.observation.view.record.plan.plan.totalSourceMs);
  assert.equal(a.plan.segments.length, f.observation.view.record.plan.plan.sourceOrder.length);
  let cursor = 0;
  for (const s of a.plan.segments) {
    assert.equal(s.sourceStartMs, s.candidate.startMs); assert.equal(s.sourceEndMs, s.candidate.endMs);
    assert.equal(s.outputStartMs, cursor); cursor += s.sourceEndMs - s.sourceStartMs;
    assert.equal(s.outputEndMs, cursor); assert.equal(s.durationMs, s.sourceEndMs - s.sourceStartMs);
    assert.deepEqual(s.selected, f.input.selected); assert.deepEqual(s.source, f.f.input.source);
    assert.ok(s.candidate.claimIds.length && s.candidate.evidence.length);
    assert.ok(s.candidate.evidence[0].sourceText); assert.ok(s.candidate.findingId);
    const { id, ...body } = s; assert.equal(id, `tlseg-${contractHash(T.segment, body)}`);
  }
  function frozen(v: unknown) { if (v && typeof v === "object") { assert.ok(Object.isFrozen(v)); Object.values(v).forEach(frozen); } }
  frozen(a); assert.throws(() => { (a as Plan).plan.segments[0].outputStartMs = 1; });
});

test("nonchronological M6 presentation retains source chronology and omissions without output filler", async () => {
  const f = timelineFixture({}, f => { f.input.policy.presentation = "SCORE_ORDER"; });
  const p = await generate(f.input, f.resolver);
  assert.notDeepEqual(p.plan.presentationOrder, p.plan.sourceOrder);
  assert.deepEqual(p.plan.segments.map(s => s.candidate.id), f.observation.view.record.plan.plan.presentationOrder);
  assert.deepEqual(p.plan.omissions, f.observation.view.record.plan.plan.gaps);
  assert.ok(p.plan.omissions.length); assert.ok(p.plan.totalOutputMs < p.plan.source.media.durationMs);
  assert.equal(p.plan.segments[0].outputStartMs, 0);
});

test("half-open touching intervals, source zero and exact authoritative media end pass", async () => {
  const f = timelineFixture({ raw: r => { r.transcript.segments[2].startMs = r.transcript.segments[0].endMs; } });
  const p = await generate(f.input, f.resolver), chronological = p.plan.sourceOrder.map(id => p.plan.segments.find(s => s.id === id)!);
  assert.equal(chronological[0].sourceStartMs, 0); assert.equal(chronological[0].sourceEndMs, chronological[1].sourceStartMs);
  assert.equal(chronological.at(-1)!.sourceEndMs, p.plan.source.media.durationMs);
});

test("matching fake audio preserves exact reference, never changes placement or grants eligibility", async () => {
  const plain = timelineFixture(), audio = timelineFixture({}, f => {
    f.input.audio = { schemaVersion: "story-highlight-synthetic-audio-ref-v1", artifactId: "fake-audio", artifactHash: "a".repeat(64), planHash: "b".repeat(64),
      reference: f.input.source.narration, execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: fakeVoiceRestrictions };
  });
  const a = await generate(plain.input, plain.resolver), b = await generate(audio.input, audio.resolver);
  assert.equal(a.plan.audio, null); assert.deepEqual(b.plan.audio, audio.f.input.audio);
  assert.deepEqual(a.plan.segments.map(s => [s.sourceStartMs, s.sourceEndMs, s.outputStartMs, s.outputEndMs]), b.plan.segments.map(s => [s.sourceStartMs, s.sourceEndMs, s.outputStartMs, s.outputEndMs]));
  assert.equal(a.plan.totalOutputMs, b.plan.totalOutputMs); assert.deepEqual(b.plan.restrictions, timelineRestrictions);
});

test("R4 domain and immutable original lineage survive; selected version changes segment identities", async () => {
  const f = timelineFixture({ edited: true }), a = await generate(f.input, f.resolver);
  assert.equal(a.plan.source.narration.artifact.hashDomain, "story-edited-narration-v1");
  assert.equal(a.plan.source.narration.original.hashDomain, "story-narration-draft-v1");
  f.observation.parent = clone(f.observation.view);
  const r = clone(f.observation.view.record); r.previous = f.observation.head.identity; r.version = 2; r.expectedRevision = 1; r.id = "second-saved-record";
  f.observation.view = { ...f.observation.view, record: r }; f.observation.head.revision = 2; reseal(f);
  const b = await generate(f.input, f.resolver);
  assert.ok(a.plan.segments.every((s, i) => s.id !== b.plan.segments[i].id));
  assert.equal(a.plan.totalOutputMs, b.plan.totalOutputMs);
});

const inputAttacks: [string, (r: Record<string, unknown>) => void][] = [
  ["caller clips", r => { r.clips = []; }], ["browser roles", r => { r.role = "editor"; }], ["approval", r => { r.approval = true; }],
  ["unsupported schema", r => { r.schemaVersion = "story-recap-timeline-input-v2"; }], ["production", r => { r.execution = "PRODUCTION"; }],
  ...["tenantId", "projectId", "movieId", "studioId"].map(k => [`invalid ${k}`, (r: Record<string, unknown>) => { (r.scope as Record<string, unknown>)[k] = "bad/id"; }] as [string, (r: Record<string, unknown>) => void]),
  ...[0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(n => [`invalid version ${Object.is(n, -0) ? "negative zero" : n}`, (r: Record<string, unknown>) => { (r.selected as Record<string, unknown>).version = n; }] as [string, (r: Record<string, unknown>) => void]),
  ["record domain", r => { (r.selected as Record<string, unknown>).recordHashDomain = "story-highlight-plan-v1"; }],
  ["plan domain", r => { (r.selected as Record<string, unknown>).planHashDomain = "story-narration-draft-v1"; }],
  ["malformed hash", r => { (r.selected as Record<string, unknown>).recordHash = "A".repeat(64); }],
  ["malformed Unicode", r => { (r.selected as Record<string, unknown>).id = "\ud800"; }],
  ...["SECONDS", "FRAMES", "SAMPLES"].map(unit => [`unit ${unit}`, (r: Record<string, unknown>) => { (r.policy as Record<string, unknown>).timeUnit = unit; }] as [string, (r: Record<string, unknown>) => void]),
  ["speed", r => { (r.policy as Record<string, unknown>).speedNumerator = 2; }],
  ["transition", r => { (r.policy as Record<string, unknown>).transition = "CROSSFADE"; }],
  ["transition duration", r => { (r.policy as Record<string, unknown>).transitionDurationMs = 1; }],
  ["audio silence sync", r => { (r.policy as Record<string, unknown>).placement = "FAKE_WAV_SYNC"; }],
  ["oversized", r => { r.extra = "x".repeat(T.maxBytes); }],
];
for (const [name, change] of inputAttacks) test(`strict input rejects ${name} before resolution`, async () => {
  const f = timelineFixture(), r = clone(f.input) as unknown as Record<string, unknown>; change(r);
  let calls = 0; await assert.rejects(generate(r, { resolve: () => { calls++; return f.observation; } })); assert.equal(calls, 0);
  assert.throws(() => parseRecapTimelineInput(r));
});

test("strict JSON rejects getters, Dates, cycles, holes, nonenumerable keys without executing getters", () => {
  let calls = 0;
  const getter = { get field() { calls++; return 1; } };
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const v of [getter, new Date(), cycle, Array(2), Object.defineProperty({}, "secret", { value: 1 })]) assert.throws(() => parseRecapTimelineInput(v));
  assert.equal(calls, 0);
});

const planAttacks: [string, (p: Plan) => void][] = [
  ["missing segment", p => { p.plan.segments.pop(); }], ["duplicate segment", p => { p.plan.segments.push(clone(p.plan.segments[0])); }],
  ["unknown candidate", p => { p.plan.segments[0].candidate.id = "h-unknown"; }],
  ["source overlap", p => { p.plan.segments[1].sourceStartMs = 0; }], ["zero duration", p => { p.plan.segments[0].durationMs = 0; }],
  ["reversed interval", p => { p.plan.segments[0].sourceEndMs = 0; }], ["source bound", p => { p.plan.segments[0].sourceEndMs = p.plan.source.media.durationMs + 1; }],
  ["output gap", p => { p.plan.segments[1].outputStartMs++; }], ["output overlap", p => { p.plan.segments[1].outputStartMs--; }],
  ["initial offset", p => { p.plan.segments[0].outputStartMs = 1; }], ["total", p => { p.plan.totalOutputMs++; }],
  ["presentation reorder", p => { p.plan.segments.reverse(); }], ["chronology", p => { p.plan.sourceOrder.reverse(); }],
  ["index", p => { p.plan.segments[0].presentationIndex++; }], ["claim", p => { p.plan.segments[0].candidate.claimIds = ["forged"]; }],
  ["evidence", p => { p.plan.segments[0].candidate.evidence[0].sourceText = "伪造证据"; }],
  ["classification", p => { p.plan.segments[0].candidate.classification = "INFERRED"; }],
  ["basis", p => { p.plan.segments[0].candidate.observedBasisIds = ["forged-basis"]; }],
  ["contradiction", p => { p.plan.segments[0].candidate.contradictions = []; p.plan.segments[0].candidate.contradictions.push({ findingId: "forged", explanation: "forged" }); }],
  ["character", p => { p.plan.segments[0].candidate.characterIds = ["other-character"]; }], ["relationship", p => { p.plan.segments[0].candidate.relationshipId = "other-relationship"; }],
  ["M4 as R4", p => { p.plan.source.narration.artifact.hashDomain = "story-edited-narration-v1"; }],
  ["media", p => { p.plan.source.media.sha256 = "d".repeat(64); }], ["omission", p => { p.plan.omissions = []; }],
  ["approval", p => { (p.plan.restrictions as unknown as Record<string, unknown>).humanApproval = "APPROVED"; }],
  ["source verified", p => { (p.plan.restrictions as unknown as Record<string, unknown>).sourceVerified = true; }],
  ["TTS", p => { (p.plan.restrictions as unknown as Record<string, unknown>).eligibleForRealTts = true; }],
  ["publication", p => { (p.plan.restrictions as unknown as Record<string, unknown>).eligibleForPublication = true; }],
  ["spending", p => { (p.plan.restrictions as unknown as Record<string, unknown>).spendingAuthority = "GRANTED"; }],
  ["movie audio", p => { (p.plan.restrictions as unknown as Record<string, unknown>).originalMovieAudio = "INCLUDED"; }],
  ["audio track", p => { (p.plan as unknown as Record<string, unknown>).tracks = []; }],
  ["overflow", p => { p.plan.segments[0].outputEndMs = Number.MAX_SAFE_INTEGER; p.plan.totalOutputMs = Number.MAX_SAFE_INTEGER; }],
];
for (const [name, attack] of planAttacks) test(`full canonical rehash cannot authorize changed ${name}`, async () => {
  const f = timelineFixture(), p = clone(await generate(f.input, f.resolver)); attack(p); rehash(p);
  await assert.rejects(validate(p, f.input, f.resolver));
});
for (const n of [-0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) test(`invalid timeline milliseconds ${Object.is(n, -0) ? "negative zero" : n}`, async () => {
  const f = timelineFixture(), p = clone(await generate(f.input, f.resolver)); p.plan.segments[0].sourceStartMs = n;
  await assert.rejects(validate(p, f.input, f.resolver));
});
test("forged derived segment ID rejected even with correct outer plan hash", async () => {
  const f = timelineFixture(), p = clone(await generate(f.input, f.resolver)); p.plan.segments[0].id = `tlseg-${"0".repeat(64)}`;
  p.planHash = contractHash(T.plan, p.plan); p.id = `tl-${p.planHash}`; await assert.rejects(validate(p, f.input, f.resolver));
});

for (const field of ["tenantId", "projectId", "movieId", "studioId"] as const) test(`independent scope rejects wrong ${field}`, async () => {
  const f = timelineFixture(); f.input.scope = { ...f.input.scope, [field]: "other" }; await assert.rejects(generate(f.input, f.resolver));
});
for (const status of ["NOT_FOUND", "UNAUTHORIZED", "UNKNOWN", "UNSAVED"] as const) test(`reject ${status} resolution`, async () => {
  const f = timelineFixture(); await assert.rejects(generate(f.input, { resolve: () => ({ status }) }));
});
test("resolver exception fails closed with one call and no retry", async () => {
  let calls = 0; await assert.rejects(generate(timelineFixture().input, { resolve: () => { calls++; throw Error("unavailable"); } })); assert.equal(calls, 1);
});
const resolutionAttacks: [string, (f: ReturnType<typeof timelineFixture>) => void][] = [
  ["record hash", f => { f.observation.view = { ...f.observation.view, recordHash: "f".repeat(64) }; }],
  ["record identity", f => { f.input.selected.id = "unsaved-proposal"; }],
  ["plan hash", f => { f.input.selected.planHash = "f".repeat(64); }],
  ["stale read", f => { f.observation.view = { ...f.observation.view, currentness: "STALE_DEPENDENCIES" }; }],
  ["superseded head", f => { f.observation.head.revision++; }],
  ["missing head", f => { f.observation.head.identity = null; }],
  ["wrong head", f => { f.observation.head.identity!.id = "other-record"; }],
  ["wrong head scope", f => { f.observation.head.scope.tenantId = "other"; }],
  ["dependency hash", f => { f.observation.dependency.hash = "f".repeat(64); }],
  ["dependency ID", f => { f.observation.dependency.id = "wrong"; }],
  ["current dependency", f => { f.observation.current.dependencyId = "changed"; }],
  ["current hash", f => { f.observation.current.dependencyHash = "f".repeat(64); }],
  ["disabled policy", f => { f.observation.current.policyEnabled = false; }],
  ["wrong policy domain", f => { (f.observation.current as unknown as Record<string, unknown>).policyVersion = "other"; }],
  ["wrong rubric", f => { (f.observation.current as unknown as Record<string, unknown>).rubricVersion = "other"; }],
  ["source revision", f => { f.observation.current.source.currentness.sourceRevision++; }],
  ["narration revision", f => { f.observation.current.source.currentness.narrationRevision++; }],
  ["source", f => { f.observation.current.source.narration.source.contentHash = "f".repeat(64); }],
  ["media", f => { f.observation.current.source.media.durationMs++; }],
  ["candidate", f => { f.observation.current.source.narration.analysis.candidateHash = "f".repeat(64); }],
  ["narration", f => { f.observation.current.source.narration.original.hash = "f".repeat(64); }],
  ["unexpected parent", f => { f.observation.parent = clone(f.observation.view); }],
];
for (const [name, attack] of resolutionAttacks) test(`independent resolution rejects ${name}`, async () => {
  const f = timelineFixture(); attack(f); await assert.rejects(generate(f.input, f.resolver));
});

for (const [name, attack] of [
  ["selected overlap", (p: Plan["plan"]["segments"][number]["candidate"][]) => { p[1].startMs = p[0].startMs; }],
  ["false evidence", (p: Plan["plan"]["segments"][number]["candidate"][]) => { p[0].evidence[0].sourceText = "伪造"; }],
] as const) test(`rehashing M6 and record cannot authorize ${name}`, async () => {
  const f = timelineFixture(), r = clone(f.observation.view.record); attack(r.plan.plan.candidates);
  f.observation.view = { ...f.observation.view, record: r }; reseal(f); await assert.rejects(generate(f.input, f.resolver));
});
test("excluded candidate injection with fully rehashed M6 envelope fails independent replay", async () => {
  const f = timelineFixture(), r = clone(f.observation.view.record), p = r.plan.plan;
  const excluded = p.decisions.find(d => d.status === "EXCLUDED")!; excluded.status = "SELECTED";
  p.presentationOrder.push(excluded.candidateId); p.sourceOrder.push(excluded.candidateId);
  f.observation.view = { ...f.observation.view, record: r }; reseal(f); await assert.rejects(generate(f.input, f.resolver));
});
test("honest insufficient M6 plan is intact but ineligible", async () => {
  const f = timelineFixture({}, f => { f.input.policy.maxClips = 1; f.input.policy.maxTotalSourceMs = 1; });
  assert.equal(f.observation.view.record.plan.plan.status, "INSUFFICIENT_INFORMATION"); await assert.rejects(generate(f.input, f.resolver), { code: "INELIGIBLE" });
});
test("validation reacquires observations and refuses a newly stale dependency", async () => {
  const f = timelineFixture(); let calls = 0;
  const resolver = { resolve: () => { calls++; return f.observation; } };
  const p = await generate(f.input, resolver); f.observation.current.policyEnabled = false;
  await assert.rejects(validate(p, f.input, resolver)); assert.equal(calls, 2);
});

test("qualified inferred psychology retains observed basis, evidence and uncertainty", async () => {
  const f = timelineFixture({ candidate: (c, source) => {
    const basis = c.findings.find(f => f.id === "behavior-6")!;
    basis.evidence = [5, 6, 7, 8, 9].map(seq => {
      const observation = source.payload.preparation!.observations.find(o => o.id === `obs-character-a-${seq}`)!;
      return { kind: "CAPTURED_OBSERVATION", anchor: clone(observation.anchor), segmentId: observation.transcriptSegmentId, sceneId: observation.sceneId, observationId: observation.id };
    });
    const inference = c.findings.find(f => f.id === "inference-6")!; inference.uncertainty = "COMPETING";
    c.findings.push({ ...clone(inference), id: "inference-opposite", statement: "ယုံကြည်မှု ရှိနိုင်သည်။" });
    c.contradictions.push({ firstFindingId: inference.id, secondFindingId: "inference-opposite", explanation: "Competing interpretation" });
  } });
  const p = await generate(f.input, f.resolver), inferred = p.plan.segments.find(s => s.candidate.classification === "INFERRED");
  assert.ok(inferred); assert.ok(inferred.candidate.observedBasisIds.length); assert.equal(inferred.candidate.uncertainty, "COMPETING");
  assert.ok(inferred.candidate.contradictions.length);
  assert.ok(inferred.candidate.qualification); assert.ok(inferred.candidate.evidence.length);
});
for (const name of ["missing", "duplicate", "overlap", "unknown", "domain", "fake-audio-duration"] as const) test(`M6 ${name} tampering survives no coordinated record rehash`, async () => {
  const f = timelineFixture(), r = clone(f.observation.view.record), p = r.plan.plan;
  if (name === "missing") p.presentationOrder.pop();
  if (name === "duplicate") p.presentationOrder.push(p.presentationOrder[0]);
  if (name === "overlap") {
    const a = p.candidates.find(c => c.id === p.presentationOrder[0])!, b = p.candidates.find(c => c.id === p.presentationOrder[1])!;
    b.startMs = a.startMs; b.endMs = a.endMs;
  }
  if (name === "unknown") p.presentationOrder[0] = "unknown-candidate";
  if (name === "domain") (p.input.source.narration.artifact as unknown as Record<string, unknown>).hashDomain = "story-edited-narration-v1";
  if (name === "fake-audio-duration") (p.input as unknown as Record<string, unknown>).audioDurationMs = 123;
  f.observation.view = { ...f.observation.view, record: r };
  if (name === "domain" || name === "fake-audio-duration") assert.throws(() => reseal(f));
  else reseal(f);
  await assert.rejects(generate(f.input, f.resolver));
});

test("second version requires independently matching parent and rejects self-parent or wrong parent hash", async () => {
  const f = timelineFixture(); f.observation.parent = clone(f.observation.view);
  const r = clone(f.observation.view.record); r.previous = f.observation.head.identity; r.version = 2; r.expectedRevision = 1; r.id = "second";
  f.observation.view = { ...f.observation.view, record: r }; f.observation.head.revision = 2; reseal(f);
  await generate(f.input, f.resolver);
  const parent = f.observation.parent; f.observation.parent = null; await assert.rejects(generate(f.input, f.resolver));
  f.observation.parent = { ...parent, recordHash: "a".repeat(64) }; await assert.rejects(generate(f.input, f.resolver));
  f.observation.parent = clone(f.observation.view); await assert.rejects(generate(f.input, f.resolver));
});
