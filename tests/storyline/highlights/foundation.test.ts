import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { contractHash, canonicalJson } from "../../../lib/storyline/canonical";
import { fakeVoiceRestrictions } from "../../../lib/storyline/voice/foundation/contracts";
import { HIGHLIGHTS as H, HIGHLIGHT_RUBRIC, HighlightError, RESOLUTION_FAILURES, generateHighlightPlan, parseHighlightInput, validateHighlightPlan,
  type HighlightInput, type HighlightPlan, type HighlightPlanPayload } from "../../../lib/storyline/highlights";
import { highlightsFixture } from "./fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No external calls in M6")); });
after(() => mock.restoreAll());
const code = (name: string) => (e: unknown) => e instanceof HighlightError && e.code === name;
const plan = (f = highlightsFixture()) => generateHighlightPlan(f.input, f.resolver);
function rehash(value: HighlightPlan) { const v = structuredClone(value) as { plan: HighlightPlanPayload; planHash: string }; return { v, seal: () => { v.planHash = contractHash(H.plan, v.plan); return v; } }; }

test("exact M1/M3/M4 lineage, source evidence, fixed rubric and immutable unpersisted result", () => {
  const f = highlightsFixture(), result = plan(f);
  assert.equal(result.plan.status, "PLANNED"); assert.equal(result.plan.input.source.narration.original.hash, f.capture.original.draftHash);
  assert.equal(result.plan.input.source.narration.analysis.candidateHash, f.capture.context.candidate.candidateHash);
  assert.equal(result.planHash, contractHash(H.plan, result.plan)); assert(Object.isFrozen(result.plan.candidates[0].factors));
  assert.equal(result.plan.restrictions.persistence, "NOT_PERSISTED"); assert.equal(result.plan.input.audio, null);
  for (const c of result.plan.candidates) {
    assert(c.startMs >= 0 && c.startMs < c.endMs && c.endMs <= 24000);
    assert(c.claimIds.length); assert(c.evidence.every(e => e.sourceText === f.capture.context.source.payload.transcript.segments.find(s => s.id === e.reference.segmentId)!.text));
    const total = Object.entries(c.factors).reduce((n, [key, value]) => { assert(value >= 0 && value <= 3); return n + value * HIGHLIGHT_RUBRIC.weights[key as keyof typeof HIGHLIGHT_RUBRIC.weights]; }, 0);
    assert.equal(c.totalScore, total);
  }
  assert.deepEqual(validateHighlightPlan(result, f.input, f.resolver), result);
});

test("observed actions retain exact behavior; inferred psychology retains basis, qualification and lower reliability", () => {
  const r = plan().plan, observed = r.candidates.find(c => c.findingId === "behavior-0")!, inferred = r.candidates.find(c => c.findingId === "inference-0")!;
  assert.equal(observed.classification, "OBSERVED"); assert.equal(observed.factors.evidenceReliability, 3);
  assert.equal(inferred.classification, "INFERRED"); assert.equal(inferred.factors.evidenceReliability, 1);
  assert.deepEqual(inferred.observedBasisIds, ["behavior-0"]); assert.equal(inferred.qualification, "ဖြစ်နိုင်");
  assert(inferred.explanations.includes("QUALIFIED_INFERENCE_NOT_OBSERVED")); assert(observed.totalScore > inferred.totalScore);
  assert.equal(r.candidates.find(c => c.findingId === "inference-6")!.factors.development, 3);
  assert.equal(inferred.factors.development, 1);
});

test("contradictory interpretations retain both references, uncertainty and deterministic penalty", () => {
  const f = highlightsFixture({ candidate: c => {
    const first = c.findings.find(f => f.id === "inference-0")!; first.uncertainty = "COMPETING";
    c.findings.push({ ...structuredClone(first), id: "inference-opposite", statement: "ယုံကြည်မှု ရှိနိုင်သည်။" });
    c.contradictions.push({ firstFindingId: "inference-0", secondFindingId: "inference-opposite", explanation: "Competing synthetic interpretation" });
  } });
  const r = plan(f).plan.candidates.find(c => c.findingId === "inference-0")!;
  assert.equal(r.factors.contradictionSafety, 0); assert.equal(r.factors.certainty, 0);
  assert.deepEqual(r.contradictions.map(c => c.findingId), ["inference-opposite"]); assert.equal(r.uncertainty, "COMPETING");
});

test("source start zero and exact media end remain valid boundaries", () => {
  const r = plan().plan; assert(r.candidates.some(c => c.startMs === 0)); assert(r.candidates.some(c => c.endMs === 24000));
});

test("clip intervals use scene/transcript intersections, never the unsupported remainder", () => {
  const f = highlightsFixture({ raw: r => {
    r.scenes = [{ ...r.scenes[0], endMs: 1000 }, { ...r.scenes[0], id: "scene-two", sequence: 1, startMs: 1000 }];
    for (const c of r.characters) for (const e of c.evidence) if (e.anchor.segmentSequence > 0) e.anchor.sceneSequence = 1;
    r.relationships[0].evidence[0].anchor.sceneSequence = 1;
    for (const o of r.preparation!.observations) if (o.anchor.segmentSequence > 0) { o.anchor.sceneSequence = 1; o.sceneId = "scene-two"; }
  } });
  const c = plan(f).plan.candidates.find(c => c.findingId === "behavior-0")!;
  assert.equal(c.startMs, 0); assert.equal(c.endMs, 1000);
});

test("connected evidence intervals merge; disjoint evidence preserves gaps without filler", () => {
  for (const seq of [1, 2]) {
    const f = highlightsFixture({ candidate: (c, s) => {
      const observed = c.findings.find(f => f.id === "behavior-0")!, o = s.payload.preparation!.observations.find(o => o.id === `obs-character-a-${seq}`)!;
      observed.evidence.push({ kind: "CAPTURED_OBSERVATION", anchor: structuredClone(o.anchor), sceneId: o.sceneId, segmentId: o.transcriptSegmentId, observationId: o.id });
    } });
    const rows = plan(f).plan.candidates.filter(c => c.findingId === "behavior-0");
    assert.equal(rows.length, seq === 1 ? 1 : 2);
    if (seq === 1) assert.equal(rows[0].endMs, 4000);
    else assert(rows.every(c => c.endMs - c.startMs === 2000));
  }
});

test("duplicate/overlapping candidates are explicitly excluded; no source time is double counted", () => {
  const r = plan().plan; assert(r.decisions.some(d => d.reason === "DUPLICATE_INTERVAL"));
  const f = highlightsFixture({ candidate: c => {
    const row = c.findings.find(f => f.id === "behavior-0")!, other = c.findings.find(f => f.id === "behavior-2")!;
    row.evidence.push(...structuredClone(other.evidence));
    // Add sequence 1 so this is one connected interval [0,6000).
    const e = structuredClone(row.evidence[0]); e.anchor.segmentSequence = 1; e.segmentId = "source-1";
    if (e.kind === "CAPTURED_OBSERVATION") e.observationId = "obs-character-a-1"; row.evidence.push(e);
  } });
  assert(plan(f).plan.decisions.some(d => d.reason === "OVERLAP"));
  const selected = r.sourceOrder.map(id => r.candidates.find(c => c.id === id)!);
  selected.forEach((c, i) => { if (i) assert(selected[i - 1].endMs <= c.startMs); });
  assert.equal(r.totalSourceMs, selected.reduce((s, c) => s + c.endMs - c.startMs, 0));
});

test("required coverage precedes score and missing achievable coverage is explicit", () => {
  const f = highlightsFixture(); f.input.policy.maxClips = 1;
  const r = plan(f).plan; assert.equal(r.status, "PLANNED");
  assert.equal(r.candidates.find(c => c.id === r.sourceOrder[0])!.relationshipId, "relationship-ab");
  f.input.policy.maxClipMs = 1; const no = plan(f).plan;
  assert.equal(no.status, "INSUFFICIENT_INFORMATION"); assert.deepEqual(no.coverage.missingRelationshipIds, ["relationship-ab"]);
  assert(no.decisions.every(d => d.reason === "ABOVE_MAX_DURATION"));
});

test("clip-count, total duration and clip bounds produce exact exclusion reasons", () => {
  for (const [mutate, reason] of [
    [(p: HighlightInput["policy"]) => { p.maxClips = 1; }, "CLIP_LIMIT"],
    [(p: HighlightInput["policy"]) => { p.maxTotalSourceMs = 2000; }, "DURATION_BUDGET"],
    [(p: HighlightInput["policy"]) => { p.minClipMs = 3000; }, "BELOW_MIN_DURATION"],
    [(p: HighlightInput["policy"]) => { p.maxClipMs = 1000; }, "ABOVE_MAX_DURATION"],
  ] as const) { const f = highlightsFixture(); mutate(f.input.policy); assert(plan(f).plan.decisions.some(d => d.reason === reason)); }
});

test("chronology and independent score presentation order preserve intentional source gaps", () => {
  const f = highlightsFixture(); f.input.policy.presentation = "SCORE_ORDER";
  const r = plan(f).plan; assert.notDeepEqual(r.presentationOrder, r.sourceOrder);
  assert.deepEqual([...r.presentationOrder].sort(), [...r.sourceOrder].sort());
  assert(r.gaps.length > 0); assert(r.gaps.every(g => g.kind === "INTENTIONAL_SOURCE_OMISSION" && g.startMs < g.endMs));
  f.input.policy.presentation = "SOURCE_CHRONOLOGY"; const s = plan(f).plan; assert.deepEqual(s.presentationOrder, s.sourceOrder);
});

test("repeated exact captures yield identical canonical hashes and stable ties without mutating fixtures", () => {
  const f = highlightsFixture(), before = canonicalJson(f.capture), first = plan(f);
  for (let i = 0; i < 6; i++) assert.equal(plan(f).planHash, first.planHash);
  assert.equal(canonicalJson(f.capture), before); assert.equal(canonicalJson(f.input), canonicalJson(first.plan.input));
});

for (const status of RESOLUTION_FAILURES) test(`resolver distinguishes ${status} without fabricating a plan`, () => {
  const f = highlightsFixture(); assert.throws(() => generateHighlightPlan(f.input, { resolve: () => ({ status }) }), code(status));
});

for (const [name, mutate, expected] of [
  ["media", (f: ReturnType<typeof highlightsFixture>) => { f.capture.current.media.sha256 = "f".repeat(64); }, "STALE_MEDIA"],
  ["source", (f: ReturnType<typeof highlightsFixture>) => { f.capture.current.narration.source.contentHash = "f".repeat(64); }, "STALE_SOURCE"],
  ["candidate", (f: ReturnType<typeof highlightsFixture>) => { f.capture.current.narration.analysis.candidateHash = "f".repeat(64); }, "CHANGED_CANDIDATE"],
  ["narration", (f: ReturnType<typeof highlightsFixture>) => { f.capture.current.narration.artifact.hash = "f".repeat(64); f.capture.current.narration.original.hash = "f".repeat(64); }, "CHANGED_NARRATION"],
  ["source revision", (f: ReturnType<typeof highlightsFixture>) => { f.capture.current.currentness.sourceRevision++; }, "STALE_SOURCE"],
  ["narration revision", (f: ReturnType<typeof highlightsFixture>) => { f.capture.current.currentness.narrationRevision++; }, "STALE_SOURCE"],
  ["movie", (f: ReturnType<typeof highlightsFixture>) => { f.input.source.narration.scope.movieId = "movie-other"; f.input.source.narration.source.movieId = "movie-other"; }, "STALE_SOURCE"],
  ["studio", (f: ReturnType<typeof highlightsFixture>) => { f.input.source.narration.scope.studioId = "studio-other"; f.input.source.narration.source.studioId = "studio-other"; }, "STALE_SOURCE"],
] as const) test(`independent capture rejects changed ${name}`, () => { const f = highlightsFixture(); mutate(f); assert.throws(() => plan(f), code(expected)); });

for (const [name, mutate] of [
  ["missing segment", (f: ReturnType<typeof highlightsFixture>) => { f.capture.context.candidate = structuredClone(f.capture.context.candidate); (f.capture.context.candidate.payload.findings[0].evidence[0] as { segmentId: string }).segmentId = "absent"; }],
  ["cross movie evidence", (f: ReturnType<typeof highlightsFixture>) => { f.capture.context.candidate = structuredClone(f.capture.context.candidate); (f.capture.context.candidate.payload.findings[0].evidence[0].anchor as { movieId: string }).movieId = "movie-other"; }],
  ["missing coverage owner", (f: ReturnType<typeof highlightsFixture>) => { f.input.policy.coverage.characterIds = ["not-a-character"]; }],
] as const) test(`${name} is missing evidence, never inferred source content`, () => { const f = highlightsFixture(); mutate(f); assert.throws(() => plan(f), code("MISSING_EVIDENCE")); });

for (const [name, mutate] of [
  ["score", (p: HighlightPlanPayload) => { p.candidates[0].totalScore++; }],
  ["factor", (p: HighlightPlanPayload) => { p.candidates[0].factors.development = 3; }],
  ["interval", (p: HighlightPlanPayload) => { p.candidates[0].startMs++; }],
  ["evidence", (p: HighlightPlanPayload) => { p.candidates[0].evidence[0].sourceText = "forged dialogue"; }],
  ["observed label", (p: HighlightPlanPayload) => { p.candidates.find(c => c.classification === "INFERRED")!.classification = "OBSERVED"; }],
  ["selection", (p: HighlightPlanPayload) => { p.decisions[0].status = "EXCLUDED"; }],
  ["chronology", (p: HighlightPlanPayload) => { p.sourceOrder.reverse(); }],
  ["presentation", (p: HighlightPlanPayload) => { p.presentationOrder.reverse(); }],
  ["coverage", (p: HighlightPlanPayload) => { p.coverage.characterIds = []; }],
  ["budget", (p: HighlightPlanPayload) => { p.totalSourceMs++; }],
  ["gaps", (p: HighlightPlanPayload) => { p.gaps = []; }],
  ["duplicate clip", (p: HighlightPlanPayload) => { p.sourceOrder.push(p.sourceOrder[0]); }],
  ["unknown field", (p: HighlightPlanPayload) => { Object.assign(p.candidates[0], { arbitraryAiScore: 100 }); }],
] as const) test(`complete replay rejects rehashed manipulated ${name}`, () => {
  const f = highlightsFixture(), { v, seal } = rehash(plan(f)); mutate(v.plan); assert.throws(() => validateHighlightPlan(seal(), f.input, f.resolver), code("INVALID_PLAN"));
});

for (const [name, mutate] of [
  ["schema", (i: HighlightInput) => { Object.assign(i, { schemaVersion: "v999" }); }],
  ["unknown role", (i: HighlightInput) => { Object.assign(i, { role: "ADMIN" }); }],
  ["AI scoring override", (i: HighlightInput) => { Object.assign(i.policy, { weights: { evidenceReliability: 1000 } }); }],
  ["NaN", (i: HighlightInput) => { i.policy.maxClips = NaN; }],
  ["unsafe integer", (i: HighlightInput) => { i.source.media.bytes = Number.MAX_SAFE_INTEGER + 1; }],
  ["negative zero", (i: HighlightInput) => { i.policy.minClipMs = -0; }],
  ["negative interval", (i: HighlightInput) => { i.policy.minClipMs = -1; }],
  ["zero clips", (i: HighlightInput) => { i.policy.maxClips = 0; }],
  ["impossible budget", (i: HighlightInput) => { i.policy.maxTotalSourceMs = 1; i.policy.minClipMs = 2; }],
  ["reversed bounds", (i: HighlightInput) => { i.policy.minClipMs = 5000; i.policy.maxClipMs = 1000; }],
  ["overlap policy", (i: HighlightInput) => { Object.assign(i.policy, { overlap: "ALLOW" }); }],
  ["transition policy", (i: HighlightInput) => { Object.assign(i.policy, { transition: "CROSSFADE" }); }],
  ["duplicate IDs", (i: HighlightInput) => { i.policy.coverage.characterIds = ["character-a", "character-a"]; }],
  ["invalid Unicode", (i: HighlightInput) => { i.source.narration.original.payloadId = "\ud800"; }],
  ["malformed hash", (i: HighlightInput) => { i.source.media.sha256 = "not-a-hash"; }],
  ["M4/R4 domain confusion", (i: HighlightInput) => { Object.assign(i.source.narration.artifact, { hashDomain: "story-edited-narration-v1" }); }],
] as const) test(`strict input rejects ${name}`, () => { const f = highlightsFixture(); mutate(f.input); assert.throws(() => parseHighlightInput(f.input)); });

test("R4 identity stays distinct, unapproved and bound to unchanged original lineage", () => {
  const f = highlightsFixture({ edited: true }), r = plan(f);
  assert.equal(r.plan.input.source.narration.artifact.kind, "R4_EDITED"); assert.equal(r.plan.input.source.narration.artifact.hashDomain, STUDIO_DOMAIN);
  assert.equal(r.plan.input.source.narration.original.hashDomain, "story-narration-draft-v1"); assert.equal(r.plan.restrictions.humanApproval, "NONE");
  const before = canonicalJson(f.capture.original); plan(f); assert.equal(canonicalJson(f.capture.original), before);
  f.capture.edit!.contentHash = "f".repeat(64); assert.throws(() => plan(f));
});
const STUDIO_DOMAIN = "story-edited-narration-v1";

test("fake audio is optional reference metadata only and cannot influence selected time or voice eligibility", () => {
  const f = highlightsFixture(), without = plan(f).plan;
  f.input.audio = { schemaVersion: H.audio, artifactId: "fake-audio", artifactHash: "b".repeat(64), planHash: "c".repeat(64), reference: f.input.source.narration,
    execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: fakeVoiceRestrictions };
  const withAudio = plan(f).plan;
  assert.equal(withAudio.totalSourceMs, without.totalSourceMs); assert.deepEqual(withAudio.sourceOrder, without.sourceOrder);
  assert.equal(withAudio.restrictions.eligibleForRealTts, false); assert.equal(withAudio.restrictions.eligibleForPublication, false);
  const valid = structuredClone(f.input.audio);
  for (const [field, value] of [["speech", "VERIFIED"], ["execution", "LIVE"], ["evidence", "HUMAN_VERIFIED"]]) {
    f.input.audio = structuredClone(valid); Object.assign(f.input.audio!, { [field]: value });
    assert.throws(() => parseHighlightInput(f.input));
  }
  f.input.audio = structuredClone(valid);
  Object.assign(f.input.audio!.restrictions, { eligibleForRealTts: true, eligibleForPublication: true, humanApproval: "APPROVED" });
  assert.throws(() => parseHighlightInput(f.input));
  f.input.audio = structuredClone(valid);
  Object.assign(f.input.audio, { durationMs: 300000 }); assert.throws(() => parseHighlightInput(f.input));
});

test("future approval and alleged verified speech are unsupported, never authority", () => {
  const f = highlightsFixture(); Object.assign(f.input.source.narration.artifact, { kind: "FUTURE_APPROVED_REFERENCE" }); assert.throws(() => parseHighlightInput(f.input));
});

test("Chinese quote candidates repeat exact source dialogue without attributing an inferred speaker", () => {
  const f = highlightsFixture({ candidate: (c, s) => {
    const row = c.findings[0], ref = row.evidence[0]; row.category = "DIALOGUE";
    row.statement = s.payload.transcript.segments[0].text;
    row.evidence = [{ kind: "CHINESE_QUOTE", anchor: ref.anchor, sceneId: ref.sceneId, segmentId: ref.segmentId, quote: row.statement }];
  } });
  const c = plan(f).plan.candidates.find(c => c.findingId === "behavior-0")!;
  assert.equal(c.statement, f.capture.context.source.payload.transcript.segments[0].text);
  assert.equal(c.classification, "OBSERVED"); assert.equal(c.category, "DIALOGUE");
});

test("existing M1 validation rejects negative media time", () => {
  assert.throws(() => highlightsFixture({ raw: r => { r.transcript.segments[0].startMs = -1; } }));
});

test("end beyond media, unsafe source numbers and invalid source Unicode fail inherited validation", () => {
  assert.throws(() => highlightsFixture({ raw: r => { r.transcript.segments[11].endMs++; } }));
  assert.throws(() => highlightsFixture({ raw: r => { r.media.durationMs = Number.MAX_SAFE_INTEGER + 1; } }));
  assert.throws(() => highlightsFixture({ raw: r => { r.transcript.segments[0].text = "\ud800"; } }));
});

test("UNKNOWN M2 result and rehashed injected AI score cannot become planning evidence", () => {
  const f = highlightsFixture(); Object.assign(f.capture.context.result, { state: "UNKNOWN" });
  assert.throws(() => plan(f), code("INVALID_CAPTURE"));
  const g = highlightsFixture(); g.capture.context.candidate = structuredClone(g.capture.context.candidate);
  Object.assign(g.capture.context.candidate.payload.findings[0], { aiScore: 100 });
  assert.throws(() => plan(g), code("INVALID_CAPTURE"));
});

test("R4 rehashed wrong section cannot substitute source-grounded original claim lineage", () => {
  const f = highlightsFixture({ edited: true });
  f.capture.edit!.payload.sections[0].sectionId = "unknown-section";
  f.capture.edit!.contentHash = contractHash(STUDIO_DOMAIN, f.capture.edit!.payload);
  assert.throws(() => plan(f), code("CHANGED_NARRATION"));
});

test("outer hash corruption, getters, input impersonation and resolver errors fail closed", () => {
  const f = highlightsFixture(), r = structuredClone(plan(f));
  Object.assign(r, { planHash: "b".repeat(64) }); assert.throws(() => validateHighlightPlan(r, f.input, f.resolver), code("INVALID_PLAN"));
  const getter = { ...f.input }; Object.defineProperty(getter, "policy", { enumerable: true, get() { assert.fail("getter executed"); } });
  assert.throws(() => parseHighlightInput(getter));
  const changed = structuredClone(f.input); changed.source.narration.analysis.candidateId = "forged-candidate";
  assert.throws(() => generateHighlightPlan(changed, f.resolver), code("CHANGED_CANDIDATE"));
  assert.throws(() => generateHighlightPlan(f.input, { resolve() { throw new Error("private resolver diagnostic"); } }), code("UNSUPPORTED"));
});

test("M6 source has no I/O/database/media/provider dependencies or production imports", async () => {
  for (const name of await readdir("lib/storyline/highlights")) {
    const content = await readFile(join("lib/storyline/highlights", name), "utf8");
    assert(!/from ["'](?:node:(?:fs|child_process|http|https|net)|.*(?:prisma|database|source-media|transport|provider))["']/.test(content), name);
    assert(!/\bfetch\s*\(|\bexecFile\s*\(/.test(content), name);
  }
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name); if (entry.isDirectory()) await visit(file);
      else if (/\.[cm]?[jt]sx?$/.test(file)) assert(!/storyline\/highlights/.test(await readFile(file, "utf8")), file);
    }
  }
  for (const dir of ["app", "components", "workers", "scripts"]) await visit(dir);
  // Follow runtime imports only, including the reused validators; type imports
  // never drag database/media infrastructure into this dependency graph.
  const seen = new Set<string>();
  async function dependencies(file: string): Promise<void> {
    if (seen.has(file)) return; seen.add(file);
    const content = await readFile(file, "utf8");
    assert(!/from ["']node:(?:fs|child_process|http|https|net)/.test(content), file);
    for (const match of content.matchAll(/(?:import|export)\s+(?!type\b)(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+)\s+from\s+["']([^"']+)["']/g)) {
      const target = match[1];
      if (!target.startsWith(".") && !target.startsWith("@/")) continue;
      const path = target.startsWith("@/") ? resolve(target.slice(2)) : resolve(dirname(file), target);
      const candidates = [path + ".ts", path + ".tsx", join(path, "index.ts")];
      let found: string | undefined;
      for (const candidate of candidates) { try { await readFile(candidate); found = candidate; break; } catch { /* try extension */ } }
      assert(found, target); await dependencies(found);
    }
  }
  await dependencies(resolve("lib/storyline/highlights/index.ts"));
});
