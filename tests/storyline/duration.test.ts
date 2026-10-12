import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { readFile } from "node:fs/promises";
import { planStoryDuration, validateAutoStoryPolicy } from "../../lib/storyline/duration-engine";
import { DURATION_ENGINE } from "../../lib/storyline/duration-contracts";
import { canonicalJson } from "../../lib/storyline/canonical";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { validateScriptPayload } from "../../lib/storyline/script";
import { StorylineContractError } from "../../lib/storyline/validation";
import { anchor, scope, scriptFixture, withInference } from "./fixtures";
import { durationFixture } from "./duration.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No network/provider/API requests permitted")); });
after(() => mock.restoreAll());
type Fixture = ReturnType<typeof durationFixture>;
const plan = (f: Fixture) => planStoryDuration(f.source, f.script, f.inventory, f.policy, f.authority);
const verifyAll = (f: Fixture) => f.script.payload.beats.flatMap(row => row.claims).forEach(claim => f.verify(claim.id));
function rejects(run: () => unknown, rule?: string) {
  assert.throws(run, (error: unknown) => error instanceof StorylineContractError && (!rule || error.rule === rule));
}
test("one scene supports multiple independently verified events with explainable architecture formula", () => {
  const f = durationFixture(); verifyAll(f);
  const original = canonicalJson({ source: f.source, script: f.script, inventory: f.inventory, history: f.authority.history() });
  const r = plan(f);
  assert.equal(f.source.payload.scenes.length, 1); assert.equal(r.counts.supportedEvents, 2); assert.equal(r.counts.provisionalEvents, 0);
  assert.equal(r.supportedInventory.length, 2); assert.equal(r.supportedInventory[0].anchorKeys.length, 1);
  assert.ok(r.supportedInventory[0].verificationReferences[0].receiptId.startsWith("verification-"));
  assert.equal(r.evidenceCoverage.durationMs, 4000); assert.equal(r.eligibleVisualCoverage.durationMs, 4000);
  assert.equal(r.budget.needMs, 12000); assert.equal(r.budget.hardCapMs, 4000);
  assert.equal(r.budget.planningCapMs, 4000); assert.equal(r.budget.softFloorMs, 1920); assert.equal(r.budget.suggestedBudgetMs, 4000);
  assert.equal(r.status, "BUDGET_AVAILABLE"); assert.equal(r.budget.isTarget, false);
  assert.equal(r.budget.estimatedVoiceDurationMs, null); assert.equal(r.eligibleVisualCoverage.suitabilityApproved, false);
  assert.equal(r.policy.calibrationStatus, "UNCALIBRATED"); assert.equal(r.contextStatus, "PROVIDED_IMMUTABLE_CONTEXT_ONLY");
  assert.equal(canonicalJson({ source: f.source, script: f.script, inventory: f.inventory, history: f.authority.history() }), original);
  assert.ok(Object.isFrozen(r)); assert.ok(Object.isFrozen(r.candidateInventory));
});
test("approved and human-edited translations alone contribute no supported events or budget", () => {
  const f = durationFixture(), r = plan(f);
  assert.equal(f.source.payload.translation!.rows[0].origin, "MANUAL"); assert.equal(f.source.payload.translation!.rows[1].reviewStatus, "APPROVED");
  assert.equal(r.counts.supportedEvents, 0); assert.equal(r.counts.provisionalEvents, 2);
  assert.equal(r.budget.suggestedBudgetMs, null); assert.equal(r.budget.softFloorMs, null); assert.equal(r.evidenceCoverage.durationMs, 0);
  assert.equal(r.eligibleVisualCoverage.durationMs, 0); assert.equal(r.status, "PENDING_SOURCE_VERIFICATION");
});
test("mixed verification excludes provisional events and coverage", () => {
  const f = durationFixture(); f.verify("claim-0"); const r = plan(f);
  assert.deepEqual(r.supportedEventIds, ["event-0"]); assert.equal(r.counts.provisionalEvents, 1);
  assert.equal(r.evidenceCoverage.durationMs, 2000); assert.equal(r.eligibleVisualCoverage.durationMs, 2000);
  assert.ok(r.limitingFactors.includes("PROVISIONAL_EVENTS_EXCLUDED"));
});
test("every essential claim must be verified; partially verified composites contribute zero", () => {
  const f = durationFixture(); f.verify("claim-0");
  f.inventory.events = [{ ...f.inventory.events[0], endMs: 4000, claimIds: ["claim-0", "claim-1"] }];
  f.inventory.visualIntervals[0].eventIds = ["event-0"];
  assert.equal(plan(f).counts.supportedEvents, 0);
});
test("verified decision remains provisional while its required causal predecessor is unverified", () => {
  const f = durationFixture(); f.verify("claim-1"); f.inventory.events[1].kind = "DECISION";
  const r = plan(f); assert.equal(r.counts.supportedEvents, 0); assert.deepEqual(r.decisions, []);
  assert.equal(r.provisionalEvents[1].predecessorBlocked, true);
});
for (const outcome of ["INCONCLUSIVE", "UNSUPPORTED"] as const) test(`${outcome} claims never increase complexity or coverage`, () => {
  const f = durationFixture(); f.verify("claim-0", outcome); f.verify("claim-1"); const r = plan(f);
  assert.equal(r.counts.supportedEvents, 0); assert.equal(r.evidenceCoverage.durationMs, 0); assert.equal(r.budget.suggestedBudgetMs, null);
  assert.equal(r.provisionalEvents[0].claims[0].state, outcome);
});
test("revocation excludes both the event and its causal dependents", () => {
  const f = durationFixture(), first = f.verify("claim-0"); f.verify("claim-1"); const previous = plan(f);
  f.authority.revoke(f.authority.authorizeRevocation(first.id, "Synthetic withdrawal", f.session), f.source, f.script);
  const r = plan(f); assert.equal(r.counts.supportedEvents, 0); assert.notEqual(r.inputHash, previous.inputHash);
  assert.equal(r.provisionalEvents[0].claims[0].state, "REVOKED");
});
test("superseded success cannot override a later inconclusive receipt", () => {
  const f = durationFixture(), old = f.verify("claim-0"); f.verify("claim-0", "INCONCLUSIVE");
  assert.equal(f.authority.lookup(old.id, f.source, f.script)!.state, "SUPERSEDED");
  assert.equal(plan(f).counts.supportedEvents, 0);
});
for (const change of ["text", "approval", "qc", "media"] as const) test(`${change} changes stale old receipts and change plan identity`, () => {
  const f = durationFixture(); verifyAll(f); const previous = plan(f);
  const raw = structuredClone(f.raw);
  if (change === "text") raw.translation!.rows[0].text += "က";
  if (change === "approval") raw.translation!.rows[0].reviewStatus = "APPROVED";
  if (change === "qc") raw.translation!.rows[0].qcIssues[0].message += " changed";
  if (change === "media") raw.media.sha256 = "d".repeat(64);
  const source = validateSourceSnapshot(raw, scope), script = validateScriptPayload(scriptFixture(source), source);
  const inventory = structuredClone(f.inventory); inventory.visualIntervals[0].sourceSha256 = source.payload.media.sha256;
  const r = planStoryDuration(source, script, inventory, f.policy, f.authority);
  assert.equal(r.counts.supportedEvents, 0); assert.equal(r.provisionalEvents[0].claims[0].state, "STALE");
  assert.notEqual(r.inputHash, previous.inputHash);
});
test("exact duplicate candidates and repeated claim references count once and retain aliases", () => {
  const f = durationFixture(); verifyAll(f);
  f.inventory.events.push({ ...structuredClone(f.inventory.events[0]), id: "alias-event", claimIds: ["claim-0", "claim-0"] });
  const r = plan(f); assert.equal(r.counts.submittedEvents, 3); assert.equal(r.counts.distinctCandidates, 2);
  assert.equal(r.counts.supportedEvents, 2); assert.equal(r.evidenceCoverage.durationMs, 4000);
  assert.equal(r.exactDuplicates.length, 1); assert.equal(r.candidateInventory.events.length, 3);
});
test("exact duplicates cannot shed a provisional causal dependency to bypass verification", () => {
  const f = durationFixture(); f.verify("claim-1");
  f.inventory.events.push({ ...structuredClone(f.inventory.events[1]), id: "alias-event", precedingEventIds: [] });
  assert.equal(plan(f).counts.supportedEvents, 0);
});
test("same anchors with different candidate interpretations remain visible for semantic review", () => {
  const f = durationFixture(); verifyAll(f);
  f.inventory.events.push({ ...structuredClone(f.inventory.events[0]), id: "conflict-candidate", kind: "CONFLICT" });
  const r = plan(f); assert.equal(r.counts.distinctCandidates, 3);
  assert.equal(r.semanticDuplicateReviewGroups.length, 1); assert.equal(r.candidateInventory.events.length, 3);
  assert.ok(r.limitingFactors.includes("SEMANTIC_DUPLICATE_REVIEW_REQUIRED"));
});
test("overlapping claims, source intervals and visual candidates are unioned, never multiplied", () => {
  const f = durationFixture(raw => {
    raw.transcript.segments[0].endMs = 3000; raw.translation!.rows[0].endMs = 3000;
  }); verifyAll(f);
  f.inventory.events[1].precedingEventIds = [];
  f.inventory.visualIntervals.push({ ...f.inventory.visualIntervals[0], id: "visual-duplicate" });
  const r = plan(f); assert.equal(r.evidenceCoverage.durationMs, 4000); assert.equal(r.eligibleVisualCoverage.durationMs, 4000);
  assert.deepEqual(r.evidenceCoverage.intervals, [{ startMs: 0, endMs: 4000 }]);
});
test("visual candidates contribute only the available intersection with their supported evidence", () => {
  const f = durationFixture(); verifyAll(f);
  f.inventory.visualIntervals = [{ ...f.inventory.visualIntervals[0], startMs: 500, endMs: 1500, eventIds: ["event-0"] },
    { ...f.inventory.visualIntervals[0], id: "unavailable", availability: "UNAVAILABLE", eventIds: ["event-1"] }];
  const r = plan(f); assert.equal(r.eligibleVisualCoverage.durationMs, 1000); assert.equal(r.budget.hardCapMs, 1000);
});
for (const mode of ["empty", "unavailable", "outside-evidence"] as const) test(`no visual coverage (${mode}) blocks budget without inventing clips`, () => {
  const f = durationFixture(); verifyAll(f);
  if (mode === "empty") f.inventory.visualIntervals = [];
  if (mode === "unavailable") f.inventory.visualIntervals[0].availability = "UNAVAILABLE";
  if (mode === "outside-evidence") f.inventory.visualIntervals[0].startMs = 10000;
  const r = plan(f); assert.equal(r.status, "INSUFFICIENT_VISUAL_COVERAGE");
  assert.equal(r.budget.suggestedBudgetMs, null); assert.equal(r.budget.softFloorMs, null);
});
test("character arcs need two supported nonoverlapping states owned by that character", () => {
  const f = durationFixture(raw => raw.characters[0].evidence.push({ ...raw.characters[0].evidence[0], anchor: anchor(1) }), payload => {
    payload.beats[1].claims[0].characterRefs = ["character-a"];
  });
  f.inventory.characterArcs = [{ id: "arc", characterId: "character-a", states: [{ eventId: "event-0", claimIds: ["claim-0"] }, { eventId: "event-1", claimIds: ["claim-1"] }] }];
  f.verify("claim-0"); assert.equal(plan(f).verifiedCharacterArcs.length, 0);
  f.verify("claim-1"); const r = plan(f); assert.equal(r.verifiedCharacterArcs.length, 1); assert.equal(r.budget.needMs, 22000);
  f.inventory.characterArcs.push({ ...structuredClone(f.inventory.characterArcs[0]), id: "duplicate-arc" });
  assert.equal(plan(f).features.characterArcs, 1);
});
test("repeating the same temporal state is not a character arc", () => {
  const f = durationFixture(); verifyAll(f);
  f.inventory.characterArcs = [{ id: "arc", characterId: "character-a", states: [{ eventId: "event-0", claimIds: ["claim-0"] }, { eventId: "event-0", claimIds: ["claim-0"] }] }];
  assert.equal(plan(f).verifiedCharacterArcs.length, 0);
});
test("generic plot evidence cannot create a wrong-character arc", () => {
  const f = durationFixture(); verifyAll(f);
  f.inventory.characterArcs = [{ id: "arc", characterId: "character-a", states: [{ eventId: "event-1", claimIds: ["claim-1"] }] }];
  rejects(() => plan(f), "EVIDENCE_OWNERSHIP");
});
test("unsupported psychological motivation adds zero even when the observed basis is verified", () => {
  const f = durationFixture(undefined, payload => Object.assign(payload, withInference(payload)));
  f.verify("claim-0"); f.verify("claim-inferred", "UNSUPPORTED");
  f.inventory.events[0].claimIds = ["claim-0", "claim-inferred"];
  assert.equal(plan(f).counts.supportedEvents, 0);
});
test("relationship change counts only current verified evidence for the correct endpoints", () => {
  const f = durationFixture(raw => {
    raw.characters.push({ ...structuredClone(raw.characters[0]), id: "character-b" });
    raw.relationships = [{ ...scope, id: "relationship", characterAId: "character-a", characterBId: "character-b", type: "UNKNOWN", summary: "Synthetic", confidence: "LOW", evidence: structuredClone(raw.characters[0].evidence) }];
  }, payload => { payload.beats[0].claims[0].characterRefs = ["character-a", "character-b"]; payload.beats[0].claims[0].relationshipRef = "relationship"; });
  f.inventory.events[0].kind = "RELATIONSHIP_CHANGE"; f.verify("claim-0");
  assert.equal(plan(f).features.relationshipChanges, 1);
  const invalid = structuredClone(f.payload); invalid.beats[0].claims[0].characterRefs = ["character-a"];
  rejects(() => planStoryDuration(f.source, { payload: invalid, scriptHash: f.script.scriptHash }, f.inventory, f.policy, f.authority), "EVIDENCE_OWNERSHIP");
});
test("conflicts and decisions are separately explained and contribute once per distinct event", () => {
  const f = durationFixture(); verifyAll(f); f.inventory.events[0].kind = "CONFLICT"; f.inventory.events[1].kind = "DECISION";
  const r = plan(f); assert.deepEqual(r.conflicts, ["event-0"]); assert.deepEqual(r.decisions, ["event-1"]);
  assert.equal(r.features.conflictsAndDecisions, 2); assert.equal(r.budget.needMs, 24000);
});
test("tiny source uses coherent floor/cap without a fabricated minimum duration", () => {
  const f = durationFixture(raw => {
    raw.media.durationMs = 12; raw.scenes[0].endMs = 12;
    raw.transcript.segments.forEach((row, i) => { row.startMs = i; row.endMs = i + 1; });
    raw.translation!.rows.forEach((row, i) => { row.startMs = i; row.endMs = i + 1; });
  }); verifyAll(f);
  const r = plan(f); assert.equal(r.budget.hardCapMs, 2); assert.equal(r.budget.softFloorMs, 0);
  assert.ok(r.budget.suggestedBudgetMs! <= 2);
  f.policy.runtimeCapPermille = 1;
  f.policy.runtimeFloorPermille = 0;
  assert.equal(plan(f).status, "INSUFFICIENT_SUPPORTED_MATERIAL"); assert.equal(plan(f).budget.suggestedBudgetMs, null);
});
test("long sparse sources attenuate the cap with exact rational coverage and never count entire scenes", () => {
  const f = durationFixture(raw => { raw.media.durationMs = 14_400_000; raw.scenes[0].endMs = raw.media.durationMs; }); verifyAll(f);
  const r = plan(f); assert.equal(r.evidenceCoverage.durationMs, 4000); assert.equal(r.eligibleVisualCoverage.durationMs, 4000);
  const expected = Number(BigInt(4000) * (BigInt(650) * BigInt(14_400_000) * BigInt(150) + BigInt(350) * BigInt(4000) * BigInt(1000)) / (BigInt(1000) * BigInt(14_400_000) * BigInt(150)));
  assert.equal(r.budget.planningCapMs, expected); assert.ok(r.limitingFactors.includes("SPARSE_EVIDENCE"));
});
test("absolute cap applies to long sources with enough source-backed visual material", () => {
  const f = durationFixture(raw => {
    raw.media.durationMs = 14_400_000; raw.scenes[0].endMs = raw.media.durationMs;
    raw.transcript.segments.forEach((row, i) => { row.startMs = i * 600000; row.endMs = (i + 1) * 600000; });
    raw.translation!.rows.forEach((row, i) => { row.startMs = i * 600000; row.endMs = (i + 1) * 600000; });
  }); verifyAll(f);
  const r = plan(f); assert.equal(r.eligibleVisualCoverage.durationMs, 1200000);
  assert.equal(r.budget.hardCapMs, 720000); assert.ok(r.limitingFactors.includes("ABSOLUTE_POLICY_CAP"));
  assert.ok(r.budget.suggestedBudgetMs! <= r.budget.planningCapMs!);
});
test("maximum allowed candidate duplicates remain bounded and count once", () => {
  const f = durationFixture(); f.verify("claim-0");
  f.inventory.events = Array.from({ length: 200 }, (_, i) => ({ ...f.inventory.events[0], id: `candidate-${String(i).padStart(3, "0")}` }));
  f.inventory.visualIntervals[0].eventIds = ["candidate-000"];
  const r = plan(f); assert.equal(r.counts.supportedEvents, 1); assert.equal(r.exactDuplicates[0].candidateIds.length, 200);
  f.inventory.events.push({ ...f.inventory.events[0], id: "too-many-events" });
  rejects(() => plan(f), "SIZE_LIMIT");
});
test("explicit feature caps and hard limits bound contributions before arithmetic", () => {
  const f = durationFixture(); verifyAll(f); f.policy.caps.events = 1; f.policy.maxBudgetMs = 1000; f.policy.softFloorMs = 1000;
  const r = plan(f); assert.equal(r.budget.needMs, 6000); assert.equal(r.budget.hardCapMs, 1000);
  assert.ok(r.limitingFactors.includes("FEATURE_CONTRIBUTION_CAP"));
  assert.ok(r.budget.softFloorMs! <= r.budget.suggestedBudgetMs! && r.budget.suggestedBudgetMs! <= r.budget.planningCapMs!);
});
test("stable ordering/hashing and policy numbers participate even under the same coefficient ID", () => {
  const f = durationFixture(); verifyAll(f); const first = plan(f);
  f.inventory.events.reverse(); f.inventory.visualIntervals.reverse();
  assert.equal(plan(f).inputHash, first.inputHash); assert.equal(canonicalJson(plan(f)), canonicalJson(first));
  f.policy.weightsMs.event++;
  assert.notEqual(plan(f).inputHash, first.inputHash);
  const changed = plan(f); f.policy.coefficientSetId = "new-explicit-policy";
  assert.notEqual(plan(f).inputHash, changed.inputHash);
});
test("no events produces no supported budget even with verified script and available movie", () => {
  const f = durationFixture(); verifyAll(f); f.inventory.events = []; f.inventory.visualIntervals = [];
  const r = plan(f); assert.equal(r.counts.supportedEvents, 0); assert.equal(r.counts.provisionalEvents, 0); assert.equal(r.budget.suggestedBudgetMs, null);
});
test("fake authorities, provider review results and stale wrappers cannot establish support", () => {
  const f = durationFixture(); verifyAll(f);
  for (const fake of [null, { ...f.authority }, { evaluate: () => f.authority.evaluate(f.source, f.script) }, f.authority.evaluate(f.source, f.script)]) {
    rejects(() => planStoryDuration(f.source, f.script, f.inventory, f.policy, fake), "UNTRUSTED_RECEIPT");
  }
  rejects(() => planStoryDuration({ ...f.source, sourceContextHash: "d".repeat(64) }, f.script, f.inventory, f.policy, f.authority), "STALE_CONTEXT");
});
test("explicit policy is required, integer bounded, uncalibrated and strictly validated", () => {
  const f = durationFixture();
  rejects(() => planStoryDuration(f.source, f.script, f.inventory, undefined, f.authority));
  for (const value of [{ ...f.policy, calibrationStatus: "APPROVED" }, { ...f.policy, calibrationId: "pretend-calibration" },
    { ...f.policy, runtimeFloorPermille: 1001 }, { ...f.policy, runtimeCapPermille: 0 }, { ...f.policy, softFloorMs: 900000 },
    { ...f.policy, runtimeFloorPermille: 201 }, { ...f.policy, runtimeCapPermille: 1.5 }, { ...f.policy, unknown: true },
    { ...f.policy, evidence: { basePermille: 900, additionalPermille: 900, fullCoveragePermille: 0 } }]) rejects(() => validateAutoStoryPolicy(value));
});
test("bounded inventories reject unknown fields, IDs, unsafe media identity, bounds and causal references", () => {
  const f = durationFixture();
  for (const change of ["duplicate-id", "too-many", "wrong-movie", "wrong-media", "outside-bounds", "bad-predecessor", "unknown-fields"] as const) {
    const inventory = structuredClone(f.inventory);
    if (change === "duplicate-id") inventory.events.push(structuredClone(inventory.events[0]));
    if (change === "too-many") inventory.visualIntervals = Array.from({ length: DURATION_ENGINE.visualIntervals + 1 }, () => inventory.visualIntervals[0]);
    if (change === "wrong-movie") inventory.visualIntervals[0].movieId = "other-movie";
    if (change === "wrong-media") inventory.visualIntervals[0].sourceSha256 = "d".repeat(64);
    if (change === "outside-bounds") inventory.visualIntervals[0].endMs++;
    if (change === "bad-predecessor") inventory.events[0].precedingEventIds = ["event-1"];
    if (change === "unknown-fields") Object.assign(inventory, { verified: true });
    rejects(() => planStoryDuration(f.source, f.script, inventory, f.policy, f.authority));
  }
});
test("duration planning is server-only, unwired, read-only and has no processing/provider imports", async () => {
  const code = await readFile("lib/storyline/duration-engine.ts", "utf8");
  assert.match(code, /^import "server-only";/);
  assert.doesNotMatch(code, /\bfetch\s*\(|@\/lib\/(?:prisma|storage|queue)|prepareStorylineSource|use server|use client|console\./);
});
