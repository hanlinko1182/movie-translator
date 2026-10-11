import "server-only";
import { CONFIDENCES, EVIDENCE_TYPES, RELATIONSHIP_TYPES } from "@/lib/character-analysis/types";
import { validateRecapOutput } from "@/lib/recap/validate-output";
import type { RecapInput, RecapOutput } from "@/lib/recap/types";
import { canonicalJson } from "./canonical";
import { LIMITS, type StorySourcePayload, type StoryPreparationContext, type StoryLegacyRecap, type EvidenceAllowance } from "./contracts";
import { array, date, enumeration, fail, hash, id, integer, literal, nullable, record, text, unique } from "./validation";

const order = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const key = (anchor: EvidenceAllowance["anchor"]) => `${anchor.sceneSequence}:${anchor.segmentSequence}`;
const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
/** Keep every exact observation in the capture; project one conservative allowance per anchor. */
export function observationAllowances(rows: StoryPreparationContext["observations"]): EvidenceAllowance[] {
  const result = new Map<string, EvidenceAllowance>();
  for (const row of [...rows].sort(order)) {
    const prior = result.get(key(row.anchor));
    if (!prior) result.set(key(row.anchor), { anchor: { ...row.anchor }, confidence: row.confidence, evidenceText: row.evidenceText, inference: row.inference });
    else if (rank[row.confidence] < rank[prior.confidence]) prior.confidence = row.confidence;
  }
  return [...result.values()].sort((a, b) => a.anchor.sceneSequence - b.anchor.sceneSequence || a.anchor.segmentSequence - b.anchor.segmentSequence);
}
export function storyRecapInput(source: StorySourcePayload): RecapInput {
  const evidence = (rows: EvidenceAllowance[]) => rows.map(row => ({ sceneSequence: row.anchor.sceneSequence, segmentSequence: row.anchor.segmentSequence, evidence: row.evidenceText, inference: row.inference, confidence: row.confidence }));
  return { stage: "SCENES", characterContext: "CURRENT", summaries: [],
    scenes: source.scenes.map(scene => ({ ...scene, segments: source.transcript.segments.filter(row => row.startMs < scene.endMs && (row.endMs > scene.startMs || row.startMs === row.endMs && row.startMs >= scene.startMs)) })),
    characters: source.characters.map(row => ({ ref: row.id, name: row.name, uncertain: row.uncertain, aliases: [], evidence: evidence(row.evidence) })),
    relationships: source.relationships.map(row => ({ ref: row.id, characterARef: row.characterAId, characterBRef: row.characterBId, type: row.type, summary: row.summary, confidence: row.confidence, evidence: evidence(row.evidence) })),
  };
}
// Use the existing evidence validator but retain the original text, not its trimmed projection.
export function validateAdvisoryOutput(raw: unknown, source: StorySourcePayload): RecapOutput {
  const bytes = canonicalJson(raw, 64 * 1024);
  if (bytes.length > 10000) fail("SIZE_LIMIT", "source.preparation.legacyRecap.output");
  try { validateRecapOutput(raw, storyRecapInput(source)); }
  catch { fail("INVALID_ANCHOR", "source.preparation.legacyRecap.output"); }
  return JSON.parse(bytes) as RecapOutput;
}
export function validatePreparationContext(value: unknown, source: StorySourcePayload): StoryPreparationContext {
  const p = "source.preparation";
  const row = record(value, ["policyVersion", "translationQcState", "dependencyHash", "sourceBindingHash", "video", "characterAnalysis", "aliases", "observations", "legacyRecapState", "legacyRecap"], p);
  const translationQcState = enumeration(row.translationQcState, ["TRANSLATION_MISSING", "UNSCANNED", "SCAN_RECORDED"], `${p}.translationQcState`);
  if (translationQcState !== (!source.translation ? "TRANSLATION_MISSING" : source.translation.qcScannedAt === null ? "UNSCANNED" : "SCAN_RECORDED")) fail("STALE_CONTEXT", `${p}.translationQcState`);
  const video = record(row.video, ["format", "videoIndex", "videoCodec", "width", "height", "timeBase", "frameRate", "hasAudio"], `${p}.video`);
  const rational = (value: unknown, path: string) => {
    const result = text(value, 64, path), parts = result.split("/").map(Number);
    if (!/^[1-9]\d*\/[1-9]\d*$/.test(result) || parts.some(part => !Number.isSafeInteger(part) || part <= 0)) fail("INVALID_NUMBER", path);
    return result;
  };
  if (typeof video.hasAudio !== "boolean") fail("INVALID_ENUM", `${p}.video.hasAudio`);
  const analysis = record(row.characterAnalysis, ["id", "sourceHash", "provider", "model", "createdAt", "updatedAt"], `${p}.characterAnalysis`);
  const aliases = array(row.aliases, LIMITS.entities, `${p}.aliases`).map(raw => {
    const item = record(raw, ["characterId", "values"], `${p}.aliases`);
    const characterId = id(item.characterId, `${p}.aliases.characterId`);
    if (!source.characters.some(row => row.id === characterId)) fail("EVIDENCE_OWNERSHIP", `${p}.aliases`);
    const values = array(item.values, 200, `${p}.aliases.values`).map(raw => text(raw, LIMITS.text, `${p}.aliases.values`)).sort();
    unique(values, row => row, `${p}.aliases.values`); return { characterId, values };
  }).sort((a, b) => a.characterId < b.characterId ? -1 : 1);
  unique(aliases, row => row.characterId, `${p}.aliases`);
  const observations = array(row.observations, LIMITS.anchorPairs, `${p}.observations`).map(raw => {
    const item = record(raw, ["id", "ownerKind", "ownerId", "anchor", "sceneId", "transcriptSegmentId", "kind", "evidenceText", "inference", "confidence", "relationshipType", "relationshipSummary", "createdAt", "updatedAt"], `${p}.observations`);
    const anchor = record(item.anchor, ["movieId", "transcriptId", "sceneSequence", "segmentSequence"], `${p}.observations.anchor`);
    const result = { id: id(item.id, `${p}.observations.id`), ownerKind: enumeration(item.ownerKind, ["CHARACTER", "RELATIONSHIP"], `${p}.observations.ownerKind`), ownerId: id(item.ownerId, `${p}.observations.ownerId`),
      anchor: { movieId: id(anchor.movieId, `${p}.observations.anchor.movieId`), transcriptId: id(anchor.transcriptId, `${p}.observations.anchor.transcriptId`), sceneSequence: integer(anchor.sceneSequence, `${p}.observations.anchor.sceneSequence`), segmentSequence: integer(anchor.segmentSequence, `${p}.observations.anchor.segmentSequence`) },
      sceneId: id(item.sceneId, `${p}.observations.sceneId`), transcriptSegmentId: id(item.transcriptSegmentId, `${p}.observations.transcriptSegmentId`), kind: text(item.kind, 160, `${p}.observations.kind`), evidenceText: text(item.evidenceText, LIMITS.text, `${p}.observations.evidenceText`), inference: text(item.inference, LIMITS.text, `${p}.observations.inference`, true), confidence: enumeration(item.confidence, CONFIDENCES, `${p}.observations.confidence`),
      relationshipType: nullable(item.relationshipType, v => enumeration(v, RELATIONSHIP_TYPES, `${p}.observations.relationshipType`)), relationshipSummary: nullable(item.relationshipSummary, v => text(v, 2000, `${p}.observations.relationshipSummary`)), createdAt: date(item.createdAt, `${p}.observations.createdAt`), updatedAt: nullable(item.updatedAt, v => date(v, `${p}.observations.updatedAt`)) };
    const owner = result.ownerKind === "CHARACTER" ? source.characters.find(row => row.id === result.ownerId) : source.relationships.find(row => row.id === result.ownerId);
    const scene = source.scenes.find(row => row.id === result.sceneId && row.sequence === result.anchor.sceneSequence);
    const segment = source.transcript.segments.find(row => row.id === result.transcriptSegmentId && row.sequence === result.anchor.segmentSequence);
    if (!owner || !scene || !segment || result.anchor.movieId !== source.movieId || result.anchor.transcriptId !== source.transcript.id || !owner.evidence.some(row => key(row.anchor) === key(result.anchor))) fail("EVIDENCE_OWNERSHIP", `${p}.observations`);
    if (result.ownerKind === "CHARACTER" && (result.relationshipType !== null || result.relationshipSummary !== null) || result.ownerKind === "RELATIONSHIP" && (result.relationshipType === null || result.relationshipSummary === null)) fail("EVIDENCE_OWNERSHIP", `${p}.observations`);
    enumeration(result.kind, result.ownerKind === "CHARACTER" ? EVIDENCE_TYPES : ["RELATIONSHIP"], `${p}.observations.kind`);
    return result;
  }).sort(order);
  unique(observations, row => row.id, `${p}.observations`);
  for (const [kind, owners] of [["CHARACTER", source.characters], ["RELATIONSHIP", source.relationships]] as const) for (const owner of owners) {
    if (canonicalJson(observationAllowances(observations.filter(row => row.ownerKind === kind && row.ownerId === owner.id))) !== canonicalJson(owner.evidence)) fail("EVIDENCE_OWNERSHIP", `${p}.observations`);
  }
  let legacyRecap: StoryLegacyRecap | null = null;
  if (row.legacyRecap !== null) {
    const item = record(row.legacyRecap, ["id", "sourceHash", "sourceTranscriptId", "characterAnalysisRunId", "provider", "model", "language", "createdAt", "updatedAt", "childIds", "output"], `${p}.legacyRecap`);
    const ids = record(item.childIds, ["sections", "characterInsights", "relationshipInsights", "evidence"], `${p}.legacyRecap.childIds`);
    const children = (value: unknown) => { const rows = array(value, 10000, `${p}.legacyRecap.childIds`).map(v => id(v, `${p}.legacyRecap.childIds`)).sort(); unique(rows, v => v, `${p}.legacyRecap.childIds`); return rows; };
    legacyRecap = { id: id(item.id, `${p}.legacyRecap.id`), sourceHash: hash(item.sourceHash, `${p}.legacyRecap.sourceHash`), sourceTranscriptId: id(item.sourceTranscriptId, `${p}.legacyRecap.sourceTranscriptId`), characterAnalysisRunId: id(item.characterAnalysisRunId, `${p}.legacyRecap.characterAnalysisRunId`), provider: text(item.provider, 160, `${p}.legacyRecap.provider`), model: text(item.model, 160, `${p}.legacyRecap.model`), language: literal(item.language, "my", `${p}.legacyRecap.language`), createdAt: date(item.createdAt, `${p}.legacyRecap.createdAt`), updatedAt: date(item.updatedAt, `${p}.legacyRecap.updatedAt`),
      childIds: { sections: children(ids.sections), characterInsights: children(ids.characterInsights), relationshipInsights: children(ids.relationshipInsights), evidence: children(ids.evidence) }, output: validateAdvisoryOutput(item.output, source) };
    if (legacyRecap.sourceTranscriptId !== source.transcript.id || legacyRecap.characterAnalysisRunId !== analysis.id) fail("SCOPE_MISMATCH", `${p}.legacyRecap`);
  }
  const legacyRecapState = enumeration(row.legacyRecapState, ["ABSENT", "EXCLUDED_STALE", "EXCLUDED_INVALID", "CURRENT_ADVISORY"], `${p}.legacyRecapState`);
  if ((legacyRecapState === "CURRENT_ADVISORY") !== (legacyRecap !== null)) fail("INVALID_ENUM", `${p}.legacyRecapState`);
  const width = integer(video.width, `${p}.video.width`), height = integer(video.height, `${p}.video.height`);
  if (!width || !height) fail("INVALID_NUMBER", `${p}.video`);
  return { policyVersion: literal(row.policyVersion, "story-source-preparation-v1", `${p}.policyVersion`), translationQcState, dependencyHash: hash(row.dependencyHash, `${p}.dependencyHash`), sourceBindingHash: hash(row.sourceBindingHash, `${p}.sourceBindingHash`),
    video: { format: text(video.format, 160, `${p}.video.format`), videoIndex: integer(video.videoIndex, `${p}.video.videoIndex`), videoCodec: text(video.videoCodec, 160, `${p}.video.videoCodec`), width, height, timeBase: rational(video.timeBase, `${p}.video.timeBase`), frameRate: rational(video.frameRate, `${p}.video.frameRate`), hasAudio: video.hasAudio },
    characterAnalysis: { id: id(analysis.id, `${p}.characterAnalysis.id`), sourceHash: hash(analysis.sourceHash, `${p}.characterAnalysis.sourceHash`), provider: text(analysis.provider, 160, `${p}.characterAnalysis.provider`), model: text(analysis.model, 160, `${p}.characterAnalysis.model`), createdAt: date(analysis.createdAt, `${p}.characterAnalysis.createdAt`), updatedAt: date(analysis.updatedAt, `${p}.characterAnalysis.updatedAt`) }, aliases, observations, legacyRecapState, legacyRecap };
}
