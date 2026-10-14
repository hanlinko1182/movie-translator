import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mock, test } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { SOURCE_COMPARISON_RUBRIC, type HumanVerificationDecision, type SourceComparison, type SourceVerificationProposal } from "../../lib/storyline/human-verification-contracts";
import { createStorylineOperatorAuthority, operatorDecisionHash } from "../../lib/storyline/operator-authority";
import { prepareStorylineSource } from "../../lib/storyline/prepare-source";
import { persistPreparedStorylineSource } from "../../lib/storyline/persist-source";
import { persistStorylineScriptDraft } from "../../lib/storyline/persist-script";
import { createStorylineReceiptAttestor } from "../../lib/storyline/verification-attestation";
import { VerificationSecurityError } from "../../lib/storyline/verification-errors";
import { STORYLINE_VERIFICATION_ISSUANCE_ENABLED } from "../../lib/storyline/verification-issuance";
import { createDurableStorylineVerificationService, type DurableVerificationCommand } from "../../lib/storyline/verification-service";
import { DisposableStorylinePostgres } from "./disposable-postgres";
import { date, scope, scriptFixture, withInference } from "./fixtures";
import { fakePersistenceMedia, seedPersistenceFixture } from "./persistence.fixture";

function decision(p: SourceVerificationProposal, outcome: HumanVerificationDecision["outcome"] = "SOURCE_VERIFIED"): HumanVerificationDecision {
  const comparison = Object.fromEntries(Object.keys(SOURCE_COMPARISON_RUBRIC).map(key => [key,
    key === "translationConsistency" && !p.binding.translationContextRefs.length ? "NOT_APPLICABLE" : "SUPPORTED"])) as SourceComparison;
  if (outcome === "INCONCLUSIVE") comparison.evidenceSufficiency = "INSUFFICIENT";
  if (outcome === "UNSUPPORTED") comparison.chineseMeaning = "CONTRADICTED";
  return { proposalHash: p.proposalHash, chineseEvidenceHash: p.chineseEvidenceHash, translationContextHash: p.translationContextHash,
    acknowledgedChineseComparison: true, outcome, comparison, rationale: "Synthetic explicit Chinese source comparison only" };
}
async function rejects(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => error instanceof VerificationSecurityError && error.code === code);
}
async function sqlRejects(run: () => Promise<unknown>, code = "42501") {
  await assert.rejects(run, (error: unknown) => (error as { code?: string }).code === code);
}

test("durable verification security uses only synthetic data and an isolated owned PostgreSQL cluster", { timeout: 120_000 }, async t => {
  const network = mock.method(globalThis, "fetch", () => assert.fail("No API/provider calls are permitted"));
  const owned = await DisposableStorylinePostgres.start(), sql = await owned.client();
  const owner = new PrismaClient({ adapter: new PrismaPg({ ...owned.prismaAdapterConfig(), pipeline: true }) });
  const clients: PrismaClient[] = [owner];
  let runtimeSql: Client | undefined, issuerSql: Client | undefined;
  try {
    for (const name of (await readdir("prisma/migrations", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
      await sql.query(await readFile(join("prisma/migrations", name, "migration.sql"), "utf8"));
    }
    await seedPersistenceFixture(owner);
    const legacyBefore = await owner.movie.findUniqueOrThrow({ where: { id: scope.movieId }, include: {
      transcript: { include: { segments: true } }, translation: { include: { segments: { include: { qcIssues: true } } } }, recap: true,
    } });
    const media = fakePersistenceMedia();
    const candidate = await prepareStorylineSource(scope, { database: owner, inspectMedia: media.inspect, now: () => date });
    const snapshot = await persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: owner, inspectMedia: media.inspect });
    const script = await persistStorylineScriptDraft({ ...scope, sourceSnapshotId: snapshot.snapshotId, expectedRevision: snapshot.revision,
      origin: "HUMAN", beats: withInference(scriptFixture(candidate.snapshot)).beats }, { database: owner, inspectMedia: media.inspect });
    const admin = await owned.securityAdministrator();
    try { await admin.query(await readFile("docs/drafts/storyline-verification-roles.sql", "utf8")); }
    finally { await admin.end(); }
    const runtimeConfig = await owned.restrictedLogin("storyline_runtime"), issuerConfig = await owned.restrictedLogin("storyline_verification_issuer");
    const runtime = new PrismaClient({ adapter: new PrismaPg({ ...runtimeConfig, pipeline: true }) });
    const issuer = new PrismaClient({ adapter: new PrismaPg({ ...issuerConfig, pipeline: true }) });
    clients.push(runtime, issuer);
    runtimeSql = new Client(runtimeConfig); issuerSql = new Client(issuerConfig);
    await runtimeSql.connect(); await issuerSql.connect();
    const selected = { ...scope, studioId: snapshot.studioId, scriptVersionId: script.scriptVersionId };
    const session = Object.freeze({ syntheticServerSession: true });
    const keys = generateKeyPairSync("ed25519");
    const attestor = createStorylineReceiptAttestor({ keyId: "synthetic-pinned-issuer", ...keys });
    const authority = createStorylineOperatorAuthority({ providerId: "synthetic-auth-provider", resolve: async (candidate, binding) =>
      candidate === session && canonicalJson(binding.scope) === canonicalJson({ ...scope, studioId: snapshot.studioId })
        ? { subjectId: "synthetic-human", auditLabel: "Synthetic reviewer", authenticatedAt: date, expiresAt: "2026-10-01T00:05:00.000Z" } : null }, () => date);
    const makeService = (inspectMedia = media.inspect) => createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: issuer,
      authority, attestor, now: () => date, inspectMedia });
    const service = makeService();
    async function command(claimId = "claim-0", outcome: HumanVerificationDecision["outcome"] = "SOURCE_VERIFIED") {
      const p = await service.propose(selected, claimId);
      return service.authorize(p, decision(p, outcome), session);
    }
    async function issue(claimId = "claim-0", outcome: HumanVerificationDecision["outcome"] = "SOURCE_VERIFIED") { return service.issue(await command(claimId, outcome)); }
    const count = () => runtime.storySourceVerification.count();

    await t.test("default application gate and missing/fabricated authority fail closed", async () => {
      assert.equal(STORYLINE_VERIFICATION_ISSUANCE_ENABLED, false);
      const disabled = createDurableStorylineVerificationService({ readerDatabase: null, issuerDatabase: null, authority: null, attestor: null, now: () => date });
      await rejects(() => disabled.issue({} as DurableVerificationCommand), "VERIFICATION_DISABLED");
      const denied = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: issuer,
        authority: createStorylineOperatorAuthority(null, () => date), attestor, now: () => date });
      await rejects(() => denied.propose(selected, "claim-0"), "VERIFICATION_DISABLED");
      const unsafe = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: owner, authority, attestor, now: () => date });
      await rejects(() => unsafe.propose(selected, "claim-0"), "VERIFICATION_DATABASE_UNSAFE");
      assert.equal(await count(), 0);
    });
    await t.test("runtime cannot forge receipts, invoke issuer gateways, change roles or disable guards", async () => {
      await sqlRejects(() => runtimeSql!.query(`INSERT INTO "StorySourceVerification" SELECT * FROM "StorySourceVerification"`));
      await sqlRejects(() => runtimeSql!.query(`UPDATE "StorySourceVerification" SET outcome='SOURCE_VERIFIED'`));
      await sqlRejects(() => runtimeSql!.query(`DELETE FROM "StorySourceVerification"`));
      await sqlRejects(() => runtimeSql!.query(`TRUNCATE "StorySourceVerification"`));
      await sqlRejects(() => runtimeSql!.query(`SELECT public.story_m1_verification_append('forged','${"a".repeat(64)}','{}')`));
      await sqlRejects(() => runtimeSql!.query(`SET ROLE storyline_verification_issuer`));
      await sqlRejects(() => runtimeSql!.query(`SET ROLE storyline_migration_owner`));
      await sqlRejects(() => runtimeSql!.query(`ALTER TABLE "StorySourceVerification" DISABLE TRIGGER ALL`));
      await sqlRejects(() => runtimeSql!.query(`CREATE FUNCTION public.forged() RETURNS int LANGUAGE sql AS 'SELECT 1'`));
      await sqlRejects(() => issuerSql!.query(`INSERT INTO "StorySourceVerification" SELECT * FROM "StorySourceVerification"`));
      await sqlRejects(() => issuerSql!.query(`UPDATE "Movie" SET title='forged' WHERE id=$1`, [scope.movieId]));
      await sqlRejects(() => issuerSql!.query(`UPDATE "StorylineStudio" SET revision=revision`));
      assert.equal(await count(), 0);
    });
    await t.test("read-only lookup reports pending and exact scoping rejects other projects/movies/Studios", async () => {
      const pending = await service.lookup(selected);
      assert.equal(pending.contextState, "CURRENT"); assert.equal(pending.sourceEligible, false);
      assert.ok(pending.claims.every(row => row.state === "PENDING")); assert.equal(await count(), 0);
      for (const invalid of [{ ...selected, projectId: "other-project" }, { ...selected, movieId: "movie-other" }, { ...selected, studioId: "other-studio" }]) {
        await rejects(() => service.propose(invalid, "claim-0"), "VERIFICATION_CONTEXT_INVALID");
        await rejects(() => service.lookup(invalid), "VERIFICATION_CONTEXT_INVALID");
      }
      const invalid = structuredClone(withInference(scriptFixture(candidate.snapshot)).beats);
      invalid[0].claims[0].evidence[0].segmentSequence = 11;
      const studio = await runtime.storylineStudio.findUniqueOrThrow({ where: { id: snapshot.studioId } });
      await assert.rejects(() => persistStorylineScriptDraft({ ...scope, sourceSnapshotId: snapshot.snapshotId,
        expectedRevision: studio.revision, origin: "HUMAN", beats: invalid }, { database: runtime, inspectMedia: media.inspect }));
    });
    let firstReceipt = "";
    await t.test("explicit Chinese comparison and server authority issue one signed current receipt", async () => {
      const p = await service.propose(selected, "claim-0");
      await rejects(() => service.authorize(p, decision(p), { auditLabel: "human" }), "OPERATOR_UNAUTHORIZED");
      await rejects(() => service.authorize(structuredClone(p), decision(p), session), "VERIFICATION_AUTHORIZATION_INVALID");
      await rejects(() => service.authorize(p, { ...decision(p), acknowledgedChineseComparison: false }, session), "VERIFICATION_DECISION_INVALID");
      const token = await service.authorize(p, decision(p), session);
      await rejects(() => service.issue(structuredClone(token)), "VERIFICATION_AUTHORIZATION_INVALID");
      const saved = await service.issue(token); firstReceipt = saved.receiptId;
      await rejects(() => service.issue(token), "VERIFICATION_AUTHORIZATION_INVALID");
      assert.equal(saved.outcome, "SOURCE_VERIFIED"); assert.equal(await count(), 1);
      const read = await service.lookup(selected);
      assert.equal(read.claims[0].state, "SOURCE_VERIFIED"); assert.equal(read.scriptApproved, false); assert.equal(read.voiceEligible, false);
      assert.doesNotMatch(canonicalJson(read), /storageKey|canonicalPayload|operatorToken|issuerAttestation|authorityDecision/);
      const publicReader = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: null, authority: null,
        attestor: createStorylineReceiptAttestor({ keyId: "synthetic-pinned-issuer", publicKey: keys.publicKey }), now: () => date, inspectMedia: media.inspect });
      assert.equal((await publicReader.lookup(selected)).claims[0].state, "SOURCE_VERIFIED");
      await rejects(() => publicReader.propose(selected, "claim-0"), "VERIFICATION_DISABLED");
      const wrongKey = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: null, authority: null,
        attestor: createStorylineReceiptAttestor({ keyId: "synthetic-pinned-issuer", publicKey: generateKeyPairSync("ed25519").publicKey }), now: () => date, inspectMedia: media.inspect });
      await rejects(() => wrongKey.lookup(selected), "VERIFICATION_HISTORY_INVALID");
      assert.equal(legacyBefore.translation!.segments[0].reviewStatus, "NEEDS_REVIEW");
    });
    await t.test("inference requires observed verification; supersession invalidates dependent inference", async () => {
      await issue("claim-inferred");
      assert.equal((await service.lookup(selected)).claims.find(row => row.claimId === "claim-inferred")!.state, "SOURCE_VERIFIED");
      await issue("claim-0", "INCONCLUSIVE");
      const read = await service.lookup(selected, firstReceipt);
      assert.equal(read.receipt!.state, "SUPERSEDED");
      assert.equal(read.claims.find(row => row.claimId === "claim-0")!.state, "INCONCLUSIVE");
      assert.equal(read.claims.find(row => row.claimId === "claim-inferred")!.state, "STALE");
      await rejects(() => issue("claim-inferred"), "VERIFICATION_BASIS_UNVERIFIED");
      await issue("claim-0"); await issue("claim-inferred");
    });
    await t.test("append-only revocation remains historical and removes inference support", async () => {
      const read = await service.lookup(selected), target = read.claims.find(row => row.claimId === "claim-0")!;
      const p = await service.proposeRevocation(selected, target.claimId, target.receiptId!);
      const revoked = await service.revoke(await service.authorizeRevocation(p, "Synthetic revocation", session));
      assert.equal(revoked.outcome, "REVOKED");
      const after = await service.lookup(selected);
      assert.equal(after.claims.find(row => row.claimId === "claim-0")!.state, "REVOKED");
      assert.equal(after.claims.find(row => row.claimId === "claim-inferred")!.state, "STALE");
      assert.equal((await service.lookup(selected, target.receiptId)).receipt!.state, "SUPERSEDED");
      await sqlRejects(() => issuerSql!.query(`DELETE FROM "StorySourceVerification"`));
      await sqlRejects(() => issuerSql!.query(`UPDATE "StorySourceVerification" SET outcome='SOURCE_VERIFIED'`));
      await issue("claim-1", "UNSUPPORTED");
      assert.equal((await service.lookup(selected)).claims.find(row => row.claimId === "claim-1")!.state, "UNSUPPORTED");
    });
    await t.test("issuance versus revocation race commits one ledger head, with no fork or partial append", async () => {
      const target = (await service.lookup(selected)).claims.find(row => row.claimId === "claim-1")!;
      const p = await service.propose(selected, "claim-1"), r = await service.proposeRevocation(selected, "claim-1", target.receiptId!);
      const a = await service.authorize(p, decision(p, "INCONCLUSIVE"), session), b = await service.authorizeRevocation(r, "Synthetic race", session);
      const before = await count();
      const results = await Promise.allSettled([service.issue(a), service.revoke(b)]);
      assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
      assert.equal(results.filter(row => row.status === "rejected").length, 1);
      assert.equal(await count(), before + 1);
      await service.lookup(selected);
    });
    await t.test("source writer during issuance is rechecked after lock wait and rolls back", async () => {
      const token = await command("claim-0");
      let inspected!: () => void, release!: () => void, locked!: () => void;
      const ready = new Promise<void>(resolve => { inspected = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
      const lockReady = new Promise<void>(resolve => { locked = resolve; });
      const blocker = runtime.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${scope.projectId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Movie" WHERE id=${scope.movieId} FOR UPDATE`;
        locked(); await gate;
        await tx.translatedSegment.update({ where: { id: "target-0" }, data: { text: "စမ်းသပ်ပြောင်းလဲထားသည်။" } });
      }, { timeout: 10000 });
      await lockReady;
      let armed = false;
      const raceService = makeService(async key => { if (armed) inspected(); return media.inspect(key); });
      // Capabilities are instance-owned: authorize on the service that will consume.
      // The first token above proves another instance cannot steal it.
      await rejects(() => raceService.issue(token), "VERIFICATION_AUTHORIZATION_INVALID");
      const p = await raceService.propose(selected, "claim-0"), raceToken = await raceService.authorize(p, decision(p), session);
      const before = await count();
      armed = true;
      const waiting = raceService.issue(raceToken);
      await ready; release(); await blocker;
      await rejects(() => waiting, "VERIFICATION_SOURCE_STALE");
      assert.equal(await count(), before);
      await runtime.translatedSegment.update({ where: { id: "target-0" }, data: { text: legacyBefore.translation!.segments.find(row => row.id === "target-0")!.text } });
    });
    await t.test("stale dependencies and media failure after INSERT cannot authorize or leave partial history", async () => {
      const token = await command("claim-0"), before = await count();
      await runtime.translatedSegment.update({ where: { id: "target-0" }, data: { reviewStatus: "APPROVED" } });
      await rejects(() => service.issue(token), "VERIFICATION_SOURCE_STALE");
      assert.equal((await service.lookup(selected)).contextState, "STALE");
      await runtime.translatedSegment.update({ where: { id: "target-0" }, data: { reviewStatus: "NEEDS_REVIEW" } });
      let checks = 0, armed = false;
      const rollbackService = makeService(async key => ({ ...await media.inspect(key), assertUnchanged: async () => {
        if (armed && ++checks === 3) throw new Error("Synthetic media identity change after INSERT");
      } }));
      const p = await rollbackService.propose(selected, "claim-0"), rollbackToken = await rollbackService.authorize(p, decision(p), session);
      const revision = (await runtime.storylineStudio.findUniqueOrThrow({ where: { id: snapshot.studioId } })).revision;
      armed = true;
      await rejects(() => rollbackService.issue(rollbackToken), "VERIFICATION_SOURCE_STALE");
      assert.equal(await count(), before);
      assert.equal((await runtime.storylineStudio.findUniqueOrThrow({ where: { id: snapshot.studioId } })).revision, revision);
    });
    await t.test("syntactically valid unsigned issuer forgery is never trusted by authoritative lookup", async () => {
      const p = await service.propose(selected, "claim-0");
      const head = await runtime.storySourceVerification.findFirstOrThrow({ where: { studioId: selected.studioId }, orderBy: { sequence: "desc" } });
      const previous = await runtime.storySourceVerification.findFirstOrThrow({ where: { studioId: selected.studioId, claimId: "claim-0" }, orderBy: { sequence: "desc" } });
      const content = JSON.parse(head.canonicalPayload);
      content.kind = "RECEIPT"; content.outcome = "SOURCE_VERIFIED"; content.proposal = p; content.comparison = decision(p).comparison;
      content.rationale = decision(p).rationale; content.previousEntryId = previous.id; content.previousLedgerHash = head.entryHash; content.sequence = head.sequence + 1;
      content.basisReceiptHashes = []; content.issuerAttestation.signature = "0".repeat(128);
      content.authorityDecision.action = "VERIFY_SOURCE";
      content.authorityDecision.decisionHash = operatorDecisionHash({ proposalHash: p.proposalHash, decision: decision(p) });
      const hash = contractHash("story-persisted-human-verification-entry-v1", content), payload = canonicalJson(content);
      await sqlRejects(() => runtimeSql!.query(`SELECT public.story_m1_verification_append($1,$2,$3)`, [`verification-${hash}`, hash, payload]));
      await issuerSql!.query(`SELECT public.story_m1_verification_append($1,$2,$3)`, [`verification-${hash}`, hash, payload]);
      await rejects(() => service.lookup(selected), "VERIFICATION_HISTORY_INVALID");
    });
    const after = await owner.movie.findUniqueOrThrow({ where: { id: scope.movieId }, include: {
      transcript: { include: { segments: true } }, translation: { include: { segments: { include: { qcIssues: true } } } }, recap: true,
    } });
    assert.deepEqual({ transcript: after.transcript, translation: after.translation, recap: after.recap },
      { transcript: legacyBefore.transcript, translation: legacyBefore.translation, recap: legacyBefore.recap });
  } finally {
    await runtimeSql?.end(); await issuerSql?.end();
    for (const client of clients) await client.$disconnect();
    await sql.end(); await owned.stop(); network.mock.restore();
  }
});
