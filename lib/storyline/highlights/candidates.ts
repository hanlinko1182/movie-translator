import "server-only";
import { contractHash } from "../canonical";
import { assertAnchor, anchorKey } from "../source";
import { interval, unique } from "../validation";
import { HIGHLIGHTS as H, HIGHLIGHT_RUBRIC, type HighlightCandidate, type HighlightEvidence, type HighlightFactor } from "./contracts";
import type { resolveHighlightCapture } from "./resolution";

export const compareHighlightId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const sourceOrder = (a: Pick<HighlightCandidate, "startMs" | "endMs" | "id">, b: Pick<HighlightCandidate, "startMs" | "endMs" | "id">) =>
  a.startMs - b.startMs || a.endMs - b.endMs || compareHighlightId(a.id, b.id);
export const scoreOrder = (a: HighlightCandidate, b: HighlightCandidate) => b.totalScore - a.totalScore || sourceOrder(a, b);

/** One candidate per finding per connected union of scene/segment intersections.
 * Missing gaps are never bridged. No timestamp supplied by a caller is used. */
export function extractHighlightCandidates(capture: ReturnType<typeof resolveHighlightCapture>): HighlightCandidate[] {
  const { context, draft } = capture, source = context.source.payload, findings = context.candidate.payload.findings;
  const candidates: HighlightCandidate[] = [];
  for (const f of [...findings].sort((a, b) => compareHighlightId(a.id, b.id))) {
    const evidence: HighlightEvidence[] = f.evidence.map(reference => {
      assertAnchor(reference.anchor, source);
      const segment = source.transcript.segments.find(s => s.id === reference.segmentId)!;
      const scene = source.scenes.find(s => s.id === reference.sceneId)!;
      const startMs = Math.max(scene.startMs, segment.startMs), endMs = Math.min(scene.endMs, segment.endMs);
      return { reference: structuredClone(reference), startMs, endMs, sourceText: segment.text };
    }).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || compareHighlightId(anchorKey(a.reference.anchor), anchorKey(b.reference.anchor)) ||
      compareHighlightId(contractHash(H.candidate, a.reference), contractHash(H.candidate, b.reference)));
    const groups: HighlightEvidence[][] = [];
    for (const e of evidence) {
      const last = groups.at(-1);
      if (last && e.startMs <= Math.max(...last.map(e => e.endMs))) last.push(e); else groups.push([e]);
    }
    for (const group of groups) {
      const startMs = Math.min(...group.map(e => e.startMs)), endMs = Math.max(...group.map(e => e.endMs));
      if (startMs !== endMs) interval(startMs, endMs, source.media.durationMs, "highlight.interval");
      const contradictions = context.candidate.payload.contradictions.filter(c => c.firstFindingId === f.id || c.secondFindingId === f.id)
        .map(c => ({ findingId: c.firstFindingId === f.id ? c.secondFindingId : c.firstFindingId, explanation: c.explanation }))
        .sort((a, b) => compareHighlightId(a.findingId, b.findingId));
      const claimIds = draft.payload.claimLineage.filter(c => c.candidateFindingIds.includes(f.id)).map(c => c.claimId).sort(compareHighlightId);
      const count = findings.filter(other => other.subject.characterIds.some(c => f.subject.characterIds.includes(c)) ||
        f.subject.relationshipId !== null && other.subject.relationshipId === f.subject.relationshipId).length;
      const factors: Record<HighlightFactor, number> = {
        evidenceReliability: f.classification === "OBSERVED" ? 3 : 1,
        development: ["DECISION", "CONSEQUENCE", "CONFLICT"].includes(f.category) ? 3 : ["BEHAVIOR", "ACTION", "RELATIONSHIP"].includes(f.category) ? 2 : 1,
        behavior: ["BEHAVIOR", "ACTION", "TRAIT"].includes(f.category) ? 3 : ["MOTIVATION", "DECISION"].includes(f.category) ? 2 : 1,
        relationship: f.subject.relationshipId ? 3 : 0,
        narrative: ["DECISION", "CONSEQUENCE", "CONFLICT"].includes(f.category) ? 3 : 1,
        confidence: { LOW: 1, MEDIUM: 2, HIGH: 3 }[f.confidence],
        certainty: { NONE: 3, POSSIBLE: 1, COMPETING: 0 }[f.uncertainty],
        contradictionSafety: contradictions.length ? 0 : 3, diversity: count <= 2 ? 3 : 1, availability: startMs < endMs ? 3 : 0,
      };
      const totalScore = (Object.keys(factors) as HighlightFactor[]).reduce((sum, key) => sum + factors[key] * HIGHLIGHT_RUBRIC.weights[key], 0);
      const body = { findingId: f.id, evidence: group, startMs, endMs };
      candidates.push({ schemaVersion: H.candidate, id: `h-${contractHash(H.candidate, body)}`, findingId: f.id, claimIds,
        startMs, endMs, intervalPolicy: "CONNECTED_EVIDENCE_INTERSECTIONS", characterIds: [...f.subject.characterIds], relationshipId: f.subject.relationshipId,
        classification: f.classification, category: f.category, statement: f.statement, confidence: f.confidence, uncertainty: f.uncertainty,
        qualification: f.qualification, observedBasisIds: [...f.observedBasisIds], evidence: group, contradictions, factors, totalScore,
        explanations: [f.classification === "OBSERVED" ? "CAPTURED_BEHAVIOR_OR_EXACT_QUOTE" : "QUALIFIED_INFERENCE_NOT_OBSERVED", `CATEGORY_${f.category}`,
          `CONFIDENCE_${f.confidence}`, `UNCERTAINTY_${f.uncertainty}`, contradictions.length ? "CONTRADICTORY_INTERPRETATION_PENALTY" : "NO_RECORDED_CONTRADICTION",
          count <= 2 ? "LESS_REPRESENTED_SUBJECT" : "REPEATED_SUBJECT", startMs < endMs ? "SOURCE_INTERVAL_AVAILABLE" : "NO_SOURCE_INTERVAL"] });
    }
  }
  unique(candidates, c => c.id, "highlight.candidates");
  return candidates.sort(scoreOrder);
}
