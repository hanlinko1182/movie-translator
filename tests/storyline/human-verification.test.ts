import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { readFile } from "node:fs/promises";
import { canonicalJson } from "../../lib/storyline/canonical";
import type { StoryScriptVersion, StorySourceSnapshot } from "../../lib/storyline/contracts";
import { HUMAN_VERIFICATION, SOURCE_COMPARISON_RUBRIC, type AuthorizedHumanDecision,
  type HumanVerificationDecision, type SourceComparison, type SourceVerificationProposal } from "../../lib/storyline/human-verification-contracts";
import { createHumanSourceVerificationFoundation } from "../../lib/storyline/human-verification";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { validateScriptPayload } from "../../lib/storyline/script";
import { StorylineContractError } from "../../lib/storyline/validation";
import { verificationBinding } from "../../lib/storyline/verification";
import { anchor, date, eventsFixture, receiptFixture, scope, scriptFixture, sourceFixture, withInference } from "./fixtures";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No provider or API calls permitted")); });
after(() => mock.restoreAll());
const session = Object.freeze({ syntheticServerSession: true });
function foundation(available = true) {
  let time = date;
  const service = createHumanSourceVerificationFoundation({ scope, now: () => time,
    authority: available ? { resolve: candidate => candidate === session
      ? { authority: "TRUSTED_LOCAL_OPERATOR", operatorId: "synthetic-human", auditLabel: "Synthetic Chinese source reviewer" } : null } : null });
  return { service, setTime: (value: string) => { time = value; } };
}
function setup(inferred = false) {
  const source = validateSourceSnapshot(sourceFixture(), scope);
  const payload = inferred ? withInference(scriptFixture(source)) : scriptFixture(source);
  return { source, payload, script: validateScriptPayload(payload, source), ...foundation() };
}
type Service = ReturnType<typeof foundation>["service"];
function request(source: StorySourceSnapshot, script: StoryScriptVersion, claimId = "claim-0") {
  return { ...scope, claimId, claimContentHash: verificationBinding(claimId, source, script).claimContentHash,
    sourceContextHash: source.sourceContextHash, scriptHash: script.scriptHash };
}
function decision(proposal: SourceVerificationProposal, outcome: HumanVerificationDecision["outcome"] = "SOURCE_VERIFIED"): HumanVerificationDecision {
  const comparison = Object.fromEntries(Object.keys(SOURCE_COMPARISON_RUBRIC).map(key => [key,
    key === "translationConsistency" && !proposal.binding.translationContextRefs.length ? "NOT_APPLICABLE" : "SUPPORTED"])) as SourceComparison;
  if (outcome === "INCONCLUSIVE") comparison.evidenceSufficiency = "INSUFFICIENT";
  if (outcome === "UNSUPPORTED") comparison.observedVsInferred = "CONTRADICTED";
  return { proposalHash: proposal.proposalHash, chineseEvidenceHash: proposal.chineseEvidenceHash,
    translationContextHash: proposal.translationContextHash, acknowledgedChineseComparison: true,
    outcome, comparison, rationale: "Synthetic explicit comparison against Chinese evidence" };
}
function issue(service: Service, source: StorySourceSnapshot, script: StoryScriptVersion, claimId = "claim-0", outcome: HumanVerificationDecision["outcome"] = "SOURCE_VERIFIED") {
  const proposal = service.propose(source, script, request(source, script, claimId));
  return service.issue(service.authorize(proposal, decision(proposal, outcome), session), source, script);
}
function rejects(run: () => unknown, rule?: string) {
  assert.throws(run, (error: unknown) => error instanceof StorylineContractError && (!rule || error.rule === rule));
}

test("valid explicit human comparison verifies unapproved MANUAL context without changing source/subtitle/QC", () => {
  const { source, script, service } = setup(), original = canonicalJson({ source, script });
  const pending = service.evaluate(source, script, eventsFixture());
  assert.equal(pending.draftContinuation, true); assert.equal(pending.scriptApproval.sourceEligible, false);
  assert.deepEqual(pending.supportedEventIds, []); assert.equal(pending.voice.eligible, false);
  const entry = issue(service, source, script);
  assert.equal(entry.outcome, "SOURCE_VERIFIED"); assert.equal(entry.persisted, false);
  assert.equal(entry.operator.authority, "TRUSTED_LOCAL_OPERATOR");
  assert.equal(entry.reviewedAt, date); assert.equal(entry.proposal.binding.projectId, scope.projectId);
  assert.equal(entry.proposal.binding.movieId, scope.movieId);
  assert.equal(entry.proposal.binding.claimContentHash, verificationBinding("claim-0", source, script).claimContentHash);
  assert.deepEqual(entry.proposal.binding.translationContextRefs, script.payload.beats[0].claims[0].translationContextRefs);
  assert.deepEqual(service.evaluate(source, script, eventsFixture()).supportedEventIds, ["event-0"]);
  assert.equal(source.admissions[0].status, "ADMITTED");
  assert.equal(source.payload.translation!.rows[0].reviewStatus, "NEEDS_REVIEW");
  assert.equal(canonicalJson({ source, script }), original);
  assert.ok(Object.isFrozen(entry)); assert.ok(Object.isFrozen(service.history()));
});
test("all material claims need comparison; source eligibility is not final script or voice approval", () => {
  const { source, script, service } = setup();
  issue(service, source, script); issue(service, source, script, "claim-1");
  const result = service.evaluate(source, script, eventsFixture());
  assert.equal(result.scriptApproval.sourceEligible, true); assert.equal(result.scriptApproval.approved, false);
  assert.equal(result.voice.sourceEligible, true); assert.equal(result.voice.eligible, false);
  assert.deepEqual(result.supportedEventIds, ["event-0", "event-1"]);
});
test("no authority adapter, label-only sessions and provider acceptance cannot authorize", () => {
  const { source, script } = setup(), { service } = foundation(false);
  assert.equal(service.capability.operatorAuthority, "UNAVAILABLE");
  const proposal = service.propose(source, script, request(source, script));
  rejects(() => service.authorize(proposal, decision(proposal), { auditLabel: "human" }), "UNTRUSTED_RECEIPT");
  const trusted = foundation().service, p = trusted.propose(source, script, request(source, script));
  for (const fake of [{ auditLabel: "human" }, { accepted: true, issuer: "AI" }, structuredClone(session), null]) {
    rejects(() => trusted.authorize(p, decision(p), fake), "UNTRUSTED_RECEIPT");
  }
  assert.equal(trusted.history().length, 0);
});
test("authenticated audit kind is accepted only from the configured server authority", () => {
  const { source, script } = setup();
  const service = createHumanSourceVerificationFoundation({ scope, now: () => date,
    authority: { resolve: value => value === session ? { authority: "AUTHENTICATED_OPERATOR", operatorId: "synthetic-authenticated-id", auditLabel: "Synthetic fixture only" } : null } });
  assert.equal(issue(service, source, script).operator.authority, "AUTHENTICATED_OPERATOR");
});
test("approved-but-mistranslated context is not verified and explicit contradiction blocks issuance", () => {
  const { source, script, service } = setup();
  const p = service.propose(source, script, request(source, script, "claim-1")), d = decision(p);
  assert.equal(source.payload.translation!.rows[1].reviewStatus, "APPROVED");
  d.comparison.translationConsistency = "CONTRADICTED";
  rejects(() => service.authorize(p, d, session), "UNTRUSTED_RECEIPT");
  d.outcome = "UNSUPPORTED";
  service.issue(service.authorize(p, d, session), source, script);
  assert.equal(service.evaluate(source, script).claims[1].state, "UNSUPPORTED");
});
test("MANUAL unsupported psychology is blocked despite cautious wording and model confidence", () => {
  const { source, script, service } = setup(true);
  issue(service, source, script, "claim-0");
  const p = service.propose(source, script, request(source, script, "claim-inferred")), d = decision(p);
  d.comparison.observedVsInferred = "CONTRADICTED";
  rejects(() => service.authorize(p, d, session), "UNTRUSTED_RECEIPT");
  d.outcome = "UNSUPPORTED"; service.issue(service.authorize(p, d, session), source, script);
  assert.equal(service.evaluate(source, script).claims.find(row => row.claimId === "claim-inferred")!.state, "UNSUPPORTED");
});
test("supported inference requires current verified observed basis plus separate qualified comparison", () => {
  const { source, script, service } = setup(true);
  const p = service.propose(source, script, request(source, script, "claim-inferred"));
  rejects(() => service.authorize(p, decision(p), session), "INFERENCE_INVALID");
  const observed = issue(service, source, script);
  const inferred = issue(service, source, script, "claim-inferred");
  assert.deepEqual(inferred.basisReceiptHashes, [{ claimId: "claim-0", receiptHash: observed.entryHash }]);
  assert.ok(inferred.proposal.binding.qualificationHash);
  assert.equal(service.lookup(inferred.id, source, script)!.state, "SOURCE_VERIFIED");
  const revoke = service.authorizeRevocation(observed.id, "Synthetic basis withdrawn", session);
  service.revoke(revoke, source, script);
  assert.equal(service.lookup(inferred.id, source, script)!.state, "STALE");
});
test("new basis comparison does not silently reauthorize an old inference receipt", () => {
  const { source, script, service } = setup(true);
  issue(service, source, script); const inferred = issue(service, source, script, "claim-inferred");
  issue(service, source, script);
  assert.equal(service.lookup(inferred.id, source, script)!.state, "STALE");
});
for (const outcome of ["INCONCLUSIVE", "UNSUPPORTED"] as const) test(`${outcome} cannot count events or approve script/voice`, () => {
  const { source, script, service } = setup(); issue(service, source, script, "claim-0", outcome);
  const result = service.evaluate(source, script, eventsFixture());
  assert.equal(result.claims[0].state, outcome); assert.deepEqual(result.supportedEventIds, []);
  assert.equal(result.scriptApproval.sourceEligible, false); assert.equal(result.voice.eligible, false);
});
test("Chinese-only context is allowed with explicit source comparison, not invented translation", () => {
  const raw = sourceFixture(); raw.translation = null;
  const source = validateSourceSnapshot(raw, scope), script = validateScriptPayload(scriptFixture(source), source), { service } = foundation();
  const entry = issue(service, source, script);
  assert.deepEqual(entry.proposal.binding.translationContextRefs, []);
  assert.equal(entry.comparison!.translationConsistency, "NOT_APPLICABLE");
});
test("wrong character, cross-movie and invalid scene evidence cannot be waived by a human", () => {
  for (const bad of ["character", "movie", "scene", "segment", "motivation", "cycle"] as const) {
    const { source, payload, service } = setup(true);
    const claim = payload.beats[0].claims[0];
    if (bad === "character") claim.evidence = [anchor(1)];
    if (bad === "movie") claim.evidence[0].movieId = "other-movie";
    if (bad === "scene") claim.evidence[0].sceneSequence = 99;
    if (bad === "segment") claim.evidence[0].segmentSequence = 99;
    if (bad === "motivation" || bad === "cycle") {
      const inferred = payload.beats[0].claims[1]; assert.equal(inferred.kind, "INFERRED");
      if (inferred.kind === "INFERRED") {
        if (bad === "motivation") inferred.inferenceBasisClaimIds = ["unknown-basis"];
        else inferred.inferenceBasisClaimIds = [inferred.id];
      }
    }
    rejects(() => service.propose(source, { payload, scriptHash: "a".repeat(64) }, { ...scope, claimId: "claim-0", claimContentHash: "a".repeat(64), sourceContextHash: source.sourceContextHash, scriptHash: "a".repeat(64) }));
    assert.equal(service.history().length, 0);
  }
});
test("relationship ownership cannot borrow generic or endpoint-only anchors", () => {
  const raw = sourceFixture(); raw.characters.push({ ...structuredClone(raw.characters[0]), id: "character-b" });
  raw.relationships = [{ ...scope, id: "relationship", characterAId: "character-a", characterBId: "character-b", type: "UNKNOWN", summary: "Synthetic", confidence: "LOW", evidence: structuredClone(raw.characters[0].evidence) }];
  const source = validateSourceSnapshot(raw, scope), payload = scriptFixture(source), claim = payload.beats[0].claims[0];
  claim.characterRefs = ["character-a", "character-b"]; claim.relationshipRef = "relationship";
  const script = validateScriptPayload(payload, source), { service } = foundation();
  assert.equal(issue(service, source, script).outcome, "SOURCE_VERIFIED");
  claim.evidence = [anchor(1)];
  rejects(() => service.propose(source, { payload, scriptHash: script.scriptHash }, request(source, script)), "EVIDENCE_OWNERSHIP");
});
for (const key of ["claimContentHash", "sourceContextHash", "scriptHash"] as const) test(`stale ${key} rejected before proposal`, () => {
  const { source, script, service } = setup(), value = request(source, script); value[key] = "d".repeat(64);
  rejects(() => service.propose(source, script, value), "STALE_CONTEXT");
});
test("exact scope and provided immutable wrapper hashes are mandatory", () => {
  const { source, script, service } = setup();
  for (const key of ["projectId", "movieId"] as const) rejects(() => service.propose(source, script, { ...request(source, script), [key]: "wrong" }), "SCOPE_MISMATCH");
  rejects(() => service.propose({ ...source, sourceContextHash: "d".repeat(64) }, script, request(source, script)), "STALE_CONTEXT");
});
for (const change of ["text", "approval", "qc", "alignment", "source", "claim", "narration"] as const) test(`${change} change stales receipt and pending authorization`, () => {
  const { source, script, service } = setup(), entry = issue(service, source, script);
  const p = service.propose(source, script, request(source, script)), authorized = service.authorize(p, decision(p), session);
  const raw = sourceFixture();
  if (change === "text") raw.translation!.rows[0].text += "က";
  if (change === "approval") raw.translation!.rows[0].reviewStatus = "APPROVED";
  if (change === "qc") raw.translation!.rows[0].qcIssues[0].message += " changed";
  if (change === "alignment") raw.translation!.rows[0].endMs++;
  if (change === "source") raw.media.sha256 = "d".repeat(64);
  const nextSource = validateSourceSnapshot(raw, scope), payload = scriptFixture(nextSource);
  if (change === "claim") payload.beats[0].claims[0].statement += " changed";
  if (change === "narration") payload.beats[0].narration[0].text += "က";
  const nextScript = validateScriptPayload(payload, nextSource);
  assert.equal(service.lookup(entry.id, nextSource, nextScript)!.state, "STALE");
  rejects(() => service.issue(authorized, nextSource, nextScript), "STALE_CONTEXT");
  assert.equal(service.history().length, 1);
});
test("revocation and supersession are append-only; old IDs never authorize the current view", () => {
  const { source, script, service } = setup(), first = issue(service, source, script), original = canonicalJson(first);
  const revoked = service.revoke(service.authorizeRevocation(first.id, "Synthetic withdrawal", session), source, script);
  assert.equal(revoked.outcome, "REVOKED"); assert.equal(revoked.previousEntryId, first.id);
  assert.equal(service.lookup(first.id, source, script)!.state, "SUPERSEDED");
  assert.equal(service.evaluate(source, script).claims[0].state, "REVOKED");
  assert.equal(canonicalJson(first), original);
  const next = issue(service, source, script);
  assert.equal(next.previousEntryId, revoked.id); assert.equal(next.previousLedgerHash, revoked.entryHash);
  assert.equal(service.lookup(revoked.id, source, script)!.state, "SUPERSEDED");
  assert.equal(service.history().length, 3);
  rejects(() => service.authorizeRevocation(first.id, "old", session), "UNTRUSTED_RECEIPT");
});
test("a stale receipt can still be explicitly revoked without rewriting its historical context", () => {
  const { source, script, service } = setup(), entry = issue(service, source, script);
  const raw = sourceFixture(); raw.translation!.rows[0].text += "က";
  const nextSource = validateSourceSnapshot(raw, scope), nextScript = validateScriptPayload(scriptFixture(nextSource), nextSource);
  const revoked = service.revoke(service.authorizeRevocation(entry.id, "Stale context withdrawal", session), nextSource, nextScript);
  assert.equal(revoked.proposal.binding.sourceContextHash, source.sourceContextHash);
  assert.equal(service.evaluate(nextSource, nextScript).claims[0].state, "REVOKED");
});
test("forged proposals, receipts, tokens and caller lookups cannot enter authoritative state", () => {
  const { source, script, service } = setup(), p = service.propose(source, script, request(source, script));
  const forged = receiptFixture(source, script);
  rejects(() => service.authorize(structuredClone(p), decision(p), session), "UNTRUSTED_RECEIPT");
  rejects(() => service.issue(forged as unknown as AuthorizedHumanDecision, source, script), "UNTRUSTED_RECEIPT");
  rejects(() => service.issue({} as AuthorizedHumanDecision, source, script), "UNTRUSTED_RECEIPT");
  assert.equal(service.lookup(forged.id, source, script), undefined);
  const auth = service.authorize(p, decision(p), session);
  rejects(() => service.issue(structuredClone(auth), source, script), "UNTRUSTED_RECEIPT");
  const other = foundation().service;
  rejects(() => other.issue(auth, source, script), "UNTRUSTED_RECEIPT");
  service.issue(auth, source, script);
  rejects(() => service.issue(auth, source, script), "UNTRUSTED_RECEIPT");
});
test("ledger fencing prevents double issuance and supersession races", () => {
  const { source, script, service } = setup(), p = service.propose(source, script, request(source, script));
  const first = service.authorize(p, decision(p), session), second = service.authorize(p, decision(p), session);
  service.issue(first, source, script);
  rejects(() => service.issue(second, source, script), "STALE_CONTEXT");
  assert.equal(service.history().length, 1);
});
test("identical synthetic inputs, decisions, clock and ledger yield stable immutable identities", () => {
  const first = setup(), second = setup();
  const a = issue(first.service, first.source, first.script), b = issue(second.service, second.source, second.script);
  assert.equal(a.entryHash, b.entryHash); assert.equal(a.id, b.id);
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(first.service.evaluate(first.source, first.script).dependencyHash, second.service.evaluate(second.source, second.script).dependencyHash);
});
test("missing/inconclusive basis cannot support psychological inference and source status changes dependency identity", () => {
  const { source, script, service } = setup(true), before = service.evaluate(source, script).dependencyHash;
  issue(service, source, script, "claim-0", "INCONCLUSIVE");
  const p = service.propose(source, script, request(source, script, "claim-inferred"));
  rejects(() => service.authorize(p, decision(p), session), "INFERENCE_INVALID");
  assert.notEqual(service.evaluate(source, script).dependencyHash, before);
});
test("a failed superseding decision leaves prior authoritative receipt intact", () => {
  const { source, script, service } = setup(), entry = issue(service, source, script);
  const p = service.propose(source, script, request(source, script)), d = decision(p);
  d.comparison.evidenceSufficiency = "INSUFFICIENT";
  rejects(() => service.authorize(p, d, session), "UNTRUSTED_RECEIPT");
  assert.equal(service.lookup(entry.id, source, script)!.state, "SOURCE_VERIFIED");
  assert.equal(service.history().length, 1);
});
test("authorization expires and rejects backward clocks without appending state", () => {
  for (const delta of [HUMAN_VERIFICATION.decisionTtlMs + 1, -1]) {
    const { source, script, service, setTime } = setup(), p = service.propose(source, script, request(source, script));
    const auth = service.authorize(p, decision(p), session); setTime(new Date(Date.parse(date) + delta).toISOString());
    rejects(() => service.issue(auth, source, script), "STALE_CONTEXT");
    assert.equal(service.history().length, 0);
  }
});
test("comparison hashes, acknowledgement, strict fields and per-rule dispositions are required", () => {
  const { source, script, service } = setup(), p = service.propose(source, script, request(source, script));
  for (const key of ["proposalHash", "chineseEvidenceHash", "translationContextHash"] as const) {
    rejects(() => service.authorize(p, { ...decision(p), [key]: "d".repeat(64) }, session), "RECEIPT_BINDING_INVALID");
  }
  rejects(() => service.authorize(p, { ...decision(p), acknowledgedChineseComparison: false }, session), "UNTRUSTED_RECEIPT");
  rejects(() => service.authorize(p, { ...decision(p), issuer: "HUMAN" }, session), "UNKNOWN_FIELDS");
  rejects(() => service.authorize(p, { ...decision(p), operatorLabel: "caller" }, session), "UNKNOWN_FIELDS");
  for (const key of Object.keys(SOURCE_COMPARISON_RUBRIC)) {
    const d = decision(p); d.comparison[key as keyof SourceComparison] = "INSUFFICIENT";
    rejects(() => service.authorize(p, d, session), "UNTRUSTED_RECEIPT");
    d.comparison[key as keyof SourceComparison] = "NOT_APPLICABLE";
    rejects(() => service.authorize(p, d, session), "INVALID_ENUM");
  }
});
test("rationale size, Unicode and time validation fail with safe errors", () => {
  const { source, script, service, setTime } = setup(), p = service.propose(source, script, request(source, script));
  for (const rationale of ["", "က".repeat(2001), "\ud800"]) rejects(() => service.authorize(p, { ...decision(p), rationale }, session));
  setTime("invalid-time"); rejects(() => service.authorize(p, decision(p), session), "INVALID_TIMESTAMP");
  assert.equal(service.history().length, 0);
});
test("authority failures cannot leak credentials into errors", () => {
  const { source, script } = setup(), secret = "SYNTHETIC_PRIVATE_CREDENTIAL";
  const service = createHumanSourceVerificationFoundation({ scope, now: () => date, authority: { resolve() { throw new Error(secret); } } });
  const p = service.propose(source, script, request(source, script));
  try { service.authorize(p, decision(p), { secret }); assert.fail("expected failure"); } catch (error) {
    assert.ok(error instanceof StorylineContractError); assert.equal(error.message.includes(secret), false);
    assert.equal(JSON.stringify(error).includes(secret), false);
  }
});
test("foundation stays server-only, unwired and free of database, media, queue and provider IO", async () => {
  const code = await readFile("lib/storyline/human-verification.ts", "utf8");
  assert.match(code, /^import "server-only";/);
  assert.doesNotMatch(code, /\bfetch\s*\(|@\/lib\/(?:prisma|storage|queue)|\bprepareStorylineSource\s*\(|use server|use client|console\./);
  for (const path of ["app/projects/[id]/recap/page.tsx", "components/storyline/recap-studio-shell.tsx", "components/storyline/navigation.ts"]) {
    assert.doesNotMatch(await readFile(path, "utf8"), /human-verification|createHumanSourceVerificationFoundation/);
  }
});
