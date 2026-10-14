// FIX-02: real signed lookup on a verified, disposable cluster only.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { mock, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { createAuthoritativeStorylineDurationService, AuthoritativeDurationError } from "../../lib/storyline/authoritative-duration";
import type { DurableDurationRequest } from "../../lib/storyline/authoritative-duration-contracts";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import type { StoryScriptPayload } from "../../lib/storyline/contracts";
import { calculateUntrustedStoryDuration } from "../../lib/storyline/duration-engine";
import type { StoryComplexityInventory } from "../../lib/storyline/duration-contracts";
import { SOURCE_COMPARISON_RUBRIC, type SourceComparison, type SourceVerificationProposal, type HumanVerificationDecision } from "../../lib/storyline/human-verification-contracts";
import { createStorylineOperatorAuthority } from "../../lib/storyline/operator-authority";
import { persistPreparedStorylineSource } from "../../lib/storyline/persist-source";
import { persistStorylineScriptDraft } from "../../lib/storyline/persist-script";
import { prepareStorylineSource } from "../../lib/storyline/prepare-source";
import { createStorylineReceiptAttestor } from "../../lib/storyline/verification-attestation";
import type { VerificationMediaInspector } from "../../lib/storyline/verification-context";
import { VerificationSecurityError } from "../../lib/storyline/verification-errors";
import { STORYLINE_VERIFICATION_ISSUANCE_ENABLED } from "../../lib/storyline/verification-issuance";
import { createDurableStorylineVerificationService } from "../../lib/storyline/verification-service";
import { DisposableStorylinePostgres } from "./disposable-postgres";
import { durationFixture, durationPolicyFixture } from "./duration.fixture";
import { date, eventsFixture, scope, scriptFixture, withInference } from "./fixtures";
import { fakePersistenceMedia, seedPersistenceFixture } from "./persistence.fixture";

function decision(p: SourceVerificationProposal, outcome: HumanVerificationDecision["outcome"] = "SOURCE_VERIFIED"): HumanVerificationDecision {
  const comparison = Object.fromEntries(Object.keys(SOURCE_COMPARISON_RUBRIC).map(key => [key,
    key === "translationConsistency" && !p.binding.translationContextRefs.length ? "NOT_APPLICABLE" : "SUPPORTED"])) as SourceComparison;
  if (outcome === "INCONCLUSIVE") comparison.evidenceSufficiency = "INSUFFICIENT";
  if (outcome === "UNSUPPORTED") comparison.chineseMeaning = "CONTRADICTED";
  return { proposalHash: p.proposalHash, chineseEvidenceHash: p.chineseEvidenceHash, translationContextHash: p.translationContextHash,
    acknowledgedChineseComparison: true, outcome, comparison, rationale: "Synthetic explicit Chinese comparison" };
}
const rejects = (run: () => Promise<unknown>, code: string) => assert.rejects(run,
  (error: unknown) => (error instanceof AuthoritativeDurationError || error instanceof VerificationSecurityError) && error.code === code);
const throws = (run: () => unknown, code: string) => assert.throws(run,
  (error: unknown) => error instanceof AuthoritativeDurationError && error.code === code);
function gate() {
  let ready!: () => void, release!: () => void;
  return { entered: new Promise<void>(resolve => { ready = resolve; }), wait: new Promise<void>(resolve => { release = resolve; }), ready, release };
}

test("authoritative durable duration observation, trust and invalidation", { timeout: 120_000 }, async t => {
  const network = mock.method(globalThis, "fetch", () => assert.fail("No provider/API calls"));
  const owned = await DisposableStorylinePostgres.start(), sql = await owned.client();
  const owner = new PrismaClient({ adapter: new PrismaPg({ ...owned.prismaAdapterConfig(), pipeline: true }) });
  const clients = [owner];
  try {
    for (const name of (await readdir("prisma/migrations", { withFileTypes: true })).filter(row => row.isDirectory()).map(row => row.name).sort()) {
      await sql.query(await readFile(join("prisma/migrations", name, "migration.sql"), "utf8"));
    }
    await seedPersistenceFixture(owner);
    const media = fakePersistenceMedia();
    const prepared = await prepareStorylineSource(scope, { database: owner, inspectMedia: media.inspect, now: () => date });
    const snapshot = await persistPreparedStorylineSource({ selection: scope, candidate: prepared, expectedRevision: null }, { database: owner, inspectMedia: media.inspect });
    const beats = withInference(scriptFixture(prepared.snapshot)).beats;
    const script = await persistStorylineScriptDraft({ ...scope, sourceSnapshotId: snapshot.snapshotId, expectedRevision: snapshot.revision,
      origin: "HUMAN", beats }, { database: owner, inspectMedia: media.inspect });
    const admin = await owned.securityAdministrator();
    try { await admin.query(await readFile("docs/drafts/storyline-verification-roles.sql", "utf8")); } finally { await admin.end(); }
    const runtime = new PrismaClient({ adapter: new PrismaPg({ ...await owned.restrictedLogin("storyline_runtime"), pipeline: true }) });
    const issuer = new PrismaClient({ adapter: new PrismaPg({ ...await owned.restrictedLogin("storyline_verification_issuer"), pipeline: true }) });
    clients.push(runtime, issuer);
    const selected = { ...scope, studioId: snapshot.studioId, scriptVersionId: script.scriptVersionId };
    const keys = generateKeyPairSync("ed25519"), session = Object.freeze({ syntheticServerSession: true });
    const signer = createStorylineReceiptAttestor({ keyId: "ephemeral-duration-fixture", ...keys });
    const verifier = createStorylineReceiptAttestor({ keyId: "ephemeral-duration-fixture", publicKey: keys.publicKey });
    const authority = createStorylineOperatorAuthority({ providerId: "synthetic-operator-provider", resolve: async (candidate, binding) =>
      candidate === session && canonicalJson(binding.scope) === canonicalJson({ ...scope, studioId: snapshot.studioId })
        ? { subjectId: "synthetic-human", auditLabel: "Synthetic Chinese reviewer", authenticatedAt: date, expiresAt: "2026-10-01T00:05:00.000Z" } : null }, () => date);
    const service = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: issuer, authority, attestor: signer,
      now: () => date, inspectMedia: media.inspect });
    const makeReader = (inspectMedia: VerificationMediaInspector = media.inspect, attestor = verifier) => createDurableStorylineVerificationService({
      readerDatabase: runtime, issuerDatabase: null, authority: null, attestor, now: () => date, inspectMedia });
    const policy = durationPolicyFixture(), reader = makeReader(), planner = createAuthoritativeStorylineDurationService(reader, policy);
    const inventory: StoryComplexityInventory = { events: [...eventsFixture(), { id: "event-inferred", kind: "DECISION", startMs: 0, endMs: 2000,
      claimIds: ["claim-inferred"], precedingEventIds: [] }], characterArcs: [], visualIntervals: [{ id: "visual-real-source", movieId: scope.movieId,
      sourceSha256: prepared.snapshot.payload.media.sha256, startMs: 0, endMs: 24000, availability: "AVAILABLE", eventIds: ["event-0", "event-1", "event-inferred"] }] };
    async function request(): Promise<DurableDurationRequest> { return { ...selected, sourceSnapshotId: snapshot.snapshotId,
      expectedRevision: (await runtime.storylineStudio.findUniqueOrThrow({ where: { id: selected.studioId } })).revision,
      policyHash: planner.capability.policyHash, inventory: structuredClone(inventory) }; }
    async function issue(claimId: string, outcome: HumanVerificationDecision["outcome"] = "SOURCE_VERIFIED") {
      const p = await service.propose(selected, claimId);
      return service.issue(await service.authorize(p, decision(p, outcome), session));
    }
    async function revoke(claimId: string) {
      const row = (await service.lookup(selected)).claims.find(row => row.claimId === claimId)!;
      const p = await service.proposeRevocation(selected, claimId, row.receiptId!);
      return service.revoke(await service.authorizeRevocation(p, "Synthetic explicit revocation", session));
    }
    const legacy = () => runtime.movie.findUniqueOrThrow({ where: { id: scope.movieId }, include: {
      transcript: { include: { segments: { orderBy: { sequence: "asc" } } } },
      translation: { include: { segments: { orderBy: { sequence: "asc" }, include: { qcIssues: true } } } }, recap: true } });
    const beforeLegacy = await legacy();
    const counts = async () => Promise.all([runtime.storySourceVerification.count(), runtime.storySourceSnapshot.count(), runtime.storyScriptVersion.count()]);

    await t.test("read-only empty signed ledger: no supported budget, no writes or runtime enablement", async () => {
      const before = await counts(), read = await planner.observe(await request());
      assert.equal(read.result.counts.supportedEvents, 0); assert.equal(read.result.counts.provisionalEvents, 3);
      assert.equal(read.result.budget.suggestedBudgetMs, null); assert.equal(read.result.status, "PENDING_SOURCE_VERIFICATION");
      assert.deepEqual(await counts(), before); assert.equal(STORYLINE_VERIFICATION_ISSUANCE_ENABLED, false);
      assert.equal(planner.capability.applicationEnabled, false);
    });
    await t.test("pure M1-C, JSON, callbacks, copied service and copied DTO cannot create authority", async () => {
      const f = durationFixture(); f.verify("claim-0");
      const copied = await reader.lookup(selected);
      for (const fake of [f.authority, copied, { ...reader }, { claims: [{ claimId: "claim-0", state: "SOURCE_VERIFIED" }] },
        { lookup: async () => copied }, () => copied, null]) {
        throws(() => createAuthoritativeStorylineDurationService(fake, policy), "DURATION_AUTHORITY_INVALID");
      }
      const raw = calculateUntrustedStoryDuration(f.source, f.script, f.inventory, f.policy,
        { claims: [{ claimId: "claim-0", state: "SOURCE_VERIFIED", receiptId: "forged" }, { claimId: "claim-1", state: "PENDING", receiptId: null }], dependencyHash: "a".repeat(64) });
      assert.equal(raw.contextStatus, "PROVIDED_IMMUTABLE_CONTEXT_ONLY");
      await rejects(() => planner.recheck(raw, {}), "DURATION_AUTHORITY_INVALID");
      for (const extra of [{ claims: copied.claims }, { receipt: copied }, { lookup: () => copied }, { sourceEligible: true }]) {
        await rejects(async () => planner.observe({ ...await request(), ...extra }), "DURATION_INPUT_INVALID");
      }
    });
    await t.test("missing key/database and unsafe owner-role reader fail closed", async () => {
      const disabled = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: null, authority: null,
        attestor: null, now: () => date });
      await rejects(async () => createAuthoritativeStorylineDurationService(disabled, policy).observe(await request()), "VERIFICATION_DISABLED");
      const unsafe = createDurableStorylineVerificationService({ readerDatabase: owner, issuerDatabase: null, authority: null,
        attestor: verifier, now: () => date, inspectMedia: media.inspect });
      await rejects(async () => createAuthoritativeStorylineDurationService(unsafe, policy).observe(await request()), "VERIFICATION_DATABASE_UNSAFE");
    });
    await t.test("inconclusive source comparison cannot count despite MANUAL translation provenance", async () => {
      await issue("claim-0", "INCONCLUSIVE");
      const read = await planner.observe(await request());
      assert.equal(read.result.counts.supportedEvents, 0); assert.equal(read.result.budget.suggestedBudgetMs, null);
      assert.ok(read.result.provisionalContributions.some(row => row.reasons.includes("INCONCLUSIVE")));
      assert.equal(beforeLegacy.translation!.segments[0].origin, "MANUAL");
      assert.equal(beforeLegacy.translation!.segments[0].reviewStatus, "NEEDS_REVIEW");
    });
    await t.test("genuine pinned signed comparison supports current unapproved context and two beats in one scene", async () => {
      await issue("claim-0"); await issue("claim-1"); await issue("claim-inferred");
      const before = await counts(), req = await request(), read = await planner.observe(req);
      assert.equal(read.result.counts.supportedEvents, 3); assert.equal(read.result.counts.provisionalEvents, 0);
      assert.equal(read.result.evidenceCoverage.durationMs, 4000); assert.equal(read.result.eligibleVisualCoverage.durationMs, 4000);
      assert.equal(read.result.contextStatus, "AUTHORITATIVE_DURABLE_OBSERVATION"); assert.equal(read.result.observationOnly, true);
      assert.equal(read.result.policy.calibrationStatus, "UNCALIBRATED");
      assert.deepEqual([read.result.authorizesScriptApproval, read.result.authorizesVoice, read.result.authorizesExecution], [false, false, false]);
      assert.equal(read.result.budget.estimatedVoiceDurationMs, null);
      assert.deepEqual(await counts(), before);
      assert.equal((await planner.recheck(read.view, req)).result.observationHash, read.result.observationHash);
      assert.doesNotMatch(canonicalJson(read.result), /storageKey|canonicalPayload|issuerAttestation|authorityDecision|operatorToken|中文|မြန်မာ/);
    });
    await t.test("views are instance owned, nonserializable, scope bound and unusable as plain objects", async () => {
      const req = await request(), read = await planner.observe(req);
      throws(() => JSON.stringify(read.view), "DURATION_AUTHORITY_INVALID");
      assert.throws(() => structuredClone(read.view));
      for (const fake of [{}, { ...read.view }, read.result, JSON.parse(canonicalJson(read.result))]) {
        await rejects(() => planner.recheck(fake, req), "DURATION_AUTHORITY_INVALID");
      }
      const other = createAuthoritativeStorylineDurationService(reader, policy);
      await rejects(() => other.recheck(read.view, req), "DURATION_AUTHORITY_INVALID");
      await rejects(() => planner.recheck(read.view, { ...req, movieId: "movie-other" }), "DURATION_OBSERVATION_STALE");
    });
    await t.test("wrong project/movie/Studio/script/source, revision and policy are rejected", async () => {
      const req = await request();
      for (const invalid of [{ projectId: "wrong-project" }, { movieId: "movie-other" }, { studioId: "wrong-studio" }, { scriptVersionId: "wrong-script" }]) {
        await rejects(() => planner.observe({ ...req, ...invalid }), "VERIFICATION_CONTEXT_INVALID");
      }
      await rejects(() => planner.observe({ ...req, sourceSnapshotId: "wrong-source" }), "VERIFICATION_SOURCE_STALE");
      await rejects(() => planner.observe({ ...req, expectedRevision: req.expectedRevision - 1 }), "DURATION_REVISION_STALE");
      await rejects(() => planner.observe({ ...req, policyHash: "0".repeat(64) }), "DURATION_POLICY_MISMATCH");
      const changedPolicy = { ...policy, weightsMs: { ...policy.weightsMs, event: policy.weightsMs.event + 1 } };
      const changed = createAuthoritativeStorylineDurationService(reader, changedPolicy);
      await rejects(() => changed.observe(req), "DURATION_POLICY_MISMATCH");
    });
    await t.test("an incorrect pinned signature key can never supply supported events", async () => {
      const wrong = createStorylineReceiptAttestor({ keyId: "ephemeral-duration-fixture", publicKey: generateKeyPairSync("ed25519").publicKey });
      const denied = createAuthoritativeStorylineDurationService(makeReader(media.inspect, wrong), policy);
      await rejects(async () => denied.observe(await request()), "VERIFICATION_HISTORY_INVALID");
    });
    await t.test("exact aliases deduplicate and semantic anchor duplicates remain for review", async () => {
      const req = await request(); req.inventory.events.push({ ...req.inventory.events[0], id: "alias-0" });
      const read = await planner.observe(req);
      assert.equal(read.result.counts.submittedEvents, 4); assert.equal(read.result.counts.supportedEvents, 3);
      assert.equal(read.result.exactDuplicates.length, 1); assert.ok(read.result.semanticDuplicateReviewGroups.length > 0);
      assert.equal(read.result.evidenceCoverage.durationMs, 4000);
    });
    await t.test("missing eligible visuals gives no budget despite verified events", async () => {
      const req = await request(); req.inventory.visualIntervals = [];
      const read = await planner.observe(req);
      assert.equal(read.result.counts.supportedEvents, 3); assert.equal(read.result.budget.suggestedBudgetMs, null);
      assert.equal(read.result.status, "INSUFFICIENT_VISUAL_COVERAGE"); assert.equal(read.result.eligibleVisualCoverage.suitabilityApproved, false);
    });
    await t.test("arcs with the wrong character and mismatched source visuals reject", async () => {
      const req = await request();
      req.inventory.characterArcs = [{ id: "arc-invalid", characterId: "character-a", states: [{ eventId: "event-1", claimIds: ["claim-1"] }] }];
      await rejects(() => planner.observe(req), "DURATION_INPUT_INVALID");
      const wrongVisual = await request(); wrongVisual.inventory.visualIntervals[0].movieId = "movie-other";
      await rejects(() => planner.observe(wrongVisual), "DURATION_INPUT_INVALID");
    });
    for (const mutation of ["Chinese", "translation", "approval", "QC"] as const) {
      await t.test(`changed ${mutation} invalidates observation even when Studio revision is unchanged`, async () => {
        const req = await request(), read = await planner.observe(req);
        const target = await runtime.translatedSegment.findUniqueOrThrow({ where: { id: "target-0" } });
        const source = await runtime.transcriptSegment.findUniqueOrThrow({ where: { id: "source-0" } });
        const qc = await runtime.translationQcIssue.findUniqueOrThrow({ where: { id: "qc-0" } });
        try {
          if (mutation === "Chinese") await runtime.transcriptSegment.update({ where: { id: source.id }, data: { text: "修改后的合成对白。" } });
          if (mutation === "translation") await runtime.translatedSegment.update({ where: { id: target.id }, data: { text: "ပြောင်းလဲထားသည်။" } });
          if (mutation === "approval") await runtime.translatedSegment.update({ where: { id: target.id }, data: { reviewStatus: "APPROVED" } });
          if (mutation === "QC") await runtime.translationQcIssue.update({ where: { id: qc.id }, data: { resolvedAt: new Date(date), updatedAt: new Date(date) } });
          await rejects(() => planner.recheck(read.view, req), "VERIFICATION_SOURCE_STALE");
          await rejects(() => planner.observe(req), "VERIFICATION_SOURCE_STALE");
        } finally {
          await runtime.transcriptSegment.update({ where: { id: source.id }, data: { text: source.text } });
          await runtime.translatedSegment.update({ where: { id: target.id }, data: { text: target.text, reviewStatus: target.reviewStatus } });
          await runtime.translationQcIssue.update({ where: { id: qc.id }, data: { resolvedAt: qc.resolvedAt, updatedAt: qc.updatedAt } });
        }
      });
    }
    await t.test("revocation invalidates a prior head; observed-basis loss removes dependent inference", async () => {
      const req = await request(), read = await planner.observe(req);
      await revoke("claim-0");
      await rejects(() => planner.recheck(read.view, req), "DURATION_REVISION_STALE");
      await rejects(async () => planner.recheck(read.view, await request()), "DURATION_OBSERVATION_STALE");
      const next = await planner.observe(await request());
      assert.equal(next.result.counts.supportedEvents, 0); assert.equal(next.result.budget.suggestedBudgetMs, null);
      assert.ok(next.result.excludedContributions.some(row => row.reasons.includes("REVOKED")));
      assert.ok(next.result.excludedContributions.some(row => row.reasons.includes("STALE")));
      await issue("claim-0");
      const restored = await planner.observe(await request());
      assert.equal(restored.result.counts.supportedEvents, 2); // Old inferred receipt remains stale.
      await issue("claim-inferred");
    });
    await t.test("superseded basis receipt is not restored by an identical new outcome", async () => {
      const previous = await planner.observe(await request());
      await issue("claim-0", "INCONCLUSIVE");
      const read = await planner.observe(await request());
      assert.equal(read.result.counts.supportedEvents, 0);
      assert.notEqual(read.result.binding.ledgerHeadHash, previous.result.binding.ledgerHeadHash);
      await issue("claim-0");
      assert.equal((await planner.observe(await request())).result.counts.supportedEvents, 2);
      await issue("claim-inferred");
    });
    await t.test("concurrent committed source edit during media inspection is seen by the final read", { timeout: 15000 }, async () => {
      const blocked = gate(), req = await request();
      const race = createAuthoritativeStorylineDurationService(makeReader(async key => { blocked.ready(); await blocked.wait; return media.inspect(key); }), policy);
      const pending = race.observe(req); await blocked.entered;
      const original = await runtime.translatedSegment.findUniqueOrThrow({ where: { id: "target-0" } });
      try {
        await runtime.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${scope.projectId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "Movie" WHERE id=${scope.movieId} FOR UPDATE`;
          await tx.translatedSegment.update({ where: { id: original.id }, data: { text: "ပြိုင်တူပြောင်းလဲမှု။" } });
        });
        blocked.release(); await rejects(() => pending, "VERIFICATION_SOURCE_STALE");
      } finally { blocked.release(); await runtime.translatedSegment.update({ where: { id: original.id }, data: { text: original.text } }); }
    });
    await t.test("concurrent receipt append during media inspection rejects old revision", { timeout: 15000 }, async () => {
      const blocked = gate(), req = await request();
      const race = createAuthoritativeStorylineDurationService(makeReader(async key => { blocked.ready(); await blocked.wait; return media.inspect(key); }), policy);
      const pending = race.observe(req); await blocked.entered;
      try { await issue("claim-1"); } finally { blocked.release(); }
      await rejects(() => pending, "DURATION_REVISION_STALE");
    });
    await t.test("receipt commit after the read snapshot cannot turn an observation into future authority", { timeout: 15000 }, async () => {
      const blocked = gate(); let checks = 0;
      const race = createAuthoritativeStorylineDurationService(makeReader(async key => ({ ...await media.inspect(key), assertUnchanged: async () => {
        if (++checks === 3) { blocked.ready(); await blocked.wait; }
      } })), policy);
      const req = await request(), pending = race.observe(req); await blocked.entered;
      try { await revoke("claim-0"); } finally { blocked.release(); }
      const read = await pending;
      assert.equal(read.result.observationOnly, true); assert.equal(read.result.binding.currentness, "CURRENT_AT_READ_SNAPSHOT");
      assert.equal(read.result.authorizesExecution, false); assert.equal(read.result.authorizesScriptApproval, false);
      await rejects(() => race.recheck(read.view, req), "DURATION_REVISION_STALE");
      await issue("claim-0"); await issue("claim-inferred");
    });
    await t.test("missing or changed media cannot yield a duration observation", async () => {
      media.setInvalid(true);
      try { await rejects(async () => planner.observe(await request()), "VERIFICATION_SOURCE_STALE"); } finally { media.setInvalid(false); }
      media.setChanged(true);
      try { await rejects(async () => planner.observe(await request()), "VERIFICATION_SOURCE_STALE"); } finally { media.setChanged(false); }
    });
    await t.test("new immutable script version makes historical script observations stale", async () => {
      const req = await request(), read = await planner.observe(req);
      const next = await persistStorylineScriptDraft({ ...scope, sourceSnapshotId: snapshot.snapshotId, expectedRevision: req.expectedRevision,
        origin: "HUMAN", beats: beats.map((beat, i) => ({ ...beat, narration: beat.narration.map(row => ({ ...row, text: i ? row.text : `${row.text} ` })) })) },
      { database: runtime, inspectMedia: media.inspect });
      await rejects(() => planner.recheck(read.view, req), "VERIFICATION_SOURCE_STALE");
      const fresh = await planner.observe({ ...await request(), scriptVersionId: next.scriptVersionId });
      assert.equal(fresh.result.counts.supportedEvents, 0); assert.equal(fresh.result.budget.suggestedBudgetMs, null);
    });
    for (const kind of ["character", "relationship"] as const) await t.test(`persisted wrong-${kind} ownership is rejected through real durable lookup`, async () => {
      const inserted = await runtime.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${scope.projectId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Movie" WHERE id=${scope.movieId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "StorylineStudio" WHERE id=${snapshot.studioId} FOR UPDATE`;
        const studio = await tx.storylineStudio.findUniqueOrThrow({ where: { id: snapshot.studioId } });
        const parent = await tx.storyScriptVersion.findUniqueOrThrow({ where: { studioId_version: { studioId: studio.id, version: studio.nextScriptVersion - 1 } } });
        const payload = JSON.parse(parent.canonicalPayload) as StoryScriptPayload;
        payload.id = `synthetic-invalid-${kind}`; payload.version = studio.nextScriptVersion; payload.parentVersionId = parent.id;
        if (kind === "character") payload.beats[1].claims[0].characterRefs = ["character-a"];
        else payload.beats[0].claims[0].relationshipRef = "nonexistent-relationship";
        // Legitimate runtime INSERT rights cannot authenticate an invalid claim.
        // Do not disable guards or change an immutable existing row for this test.
        await tx.storyScriptVersion.create({ data: { id: payload.id, studioId: studio.id, sourceSnapshotId: snapshot.snapshotId,
          sourceContentHash: payload.sourceContentHash, sourceContextHash: payload.sourceContextHash, scriptHash: contractHash("story-script-v1", payload),
          version: payload.version, parentVersionId: parent.id, parentVersion: parent.version, origin: "HUMAN", canonicalPayload: canonicalJson(payload) } });
        await tx.storyBeat.createMany({ data: payload.beats.map(beat => ({ studioId: studio.id, scriptVersionId: payload.id,
          beatId: beat.id, order: beat.order, category: beat.category, startMs: beat.startMs, endMs: beat.endMs, canonicalPayload: canonicalJson(beat) })) });
        await tx.storylineStudio.update({ where: { id: studio.id }, data: { currentScriptVersionId: payload.id } });
        return payload.id;
      });
      await rejects(async () => planner.observe({ ...await request(), scriptVersionId: inserted }), "VERIFICATION_CONTEXT_INVALID");
    });
    await t.test("source, subtitle approvals, QC and legacy Recap remain unchanged", async () => {
      assert.deepEqual(await legacy(), beforeLegacy);
      assert.equal(STORYLINE_VERIFICATION_ISSUANCE_ENABLED, false);
    });
  } finally {
    for (const client of clients) await client.$disconnect();
    await sql.end(); await owned.stop(); network.mock.restore();
  }
});
