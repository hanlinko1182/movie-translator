import { CONFIDENCES } from "@/lib/character-analysis/types";
import { referencePairs } from "./context";
import { RecapError, type Confidence, type RecapInput, type RecapOutput, type RecapReference } from "./types";
function invalid(): never { throw new RecapError("RECAP_INVALID_RESPONSE"); }
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...fields].sort().join(",")) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number): string { if (typeof value !== "string" || !value.trim() || value.length > maximum) invalid(); return value.trim(); }
function array(value: unknown, maximum: number, required = false): unknown[] { if (!Array.isArray(value) || value.length > maximum || required && !value.length) invalid(); return value; }
function confidence(value: unknown): Confidence { if (!CONFIDENCES.includes(value as Confidence)) invalid(); return value as Confidence; }
export function validateRecapOutput(value: unknown, input: RecapInput): RecapOutput {
  const root = object(value, ["title", "summary", "sections", "characterInsights", "relationshipInsights"]);
  const pairs = referencePairs(input);
  const scenes = new Set([...pairs].map((pair) => Number(pair.split(":")[0])));
  for (const scene of input.scenes) scenes.add(scene.sequence);
  for (const summary of input.summaries) for (const section of summary.sections) { scenes.add(section.sceneStartSequence); scenes.add(section.sceneEndSequence); }
  function evidence(raw: unknown): RecapReference[] {
    const seen = new Set<string>();
    return array(raw, 4, true).map((raw) => {
      const row = object(raw, ["sceneSequence", "segmentSequences", "note"]);
      if (!Number.isSafeInteger(row.sceneSequence) || !scenes.has(row.sceneSequence as number)) invalid();
      const sequences = array(row.segmentSequences, 8, true);
      if (new Set(sequences).size !== sequences.length || sequences.some((seq) => !Number.isSafeInteger(seq) || !pairs.has(`${row.sceneSequence}:${seq}`))) invalid();
      const result = { sceneSequence: row.sceneSequence as number, segmentSequences: (sequences as number[]).sort((a, b) => a - b), note: text(row.note, 160) };
      const key = JSON.stringify(result); if (seen.has(key)) invalid(); seen.add(key);
      return result;
    });
  }
  const sections = array(root.sections, 8, true).map((raw, sequence) => {
    const row = object(raw, ["sequence", "sceneStartSequence", "sceneEndSequence", "heading", "summary", "confidence", "evidence"]);
    if (row.sequence !== sequence || !Number.isSafeInteger(row.sceneStartSequence) || !Number.isSafeInteger(row.sceneEndSequence) || !scenes.has(row.sceneStartSequence as number) || !scenes.has(row.sceneEndSequence as number) || (row.sceneStartSequence as number) > (row.sceneEndSequence as number)) invalid();
    const refs = evidence(row.evidence);
    if (refs.some((e) => e.sceneSequence < (row.sceneStartSequence as number) || e.sceneSequence > (row.sceneEndSequence as number))) invalid();
    return { sequence, sceneStartSequence: row.sceneStartSequence as number, sceneEndSequence: row.sceneEndSequence as number, heading: text(row.heading, 120), summary: text(row.summary, 700), confidence: confidence(row.confidence), evidence: refs };
  });
  if (sections.some((row, i) => i > 0 && row.sceneStartSequence < sections[i - 1].sceneStartSequence)) invalid();
  const characterRefs = new Set<string>();
  const characterInsights = array(root.characterInsights, 12).map((raw) => {
    const row = object(raw, ["characterRef", "observation", "confidence", "evidence"]);
    const characterRef = text(row.characterRef, 160); const character = input.characters.find((c) => c.ref === characterRef);
    if (!character || characterRefs.has(characterRef)) invalid(); characterRefs.add(characterRef);
    const certainty = confidence(row.confidence); if (character.uncertain && certainty !== "LOW") invalid();
    const refs = evidence(row.evidence);
    if (refs.some((e) => e.segmentSequences.some((seq) => !character.evidence.some((c) => c.sceneSequence === e.sceneSequence && c.segmentSequence === seq)))) invalid();
    return { characterRef, observation: text(row.observation, 500), confidence: certainty, evidence: refs };
  });
  const relationRefs = new Set<string>(); const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const relationshipInsights = array(root.relationshipInsights, 12).map((raw) => {
    const row = object(raw, ["relationshipRef", "characterARef", "characterBRef", "observation", "confidence", "evidence"]);
    const relationshipRef = text(row.relationshipRef, 160); const relationship = input.relationships.find((r) => r.ref === relationshipRef);
    const characterARef = text(row.characterARef, 160); const characterBRef = text(row.characterBRef, 160);
    if (!relationship || relationRefs.has(relationshipRef) || characterARef === characterBRef || !input.characters.some((c) => c.ref === characterARef) || !input.characters.some((c) => c.ref === characterBRef) || [characterARef, characterBRef].sort().join(":") !== [relationship.characterARef, relationship.characterBRef].sort().join(":")) invalid();
    relationRefs.add(relationshipRef);
    const certainty = confidence(row.confidence);
    if (rank[certainty] > rank[relationship.confidence] || (relationship.type === "UNKNOWN" || [characterARef, characterBRef].some((ref) => input.characters.find((c) => c.ref === ref)!.uncertain)) && certainty !== "LOW") invalid();
    const refs = evidence(row.evidence);
    if (refs.some((e) => e.segmentSequences.some((seq) => !relationship.evidence.some((r) => r.sceneSequence === e.sceneSequence && r.segmentSequence === seq)))) invalid();
    return { relationshipRef, characterARef, characterBRef, observation: text(row.observation, 500), confidence: certainty, evidence: refs };
  });
  const output = { title: text(root.title, 160), summary: text(root.summary, 1200), sections, characterInsights, relationshipInsights };
  if (JSON.stringify(output).length > 10000) invalid();
  return output;
}
export function parseRecapOutput(content: string, input: RecapInput) {
  let value: unknown; try { value = JSON.parse(content); } catch { invalid(); }
  return validateRecapOutput(value, input);
}
