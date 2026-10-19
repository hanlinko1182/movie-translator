import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { freeze, hash, record } from "../validation";
import { HIGHLIGHTS as H, HIGHLIGHT_RUBRIC, highlightRestrictions, HighlightError, type HighlightCandidate, type HighlightDecision,
  type HighlightPlanPayload, type SyntheticHighlightResolver } from "./contracts";
import { parseHighlightInput, sameHighlightValue } from "./input";
import { resolveHighlightCapture } from "./resolution";
import { extractHighlightCandidates, sourceOrder, scoreOrder, compareHighlightId } from "./candidates";

/** Pure greedy selection. Required uncovered subjects precede score; score,
 * source start/end and code-unit ID order break ties. No optimality is implied. */
export function generateHighlightPlan(value: unknown, resolver: SyntheticHighlightResolver) {
  const input = parseHighlightInput(value), capture = resolveHighlightCapture(input, resolver);
  const candidates = extractHighlightCandidates(capture), policy = input.policy;
  const chosen: HighlightCandidate[] = [], decisions = new Map<string, HighlightDecision>();
  const characters = new Set<string>(), relationships = new Set<string>();
  let totalSourceMs = 0;
  const benefit = (c: HighlightCandidate) => c.characterIds.filter(i => policy.coverage.characterIds.includes(i) && !characters.has(i)).length +
    Number(c.relationshipId !== null && policy.coverage.relationshipIds.includes(c.relationshipId) && !relationships.has(c.relationshipId));
  const pending = [...candidates];
  while (pending.length) {
    pending.sort((a, b) => benefit(b) - benefit(a) || scoreOrder(a, b));
    const c = pending.shift()!, duration = c.endMs - c.startMs;
    let reason: HighlightDecision["reason"] = "SELECTED_BY_RUBRIC";
    if (!c.claimIds.length) reason = "NO_NARRATION_CLAIM";
    else if (!duration) reason = "NO_SOURCE_INTERVAL";
    else if (duration < policy.minClipMs) reason = "BELOW_MIN_DURATION";
    else if (duration > policy.maxClipMs) reason = "ABOVE_MAX_DURATION";
    else if (chosen.some(s => c.startMs === s.startMs && c.endMs === s.endMs)) reason = "DUPLICATE_INTERVAL";
    else if (chosen.some(s => c.startMs < s.endMs && c.endMs > s.startMs)) reason = "OVERLAP";
    else if (chosen.length === policy.maxClips) reason = "CLIP_LIMIT";
    else if (duration + totalSourceMs > policy.maxTotalSourceMs) reason = "DURATION_BUDGET";
    if (reason === "SELECTED_BY_RUBRIC") {
      chosen.push(c); totalSourceMs += duration; c.characterIds.forEach(id => characters.add(id)); if (c.relationshipId) relationships.add(c.relationshipId);
    }
    decisions.set(c.id, { candidateId: c.id, status: reason === "SELECTED_BY_RUBRIC" ? "SELECTED" : "EXCLUDED", reason });
  }
  const chronological = [...chosen].sort(sourceOrder);
  const gaps: HighlightPlanPayload["gaps"] = chronological.slice(1).flatMap((c, i) => chronological[i].endMs < c.startMs ? [{
    afterCandidateId: chronological[i].id, beforeCandidateId: c.id, startMs: chronological[i].endMs, endMs: c.startMs, kind: "INTENTIONAL_SOURCE_OMISSION" as const,
  }] : []);
  const missingCharacterIds = policy.coverage.characterIds.filter(i => !characters.has(i)), missingRelationshipIds = policy.coverage.relationshipIds.filter(i => !relationships.has(i));
  const plan = { schemaVersion: H.plan, input, inputHash: contractHash(H.input, input), restrictions: highlightRestrictions, rubric: HIGHLIGHT_RUBRIC,
    status: chosen.length && !missingCharacterIds.length && !missingRelationshipIds.length ? "PLANNED" as const : "INSUFFICIENT_INFORMATION" as const,
    candidates, decisions: candidates.map(c => decisions.get(c.id)!), sourceOrder: chronological.map(c => c.id),
    presentationOrder: (policy.presentation === "SOURCE_CHRONOLOGY" ? chronological : [...chosen].sort(scoreOrder)).map(c => c.id), gaps, totalSourceMs,
    coverage: { characterIds: [...characters].sort(compareHighlightId), relationshipIds: [...relationships].sort(compareHighlightId), missingCharacterIds, missingRelationshipIds } };
  canonicalJson(plan, H.maxBytes);
  return freeze({ plan, planHash: contractHash(H.plan, plan) });
}
/** Strict parsing requires independent expected input + fixture resolver. Replay
 * rejects rehashed score, evidence, eligibility, interval, selection or order edits. */
export function validateHighlightPlan(value: unknown, expectedInput: unknown, resolver: SyntheticHighlightResolver) {
  try {
    const r = record(JSON.parse(canonicalJson(value, H.maxBytes)), ["plan", "planHash"], "highlight.plan");
    const expected = generateHighlightPlan(expectedInput, resolver);
    if (hash(r.planHash, "highlight.hash") !== contractHash(H.plan, r.plan) || !sameHighlightValue(r, expected)) throw new HighlightError("INVALID_PLAN");
    return expected;
  } catch (e) {
    if (e instanceof HighlightError) throw e;
    throw new HighlightError("INVALID_PLAN");
  }
}
