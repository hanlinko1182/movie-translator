// M1-F security acceptance uses a new owned database, never application data.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { prepareStorylineSource } from "../../lib/storyline/prepare-source";
import { persistPreparedStorylineSource } from "../../lib/storyline/persist-source";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { createStorylineOperatorAuthority } from "../../lib/storyline/operator-authority";
import { validateScriptPayload } from "../../lib/storyline/script";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { createStorylineReceiptAttestor } from "../../lib/storyline/verification-attestation";
import { VerificationSecurityError } from "../../lib/storyline/verification-errors";
import { createDurableStorylineVerificationService } from "../../lib/storyline/verification-service";
import { DisposableStorylinePostgres } from "./disposable-postgres";
import { fakePersistenceMedia, seedPersistenceFixture } from "./persistence.fixture";
import { date, scope, scriptFixture } from "./fixtures";

test("M1-F authoritative snapshot acceptance on isolated PostgreSQL", { timeout: 120_000 }, async t => {
  const owned = await DisposableStorylinePostgres.start();
  const sql = await owned.client();
  const owner = new PrismaClient({ adapter: new PrismaPg({ ...owned.prismaAdapterConfig(), pipeline: true }) });
  let runtime: PrismaClient | undefined, issuer: PrismaClient | undefined;
  try {
    for (const name of (await readdir("prisma/migrations", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
      await sql.query(await readFile(join("prisma/migrations", name, "migration.sql"), "utf8"));
    }
    await seedPersistenceFixture(owner);
    const admin = await owned.securityAdministrator();
    try { await admin.query(await readFile("docs/drafts/storyline-verification-roles.sql", "utf8")); }
    finally { await admin.end(); }
    runtime = new PrismaClient({ adapter: new PrismaPg({ ...await owned.restrictedLogin("storyline_runtime"), pipeline: true }) });
    const media = fakePersistenceMedia();
    const candidate = await prepareStorylineSource(scope, { database: runtime, inspectMedia: media.inspect, now: () => date });
    await t.test("preparation Chinese text matches the authoritative selected movie", async () => {
      const original = await runtime!.transcriptSegment.findUniqueOrThrow({ where: { id: candidate.snapshot.payload.transcript.segments[1].id } });
      assert.equal(candidate.snapshot.payload.transcript.segments[1].text, original.text);
    });
    await t.test("rehashed altered Chinese must be rejected even with unchanged copied dependency metadata", async () => {
      const payload = { ...candidate.snapshot.payload, transcript: { ...candidate.snapshot.payload.transcript,
        segments: candidate.snapshot.payload.transcript.segments.map((segment, index) =>
          index === 1 ? { ...segment, text: "仅用于安全测试的错误原文。" } : segment) } };
      const altered = { ...candidate, snapshot: validateSourceSnapshot(payload, scope) };
      // All copied media/dependency identifiers remain genuine. These untrusted
      // identifiers must not authenticate different frozen source content.
      assert.equal(altered.snapshot.payload.preparation!.dependencyHash, candidate.snapshot.payload.preparation!.dependencyHash);
      assert.notEqual(altered.snapshot.sourceContentHash, candidate.snapshot.sourceContentHash);
      await assert.rejects(() => persistPreparedStorylineSource({ selection: scope, candidate: altered, expectedRevision: null },
        { database: runtime!, inspectMedia: media.inspect }));
      assert.equal(await runtime!.storySourceSnapshot.count(), 0);
    });

    // Independent attack path: the normal runtime legitimately has snapshot and
    // draft INSERT privileges. A trusted issuer must not trust those rows solely
    // because their recomputable dependency metadata matches the live source.
    const payload = { ...candidate.snapshot.payload, id: "synthetic-injected-source",
      transcript: { ...candidate.snapshot.payload.transcript,
        segments: candidate.snapshot.payload.transcript.segments.map((segment, index) =>
          index === 1 ? { ...segment, text: "独立的安全测试错误原文。" } : segment) } };
    const injected = validateSourceSnapshot(payload, scope);
    const studio = await runtime.storylineStudio.findUnique({ where: { movieId: scope.movieId } }) ??
      await runtime.storylineStudio.create({ data: { ...scope, verificationGenesisHash: contractHash("story-verification-ledger-empty-v1", scope) } });
    const script = validateScriptPayload({ ...scriptFixture(injected), id: "synthetic-injected-script", origin: "HUMAN" }, injected);
    await runtime.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${scope.projectId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Movie" WHERE id=${scope.movieId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "StorylineStudio" WHERE id=${studio.id} FOR UPDATE`;
      await tx.storySourceSnapshot.create({ data: { id: payload.id, studioId: studio.id, ...scope,
        sourceContentHash: injected.sourceContentHash, sourceContextHash: injected.sourceContextHash,
        dependencyHash: payload.preparation!.dependencyHash, sourceBindingHash: payload.preparation!.sourceBindingHash,
        sourceSha256: payload.media.sha256, sourceBytes: BigInt(payload.media.bytes), sourceDurationMs: payload.media.durationMs,
        canonicalPayload: canonicalJson(injected.payload), capturedAt: new Date(payload.capturedAt) } });
      await tx.storyScriptVersion.create({ data: { id: script.payload.id, studioId: studio.id, sourceSnapshotId: payload.id,
        sourceContentHash: injected.sourceContentHash, sourceContextHash: injected.sourceContextHash, scriptHash: script.scriptHash,
        version: 1, origin: "HUMAN", canonicalPayload: canonicalJson(script.payload) } });
      await tx.storyBeat.createMany({ data: script.payload.beats.map(beat => ({ studioId: studio.id,
        scriptVersionId: script.payload.id, beatId: beat.id, order: beat.order, category: beat.category,
        startMs: beat.startMs, endMs: beat.endMs, canonicalPayload: canonicalJson(beat) })) });
      await tx.storylineStudio.update({ where: { id: studio.id }, data: { currentSnapshotId: payload.id, currentScriptVersionId: script.payload.id } });
    });
    issuer = new PrismaClient({ adapter: new PrismaPg({ ...await owned.restrictedLogin("storyline_verification_issuer"), pipeline: true }) });
    const service = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: issuer,
      authority: createStorylineOperatorAuthority({ providerId: "synthetic-provider", resolve: async () => null }, () => date),
      attestor: createStorylineReceiptAttestor({ keyId: "synthetic-test-key", ...generateKeyPairSync("ed25519") }), now: () => date, inspectMedia: media.inspect });
    const selected = { ...scope, studioId: studio.id, scriptVersionId: script.payload.id };
    await t.test("issuer must reject source content injected by runtime despite valid hash shape and genuine copied dependency hash", async () => {
      await assert.rejects(() => service.propose(selected, "claim-1"),
        (error: unknown) => error instanceof VerificationSecurityError && ["VERIFICATION_SOURCE_STALE", "VERIFICATION_CONTEXT_INVALID"].includes(error.code));
    });
    await t.test("authoritative lookup must not label injected Chinese source content CURRENT", async () => {
      const lookup = await service.lookup(selected);
      assert.equal(lookup.contextState, "STALE");
    });
    assert.equal(await runtime.storySourceVerification.count(), 0, "No receipt is actually issued by this audit");
  } finally {
    await issuer?.$disconnect(); await runtime?.$disconnect(); await owner.$disconnect(); await sql.end(); await owned.stop();
  }
});
