import "server-only";
import { canonicalJson, contractHash } from "./canonical";
import { LIMITS, STORYLINE, type AutoDurationInput, type AutoDurationOutput, type AutoDurationPolicyIdentity,
  type StorySourceSnapshot, type StoryScriptVersion, type TrustedReceiptLookup } from "./contracts";
import { validateStoryEvents } from "./script";
import { evaluateSourceReview } from "./verification";
import { enumeration, fail, freeze, hash, id, integer, literal, nullable, record } from "./validation";

export function validateDurationPolicy(value: unknown): AutoDurationPolicyIdentity {
  const row = record(value, ["id", "coefficientSetId", "calibrationId"], "duration.policy");
  return freeze({ id: literal(row.id, "auto-story-v1", "duration.policy.id"), coefficientSetId: id(row.coefficientSetId, "duration.policy.coefficientSetId"), calibrationId: nullable(row.calibrationId, value => id(value, "duration.policy.calibrationId")) });
}

/** Eligible event identity only. No unapproved numeric coefficients/voice rate are implemented. */
export function createDurationInput(source: StorySourceSnapshot, script: StoryScriptVersion, eventsValue: unknown, policyValue: unknown, references: unknown = [], lookup?: TrustedReceiptLookup): AutoDurationInput {
  const review = evaluateSourceReview(source, script, references, lookup), events = validateStoryEvents(eventsValue, source, script);
  const supported = new Set(review.claims.filter(row => row.verificationStatus === "SOURCE_VERIFIED" && row.reviewStatus === "ACCEPTED").map(row => row.claimId));
  const eligible = new Set(events.filter(event => event.claimIds.every(id => supported.has(id))).map(event => event.id));
  // Causal dependents cannot count while any required predecessor is provisional.
  for (const event of events) if (event.precedingEventIds.some(id => !eligible.has(id))) eligible.delete(event.id);
  return freeze({ schemaVersion: STORYLINE.durationVersion, mode: STORYLINE.durationMode, sourceContextHash: source.sourceContextHash, scriptHash: script.scriptHash,
    verificationDependencyHash: review.dependencyHash, policy: validateDurationPolicy(policyValue), sourceRuntimeMs: source.payload.media.durationMs,
    supportedEventIds: events.filter(event => eligible.has(event.id)).map(event => event.id), pendingEventIds: events.filter(event => !eligible.has(event.id)).map(event => event.id) });
}

/** Coherence checks for a future approved duration engine; this does not compute its budget. */
export function validateDurationOutput(value: unknown, input: AutoDurationInput): AutoDurationOutput {
  canonicalJson(value, LIMITS.receiptBytes);
  const row = record(value, ["schemaVersion", "inputHash", "policy", "status", "softFloorMs", "capMs", "suggestedBudgetMs", "estimatedVoiceDurationMs"], "duration");
  const result = {
    schemaVersion: literal(row.schemaVersion, STORYLINE.durationVersion, "duration.schemaVersion"), inputHash: hash(row.inputHash, "duration.inputHash"), policy: validateDurationPolicy(row.policy), status: enumeration(row.status, ["PENDING_SOURCE_VERIFICATION", "BUDGET_AVAILABLE"], "duration.status"),
    softFloorMs: nullable(row.softFloorMs, value => integer(value, "duration.softFloorMs")), capMs: nullable(row.capMs, value => integer(value, "duration.capMs")), suggestedBudgetMs: nullable(row.suggestedBudgetMs, value => integer(value, "duration.suggestedBudgetMs")), estimatedVoiceDurationMs: nullable(row.estimatedVoiceDurationMs, value => integer(value, "duration.estimatedVoiceDurationMs")),
  };
  if (result.inputHash !== contractHash("story-duration-input-v1", input) || canonicalJson(result.policy) !== canonicalJson(input.policy)) fail("STALE_CONTEXT", "duration.inputHash");
  if (result.estimatedVoiceDurationMs !== null && input.policy.calibrationId === null) fail("INVALID_NUMBER", "duration.estimatedVoiceDurationMs");
  if (result.status === "PENDING_SOURCE_VERIFICATION") {
    if ([result.softFloorMs, result.capMs, result.suggestedBudgetMs, result.estimatedVoiceDurationMs].some(value => value !== null)) fail("INVALID_NUMBER", "duration");
  } else if (!input.supportedEventIds.length || result.softFloorMs === null || result.capMs === null || result.suggestedBudgetMs === null || result.softFloorMs > result.suggestedBudgetMs || result.suggestedBudgetMs > result.capMs || result.capMs > input.sourceRuntimeMs) fail("INVALID_NUMBER", "duration");
  return freeze(result);
}
