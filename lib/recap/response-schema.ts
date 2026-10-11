import { CONFIDENCES } from "@/lib/character-analysis/types";

// Shared with the local validator. JSON Schema cannot enforce evidence ownership,
// chronological relationships, trim-based non-emptiness, or total serialized size.
export const RECAP_LIMITS = {
  title: 160, summary: 1200, sections: 8, heading: 120, sectionSummary: 700,
  insights: 12, reference: 160, observation: 500, evidence: 4,
  segmentReferences: 8, evidenceNote: 160, output: 10000,
} as const;
const text = (maximum: number) => ({ type: "string", minLength: 1, maxLength: maximum });
const integer = { type: "integer", minimum: 0 };
const confidence = { type: "string", enum: [...CONFIDENCES] };
function object(properties: Record<string, unknown>) { return { type: "object", additionalProperties: false, required: Object.keys(properties), properties }; }
function array(items: unknown, maximum: number, minimum = 0) { return { type: "array", minItems: minimum, maxItems: maximum, items }; }
const evidence = array(object({ sceneSequence: integer, segmentSequences: array(integer, RECAP_LIMITS.segmentReferences, 1), note: text(RECAP_LIMITS.evidenceNote) }), RECAP_LIMITS.evidence, 1);
export const recapResponseSchema = object({
  title: text(RECAP_LIMITS.title), summary: text(RECAP_LIMITS.summary),
  sections: array(object({ sequence: integer, sceneStartSequence: integer, sceneEndSequence: integer, heading: text(RECAP_LIMITS.heading), summary: text(RECAP_LIMITS.sectionSummary), confidence, evidence }), RECAP_LIMITS.sections, 1),
  characterInsights: array(object({ characterRef: text(RECAP_LIMITS.reference), observation: text(RECAP_LIMITS.observation), confidence, evidence }), RECAP_LIMITS.insights),
  relationshipInsights: array(object({ relationshipRef: text(RECAP_LIMITS.reference), characterARef: text(RECAP_LIMITS.reference), characterBRef: text(RECAP_LIMITS.reference), observation: text(RECAP_LIMITS.observation), confidence, evidence }), RECAP_LIMITS.insights),
});
