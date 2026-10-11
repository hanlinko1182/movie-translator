import "server-only";
import { CONFIDENCES } from "@/lib/character-analysis/types";
import { canonicalJson, contractHash } from "./canonical";
import { BEAT_CATEGORIES, EVENT_KINDS, LIMITS, STORYLINE, type StoryClaim, type StorySourceSnapshot,
  type StoryScriptPayload, type StoryScriptVersion, type SourceAnchor, type StoryEvent } from "./contracts";
import { anchorKey, assertAnchor, parseAnchor, sourceAnchors } from "./source";
import { array, enumeration, fail, freeze, hash, id, integer, interval, literal, nullable, record, text, unique } from "./validation";

export const CAUTIOUS_MYANMAR_MARKERS = ["ဖြစ်နိုင်", "ပုံရ", "ထင်ရ", "ယူဆ"] as const;
const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
export function allClaims(script: StoryScriptVersion): readonly import("./contracts").Immutable<StoryClaim>[] { return script.payload.beats.flatMap(beat => beat.claims); }
export function claimContentHash(claim: import("./contracts").Immutable<StoryClaim>, script: StoryScriptVersion): string {
  return contractHash("story-claim-v1", { claim, narration: script.payload.beats.flatMap(beat => beat.narration).filter(chunk => chunk.claimIds.includes(claim.id)) });
}

export function allowedClaimAnchors(claim: Pick<StoryClaim, "characterRefs" | "relationshipRef"> | import("./contracts").Immutable<StoryClaim>, source: StorySourceSnapshot): readonly SourceAnchor[] {
  const firstCharacter = source.payload.characters.find(row => row.id === claim.characterRefs[0]);
  const relationship = source.payload.relationships.find(row => row.id === claim.relationshipRef);
  const all = firstCharacter?.evidence.map(row => row.anchor) ?? relationship?.evidence.map(row => row.anchor) ?? sourceAnchors(source.payload);
  return all.filter(anchor => claim.characterRefs.every(ref => source.payload.characters.find(row => row.id === ref)?.evidence.some(row => anchorKey(row.anchor) === anchorKey(anchor)))
    && (claim.relationshipRef === null || !!source.payload.relationships.find(row => row.id === claim.relationshipRef)?.evidence.some(row => anchorKey(row.anchor) === anchorKey(anchor))));
}
function strings(value: unknown, max: number, path: string, min = 0): string[] {
  const result = array(value, max, path, min).map(value => id(value, path)); unique(result, value => value, path); return result;
}
function parseClaim(raw: unknown, source: StorySourceSnapshot): StoryClaim {
  const p = "script.beats.claims";
  // Inspect kind without trusting any extra metadata such as SOURCE_VERIFIED.
  if (!raw || typeof raw !== "object") fail("INVALID_OBJECT", p);
  const descriptor = Object.getOwnPropertyDescriptor(raw, "kind");
  if (!descriptor || !("value" in descriptor)) fail("INVALID_OBJECT", p);
  const kind = enumeration(descriptor.value, ["OBSERVED", "INFERRED"], `${p}.kind`);
  const fields = ["id", "kind", "statement", "confidence", "characterRefs", "relationshipRef", "evidence", "translationContextRefs", ...(kind === "INFERRED" ? ["inferenceBasisClaimIds", "qualification"] : [])];
  const row = record(raw, fields, p);
  const characterRefs = strings(row.characterRefs, 12, `${p}.characterRefs`).sort();
  if (characterRefs.some(ref => !source.payload.characters.some(row => row.id === ref))) fail("EVIDENCE_OWNERSHIP", `${p}.characterRefs`);
  const relationshipRef = nullable(row.relationshipRef, value => id(value, `${p}.relationshipRef`));
  const relationship = source.payload.relationships.find(row => row.id === relationshipRef);
  if (relationshipRef !== null && (!relationship || [...characterRefs].sort().join(":") !== [relationship.characterAId, relationship.characterBId].sort().join(":"))) fail("EVIDENCE_OWNERSHIP", `${p}.relationshipRef`);
  const evidence = array(row.evidence, LIMITS.anchors, `${p}.evidence`, 1).map(value => parseAnchor(value, `${p}.evidence`));
  unique(evidence, anchorKey, `${p}.evidence`);
  evidence.forEach(anchor => assertAnchor(anchor, source.payload, `${p}.evidence`));
  const allowed = new Set(allowedClaimAnchors({ characterRefs, relationshipRef }, source).map(anchorKey));
  if (evidence.some(anchor => !allowed.has(anchorKey(anchor)))) fail("EVIDENCE_OWNERSHIP", `${p}.evidence`);
  const confidence = enumeration(row.confidence, CONFIDENCES, `${p}.confidence`);
  for (const ref of characterRefs) {
    const character = source.payload.characters.find(row => row.id === ref)!;
    if (character.uncertain && confidence !== "LOW" || evidence.some(anchor => rank[confidence] > rank[character.evidence.find(row => anchorKey(row.anchor) === anchorKey(anchor))!.confidence])) fail("CONFIDENCE_INVALID", `${p}.confidence`);
  }
  if (relationship && (rank[confidence] > rank[relationship.confidence] || relationship.type === "UNKNOWN" && confidence !== "LOW" || evidence.some(anchor => rank[confidence] > rank[relationship.evidence.find(row => anchorKey(row.anchor) === anchorKey(anchor))!.confidence]))) fail("CONFIDENCE_INVALID", `${p}.confidence`);
  const translationContextRefs = array(row.translationContextRefs, LIMITS.anchors, `${p}.translationContextRefs`).map(raw => {
    const item = record(raw, ["translationSegmentId", "rowContextHash"], `${p}.translationContextRefs`);
    const result = { translationSegmentId: id(item.translationSegmentId, `${p}.translationContextRefs.translationSegmentId`), rowContextHash: hash(item.rowContextHash, `${p}.translationContextRefs.rowContextHash`) };
    const admission = source.admissions.find(row => row.status === "ADMITTED" && row.row.id === result.translationSegmentId);
    if (!admission || admission.status !== "ADMITTED" || admission.rowContextHash !== result.rowContextHash || !evidence.some(anchor => anchor.segmentSequence === admission.sequence)) fail("STALE_CONTEXT", `${p}.translationContextRefs`);
    return result;
  }).sort((a, b) => a.translationSegmentId < b.translationSegmentId ? -1 : 1);
  unique(translationContextRefs, row => row.translationSegmentId, `${p}.translationContextRefs`);
  const base = { id: id(row.id, `${p}.id`), statement: text(row.statement, 2000, `${p}.statement`), confidence, characterRefs, relationshipRef, evidence: evidence.sort((a, b) => a.sceneSequence - b.sceneSequence || a.segmentSequence - b.segmentSequence), translationContextRefs };
  if (kind === "OBSERVED") return { ...base, kind };
  if (!characterRefs.length) fail("EVIDENCE_OWNERSHIP", `${p}.characterRefs`);
  const qualification = text(row.qualification, 160, `${p}.qualification`);
  if (!CAUTIOUS_MYANMAR_MARKERS.some(marker => qualification.includes(marker))) fail("INFERENCE_INVALID", `${p}.qualification`);
  return { ...base, kind, qualification, inferenceBasisClaimIds: strings(row.inferenceBasisClaimIds, LIMITS.claimsPerBeat, `${p}.inferenceBasisClaimIds`, 1).sort() };
}

export function validateScriptPayload(value: unknown, source: StorySourceSnapshot): StoryScriptVersion {
  canonicalJson(value, LIMITS.scriptBytes);
  const p = "script", row = record(value, ["schemaVersion", "id", "version", "parentVersionId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "style", "durationMode", "translationContextPolicy", "language", "origin", "beats"], p);
  const script: StoryScriptPayload = {
    schemaVersion: literal(row.schemaVersion, STORYLINE.scriptVersion, `${p}.schemaVersion`), id: id(row.id, `${p}.id`), version: integer(row.version, `${p}.version`), parentVersionId: nullable(row.parentVersionId, value => id(value, `${p}.parentVersionId`)),
    sourceSnapshotId: id(row.sourceSnapshotId, `${p}.sourceSnapshotId`), sourceContentHash: hash(row.sourceContentHash, `${p}.sourceContentHash`), sourceContextHash: hash(row.sourceContextHash, `${p}.sourceContextHash`),
    style: literal(row.style, STORYLINE.style, `${p}.style`), durationMode: literal(row.durationMode, STORYLINE.durationMode, `${p}.durationMode`), translationContextPolicy: literal(row.translationContextPolicy, STORYLINE.translationPolicy, `${p}.translationContextPolicy`), language: literal(row.language, "my", `${p}.language`), origin: enumeration(row.origin, ["MODEL", "HUMAN"], `${p}.origin`),
    beats: array(row.beats, LIMITS.beats, `${p}.beats`, 1).map((raw, order) => {
      const p = "script.beats", beat = record(raw, ["id", "order", "category", "startMs", "endMs", "narration", "claims"], p);
      const result = {
        id: id(beat.id, `${p}.id`), order: integer(beat.order, `${p}.order`), category: enumeration(beat.category, BEAT_CATEGORIES, `${p}.category`), startMs: integer(beat.startMs, `${p}.startMs`), endMs: integer(beat.endMs, `${p}.endMs`),
        claims: array(beat.claims, LIMITS.claimsPerBeat, `${p}.claims`, 1).map(raw => parseClaim(raw, source)),
        narration: array(beat.narration, LIMITS.claimsPerBeat, `${p}.narration`, 1).map(raw => {
          const item = record(raw, ["text", "claimIds"], `${p}.narration`);
          return { text: text(item.text, LIMITS.narrationPerBeat, `${p}.narration.text`), claimIds: strings(item.claimIds, LIMITS.claimsPerBeat, `${p}.narration.claimIds`, 1).sort() };
        }),
      };
      if (result.order !== order) fail("INVALID_ORDER", `${p}.order`);
      interval(result.startMs, result.endMs, source.payload.media.durationMs, p);
      if (result.claims.some(claim => claim.evidence.some(anchor => {
        const segment = source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)!;
        return segment.startMs < result.startMs || segment.endMs > result.endMs;
      }))) fail("INVALID_INTERVAL", `${p}.claims`);
      if (result.narration.reduce((total, chunk) => total + [...chunk.text].length, 0) > LIMITS.narrationPerBeat) fail("SIZE_LIMIT", `${p}.narration`);
      const ids = new Set(result.claims.map(claim => claim.id));
      if (result.narration.some(chunk => chunk.claimIds.some(id => !ids.has(id))) || result.claims.some(claim => !result.narration.some(chunk => chunk.claimIds.includes(claim.id)))) fail("INVALID_ANCHOR", `${p}.narration.claimIds`);
      for (const claim of result.claims) if (claim.kind === "INFERRED" && result.narration.some(chunk => chunk.claimIds.includes(claim.id) && !chunk.text.includes(claim.qualification))) fail("INFERENCE_INVALID", `${p}.narration`);
      return result;
    }),
  };
  if (!script.version || (script.version === 1) !== (script.parentVersionId === null) || script.parentVersionId === script.id) fail("INVALID_ORDER", "script.version");
  if (script.sourceSnapshotId !== source.payload.id || script.sourceContentHash !== source.sourceContentHash || script.sourceContextHash !== source.sourceContextHash) fail("STALE_CONTEXT", "script.sourceContextHash");
  unique(script.beats, beat => beat.id, "script.beats");
  const claims = script.beats.flatMap(beat => beat.claims), byId = new Map(claims.map(claim => [claim.id, claim]));
  unique(claims, claim => claim.id, "script.beats.claims");
  if (script.beats.flatMap(beat => beat.narration).reduce((total, chunk) => total + [...chunk.text].length, 0) > LIMITS.narrationTotal) fail("SIZE_LIMIT", "script.beats.narration");
  const visiting = new Set<string>(), visited = new Set<string>();
  function checkBasis(claim: StoryClaim) {
    if (visiting.has(claim.id)) fail("INFERENCE_CYCLE", "script.beats.claims.inferenceBasisClaimIds");
    if (visited.has(claim.id)) return;
    visiting.add(claim.id);
    if (claim.kind === "INFERRED") for (const ref of claim.inferenceBasisClaimIds) {
      const basis = byId.get(ref);
      if (!basis) fail("INFERENCE_INVALID", "script.beats.claims.inferenceBasisClaimIds");
      checkBasis(basis);
    }
    visiting.delete(claim.id); visited.add(claim.id);
  }
  claims.forEach(checkBasis);
  for (const claim of claims) if (claim.kind === "INFERRED") {
    const bases = claim.inferenceBasisClaimIds.map(id => byId.get(id)!);
    if (bases.some(basis => basis.kind !== "OBSERVED" || basis.relationshipRef !== claim.relationshipRef || basis.characterRefs.join(":") !== claim.characterRefs.join(":") || rank[claim.confidence] > rank[basis.confidence]) || claim.evidence.some(anchor => !bases.some(basis => basis.evidence.some(row => anchorKey(row) === anchorKey(anchor))))) fail("INFERENCE_INVALID", "script.beats.claims.inferenceBasisClaimIds");
  }
  return freeze({ payload: script, scriptHash: contractHash("story-script-v1", script) });
}

export function validateStoryEvents(value: unknown, source: StorySourceSnapshot, script: StoryScriptVersion): readonly import("./contracts").Immutable<StoryEvent>[] {
  if (validateScriptPayload(script.payload, source).scriptHash !== script.scriptHash) fail("STALE_CONTEXT", "events.scriptHash");
  canonicalJson(value, LIMITS.scriptBytes);
  const claims = allClaims(script);
  const events = array(value, LIMITS.events, "events").map(raw => {
    const p = "events", row = record(raw, ["id", "kind", "startMs", "endMs", "claimIds", "precedingEventIds"], p);
    const event = { id: id(row.id, `${p}.id`), kind: enumeration(row.kind, EVENT_KINDS, `${p}.kind`), startMs: integer(row.startMs, `${p}.startMs`), endMs: integer(row.endMs, `${p}.endMs`), claimIds: strings(row.claimIds, LIMITS.claimsPerEvent, `${p}.claimIds`, 1).sort(), precedingEventIds: strings(row.precedingEventIds, LIMITS.events, `${p}.precedingEventIds`).sort() };
    interval(event.startMs, event.endMs, source.payload.media.durationMs, p);
    if (event.claimIds.some(id => !claims.some(claim => claim.id === id))) fail("INVALID_ANCHOR", `${p}.claimIds`);
    if (event.claimIds.some(id => claims.find(claim => claim.id === id)!.evidence.some(anchor => {
      const segment = source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)!;
      return segment.startMs < event.startMs || segment.endMs > event.endMs;
    }))) fail("INVALID_INTERVAL", p);
    if (event.kind === "RELATIONSHIP_CHANGE" && !event.claimIds.some(id => claims.find(claim => claim.id === id)!.relationshipRef !== null)) fail("EVIDENCE_OWNERSHIP", p);
    return event;
  });
  unique(events, event => event.id, "events");
  // Different IDs cannot turn the exact same event into additional duration support.
  unique(events, event => canonicalJson({ kind: event.kind, startMs: event.startMs, endMs: event.endMs, claimIds: event.claimIds }), "events.content");
  if (events.some((event, index) => index > 0 && event.startMs < events[index - 1].startMs)) fail("INVALID_ORDER", "events");
  for (const event of events) if (event.precedingEventIds.some(id => {
    const preceding = events.find(row => row.id === id);
    return !preceding || preceding.id === event.id || preceding.endMs > event.startMs;
  })) fail("INFERENCE_INVALID", "events.precedingEventIds");
  return freeze(events);
}
