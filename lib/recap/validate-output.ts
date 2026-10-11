import { CONFIDENCES } from "@/lib/character-analysis/types";
import { referencePairs } from "./context";
import { invalidRecapResponse, type RecapValidationDiagnostic, type RecapValidationStage } from "./diagnostics";
import { RECAP_LIMITS as limits } from "./response-schema";
import type { Confidence, RecapInput, RecapOutput, RecapReference } from "./types";

export function validateRecapOutput(value: unknown, input: RecapInput, stage: RecapValidationStage = "OUTPUT_VALIDATION"): RecapOutput {
  function invalid(rule: RecapValidationDiagnostic["rule"], fieldPath: string, details: Partial<Pick<RecapValidationDiagnostic, "expectedLimit" | "actualLength" | "actualCount">> = {}): never {
    return invalidRecapResponse({ stage, rule, fieldPath, ...details });
  }
  function object(value: unknown, fields: string[], path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("INVALID_OBJECT", path);
    const row = value as Record<string, unknown>;
    for (const field of fields) if (!Object.hasOwn(row, field)) invalid("MISSING_FIELD", `${path}.${field}`);
    if (Object.keys(row).length !== fields.length) invalid("UNKNOWN_FIELDS", path, { expectedLimit: fields.length, actualCount: Object.keys(row).length });
    return row;
  }
  function text(value: unknown, maximum: number, path: string): string {
    if (typeof value !== "string") invalid("INVALID_TEXT", path);
    if (!value.trim()) invalid("EMPTY_TEXT", path, { actualLength: value.length });
    if (value.length > maximum) invalid("TEXT_TOO_LONG", path, { expectedLimit: maximum, actualLength: value.length });
    return value.trim();
  }
  function array(value: unknown, maximum: number, path: string, required = false): unknown[] {
    if (!Array.isArray(value)) invalid("INVALID_ARRAY", path);
    if (required && !value.length) invalid("TOO_FEW_ITEMS", path, { expectedLimit: 1, actualCount: 0 });
    if (value.length > maximum) invalid("TOO_MANY_ITEMS", path, { expectedLimit: maximum, actualCount: value.length });
    return value;
  }
  function confidence(value: unknown, path: string): Confidence {
    if (!CONFIDENCES.includes(value as Confidence)) invalid("INVALID_CONFIDENCE", path);
    return value as Confidence;
  }
  const root = object(value, ["title", "summary", "sections", "characterInsights", "relationshipInsights"], "output");
  const pairs = referencePairs(input);
  const scenes = new Set([...pairs].map((pair) => Number(pair.split(":")[0])));
  for (const scene of input.scenes) scenes.add(scene.sequence);
  for (const summary of input.summaries) for (const section of summary.sections) { scenes.add(section.sceneStartSequence); scenes.add(section.sceneEndSequence); }
  function evidence(raw: unknown, path: string): RecapReference[] {
    const seen = new Set<string>();
    return array(raw, limits.evidence, path, true).map((raw, index) => {
      const itemPath = `${path}[${index}]`;
      const row = object(raw, ["sceneSequence", "segmentSequences", "note"], itemPath);
      if (!Number.isSafeInteger(row.sceneSequence) || !scenes.has(row.sceneSequence as number)) invalid("INVALID_SCENE_REFERENCE", `${itemPath}.sceneSequence`);
      const sequences = array(row.segmentSequences, limits.segmentReferences, `${itemPath}.segmentSequences`, true);
      if (new Set(sequences).size !== sequences.length) invalid("DUPLICATE_SEGMENT_REFERENCE", `${itemPath}.segmentSequences`, { actualCount: sequences.length });
      sequences.forEach((seq, index) => {
        if (!Number.isSafeInteger(seq) || !pairs.has(`${row.sceneSequence}:${seq}`)) invalid("INVALID_SEGMENT_REFERENCE", `${itemPath}.segmentSequences[${index}]`);
      });
      const result = { sceneSequence: row.sceneSequence as number, segmentSequences: (sequences as number[]).sort((a, b) => a - b), note: text(row.note, limits.evidenceNote, `${itemPath}.note`) };
      const key = JSON.stringify(result);
      if (seen.has(key)) invalid("DUPLICATE_EVIDENCE", itemPath);
      seen.add(key);
      return result;
    });
  }
  const sections = array(root.sections, limits.sections, "output.sections", true).map((raw, sequence) => {
    const path = `output.sections[${sequence}]`;
    const row = object(raw, ["sequence", "sceneStartSequence", "sceneEndSequence", "heading", "summary", "confidence", "evidence"], path);
    if (row.sequence !== sequence) invalid("INVALID_SEQUENCE", `${path}.sequence`);
    for (const field of ["sceneStartSequence", "sceneEndSequence"] as const) {
      if (!Number.isSafeInteger(row[field]) || !scenes.has(row[field] as number)) invalid("INVALID_SCENE_REFERENCE", `${path}.${field}`);
    }
    if ((row.sceneStartSequence as number) > (row.sceneEndSequence as number)) invalid("INVALID_SCENE_RANGE", path);
    const refs = evidence(row.evidence, `${path}.evidence`);
    if (refs.some((e) => e.sceneSequence < (row.sceneStartSequence as number) || e.sceneSequence > (row.sceneEndSequence as number))) invalid("EVIDENCE_OUTSIDE_SECTION", `${path}.evidence`);
    return { sequence, sceneStartSequence: row.sceneStartSequence as number, sceneEndSequence: row.sceneEndSequence as number, heading: text(row.heading, limits.heading, `${path}.heading`), summary: text(row.summary, limits.sectionSummary, `${path}.summary`), confidence: confidence(row.confidence, `${path}.confidence`), evidence: refs };
  });
  const unordered = sections.findIndex((row, i) => i > 0 && row.sceneStartSequence < sections[i - 1].sceneStartSequence);
  if (unordered !== -1) invalid("SECTION_ORDER", `output.sections[${unordered}].sceneStartSequence`);
  const characterRefs = new Set<string>();
  const characterInsights = array(root.characterInsights, limits.insights, "output.characterInsights").map((raw, index) => {
    const path = `output.characterInsights[${index}]`;
    const row = object(raw, ["characterRef", "observation", "confidence", "evidence"], path);
    const characterRef = text(row.characterRef, limits.reference, `${path}.characterRef`);
    const character = input.characters.find((c) => c.ref === characterRef);
    if (!character) invalid("INVALID_CHARACTER_REFERENCE", `${path}.characterRef`);
    if (characterRefs.has(characterRef)) invalid("DUPLICATE_CHARACTER_REFERENCE", `${path}.characterRef`);
    characterRefs.add(characterRef);
    const certainty = confidence(row.confidence, `${path}.confidence`);
    if (character.uncertain && certainty !== "LOW") invalid("UNCERTAIN_CONFIDENCE", `${path}.confidence`);
    const refs = evidence(row.evidence, `${path}.evidence`);
    refs.forEach((e, index) => {
      if (e.segmentSequences.some((seq) => !character.evidence.some((c) => c.sceneSequence === e.sceneSequence && c.segmentSequence === seq))) invalid("CHARACTER_EVIDENCE_NOT_ALLOWED", `${path}.evidence[${index}].segmentSequences`);
    });
    return { characterRef, observation: text(row.observation, limits.observation, `${path}.observation`), confidence: certainty, evidence: refs };
  });
  const relationRefs = new Set<string>(); const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const relationshipInsights = array(root.relationshipInsights, limits.insights, "output.relationshipInsights").map((raw, index) => {
    const path = `output.relationshipInsights[${index}]`;
    const row = object(raw, ["relationshipRef", "characterARef", "characterBRef", "observation", "confidence", "evidence"], path);
    const relationshipRef = text(row.relationshipRef, limits.reference, `${path}.relationshipRef`);
    const relationship = input.relationships.find((r) => r.ref === relationshipRef);
    const characterARef = text(row.characterARef, limits.reference, `${path}.characterARef`);
    const characterBRef = text(row.characterBRef, limits.reference, `${path}.characterBRef`);
    if (!relationship) invalid("INVALID_RELATIONSHIP_REFERENCE", `${path}.relationshipRef`);
    if (relationRefs.has(relationshipRef)) invalid("DUPLICATE_RELATIONSHIP_REFERENCE", `${path}.relationshipRef`);
    if (characterARef === characterBRef || !input.characters.some((c) => c.ref === characterARef) || !input.characters.some((c) => c.ref === characterBRef) || [characterARef, characterBRef].sort().join(":") !== [relationship.characterARef, relationship.characterBRef].sort().join(":")) invalid("INVALID_RELATIONSHIP_ENDPOINTS", path);
    relationRefs.add(relationshipRef);
    const certainty = confidence(row.confidence, `${path}.confidence`);
    if (rank[certainty] > rank[relationship.confidence] || (relationship.type === "UNKNOWN" || [characterARef, characterBRef].some((ref) => input.characters.find((c) => c.ref === ref)!.uncertain)) && certainty !== "LOW") invalid("RELATIONSHIP_CONFIDENCE", `${path}.confidence`);
    const refs = evidence(row.evidence, `${path}.evidence`);
    refs.forEach((e, index) => {
      if (e.segmentSequences.some((seq) => !relationship.evidence.some((r) => r.sceneSequence === e.sceneSequence && r.segmentSequence === seq))) invalid("RELATIONSHIP_EVIDENCE_NOT_ALLOWED", `${path}.evidence[${index}].segmentSequences`);
    });
    return { relationshipRef, characterARef, characterBRef, observation: text(row.observation, limits.observation, `${path}.observation`), confidence: certainty, evidence: refs };
  });
  const output = { title: text(root.title, limits.title, "output.title"), summary: text(root.summary, limits.summary, "output.summary"), sections, characterInsights, relationshipInsights };
  const length = JSON.stringify(output).length;
  if (length > limits.output) invalid("OUTPUT_TOO_LONG", "output", { expectedLimit: limits.output, actualLength: length });
  return output;
}

export function parseRecapOutput(content: string, input: RecapInput) {
  let value: unknown;
  try { value = JSON.parse(content); }
  catch { invalidRecapResponse({ stage: "JSON_PARSE", rule: "INVALID_JSON", fieldPath: "response.choices[0].message.content", actualLength: content.length }); }
  return validateRecapOutput(value, input);
}
