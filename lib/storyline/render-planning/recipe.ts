import "server-only";
import { contractHash } from "../canonical";
import { parseAnchor } from "../source";
import { array, enumeration, freeze, hash, id, integer, literal, nullable, record, text, unique } from "../validation";
import { HIGHLIGHTS as H, type HighlightAudioReference } from "../highlights/contracts";
import { parseHighlightSource } from "../highlights/input";
import { parseRecordIdentity, parseStoreScope } from "../timeline-persistence/contracts";
import { parseRecordIdentity as parseM6Identity, HIGHLIGHT_STORE } from "../highlights-persistence/contracts";
import { parseNarrationReference } from "../voice/foundation/reference";
import { fakeVoiceRestrictions } from "../voice/foundation/contracts";
import { RENDER_PLANNING as R, renderRestrictions, type RenderDependencySnapshot, type RenderProvenance, type RenderRecipePayload, type RenderSegment } from "./contracts";
import { parseProfileReference, parseRenderPlanningInput, parseSyntheticRenderProfile, parseSyntheticSourceObservation, positive, rejectRender, renderCapture, renderGuard, renderSame } from "./input";

const n = (v: unknown) => integer(v, "render.coordinate", R.maxDurationMs);
const count = (v: unknown) => integer(v, "render.count", Number.MAX_SAFE_INTEGER);
function ids(v: unknown, max: number) { const a = array(v, max, "render.ids").map(v => id(v, "render.id")); unique(a, v => v, "render.ids"); return a; }
function m6Reference(v: unknown) {
  const r = record(v, ["id", "version", "recordHash", "recordHashDomain", "planHash", "planHashDomain"], "render.m6");
  return { ...parseM6Identity({ id: r.id, version: r.version, recordHash: r.recordHash, planHash: r.planHash }),
    recordHashDomain: literal(r.recordHashDomain, HIGHLIGHT_STORE.record, "render.m6.recordDomain"), planHashDomain: literal(r.planHashDomain, H.plan, "render.m6.planDomain") };
}
function dependency(v: unknown): RenderDependencySnapshot {
  const r = record(v, ["schemaVersion", "scope", "timeline", "timelineHeadRevision", "timelineParent", "m7Dependency", "m6", "m6HeadRevision", "m6Parent", "m6Dependency", "source", "policies", "profileReference", "sourceObservationHash", "restrictions"], "render.dependency");
  function ref(v: unknown) { const r = record(v, ["id", "hash"], "render.dependency.ref"); return { id: id(r.id, "render.dep.id"), hash: hash(r.hash, "render.dep.hash") }; }
  const policies = record(r.policies, ["m7", "m6", "rubric"], "render.policies");
  if (!renderSame(r.restrictions, renderRestrictions)) rejectRender("INTEGRITY_FAILED");
  return { schemaVersion: literal(r.schemaVersion, R.dependency, "render.dep.schema"), scope: parseStoreScope(r.scope), timeline: parseRecordIdentity(r.timeline),
    timelineHeadRevision: positive(r.timelineHeadRevision, 1000000), timelineParent: nullable(r.timelineParent, parseRecordIdentity),
    m7Dependency: ref(r.m7Dependency), m6: m6Reference(r.m6), m6HeadRevision: positive(r.m6HeadRevision, 1000000), m6Parent: nullable(r.m6Parent, m6Reference),
    m6Dependency: ref(r.m6Dependency), source: parseHighlightSource(r.source), policies: {
      m7: literal(policies.m7, "story-recap-timeline-policy-v1", "render.policy.m7"), m6: literal(policies.m6, H.policy, "render.policy.m6"), rubric: literal(policies.rubric, H.rubric, "render.policy.rubric") },
    profileReference: parseProfileReference(r.profileReference), sourceObservationHash: hash(r.sourceObservationHash, "render.observation.hash"), restrictions: renderRestrictions };
}
function provenance(v: unknown): RenderProvenance {
  const r = record(v, ["findingId", "claimIds", "characterIds", "relationshipId", "classification", "category", "statement", "confidence", "uncertainty", "qualification", "observedBasisIds", "evidence", "contradictions"], "render.provenance");
  return { findingId: id(r.findingId, "render.finding"), claimIds: ids(r.claimIds, 200), characterIds: ids(r.characterIds, 12), relationshipId: nullable(r.relationshipId, v => id(v, "render.relationship")),
    classification: enumeration(r.classification, ["OBSERVED", "INFERRED"], "render.classification"),
    category: enumeration(r.category, ["DIALOGUE", "ACTION", "BEHAVIOR", "MOTIVATION", "TRAIT", "RELATIONSHIP", "CONFLICT", "DECISION", "CONSEQUENCE"], "render.category"),
    statement: text(r.statement, 1200, "render.statement"), confidence: enumeration(r.confidence, ["LOW", "MEDIUM", "HIGH"], "render.confidence"),
    uncertainty: enumeration(r.uncertainty, ["NONE", "POSSIBLE", "COMPETING"], "render.uncertainty"), qualification: nullable(r.qualification, v => text(v, 160, "render.qualification")), observedBasisIds: ids(r.observedBasisIds, 12),
    evidence: array(r.evidence, 8, "render.evidence", 1).map(v => {
      const e = record(v, ["reference", "startMs", "endMs", "sourceText"], "render.evidence.row");
      const kind = Object.getOwnPropertyDescriptor(e.reference, "kind")?.value;
      const ref = record(e.reference, ["kind", "anchor", "segmentId", "sceneId", kind === "CHINESE_QUOTE" ? "quote" : "observationId"], "render.evidence.reference");
      const common = { anchor: parseAnchor(ref.anchor), segmentId: id(ref.segmentId, "render.segment"), sceneId: id(ref.sceneId, "render.scene") };
      const reference = kind === "CHINESE_QUOTE" ? { ...common, kind: literal(ref.kind, "CHINESE_QUOTE", "render.quote.kind"), quote: text(ref.quote, 600, "render.quote") } :
        { ...common, kind: literal(ref.kind, "CAPTURED_OBSERVATION", "render.observation.kind"), observationId: id(ref.observationId, "render.observation.id") };
      return { reference, startMs: n(e.startMs), endMs: n(e.endMs), sourceText: text(e.sourceText, 20000, "render.chinese") };
    }), contradictions: array(r.contradictions, 100, "render.contradictions").map(v => {
      const c = record(v, ["findingId", "explanation"], "render.contradiction"); return { findingId: id(c.findingId, "render.contradiction.id"), explanation: text(c.explanation, 2000, "render.contradiction.text") };
    }) };
}
function segment(v: unknown): RenderSegment {
  const r = record(v, ["timelineSegmentId", "candidateId", "candidateHash", "presentationIndex", "sourceChronologyIndex", "sourceStartMs", "sourceEndMs", "outputStartMs", "outputEndMs", "durationMs", "sourceStartFrame", "sourceEndFrame", "outputStartFrame", "outputEndFrame", "frameCount", "sourceStartTick", "sourceEndTick", "outputStartTick", "outputEndTick", "durationTicks", "transition", "provenance"], "render.segment");
  return { timelineSegmentId: id(r.timelineSegmentId, "render.timelineSegment"), candidateId: id(r.candidateId, "render.candidate"), candidateHash: hash(r.candidateHash, "render.candidate.hash"),
    presentationIndex: integer(r.presentationIndex, "render.index", 63), sourceChronologyIndex: integer(r.sourceChronologyIndex, "render.chronology", 63),
    sourceStartMs: n(r.sourceStartMs), sourceEndMs: n(r.sourceEndMs), outputStartMs: n(r.outputStartMs), outputEndMs: n(r.outputEndMs), durationMs: positive(r.durationMs, R.maxDurationMs),
    sourceStartFrame: count(r.sourceStartFrame), sourceEndFrame: count(r.sourceEndFrame), outputStartFrame: count(r.outputStartFrame), outputEndFrame: count(r.outputEndFrame), frameCount: positive(r.frameCount, Number.MAX_SAFE_INTEGER),
    sourceStartTick: count(r.sourceStartTick), sourceEndTick: count(r.sourceEndTick), outputStartTick: count(r.outputStartTick), outputEndTick: count(r.outputEndTick), durationTicks: positive(r.durationTicks, Number.MAX_SAFE_INTEGER),
    transition: literal(r.transition, "CUT_ONLY", "render.transition"), provenance: provenance(r.provenance) };
}
function audio(v: unknown, source: RenderDependencySnapshot["source"]): HighlightAudioReference | null {
  if (v === null) return null;
  const r = record(v, ["schemaVersion", "artifactId", "artifactHash", "planHash", "reference", "execution", "evidence", "speech", "verification", "restrictions"], "render.audio");
  const reference = parseNarrationReference(r.reference);
  if (!renderSame(reference, source.narration) || !renderSame(r.restrictions, fakeVoiceRestrictions)) rejectRender("INTEGRITY_FAILED");
  return { schemaVersion: literal(r.schemaVersion, H.audio, "render.audio.schema"), artifactId: id(r.artifactId, "render.audio.id"), artifactHash: hash(r.artifactHash, "render.audio.hash"), planHash: hash(r.planHash, "render.audio.planHash"), reference,
    execution: literal(r.execution, "FAKE_ONLY", "render.audio.execution"), evidence: literal(r.evidence, "SYNTHETIC_BYTE_INTEGRITY_ONLY", "render.audio.evidence"), speech: literal(r.speech, "NOT_VERIFIED", "render.audio.speech"),
    verification: literal(r.verification, "REFERENCE_ONLY", "render.audio.verification"), restrictions: fakeVoiceRestrictions };
}
/** Shape and self-hash validation only; public validation must also perform independent full replay. */
export function parseRenderRecipe(value: unknown) {
  return renderGuard(() => {
    const outer = record(renderCapture(value), ["id", "recipe", "recipeHash"], "render.recipe.envelope");
    const r = record(outer.recipe, ["schemaVersion", "input", "inputHash", "timelinePlanHash", "dependency", "dependencyHash", "sourceObservation", "sourceObservationHash", "profile", "profileHash", "policyHash", "segments", "sourceOrder", "presentationOrder", "totalOutputMs", "totalOutputFrames", "totalOutputTicks", "audio", "outputAudioTracks", "historicalFakeAudio", "restrictions"], "render.recipe");
    const input = parseRenderPlanningInput(r.input), d = dependency(r.dependency), sourceObservation = parseSyntheticSourceObservation(r.sourceObservation), profile = parseSyntheticRenderProfile(r.profile);
    if (!renderSame(r.restrictions, renderRestrictions) || r.outputAudioTracks !== 0) rejectRender("INTEGRITY_FAILED");
    const recipe: RenderRecipePayload = { schemaVersion: literal(r.schemaVersion, R.recipe, "render.recipe.schema"), input,
      inputHash: hash(r.inputHash, "render.inputHash"), timelinePlanHash: hash(r.timelinePlanHash, "render.timelinePlanHash"), dependency: d, dependencyHash: hash(r.dependencyHash, "render.dependencyHash"),
      sourceObservation, sourceObservationHash: hash(r.sourceObservationHash, "render.sourceHash"), profile, profileHash: hash(r.profileHash, "render.profileHash"), policyHash: hash(r.policyHash, "render.policyHash"),
      segments: array(r.segments, 64, "render.segments", 1).map(segment), sourceOrder: ids(r.sourceOrder, 64), presentationOrder: ids(r.presentationOrder, 64),
      totalOutputMs: positive(r.totalOutputMs, R.maxDurationMs), totalOutputFrames: positive(r.totalOutputFrames, Number.MAX_SAFE_INTEGER), totalOutputTicks: positive(r.totalOutputTicks, Number.MAX_SAFE_INTEGER),
      audio: literal(r.audio, "EXCLUDE_ALL", "render.audio.policy"), outputAudioTracks: 0, historicalFakeAudio: audio(r.historicalFakeAudio, d.source), restrictions: renderRestrictions };
    if (recipe.inputHash !== contractHash(R.input, input) || recipe.dependencyHash !== contractHash(R.dependency, d) || recipe.sourceObservationHash !== contractHash(R.source, sourceObservation) ||
      recipe.profileHash !== contractHash(R.profile, profile) || recipe.policyHash !== contractHash(R.policy, input.policy) || recipe.timelinePlanHash !== input.timeline.planHash ||
      recipe.dependencyHash !== contractHash(R.dependency, r.dependency) || !renderSame(d.timeline, input.timeline) || !renderSame(d.scope, input.scope) || !renderSame(d.profileReference, input.profileReference) ||
      d.sourceObservationHash !== recipe.sourceObservationHash || !renderSame(sourceObservation.fingerprint, d.source.media)) rejectRender("INTEGRITY_FAILED");
    const recipeHash = hash(outer.recipeHash, "render.recipeHash");
    if (recipeHash !== contractHash(R.recipe, recipe) || outer.id !== `rr-${recipeHash}` || !renderSame(recipe, r)) rejectRender("INTEGRITY_FAILED");
    return freeze({ id: outer.id as string, recipe, recipeHash });
  }, "INTEGRITY_FAILED");
}
