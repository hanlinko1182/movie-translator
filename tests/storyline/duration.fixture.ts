import { createHumanSourceVerificationFoundation } from "../../lib/storyline/human-verification";
import { SOURCE_COMPARISON_RUBRIC, type SourceComparison, type HumanVerificationOutcome } from "../../lib/storyline/human-verification-contracts";
import { verificationBinding } from "../../lib/storyline/verification";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { validateScriptPayload } from "../../lib/storyline/script";
import type { AutoStoryPolicy, StoryComplexityInventory } from "../../lib/storyline/duration-contracts";
import type { StorySourcePayload, StoryScriptPayload } from "../../lib/storyline/contracts";
import { date, eventsFixture, scope, scriptFixture, sourceFixture } from "./fixtures";

// Explicit architecture example, synthetic and UNCALIBRATED; not an application default.
export function durationPolicyFixture(): AutoStoryPolicy {
  return { id: "auto-story-v1", coefficientSetId: "synthetic-architecture-example", calibrationId: null, calibrationStatus: "UNCALIBRATED",
    caps: { events: 40, characterArcs: 6, conflictsAndDecisions: 10, relationshipChanges: 6 },
    weightsMs: { event: 6000, characterArc: 10000, conflictOrDecision: 6000, relationshipChange: 5000 },
    evidence: { basePermille: 650, additionalPermille: 350, fullCoveragePermille: 150 },
    maxBudgetMs: 720000, runtimeCapPermille: 200, softFloorMs: 30000, runtimeFloorPermille: 80 };
}
export function durationFixture(changeSource?: (raw: StorySourcePayload) => void, changeScript?: (raw: StoryScriptPayload) => void) {
  const raw = sourceFixture(); changeSource?.(raw);
  const source = validateSourceSnapshot(raw, scope), payload = scriptFixture(source);
  payload.beats.forEach((beat, index) => {
    beat.startMs = source.payload.transcript.segments[index].startMs;
    beat.endMs = source.payload.transcript.segments[index].endMs;
  });
  changeScript?.(payload);
  const script = validateScriptPayload(payload, source), session = Object.freeze({ synthetic: true });
  const authority = createHumanSourceVerificationFoundation({ scope, now: () => date,
    authority: { resolve: candidate => candidate === session ? { authority: "TRUSTED_LOCAL_OPERATOR", operatorId: "synthetic", auditLabel: "Synthetic comparison only" } : null } });
  function verify(claimId: string, outcome: HumanVerificationOutcome = "SOURCE_VERIFIED") {
    const binding = verificationBinding(claimId, source, script);
    const proposal = authority.propose(source, script, { ...scope, claimId, claimContentHash: binding.claimContentHash,
      sourceContextHash: source.sourceContextHash, scriptHash: script.scriptHash });
    const comparison = Object.fromEntries(Object.keys(SOURCE_COMPARISON_RUBRIC).map(key => [key,
      key === "translationConsistency" && !binding.translationContextRefs.length ? "NOT_APPLICABLE" : "SUPPORTED"])) as SourceComparison;
    if (outcome === "INCONCLUSIVE") comparison.evidenceSufficiency = "INSUFFICIENT";
    if (outcome === "UNSUPPORTED") comparison.observedVsInferred = "CONTRADICTED";
    return authority.issue(authority.authorize(proposal, { proposalHash: proposal.proposalHash,
      chineseEvidenceHash: proposal.chineseEvidenceHash, translationContextHash: proposal.translationContextHash,
      acknowledgedChineseComparison: true, outcome, comparison, rationale: "Synthetic original Chinese comparison" }, session), source, script);
  }
  const inventory: StoryComplexityInventory = { events: eventsFixture().map(event => {
    const segment = source.payload.transcript.segments[event.claimIds[0] === "claim-0" ? 0 : 1];
    return { ...event, startMs: segment.startMs, endMs: segment.endMs };
  }), characterArcs: [], visualIntervals: [{ id: "visual-0", movieId: scope.movieId, sourceSha256: source.payload.media.sha256,
    startMs: 0, endMs: source.payload.media.durationMs, availability: "AVAILABLE", eventIds: ["event-0", "event-1"] }] };
  return { source, script, payload, raw, authority, session, verify, inventory, policy: durationPolicyFixture() };
}
