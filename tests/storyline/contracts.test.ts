// Run: node --conditions=react-server --import tsx tests/storyline/contracts.test.ts
// Synthetic data only; no Prisma, Redis, filesystem media or provider access.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { canonicalJson, contractHash, validateSourceSnapshot, validateScriptPayload, validateVerificationReceipt,
  evaluateSourceReview, createDurationInput, validateDurationOutput, validateStoryEvents, STORYLINE, LIMITS, StorylineContractError } from "../../lib/storyline";
import type { StorySourcePayload, StoryScriptPayload } from "../../lib/storyline/contracts";
import { sourceFixture, scriptFixture, scope, anchor, withInference, receiptFixture, receiptStore, eventsFixture } from "./fixtures";

before(() => { mock.method(globalThis, "fetch", () => { assert.fail("Network calls are forbidden in Storyline contract tests"); }); });
after(() => { mock.restoreAll(); });

const checkedSource = () => validateSourceSnapshot(sourceFixture(), scope);
function setup() { const source = checkedSource(); const payload = scriptFixture(source); return { source, payload, script: validateScriptPayload(payload, source) }; }
function rejects(fn: () => unknown, rule?: string) {
  assert.throws(fn, error => error instanceof StorylineContractError && (rule === undefined || error.rule === rule));
}
function sourceChange(change: (value: StorySourcePayload) => void, rule?: string) {
  const raw = sourceFixture(); change(raw); rejects(() => validateSourceSnapshot(raw, scope), rule);
}
function scriptChange(change: (value: StoryScriptPayload) => void, rule?: string) {
  const { source, payload } = setup(); change(payload); rejects(() => validateScriptPayload(payload, source), rule);
}

test("one scene supports two ordered beats and twelve exact Chinese segments", () => {
  const { source, script } = setup();
  assert.equal(source.payload.transcript.segments.length, 12); assert.equal(source.payload.scenes.length, 1);
  assert.equal(script.payload.beats.length, 2); assert.equal(script.payload.beats[1].claims[0].evidence[0].sceneSequence, 0);
  assert.equal(source.payload.transcript.segments[0].text, "  中文对话 0。\n");
});
test("ALL_CURRENT admits approved, unreviewed and manual needs-review exact targets", () => {
  const { admissions } = checkedSource();
  for (const sequence of [0, 1, 2]) assert.equal(admissions[sequence].status, "ADMITTED");
  const manual = admissions[0]; assert.equal(manual.status, "ADMITTED");
  if (manual.status === "ADMITTED") {
    assert.equal(manual.row.origin, "MANUAL"); assert.equal(manual.row.reviewStatus, "NEEDS_REVIEW");
    assert.equal(manual.row.text, "  မြန်မာစာ 0။\n"); assert.equal(manual.row.revision, 2);
    assert.equal(manual.row.startMs, 0); assert.equal(manual.row.endMs, 2000); assert.equal(manual.row.provider, "synthetic");
  }
});
test("active/manual and resolved QC retained; neither restricts admission", () => {
  const source = checkedSource(), rows = source.payload.translation!.rows;
  assert.equal(rows[0].qcIssues[0].source, "MANUAL"); assert.equal(rows[0].qcIssues[0].resolvedAt, null);
  assert.equal(rows[1].qcIssues[0].resolution, "Synthetic resolution"); assert.ok(rows[1].qcIssues[0].resolvedAt);
  assert.equal(source.admissions[0].status, "ADMITTED"); assert.equal(source.admissions[1].status, "ADMITTED");
});
test("unscanned QC is preserved as null, not a clean QC assertion", () => {
  const raw = sourceFixture(); raw.translation!.qcScannedAt = null; raw.translation!.rows.forEach(row => { row.qcIssues = []; });
  const source = validateSourceSnapshot(raw, scope); assert.equal(source.payload.translation!.qcScannedAt, null);
  assert.equal(source.admissions[0].status, "ADMITTED");
});
test("zero approved translations still permit provisional ALL_CURRENT drafts", () => {
  const raw = sourceFixture(); raw.translation!.rows.forEach(row => { row.reviewStatus = "UNREVIEWED"; row.reviewedAt = null; });
  const source = validateSourceSnapshot(raw, scope), script = validateScriptPayload(scriptFixture(source), source);
  assert.equal(source.admissions[1].status, "ADMITTED"); assert.equal(evaluateSourceReview(source, script).sourceEligible, false);
});
test("missing, stale manual and invalid timing rows remain explicit, never fabricated", () => {
  const source = checkedSource();
  assert.deepEqual(source.admissions[11], { status: "MISSING", sequence: 11, reason: "MISSING", rowId: null });
  assert.equal(source.admissions[9].status, "EXCLUDED_STALE"); assert.equal("reason" in source.admissions[9] && source.admissions[9].reason, "MANUAL_SOURCE_CHANGED");
  assert.equal(source.admissions[10].status, "EXCLUDED_INVALID"); assert.equal(source.payload.translation!.rows.length, 11);
});
test("no translation allows Chinese-only draft but not automatic source approval", () => {
  const raw = sourceFixture(); raw.translation = null; const source = validateSourceSnapshot(raw, scope);
  assert.ok(source.admissions.every(row => row.status === "MISSING"));
  const script = validateScriptPayload(scriptFixture(source), source), review = evaluateSourceReview(source, script);
  assert.equal(review.sourceEligible, false); assert.equal(review.claims[0].verificationStatus, "PENDING_SOURCE_REVIEW");
  const store = receiptStore(source, script); assert.equal(evaluateSourceReview(source, script, store.references, store.lookup).sourceEligible, true);
});
test("equivalent Chinese language identifiers are admitted without rewriting metadata", () => {
  const raw = sourceFixture(); raw.translation!.sourceLanguage = "cmn";
  const source = validateSourceSnapshot(raw, scope); assert.equal(source.admissions[1].status, "ADMITTED");
  assert.equal(source.payload.translation!.sourceLanguage, "cmn"); assert.equal(source.payload.sourceLanguage, "zh");
});
for (const [name, change, reason] of [
  ["stale transcript", (raw: StorySourcePayload) => { raw.translation!.sourceTranscriptId = "old-transcript"; }, "SOURCE_TRANSCRIPT_CHANGED"],
  ["wrong language pair", (raw: StorySourcePayload) => { raw.translation!.targetLanguage = "en"; }, "LANGUAGE_MISMATCH"],
  ["empty target", (raw: StorySourcePayload) => { raw.translation!.rows[1].text = " \n"; }, "EMPTY_TARGET"],
  ["orphan sequence", (raw: StorySourcePayload) => { raw.translation!.rows[1].sequence = 100; }, "ORPHAN_SEQUENCE"],
] as const) test(`${name} is excluded but exact raw context remains frozen`, () => {
  const raw = sourceFixture(); change(raw); const source = validateSourceSnapshot(raw, scope);
  assert.ok(source.admissions.some(row => "reason" in row && row.reason === reason));
});
for (const [name, change] of [
  ["movie", (raw: StorySourcePayload) => { raw.movieId = "movie-newest"; }],
  ["project", (raw: StorySourcePayload) => { raw.projectId = "another-project"; }],
  ["transcript movie", (raw: StorySourcePayload) => { raw.transcript.movieId = "another-movie"; }],
  ["transcript row parent", (raw: StorySourcePayload) => { raw.transcript.segments[0].transcriptId = "another-transcript"; }],
  ["scene movie", (raw: StorySourcePayload) => { raw.scenes[0].movieId = "another-movie"; }],
  ["translation movie", (raw: StorySourcePayload) => { raw.translation!.movieId = "another-movie"; }],
  ["translated row parent", (raw: StorySourcePayload) => { raw.translation!.rows[0].translationId = "another-translation"; }],
  ["QC row parent", (raw: StorySourcePayload) => { raw.translation!.rows[0].qcIssues[0].translatedSegmentId = "another-segment"; }],
  ["character project", (raw: StorySourcePayload) => { raw.characters[0].projectId = "another-project"; }],
] as const) test(`reject wrong ${name} ownership, including newer movie substitution`, () => sourceChange(change, "SCOPE_MISMATCH"));
for (const [name, change, rule] of [
  ["source IDs", (raw: StorySourcePayload) => { raw.transcript.segments[1].id = raw.transcript.segments[0].id; }, "DUPLICATE_ID"],
  ["source sequence", (raw: StorySourcePayload) => { raw.transcript.segments[1].sequence = 0; }, "DUPLICATE_ID"],
  ["translation ID", (raw: StorySourcePayload) => { raw.translation!.rows[1].id = raw.translation!.rows[0].id; raw.translation!.rows[1].qcIssues[0].translatedSegmentId = raw.translation!.rows[0].id; }, "DUPLICATE_ID"],
  ["character ID", (raw: StorySourcePayload) => { raw.characters.push(structuredClone(raw.characters[0])); }, "DUPLICATE_ID"],
  ["QC ID", (raw: StorySourcePayload) => { raw.translation!.rows[1].qcIssues[0].id = "qc-0"; }, "DUPLICATE_ID"],
  ["end after runtime", (raw: StorySourcePayload) => { raw.transcript.segments[11].endMs = 24001; }, "INVALID_INTERVAL"],
  ["negative timestamp", (raw: StorySourcePayload) => { raw.transcript.segments[0].startMs = -1; }, "INVALID_NUMBER"],
  ["scene gap", (raw: StorySourcePayload) => { raw.scenes[0].startMs = 1; }, "INVALID_INTERVAL"],
  ["missing scene reference", (raw: StorySourcePayload) => { raw.characters[0].evidence[0].anchor.sceneSequence = 1; }, "INVALID_ANCHOR"],
] as const) test(`reject invalid ${name}`, () => sourceChange(change, rule));

test("hashing is stable across object keys and canonical set ordering; capture time is not content", () => {
  const raw = sourceFixture(), first = validateSourceSnapshot(raw, scope);
  const reordered = Object.fromEntries(Object.entries(raw).reverse());
  assert.equal(validateSourceSnapshot(reordered, scope).sourceContextHash, first.sourceContextHash);
  raw.translation!.rows.reverse(); raw.capturedAt = "2026-10-02T00:00:00.000Z"; raw.id = "snapshot-two";
  assert.equal(validateSourceSnapshot(raw, scope).sourceContextHash, first.sourceContextHash);
});
for (const [name, change] of [
  ["refinement text without generation change", (raw: StorySourcePayload) => { raw.translation!.rows[1].text += " ပြင်ဆင်ချက်"; raw.translation!.rows[1].origin = "REFINED"; raw.translation!.rows[1].refinementJobId = "refinement-fixture"; }],
  ["approval only", (raw: StorySourcePayload) => { raw.translation!.rows[2].reviewStatus = "APPROVED"; }],
  ["QC resolution only", (raw: StorySourcePayload) => { raw.translation!.rows[0].qcIssues[0].resolvedAt = raw.capturedAt; }],
  ["QC scan state", (raw: StorySourcePayload) => { raw.translation!.qcScannedAt = null; }],
  ["QC audit timestamp", (raw: StorySourcePayload) => { raw.translation!.rows[0].qcIssues[0].updatedAt = "2026-10-02T00:00:00.000Z"; }],
  ["provenance", (raw: StorySourcePayload) => { raw.translation!.rows[2].model = "different-fixture"; }],
  ["revision", (raw: StorySourcePayload) => { raw.translation!.rows[2].revision++; }],
  ["media SHA", (raw: StorySourcePayload) => { raw.media.sha256 = "c".repeat(64); }],
  ["alignment", (raw: StorySourcePayload) => { raw.translation!.rows[2].endMs++; }],
] as const) test(`${name} invalidates context and old scripts`, () => {
  const { source, payload } = setup(); const raw = sourceFixture(); change(raw); const current = validateSourceSnapshot(raw, scope);
  assert.notEqual(current.sourceContextHash, source.sourceContextHash); rejects(() => validateScriptPayload(payload, current), "STALE_CONTEXT");
});
test("validated outputs are detached and deeply frozen without freezing caller data", () => {
  const raw = sourceFixture(), source = validateSourceSnapshot(raw, scope);
  assert.ok(Object.isFrozen(source.payload.translation!.rows[0].qcIssues[0])); assert.equal(Object.isFrozen(raw), false);
  raw.translation!.rows[0].text = "caller change"; assert.notEqual(source.payload.translation!.rows[0].text, "caller change");
});
test("refinement text alone changes content and row hashes with every generation field unchanged", () => {
  const raw = sourceFixture(); raw.translation!.rows[1].origin = "REFINED"; raw.translation!.rows[1].refinementJobId = "retained-job";
  const first = validateSourceSnapshot(raw, scope); raw.translation!.rows[1].text += " ပြင်ဆင်ချက်။";
  const second = validateSourceSnapshot(raw, scope);
  assert.notEqual(first.sourceContentHash, second.sourceContentHash);
  assert.notEqual(first.sourceContextHash, second.sourceContextHash);
  const a = first.admissions[1], b = second.admissions[1]; assert.equal(a.status, "ADMITTED"); assert.equal(b.status, "ADMITTED");
  if (a.status === "ADMITTED" && b.status === "ADMITTED") {
    assert.notEqual(a.rowContextHash, b.rowContextHash); assert.equal(a.row.revision, b.row.revision);
    assert.equal(a.row.refinementJobId, b.row.refinementJobId);
  }
});

test("manual origin, approval and confidence cannot extend character-a beyond segment zero", () => {
  scriptChange(raw => { raw.beats[1].claims[0].characterRefs = ["character-a"]; }, "EVIDENCE_OWNERSHIP");
});
for (const [name, change, rule] of [
  ["cross movie", (raw: StoryScriptPayload) => { raw.beats[0].claims[0].evidence[0].movieId = "other"; }, "INVALID_ANCHOR"],
  ["cross transcript", (raw: StoryScriptPayload) => { raw.beats[0].claims[0].evidence[0].transcriptId = "other"; }, "INVALID_ANCHOR"],
  ["missing scene", (raw: StoryScriptPayload) => { raw.beats[0].claims[0].evidence[0].sceneSequence = 4; }, "INVALID_ANCHOR"],
  ["missing segment", (raw: StoryScriptPayload) => { raw.beats[0].claims[0].evidence[0].segmentSequence = 12; }, "INVALID_ANCHOR"],
  ["wrong character", (raw: StoryScriptPayload) => { raw.beats[0].claims[0].characterRefs = ["unknown-character"]; }, "EVIDENCE_OWNERSHIP"],
  ["increased confidence", (raw: StoryScriptPayload) => { raw.beats[0].claims[0].confidence = "HIGH"; }, "CONFIDENCE_INVALID"],
  ["beat timing", (raw: StoryScriptPayload) => { raw.beats[0].endMs = 1000; }, "INVALID_INTERVAL"],
  ["duplicate claim ID", (raw: StoryScriptPayload) => { raw.beats[1].claims[0].id = "claim-0"; raw.beats[1].narration[0].claimIds = ["claim-0"]; }, "DUPLICATE_ID"],
  ["duplicate beat ID", (raw: StoryScriptPayload) => { raw.beats[1].id = "beat-0"; }, "DUPLICATE_ID"],
  ["beat order", (raw: StoryScriptPayload) => { raw.beats[1].order = 0; }, "INVALID_ORDER"],
  ["narration without claim", (raw: StoryScriptPayload) => { raw.beats[0].narration[0].claimIds = []; }, "SIZE_LIMIT"],
  ["translation as independent anchor", (raw: StoryScriptPayload) => { raw.beats[0].claims[0].evidence = []; }, "SIZE_LIMIT"],
] as const) test(`script rejects ${name}`, () => scriptChange(change, rule));
test("relationship uses its own evidence and both character anchor sets", () => {
  const raw = sourceFixture(); raw.characters.push({ ...structuredClone(raw.characters[0]), id: "character-b" });
  raw.relationships.push({ id: "relationship-ab", ...scope, characterAId: "character-a", characterBId: "character-b", type: "UNKNOWN", summary: "Unknown relationship", confidence: "LOW", evidence: structuredClone(raw.characters[0].evidence) });
  const source = validateSourceSnapshot(raw, scope), payload = scriptFixture(source), claim = payload.beats[0].claims[0];
  claim.characterRefs = ["character-b", "character-a"]; claim.relationshipRef = "relationship-ab";
  assert.ok(validateScriptPayload(payload, source));
  claim.confidence = "HIGH"; rejects(() => validateScriptPayload(payload, source), "CONFIDENCE_INVALID");
  claim.confidence = "LOW"; claim.characterRefs = ["character-a"]; rejects(() => validateScriptPayload(payload, source), "EVIDENCE_OWNERSHIP");
});
test("relationship evidence cannot be borrowed from another relationship or a character", () => {
  const raw = sourceFixture(); raw.characters[0].evidence.push({ ...structuredClone(raw.characters[0].evidence[0]), anchor: anchor(1) });
  raw.characters.push({ ...structuredClone(raw.characters[0]), id: "character-b" });
  raw.relationships.push({ id: "relationship-ab", ...scope, characterAId: "character-a", characterBId: "character-b", type: "FRIEND", summary: "Synthetic relationship", confidence: "LOW", evidence: [structuredClone(raw.characters[0].evidence[0])] });
  const source = validateSourceSnapshot(raw, scope), payload = scriptFixture(source);
  payload.beats[1].claims[0].characterRefs = ["character-a", "character-b"]; payload.beats[1].claims[0].relationshipRef = "relationship-ab";
  rejects(() => validateScriptPayload(payload, source), "EVIDENCE_OWNERSHIP");
});
test("uncertain identity remains LOW even with a HIGH permitted anchor", () => {
  const raw = sourceFixture(); raw.characters[0].uncertain = true; raw.characters[0].evidence[0].confidence = "HIGH";
  const source = validateSourceSnapshot(raw, scope), payload = scriptFixture(source); payload.beats[0].claims[0].confidence = "MEDIUM";
  rejects(() => validateScriptPayload(payload, source), "CONFIDENCE_INVALID");
});
test("excluded stale and invalid translations cannot be cited as admitted context", () => {
  const { source, payload } = setup();
  for (const sequence of [9, 10]) {
    const row = source.admissions[sequence]; assert.ok("rowContextHash" in row);
    payload.beats[1].claims[0].translationContextRefs = [{ translationSegmentId: `target-${sequence}`, rowContextHash: row.rowContextHash }];
    rejects(() => validateScriptPayload(payload, source), "STALE_CONTEXT");
  }
});
test("supported structural inference remains provisional until human verification of basis and inference", () => {
  const source = checkedSource(), script = validateScriptPayload(withInference(scriptFixture(source)), source);
  assert.equal(evaluateSourceReview(source, script).sourceEligible, false);
  const inferred = receiptFixture(source, script, "claim-inferred");
  const partial = evaluateSourceReview(source, script, [{ claimId: inferred.claimId, receiptId: inferred.id }], () => inferred);
  assert.notEqual(partial.claims.find(row => row.claimId === inferred.claimId)!.verificationStatus, "SOURCE_VERIFIED");
  const store = receiptStore(source, script); assert.equal(evaluateSourceReview(source, script, store.references, store.lookup).sourceEligible, true);
});
for (const kind of ["missing-basis", "unqualified", "narration-unqualified", "unsupported-anchor", "cycle", "inferred-chain"] as const) test(`inference rejects ${kind}`, () => {
  const source = checkedSource(), payload = withInference(scriptFixture(source)), claim = payload.beats[0].claims[1];
  assert.equal(claim.kind, "INFERRED"); if (claim.kind !== "INFERRED") return;
  if (kind === "missing-basis") claim.inferenceBasisClaimIds = ["missing"];
  if (kind === "unqualified") claim.qualification = "အမှန်ဖြစ်သည်";
  if (kind === "narration-unqualified") payload.beats[0].narration[1].text = "စိုးရိမ်နေသည်။";
  if (kind === "unsupported-anchor") claim.inferenceBasisClaimIds = ["claim-1"];
  if (kind === "cycle") claim.inferenceBasisClaimIds = [claim.id];
  if (kind === "inferred-chain") {
    payload.beats[0].claims.push({ ...structuredClone(claim), id: "claim-chain", inferenceBasisClaimIds: [claim.id] });
    payload.beats[0].narration.push({ text: "ဖြစ်နိုင်သည်။", claimIds: ["claim-chain"] });
  }
  rejects(() => validateScriptPayload(payload, source), kind === "cycle" ? "INFERENCE_CYCLE" : "INFERENCE_INVALID");
});

test("approved target and clean QC never self-verify; no input status is trusted", () => {
  const { source, script, payload } = setup(); const review = evaluateSourceReview(source, script);
  assert.equal(review.claims[1].verificationStatus, "PROVISIONAL_TRANSLATION_CONTEXT"); assert.equal(review.sourceEligible, false);
  Object.assign(payload.beats[0].claims[0], { verificationStatus: "SOURCE_VERIFIED" });
  rejects(() => validateScriptPayload(payload, source), "UNKNOWN_FIELDS");
});
test("a perfectly shaped forged receipt cannot establish trust without server lookup", () => {
  const { source, script } = setup(), receipt = receiptFixture(source, script);
  assert.ok(validateVerificationReceipt(receipt, source, script));
  rejects(() => evaluateSourceReview(source, script, [{ claimId: receipt.claimId, receiptId: receipt.id }]), "UNTRUSTED_RECEIPT");
  rejects(() => evaluateSourceReview(source, script, [receipt], () => receipt), "UNKNOWN_FIELDS");
});
for (const field of ["claimContentHash", "sourceContextHash", "sourceContentHash", "anchorSetHash", "allowedAnchorSetHash", "qualificationHash"] as const) test(`receipt rejects altered ${field}`, () => {
  const { source, script } = setup(), receipt = receiptFixture(source, script); receipt[field] = "d".repeat(64);
  rejects(() => validateVerificationReceipt(receipt, source, script), "RECEIPT_BINDING_INVALID");
});
for (const kind of ["wrong-movie", "wrong-project", "wrong-row-hash", "missing-row", "wrong-policy", "ai-issuer", "duplicate-row"] as const) test(`receipt rejects ${kind}`, () => {
  const { source, script } = setup(), receipt = receiptFixture(source, script);
  if (kind === "wrong-movie") receipt.movieId = "another-movie";
  if (kind === "wrong-project") receipt.projectId = "another-project";
  if (kind === "wrong-row-hash") receipt.translationContextRefs[0].rowContextHash = "d".repeat(64);
  if (kind === "missing-row") receipt.translationContextRefs = [];
  if (kind === "wrong-policy") Object.assign(receipt, { policyVersion: "other-policy" });
  if (kind === "ai-issuer") Object.assign(receipt, { issuer: "AI" });
  if (kind === "duplicate-row") receipt.translationContextRefs.push(structuredClone(receipt.translationContextRefs[0]));
  rejects(() => validateVerificationReceipt(receipt, source, script));
});
test("narration-only edits invalidate exact claim receipts even with same claim statement", () => {
  const { source, script, payload } = setup(), receipt = receiptFixture(source, script);
  payload.beats[0].narration[0].text += " နောက်ထပ်စာသား။";
  const edited = validateScriptPayload(payload, source); assert.notEqual(edited.scriptHash, script.scriptHash);
  rejects(() => validateVerificationReceipt(receipt, source, edited), "RECEIPT_BINDING_INVALID");
});
test("approval and QC changes stale verification even when claim and target text are unchanged", () => {
  const { source, script } = setup(), receipt = receiptFixture(source, script);
  const raw = sourceFixture(); raw.translation!.rows[0].qcIssues[0].resolvedAt = raw.capturedAt;
  raw.translation!.rows[0].reviewStatus = "APPROVED";
  const nextSource = validateSourceSnapshot(raw, scope), nextScript = validateScriptPayload(scriptFixture(nextSource), nextSource);
  rejects(() => validateVerificationReceipt(receipt, nextSource, nextScript), "RECEIPT_BINDING_INVALID");
});
test("unsupported and inconclusive human outcomes cannot pass source eligibility", () => {
  const { source, script } = setup();
  for (const outcome of ["UNSUPPORTED", "INCONCLUSIVE"] as const) {
    const receipt = receiptFixture(source, script, "claim-0", outcome);
    const review = evaluateSourceReview(source, script, [{ claimId: receipt.claimId, receiptId: receipt.id }], () => receipt);
    assert.equal(review.sourceEligible, false); assert.equal(review.claims[0].reviewStatus, outcome === "UNSUPPORTED" ? "BLOCKED" : "NEEDS_HUMAN_REVIEW");
  }
});
test("human source eligibility is pure and leaves subtitle review/QC/TM semantics unchanged", () => {
  const { source, script } = setup(), before = canonicalJson(source), store = receiptStore(source, script);
  assert.equal(evaluateSourceReview(source, script, store.references, store.lookup).sourceEligible, true);
  assert.equal(canonicalJson(source), before); assert.equal(source.payload.translation!.rows[0].reviewStatus, "NEEDS_REVIEW");
});
test("duplicate receipt references rejected and claimed receipt IDs must match stored records", () => {
  const { source, script } = setup(), store = receiptStore(source, script);
  rejects(() => evaluateSourceReview(source, script, [store.references[0], store.references[0]], store.lookup), "DUPLICATE_ID");
  rejects(() => evaluateSourceReview(source, script, [{ claimId: "claim-0", receiptId: "different-id" }], () => receiptFixture(source, script)), "RECEIPT_BINDING_INVALID");
});
test("forged wrapper context/admissions cannot bypass revalidation", () => {
  const { source, script } = setup();
  rejects(() => evaluateSourceReview({ ...source, sourceContextHash: "e".repeat(64) }, script), "STALE_CONTEXT");
  rejects(() => evaluateSourceReview({ ...source, admissions: [] }, script), "STALE_CONTEXT");
});

const policy = { id: "auto-story-v1", coefficientSetId: "uncalibrated-v1", calibrationId: null };
test("unverified translation-only events contribute zero duration support", () => {
  const { source, script } = setup(), input = createDurationInput(source, script, eventsFixture(), policy);
  assert.deepEqual(input.supportedEventIds, []); assert.deepEqual(input.pendingEventIds, ["event-0", "event-1"]);
});
test("source-verified events and their required predecessors control duration eligibility", () => {
  const { source, script } = setup(), store = receiptStore(source, script);
  const partial = createDurationInput(source, script, eventsFixture(), policy, [store.references[1]], store.lookup);
  assert.deepEqual(partial.supportedEventIds, []);
  const input = createDurationInput(source, script, eventsFixture(), policy, store.references, store.lookup);
  assert.deepEqual(input.supportedEventIds, ["event-0", "event-1"]); assert.equal(input.sourceRuntimeMs, 24000);
});
test("duration output is version/hash bound and does not invent uncalibrated voice estimates", () => {
  const { source, script } = setup(), store = receiptStore(source, script);
  const input = createDurationInput(source, script, eventsFixture(), policy, store.references, store.lookup);
  const output = { schemaVersion: STORYLINE.durationVersion, inputHash: contractHash("story-duration-input-v1", input), policy, status: "BUDGET_AVAILABLE", softFloorMs: 1000, suggestedBudgetMs: 2000, capMs: 5000, estimatedVoiceDurationMs: null };
  assert.ok(validateDurationOutput(output, input));
  rejects(() => validateDurationOutput({ ...output, estimatedVoiceDurationMs: 2000 }, input), "INVALID_NUMBER");
  rejects(() => validateDurationOutput({ ...output, capMs: 24001 }, input), "INVALID_NUMBER");
  rejects(() => validateDurationOutput({ ...output, inputHash: "f".repeat(64) }, input), "STALE_CONTEXT");
});
test("pending duration output has no fabricated budget", () => {
  const { source, script } = setup(), input = createDurationInput(source, script, eventsFixture(), policy);
  const output = { schemaVersion: STORYLINE.durationVersion, inputHash: contractHash("story-duration-input-v1", input), policy, status: "PENDING_SOURCE_VERIFICATION", softFloorMs: null, suggestedBudgetMs: null, capMs: null, estimatedVoiceDurationMs: null };
  assert.ok(validateDurationOutput(output, input));
  rejects(() => validateDurationOutput({ ...output, suggestedBudgetMs: 1000 }, input), "INVALID_NUMBER");
});
test("events reject invalid claims, exact duplicate content and invalid causal references", () => {
  const { source, script } = setup(), events = eventsFixture();
  rejects(() => validateStoryEvents([{ ...events[0], claimIds: ["missing"] }], source, script), "INVALID_ANCHOR");
  rejects(() => validateStoryEvents([events[0], { ...events[0], id: "duplicate-content" }], source, script), "DUPLICATE_ID");
  rejects(() => validateStoryEvents([{ ...events[0], precedingEventIds: ["event-1"] }, events[1]], source, script), "INFERENCE_INVALID");
});

test("Unicode codepoint boundary accepted exactly; oversized narration is rejected", () => {
  const { source, payload } = setup(); payload.beats[0].narration[0].text = "😀".repeat(LIMITS.narrationPerBeat);
  assert.equal(validateScriptPayload(payload, source).payload.beats[0].narration[0].text, payload.beats[0].narration[0].text);
  payload.beats[0].narration[0].text += "က"; rejects(() => validateScriptPayload(payload, source), "SIZE_LIMIT");
});
test("source text boundaries, array limits and missing/unknown fields fail closed", () => {
  const raw = sourceFixture(); raw.transcript.segments[1].text = "က".repeat(LIMITS.text); assert.ok(validateSourceSnapshot(raw, scope));
  raw.transcript.segments[1].text += "က"; rejects(() => validateSourceSnapshot(raw, scope), "SIZE_LIMIT");
  sourceChange(raw => { raw.transcript.segments = Array.from({ length: LIMITS.segments + 1 }, () => raw.transcript.segments[0]); }, "SIZE_LIMIT");
  const { source, payload } = setup(); const missing = { ...payload } as Partial<StoryScriptPayload>; delete missing.style;
  rejects(() => validateScriptPayload(missing, source), "MISSING_FIELD");
  rejects(() => validateScriptPayload({ ...payload, trusted: true }, source), "UNKNOWN_FIELDS");
});
test("canonical serialization preserves exact UTF-8, rejects lossy or executable inputs", () => {
  assert.equal(canonicalJson({ z: "မြန်မာ", a: "中文" }), '{"a":"中文","z":"မြန်မာ"}');
  assert.notEqual(contractHash("test", "é"), contractHash("test", "e\u0301"));
  let called = false; const getter = Object.defineProperty({}, "field", { enumerable: true, get() { called = true; return "private"; } });
  const cycle: { self?: unknown } = {}; cycle.self = cycle;
  for (const value of [getter, cycle, new Date(), { value: undefined }, [Number.NaN], [Number.POSITIVE_INFINITY], [-0], [1.5], [BigInt(1)], Array(1), "\ud800", { toJSON() { called = true; return "private"; } }]) rejects(() => canonicalJson(value));
  assert.equal(called, false); rejects(() => canonicalJson("က".repeat(20), 10), "SIZE_LIMIT");
});
test("validation errors carry static rules and paths without rejected text", () => {
  const { source, payload } = setup(); payload.beats[0].claims[0].statement = "PRIVATE_SYNTHETIC_TEXT".repeat(2000);
  try { validateScriptPayload(payload, source); assert.fail("expected rejection"); } catch (error) {
    assert.ok(error instanceof StorylineContractError); assert.equal(JSON.stringify(error).includes("PRIVATE_SYNTHETIC_TEXT"), false);
    assert.equal(error.message, "Storyline contract validation failed");
  }
});
