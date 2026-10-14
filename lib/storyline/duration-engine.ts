import "server-only";
import { canonicalJson, contractHash } from "./canonical";
import { EVENT_KINDS, LIMITS, type Immutable, type StorySourceSnapshot, type StoryScriptVersion, type StoryEvent } from "./contracts";
import { DURATION_ENGINE, type AutoStoryPolicy, type SourceInterval, type StoryComplexityInventory } from "./duration-contracts";
import { readHumanSourceVerification } from "./human-verification";
import type { HumanVerificationState } from "./human-verification-contracts";
import { allClaims, validateStoryEvents } from "./script";
import { anchorKey } from "./source";
import { array, enumeration, fail, freeze, hash, id, integer, interval, literal, record, unique } from "./validation";

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const byId = <T extends { id: string }>(a: T, b: T) => compareText(a.id, b.id);
function refs(value: unknown, max: number, path: string) {
  return [...new Set(array(value, max, path, 1).map(raw => id(raw, path)))].sort();
}
function numbers(value: unknown, fields: string[], path: string, maximum: number, positive = false) {
  const row = record(value, fields, path);
  return Object.fromEntries(fields.map(key => {
    const result = integer(row[key], `${path}.${key}`, maximum);
    if (positive && !result) fail("INVALID_NUMBER", `${path}.${key}`);
    return [key, result];
  }));
}
export function validateAutoStoryPolicy(value: unknown): Immutable<AutoStoryPolicy> {
  canonicalJson(value, LIMITS.receiptBytes);
  const p = "duration.policy", row = record(value, ["id", "coefficientSetId", "calibrationId", "calibrationStatus", "caps", "weightsMs", "evidence", "maxBudgetMs", "runtimeCapPermille", "softFloorMs", "runtimeFloorPermille"], p);
  if (row.calibrationId !== null) fail("INVALID_ENUM", `${p}.calibrationId`);
  const caps = numbers(row.caps, ["events", "characterArcs", "conflictsAndDecisions", "relationshipChanges"], `${p}.caps`, LIMITS.events, true) as AutoStoryPolicy["caps"];
  const weightsMs = numbers(row.weightsMs, ["event", "characterArc", "conflictOrDecision", "relationshipChange"], `${p}.weightsMs`, 60_000, true) as AutoStoryPolicy["weightsMs"];
  const evidence = numbers(row.evidence, ["basePermille", "additionalPermille", "fullCoveragePermille"], `${p}.evidence`, 1000) as AutoStoryPolicy["evidence"];
  if (!evidence.fullCoveragePermille || !evidence.basePermille || evidence.basePermille + evidence.additionalPermille > 1000) fail("INVALID_NUMBER", `${p}.evidence`);
  const result: AutoStoryPolicy = { id: literal(row.id, DURATION_ENGINE.policy, `${p}.id`), coefficientSetId: id(row.coefficientSetId, `${p}.coefficientSetId`),
    calibrationId: null, calibrationStatus: literal(row.calibrationStatus, "UNCALIBRATED", `${p}.calibrationStatus`), caps, weightsMs, evidence,
    maxBudgetMs: integer(row.maxBudgetMs, `${p}.maxBudgetMs`, 3_600_000), runtimeCapPermille: integer(row.runtimeCapPermille, `${p}.runtimeCapPermille`, 1000),
    softFloorMs: integer(row.softFloorMs, `${p}.softFloorMs`, 3_600_000), runtimeFloorPermille: integer(row.runtimeFloorPermille, `${p}.runtimeFloorPermille`, 1000) };
  if (!result.maxBudgetMs || !result.runtimeCapPermille || result.runtimeFloorPermille > result.runtimeCapPermille || result.softFloorMs > result.maxBudgetMs) fail("INVALID_NUMBER", p);
  return freeze(result);
}

/** Half-open source intervals: union overlaps/adjacency once; never use scene count. */
function union(rows: readonly SourceInterval[]): SourceInterval[] {
  const result: SourceInterval[] = [];
  for (const row of [...rows].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)) {
    const previous = result.at(-1);
    if (previous && row.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, row.endMs);
    else result.push({ ...row });
  }
  return result;
}
const duration = (rows: readonly SourceInterval[]) => rows.reduce((total, row) => total + row.endMs - row.startMs, 0);
function evidenceIntervals(event: Immutable<StoryEvent>, source: StorySourceSnapshot, script: StoryScriptVersion) {
  const anchors = allClaims(script).filter(claim => event.claimIds.includes(claim.id)).flatMap(claim => claim.evidence);
  const distinct = [...new Map(anchors.map(anchor => [anchorKey(anchor), anchor])).values()];
  return union(distinct.map(anchor => {
    const segment = source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)!;
    const scene = source.payload.scenes.find(row => row.sequence === anchor.sceneSequence)!;
    return { startMs: Math.max(segment.startMs, scene.startMs), endMs: Math.min(segment.endMs, scene.endMs) };
  }).filter(row => row.endMs > row.startMs));
}

function parseInventory(value: unknown, source: StorySourceSnapshot, script: StoryScriptVersion) {
  canonicalJson(value, DURATION_ENGINE.bytes);
  const row = record(value, ["events", "characterArcs", "visualIntervals"], "inventory");
  // Normalize repeated references in the planning inventory, never rewrite script/source.
  const events: StoryEvent[] = array(row.events, LIMITS.events, "inventory.events").map(raw => {
    const p = "inventory.events", item = record(raw, ["id", "kind", "startMs", "endMs", "claimIds", "precedingEventIds"], p);
    return { id: id(item.id, `${p}.id`), kind: enumeration(item.kind, EVENT_KINDS, `${p}.kind`), startMs: integer(item.startMs, `${p}.startMs`), endMs: integer(item.endMs, `${p}.endMs`),
      claimIds: refs(item.claimIds, LIMITS.claimsPerEvent, `${p}.claimIds`),
      precedingEventIds: array(item.precedingEventIds, LIMITS.events, `${p}.precedingEventIds`).length ? refs(item.precedingEventIds, LIMITS.events, `${p}.precedingEventIds`) : [] };
  }).sort((a, b) => a.startMs - b.startMs || byId(a, b));
  unique(events, row => row.id, "inventory.events");
  // Keep duplicate candidates. Reuse the unchanged M1-A validator for each event,
  // then validate the complete causal graph (M1-A rejects duplicate event content).
  for (const event of events) validateStoryEvents([{ ...event, precedingEventIds: [] }], source, script);
  for (const event of events) for (const eventId of event.precedingEventIds) {
    const previous = events.find(row => row.id === eventId);
    if (!previous || previous.id === event.id || previous.endMs > event.startMs) fail("INFERENCE_INVALID", "inventory.events.precedingEventIds");
  }
  const claims = allClaims(script);
  const characterArcs = array(row.characterArcs, LIMITS.entities, "inventory.characterArcs").map(raw => {
    const p = "inventory.characterArcs", item = record(raw, ["id", "characterId", "states"], p), characterId = id(item.characterId, `${p}.characterId`);
    if (!source.payload.characters.some(row => row.id === characterId)) fail("EVIDENCE_OWNERSHIP", `${p}.characterId`);
    const states = array(item.states, DURATION_ENGINE.arcStates, `${p}.states`, 1).map(raw => {
      const state = record(raw, ["eventId", "claimIds"], `${p}.states`), eventId = id(state.eventId, `${p}.states.eventId`), event = events.find(row => row.id === eventId);
      const claimIds = refs(state.claimIds, LIMITS.claimsPerEvent, `${p}.states.claimIds`);
      if (!event || claimIds.some(claimId => !event.claimIds.includes(claimId))) fail("INVALID_ANCHOR", `${p}.states`);
      if (claimIds.some(claimId => !claims.find(row => row.id === claimId)?.characterRefs.includes(characterId))) fail("EVIDENCE_OWNERSHIP", `${p}.states.claimIds`);
      return { eventId, claimIds };
    }).sort((a, b) => events.find(row => row.id === a.eventId)!.startMs - events.find(row => row.id === b.eventId)!.startMs
      || compareText(a.eventId, b.eventId) || compareText(canonicalJson(a.claimIds), canonicalJson(b.claimIds)));
    return { id: id(item.id, `${p}.id`), characterId, states };
  }).sort(byId);
  unique(characterArcs, row => row.id, "inventory.characterArcs");
  const visualIntervals = array(row.visualIntervals, DURATION_ENGINE.visualIntervals, "inventory.visualIntervals").map(raw => {
    const p = "inventory.visualIntervals", item = record(raw, ["id", "movieId", "sourceSha256", "startMs", "endMs", "availability", "eventIds"], p);
    const movieId = id(item.movieId, `${p}.movieId`), sourceSha256 = hash(item.sourceSha256, `${p}.sourceSha256`);
    if (movieId !== source.payload.movieId) fail("SCOPE_MISMATCH", `${p}.movieId`);
    if (sourceSha256 !== source.payload.media.sha256) fail("STALE_CONTEXT", `${p}.sourceSha256`);
    const startMs = integer(item.startMs, `${p}.startMs`), endMs = integer(item.endMs, `${p}.endMs`);
    interval(startMs, endMs, source.payload.media.durationMs, p);
    const eventIds = refs(item.eventIds, LIMITS.events, `${p}.eventIds`);
    if (eventIds.some(eventId => !events.some(row => row.id === eventId))) fail("INVALID_ANCHOR", `${p}.eventIds`);
    return { id: id(item.id, `${p}.id`), movieId, sourceSha256, startMs, endMs, availability: enumeration(item.availability, ["AVAILABLE", "UNAVAILABLE"], `${p}.availability`), eventIds };
  }).sort(byId);
  unique(visualIntervals, row => row.id, "inventory.visualIntervals");
  return freeze({ events, characterArcs, visualIntervals });
}

/** Read-only capture from M1-C, followed by pure deterministic calculation.
 * No supplied receipt/status object, IO, default policy, or live freshness claim.
 */
export function planStoryDuration(source: StorySourceSnapshot, script: StoryScriptVersion, inventoryValue: unknown, policyValue: unknown, authority: unknown) {
  const review = readHumanSourceVerification(authority, source, script);
  return calculateUntrustedStoryDuration(source, script, inventoryValue, policyValue, review);
}
/** Numerical kernel only: supplied states confer NO authority. Its output always
 * says PROVIDED_IMMUTABLE_CONTEXT_ONLY. The durable service calls it inside its
 * own verified read; callers cannot promote this result into a trusted view. */
export function calculateUntrustedStoryDuration(source: StorySourceSnapshot, script: StoryScriptVersion, inventoryValue: unknown, policyValue: unknown,
  review: { claims: readonly { claimId: string; state: HumanVerificationState; receiptId: string | null }[]; dependencyHash: string }) {
  const inventory = parseInventory(inventoryValue, source, script), policy = validateAutoStoryPolicy(policyValue);
  return calculate(source, script, inventory, policy, review);
}
function calculate(source: StorySourceSnapshot, script: StoryScriptVersion, inventory: Immutable<StoryComplexityInventory>, policy: Immutable<AutoStoryPolicy>, review: {
  claims: readonly { claimId: string; state: HumanVerificationState; receiptId: string | null }[]; dependencyHash: string;
}) {
  const claims = allClaims(script), supportedClaims = new Set(review.claims.filter(row => row.state === "SOURCE_VERIFIED").map(row => row.claimId));
  const groups = new Map<string, typeof inventory.events[number][]>();
  for (const event of inventory.events) {
    const key = canonicalJson({ kind: event.kind, startMs: event.startMs, endMs: event.endMs, claimIds: event.claimIds });
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const representative = new Map([...groups.values()].flatMap(rows => rows.map(row => [row.id, [...rows].sort(byId)[0].id] as const)));
  // Union dependency requirements across aliases: copying an event must not remove
  // a provisional causal prerequisite or count the same event a second time.
  const canonicalEvents = [...groups.values()].map(rows => ({ ...[...rows].sort(byId)[0],
    precedingEventIds: [...new Set(rows.flatMap(row => row.precedingEventIds.map(eventId => representative.get(eventId)!)))].sort() }));
  const supportedCanonical = new Set(canonicalEvents.filter(event => event.claimIds.every(claimId => supportedClaims.has(claimId))).map(row => row.id));
  for (const event of canonicalEvents) if (event.precedingEventIds.some(eventId => !supportedCanonical.has(eventId))) supportedCanonical.delete(event.id);
  const eligible = new Set(inventory.events.filter(event => supportedCanonical.has(representative.get(event.id)!)).map(row => row.id));
  const supportedEvents = canonicalEvents.filter(row => eligible.has(row.id));
  const provisionalEvents = canonicalEvents.filter(row => !eligible.has(row.id));
  const exactDuplicates = [...groups.values()].filter(rows => rows.length > 1).map(rows => ({ representativeId: [...rows].sort(byId)[0].id, candidateIds: rows.map(row => row.id).sort() }));
  const evidence = union(supportedEvents.flatMap(event => evidenceIntervals(event, source, script)));
  const visuals = union(inventory.visualIntervals.filter(row => row.availability === "AVAILABLE").flatMap(visual => {
    const tiedEvidence = union(inventory.events.filter(event => visual.eventIds.includes(event.id) && eligible.has(event.id)).flatMap(event => evidenceIntervals(event, source, script)));
    return tiedEvidence.map(row => ({ startMs: Math.max(row.startMs, visual.startMs), endMs: Math.min(row.endMs, visual.endMs) })).filter(row => row.endMs > row.startMs);
  }));
  const verifiedCharacterArcs: { characterId: string; candidateArcIds: string[]; supportedStateEventIds: string[] }[] = [];
  for (const arc of inventory.characterArcs) {
    const states = [...new Map(arc.states.filter(state => eligible.has(state.eventId)).flatMap(state => {
      const event = inventory.events.find(row => row.id === state.eventId)!;
      const intervals = evidenceIntervals({ ...event, claimIds: state.claimIds }, source, script);
      // Use the state's actual evidence, not an arbitrarily broad event envelope.
      return intervals.length ? [[canonicalJson(intervals), { id: state.eventId,
        startMs: intervals[0].startMs, endMs: intervals.at(-1)!.endMs }] as const] : [];
    })).values()].sort((a, b) => a.startMs - b.startMs || byId(a, b));
    if (states.length < 2 || !states.some((state, index) => states.slice(index + 1).some(next => state.endMs <= next.startMs))) continue;
    const existing = verifiedCharacterArcs.find(row => row.characterId === arc.characterId);
    if (existing) { existing.candidateArcIds.push(arc.id); existing.supportedStateEventIds = [...new Set([...existing.supportedStateEventIds, ...states.map(row => row.id)])].sort(); }
    else verifiedCharacterArcs.push({ characterId: arc.characterId, candidateArcIds: [arc.id], supportedStateEventIds: states.map(row => row.id).sort() });
  }
  verifiedCharacterArcs.sort((a, b) => a.characterId < b.characterId ? -1 : 1);
  const conflicts = supportedEvents.filter(row => row.kind === "CONFLICT").map(row => row.id).sort();
  const decisions = supportedEvents.filter(row => row.kind === "DECISION").map(row => row.id).sort();
  const relationshipChanges = supportedEvents.filter(row => row.kind === "RELATIONSHIP_CHANGE").map(event => ({ eventId: event.id,
    relationshipIds: [...new Set(event.claimIds.map(claimId => claims.find(row => row.id === claimId)!.relationshipRef).filter((ref): ref is string => ref !== null))].sort() }));
  const anchorGroups = new Map<string, string[]>();
  for (const event of canonicalEvents) {
    const keys = [...new Set(event.claimIds.flatMap(claimId => claims.find(row => row.id === claimId)!.evidence.map(anchorKey)))].sort();
    const key = canonicalJson(keys); anchorGroups.set(key, [...(anchorGroups.get(key) ?? []), event.id]);
  }
  const semanticDuplicateReviewGroups = [...anchorGroups.values()].filter(rows => rows.length > 1).map(candidateIds => ({ candidateIds: candidateIds.sort(), reason: "SHARED_ANCHORS_NOT_SEMANTIC_EQUIVALENCE" as const }));
  const runtimeMs = source.payload.media.durationMs, evidenceMs = duration(evidence), visualMs = duration(visuals);
  const features = { events: supportedEvents.length, characterArcs: verifiedCharacterArcs.length, conflictsAndDecisions: conflicts.length + decisions.length, relationshipChanges: relationshipChanges.length };
  const capped = Object.fromEntries(Object.entries(features).map(([key, value]) => [key, Math.min(value, policy.caps[key as keyof typeof features])])) as typeof features;
  const needMs = capped.events * policy.weightsMs.event + capped.characterArcs * policy.weightsMs.characterArc + capped.conflictsAndDecisions * policy.weightsMs.conflictOrDecision + capped.relationshipChanges * policy.weightsMs.relationshipChange;
  const scale = BigInt(1000), threshold = BigInt(runtimeMs) * BigInt(policy.evidence.fullCoveragePermille);
  const factorDenominator = scale * threshold;
  const factorNumerator = BigInt(policy.evidence.basePermille) * threshold + BigInt(policy.evidence.additionalPermille) * (BigInt(evidenceMs) * scale < threshold ? BigInt(evidenceMs) * scale : threshold);
  const runtimeCapMs = Number(BigInt(runtimeMs) * BigInt(policy.runtimeCapPermille) / scale);
  const hardCapMs = Math.min(policy.maxBudgetMs, runtimeCapMs, visualMs);
  const planningCapMs = Number(BigInt(hardCapMs) * factorNumerator / factorDenominator);
  const floorMs = Math.min(policy.softFloorMs, Number(BigInt(runtimeMs) * BigInt(policy.runtimeFloorPermille) / scale), planningCapMs);
  const status = !supportedEvents.length ? "PENDING_SOURCE_VERIFICATION" : !visualMs ? "INSUFFICIENT_VISUAL_COVERAGE" : !planningCapMs ? "INSUFFICIENT_SUPPORTED_MATERIAL" : "BUDGET_AVAILABLE";
  const available = status === "BUDGET_AVAILABLE";
  const limitingFactors = ["UNCALIBRATED_POLICY", "TTS_DURATION_UNAVAILABLE"];
  if (provisionalEvents.length) limitingFactors.push("PROVISIONAL_EVENTS_EXCLUDED");
  if (!features.events) limitingFactors.push("NO_SUPPORTED_EVENTS");
  if (!visualMs) limitingFactors.push("NO_ELIGIBLE_VISUAL_COVERAGE");
  if (factorNumerator < factorDenominator) limitingFactors.push("SPARSE_EVIDENCE");
  if (hardCapMs === runtimeCapMs) limitingFactors.push("SOURCE_RUNTIME_CAP");
  if (hardCapMs === policy.maxBudgetMs) limitingFactors.push("ABSOLUTE_POLICY_CAP");
  if (hardCapMs === visualMs) limitingFactors.push("VISUAL_COVERAGE_CAP");
  if (supportedEvents.length && visualMs && !planningCapMs) limitingFactors.push("SUB_MILLISECOND_PLANNING_CAP");
  if (Object.keys(features).some(key => capped[key as keyof typeof features] < features[key as keyof typeof features])) limitingFactors.push("FEATURE_CONTRIBUTION_CAP");
  if (exactDuplicates.length) limitingFactors.push("EXACT_DUPLICATES_COUNTED_ONCE");
  if (semanticDuplicateReviewGroups.length) limitingFactors.push("SEMANTIC_DUPLICATE_REVIEW_REQUIRED");
  const inputHash = contractHash("story-duration-plan-input-v1", { schemaVersion: DURATION_ENGINE.version,
    projectId: source.payload.projectId, movieId: source.payload.movieId, sourceContentHash: source.sourceContentHash,
    sourceContextHash: source.sourceContextHash, scriptHash: script.scriptHash, verificationDependencyHash: review.dependencyHash, inventory, policy });
  const result = { schemaVersion: DURATION_ENGINE.version, policy, inputHash, contextStatus: "PROVIDED_IMMUTABLE_CONTEXT_ONLY" as const, persisted: false as const, status,
    verificationDependencyHash: review.dependencyHash, candidateInventory: inventory,
    counts: { submittedEvents: inventory.events.length, distinctCandidates: canonicalEvents.length, supportedEvents: features.events, provisionalEvents: provisionalEvents.length },
    supportedEventIds: supportedEvents.map(row => row.id),
    supportedInventory: supportedEvents.map(event => ({ ...event,
      anchorKeys: [...new Set(event.claimIds.flatMap(claimId => claims.find(row => row.id === claimId)!.evidence.map(anchorKey)))].sort(),
      verificationReferences: event.claimIds.map(claimId => ({ claimId, receiptId: review.claims.find(row => row.claimId === claimId)!.receiptId! })),
      evidenceIntervals: evidenceIntervals(event, source, script) })),
    provisionalEvents: provisionalEvents.map(event => ({ eventId: event.id,
      claims: event.claimIds.map(claimId => ({ claimId, state: review.claims.find(row => row.claimId === claimId)!.state })), predecessorBlocked: event.precedingEventIds.some(eventId => !eligible.has(eventId)) })),
    exactDuplicates, semanticDuplicateReviewGroups, verifiedCharacterArcs, conflicts, decisions, relationshipChanges, features, cappedFeatures: capped,
    evidenceCoverage: { intervals: evidence, durationMs: evidenceMs, fraction: { numerator: evidenceMs, denominator: runtimeMs } },
    eligibleVisualCoverage: { intervals: visuals, durationMs: visualMs, suitabilityApproved: false as const },
    budget: { needMs, evidenceFactor: { numerator: Number(factorNumerator), denominator: Number(factorDenominator) },
      hardCapMs: available ? hardCapMs : null, planningCapMs: available ? planningCapMs : null,
      softFloorMs: available ? floorMs : null, suggestedBudgetMs: available ? Math.min(planningCapMs, Math.max(floorMs, needMs)) : null,
      isTarget: false as const, estimatedVoiceDurationMs: null }, limitingFactors };
  canonicalJson(result, DURATION_ENGINE.bytes * 2);
  return freeze(result);
}
