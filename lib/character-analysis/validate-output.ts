import { normalizeName, uncertainName } from "./normalize";
import { CharacterAnalysisError, CONFIDENCES, EVIDENCE_TYPES, RELATIONSHIP_TYPES, type AnalysisBatch, type CharacterOutput, type Evidence } from "./types";

function invalid(): never { throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE"); }
function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...fields].sort().join(",")) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number) { if (typeof value !== "string" || !value.trim() || value.length > maximum) invalid(); return value.trim(); }
function array(value: unknown, maximum: number, nonempty = false): unknown[] { if (!Array.isArray(value) || value.length > maximum || (nonempty && !value.length)) invalid(); return value; }
function enumeration<T extends string>(value: unknown, values: readonly T[]): T { if (!values.includes(value as T)) invalid(); return value as T; }
function evidence(value: unknown, input: AnalysisBatch): Evidence {
  const item = record(value, ["sceneSequence", "segmentSequences", "type", "evidence", "inference", "confidence"]);
  const scene = input.scenes.find((scene) => scene.sequence === item.sceneSequence);
  if (!scene) invalid();
  const sequences = array(item.segmentSequences, 24, true);
  if (new Set(sequences).size !== sequences.length || sequences.some((sequence) => !Number.isSafeInteger(sequence) || !scene.segments.some((segment) => segment.sequence === sequence))) invalid();
  return { sceneSequence: scene.sequence, segmentSequences: (sequences as number[]).sort((a, b) => a - b), type: enumeration(item.type, EVIDENCE_TYPES), evidence: text(item.evidence, 240), inference: text(item.inference, 600), confidence: enumeration(item.confidence, CONFIDENCES) };
}
export function validateCharacterOutput(value: unknown, input: AnalysisBatch): CharacterOutput {
  const root = record(value, ["characters", "relationships"]);
  const ids = new Set<string>();
  const characters = array(root.characters, 40).map((raw) => {
    const item = record(raw, ["temporaryId", "name", "aliases", "evidence"]);
    const temporaryId = text(item.temporaryId, 80);
    if (ids.has(temporaryId)) invalid(); ids.add(temporaryId);
    const name = normalizeName(text(item.name, 100));
    const aliases = array(item.aliases, 12).map((value) => normalizeName(text(value, 100)));
    if (new Set(aliases).size !== aliases.length) invalid();
    const observations = array(item.evidence, 48, true).map((value) => evidence(value, input));
    if (!uncertainName(name)) {
      const referencedText = observations.flatMap((observation) => input.scenes.find((scene) => scene.sequence === observation.sceneSequence)!.segments.filter((segment) => observation.segmentSequences.includes(segment.sequence)).flatMap((segment) => [segment.text, segment.targetText ?? ""])).map(normalizeName).join("\n");
      // Require at least one actual name/alias in referenced text, not invented named identities.
      if (![name, ...aliases].some((alias) => !uncertainName(alias) && referencedText.includes(alias))) invalid();
    }
    return { temporaryId, name, aliases, evidence: observations };
  });
  const byId = new Map(characters.map((character) => [character.temporaryId, character]));
  const relationships = array(root.relationships, 80).map((raw) => {
    const item = record(raw, ["characterA", "characterB", "type", "summary", "confidence", "evidence"]);
    const characterA = text(item.characterA, 80); const characterB = text(item.characterB, 80);
    if (!ids.has(characterA) || !ids.has(characterB) || characterA === characterB) invalid();
    const observations = array(item.evidence, 48, true).map((value) => evidence(value, input));
    // Both candidates need evidence in each relationship's scene; uncertain identities cannot jump scenes.
    if (observations.some((row) => [characterA, characterB].some((id) => !byId.get(id)!.evidence.some((e) => e.sceneSequence === row.sceneSequence)))) invalid();
    return { characterA, characterB, type: enumeration(item.type, RELATIONSHIP_TYPES), summary: text(item.summary, 600), confidence: enumeration(item.confidence, CONFIDENCES), evidence: observations };
  });
  return { characters, relationships };
}
export function parseCharacterOutput(content: string, input: AnalysisBatch) {
  let value: unknown;
  try { value = JSON.parse(content); } catch { invalid(); }
  return validateCharacterOutput(value, input);
}
