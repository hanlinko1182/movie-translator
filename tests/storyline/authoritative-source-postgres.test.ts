// Synthetic integrity regressions. Every write targets a newly owned private cluster.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { before, after, mock, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { loadRecapSource } from "../../lib/recap/source";
import type { StorySourcePayload, StorySourceSnapshot } from "../../lib/storyline/contracts";
import { createStorylineOperatorAuthority } from "../../lib/storyline/operator-authority";
import { persistPreparedStorylineSource } from "../../lib/storyline/persist-source";
import { persistStorylineScriptDraft } from "../../lib/storyline/persist-script";
import { StorylinePersistenceError } from "../../lib/storyline/persistence-errors";
import { prepareStorylineSource } from "../../lib/storyline/prepare-source";
import { validateScriptPayload } from "../../lib/storyline/script";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { createStorylineReceiptAttestor } from "../../lib/storyline/verification-attestation";
import { VerificationSecurityError } from "../../lib/storyline/verification-errors";
import { createDurableStorylineVerificationService } from "../../lib/storyline/verification-service";
import { DisposableStorylinePostgres } from "./disposable-postgres";
import { fakePersistenceMedia, seedPersistenceFixture } from "./persistence.fixture";
import { date, scope, scriptFixture } from "./fixtures";

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const stalePersistence = (error: unknown) => error instanceof StorylinePersistenceError && error.code === "STALE_STORYLINE_SOURCE";
const staleVerification = (error: unknown) => error instanceof VerificationSecurityError && error.code === "VERIFICATION_SOURCE_STALE";
before(() => { mock.method(globalThis, "fetch", () => assert.fail("No provider/network calls")); });
after(() => mock.restoreAll());

test("authoritative content at persistence and durable boundaries", { timeout: 120_000 }, async t => {
  const owned = await DisposableStorylinePostgres.start(), sql = await owned.client();
  const owner = new PrismaClient({ adapter: new PrismaPg({ ...owned.prismaAdapterConfig(), pipeline: true }) });
  let runtime: PrismaClient | undefined, issuer: PrismaClient | undefined;
  try {
    for (const name of (await readdir("prisma/migrations", { withFileTypes: true })).filter(row => row.isDirectory()).map(row => row.name).sort()) {
      await sql.query(await readFile(join("prisma/migrations", name, "migration.sql"), "utf8"));
    }
    await seedPersistenceFixture(owner);
    // A second real synthetic owner and relationship make endpoint/anchor
    // tampering testable without inventing support in the source contract.
    await owner.character.create({ data: { id: "character-b", projectId: scope.projectId, identityKey: "9".repeat(64), canonicalName: "人物乙", normalizedName: "人物乙" } });
    await owner.characterEvidence.create({ data: { id: "observation-two", analysisRunId: "analysis-one", characterId: "character-b",
      movieId: scope.movieId, sceneId: "scene-one", sceneSequence: 0, transcriptSegmentId: "source-1", evidenceKey: "8".repeat(64),
      evidenceType: "MENTION", evidenceText: "人物乙说话。", inference: "", confidence: "LOW" } });
    await owner.characterRelationship.create({ data: { id: "relationship-one", projectId: scope.projectId,
      characterAId: "character-a", characterBId: "character-b", relationshipType: "ALLY", summary: "Synthetic relationship", confidence: "LOW" } });
    await owner.characterRelationshipEvidence.create({ data: { id: "relationship-observation", analysisRunId: "analysis-one", relationshipId: "relationship-one",
      movieId: scope.movieId, sceneId: "scene-one", sceneSequence: 0, transcriptSegmentId: "source-2", evidenceKey: "7".repeat(64),
      relationshipType: "ALLY", relationshipSummary: "合作。", evidenceText: "讨论合作。", inference: "", confidence: "LOW" } });
    const recapSource = await loadRecapSource(scope.movieId, owner);
    await owner.recap.update({ where: { movieId: scope.movieId }, data: { sourceHash: recapSource.sourceHash } });
    const admin = await owned.securityAdministrator();
    try { await admin.query(await readFile("docs/drafts/storyline-verification-roles.sql", "utf8")); } finally { await admin.end(); }
    runtime = new PrismaClient({ adapter: new PrismaPg({ ...await owned.restrictedLogin("storyline_runtime"), pipeline: true }) });
    issuer = new PrismaClient({ adapter: new PrismaPg({ ...await owned.restrictedLogin("storyline_verification_issuer"), pipeline: true }) });
    const media = fakePersistenceMedia();
    const candidate = await prepareStorylineSource(scope, { database: runtime, inspectMedia: media.inspect, now: () => date });
    const saved = await persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: runtime, inspectMedia: media.inspect });
    const service = createDurableStorylineVerificationService({ readerDatabase: runtime, issuerDatabase: issuer,
      authority: createStorylineOperatorAuthority({ providerId: "synthetic", resolve: async () => null }, () => date),
      attestor: createStorylineReceiptAttestor({ keyId: "synthetic-key", ...generateKeyPairSync("ed25519") }), now: () => date, inspectMedia: media.inspect });

    async function inject(snapshot: StorySourceSnapshot, scriptSource = snapshot) {
      // Legitimate runtime INSERT rights cannot be treated as source authority.
      return runtime!.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${scope.projectId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Movie" WHERE id=${scope.movieId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "StorylineStudio" WHERE id=${saved.studioId} FOR UPDATE`;
        const studio = await tx.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } });
        const version = studio.nextScriptVersion;
        const parent = version === 1 ? null : await tx.storyScriptVersion.findUniqueOrThrow({ where: { studioId_version: { studioId: studio.id, version: version - 1 } } });
        const p = snapshot.payload, prep = p.preparation!;
        await tx.storySourceSnapshot.create({ data: { id: p.id, studioId: studio.id, ...scope, sourceContentHash: snapshot.sourceContentHash,
          sourceContextHash: snapshot.sourceContextHash, dependencyHash: prep.dependencyHash, sourceBindingHash: prep.sourceBindingHash,
          sourceSha256: p.media.sha256, sourceBytes: BigInt(p.media.bytes), sourceDurationMs: p.media.durationMs,
          canonicalPayload: canonicalJson(p), capturedAt: new Date(p.capturedAt) } });
        // Generic Chinese claims avoid making the script itself a separate
        // wrong-character failure: source authenticity must independently reject.
        const script = validateScriptPayload({ ...scriptFixture(scriptSource), id: `injected-script-${version}`, version, parentVersionId: parent?.id ?? null,
          beats: scriptFixture(scriptSource).beats.map(beat => ({ ...beat, claims: beat.claims.map(claim => ({ ...claim, characterRefs: [] })) })) }, scriptSource);
        await tx.storyScriptVersion.create({ data: { id: script.payload.id, studioId: studio.id, sourceSnapshotId: p.id,
          sourceContentHash: snapshot.sourceContentHash, sourceContextHash: snapshot.sourceContextHash, scriptHash: script.scriptHash,
          version, parentVersionId: parent?.id ?? null, parentVersion: parent?.version ?? null, origin: script.payload.origin, canonicalPayload: canonicalJson(script.payload) } });
        await tx.storyBeat.createMany({ data: script.payload.beats.map(beat => ({ studioId: studio.id, scriptVersionId: script.payload.id,
          beatId: beat.id, order: beat.order, category: beat.category, startMs: beat.startMs, endMs: beat.endMs, canonicalPayload: canonicalJson(beat) })) });
        await tx.storylineStudio.update({ where: { id: studio.id }, data: { currentSnapshotId: p.id, currentScriptVersionId: script.payload.id } });
        return { ...scope, studioId: studio.id, scriptVersionId: script.payload.id };
      });
    }

    const cases: Array<[string, (p: Mutable<StorySourcePayload>) => void]> = [
      ["Chinese text", p => { p.transcript.segments[1].text += "更改。"; }],
      ["Chinese segment identity", p => { p.transcript.segments[3].id += "-altered"; }],
      ["Chinese timing", p => { p.transcript.segments[3].startMs++; }],
      ["Chinese sequence assignment", p => { const a = p.transcript.segments[3], b = p.transcript.segments[4]; [a.text, b.text] = [b.text, a.text]; }],
      ["missing Chinese segment", p => { p.transcript.segments = p.transcript.segments.filter(row => row.sequence !== 3); }],
      ["additional Chinese segment", p => { p.transcript.segments.push({ ...p.transcript.segments[11], id: "extra-source", sequence: 12, startMs: 23000 }); }],
      ["Myanmar exact Unicode", p => { p.translation!.rows[1].text += "ပြောင်းလဲမှု။"; }],
      ["approval", p => { p.translation!.rows[1].reviewStatus = "UNREVIEWED"; }],
      ["manual provenance", p => { p.translation!.rows[0].origin = "MODEL"; }],
      ["provider and refinement provenance", p => { p.translation!.rows[1].origin = "REFINED"; p.translation!.rows[1].refinementJobId = "synthetic-refinement"; }],
      ["translation row revision", p => { p.translation!.rows[1].revision++; }],
      ["translation alignment", p => { p.translation!.rows[1].endMs++; }],
      ["stale translation parent", p => { p.translation!.sourceTranscriptId = "different-transcript"; }],
      ["stale manual binding", p => { p.translation!.rows[0].manualSourceHash = "f".repeat(64); }],
      ["active QC content", p => { p.translation!.rows[0].qcIssues[0].message += " altered"; }],
      ["resolved QC disposition", p => { p.translation!.rows[1].qcIssues[0].resolution = "Altered disposition"; }],
      ["QC scan state", p => { p.translation!.qcScannedAt = null; p.preparation!.translationQcState = "UNSCANNED"; }],
      ["missing target row", p => { p.translation!.rows = p.translation!.rows.filter(row => row.sequence !== 2); }],
      ["additional target row", p => { const row = p.translation!.rows[2]; p.translation!.rows.push({ ...row, id: "extra-target", sequence: 11, startMs: 22000, endMs: 24000 }); }],
      ["excluded target content", p => { p.translation!.rows[10].text += "ပြင်ဆင်။"; }],
      ["translation missing state", p => { p.translation = null; p.preparation!.translationQcState = "TRANSLATION_MISSING"; }],
      ["source scene identity", p => { p.scenes[0].id = "altered-scene"; p.preparation!.observations.forEach(row => { row.sceneId = "altered-scene"; }); }],
      ["additional scene boundary", p => { p.scenes[0].endMs = 22000; p.scenes.push({ ...p.scenes[0], id: "scene-extra", sequence: 1, startMs: 22000, endMs: 24000 }); }],
      ["character attribution", p => { p.characters[0].name = "错误人物"; }],
      ["character evidence text", p => { p.characters[0].evidence[0].evidenceText += "altered"; p.preparation!.observations.find(row => row.ownerId === "character-a")!.evidenceText += "altered"; }],
      ["character permitted anchor", p => { p.characters[0].evidence[0].anchor.segmentSequence = 3; const row = p.preparation!.observations.find(row => row.ownerId === "character-a")!; row.anchor.segmentSequence = 3; row.transcriptSegmentId = "source-3"; }],
      ["relationship endpoints", p => { const r = p.relationships[0]; [r.characterAId, r.characterBId] = [r.characterBId, r.characterAId]; }],
      ["relationship permitted anchor", p => { p.relationships[0].evidence[0].anchor.segmentSequence = 4; const row = p.preparation!.observations.find(row => row.ownerKind === "RELATIONSHIP")!; row.anchor.segmentSequence = 4; row.transcriptSegmentId = "source-4"; }],
      ["character aliases", p => { p.preparation!.aliases[0].values.push("伪造别名"); }],
      ["analysis provenance", p => { p.preparation!.characterAnalysis.model = "altered-model"; }],
      ["domain audit timestamp", p => { p.translation!.rows[1].reviewedAt = "2026-10-02T00:00:00.000Z"; }],
      ["advisory recap text", p => { p.preparation!.legacyRecap!.output.summary += "ပြောင်းလဲ။"; }],
    ];
    for (const [index, [label, mutate]] of cases.entries()) await t.test(`${label}: rehashed copied dependencies rejected at both boundaries`, async () => {
      const payload = structuredClone(candidate.snapshot.payload) as Mutable<StorySourcePayload>;
      mutate(payload);
      const snapshot = validateSourceSnapshot(payload, scope); // Explicitly self-consistent, not merely malformed.
      assert.equal(snapshot.payload.preparation!.dependencyHash, candidate.snapshot.payload.preparation!.dependencyHash);
      const before = await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } });
      const count = await runtime!.storySourceSnapshot.count();
      await assert.rejects(() => persistPreparedStorylineSource({ selection: scope, candidate: { ...candidate, snapshot }, expectedRevision: before.revision },
        { database: runtime!, inspectMedia: media.inspect }), stalePersistence);
      assert.deepEqual(await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } }), before);
      assert.equal(await runtime!.storySourceSnapshot.count(), count);
      const inserted = validateSourceSnapshot({ ...snapshot.payload, id: `injected-source-${index}` }, scope);
      const selected = await inject(inserted);
      await assert.rejects(() => service.propose(selected, "claim-1"), staleVerification);
      const lookup = await service.lookup(selected);
      assert.equal(lookup.contextState, "STALE"); assert.equal(lookup.sourceEligible, false);
      assert.ok(lookup.claims.every(claim => claim.state !== "SOURCE_VERIFIED"));
      const after = await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } });
      await assert.rejects(() => persistStorylineScriptDraft({ ...scope, sourceSnapshotId: inserted.payload.id, expectedRevision: after.revision,
        origin: "HUMAN", beats: scriptFixture(inserted).beats }, { database: runtime!, inspectMedia: media.inspect }), stalePersistence);
      assert.deepEqual(await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } }), after);
    });

    const malformed: Array<[string, (p: Mutable<StorySourcePayload>) => void]> = [
      ["unknown speaker field", p => { Object.assign(p.transcript.segments[0], { speaker: "forged-speaker" }); }],
      ["reordered transcript array", p => { p.transcript.segments.reverse(); }],
      ["invalid scene sequence", p => { p.scenes[0].sequence = 9; }],
      ["wrong relationship endpoint", p => { p.relationships[0].characterAId = "unowned-character"; }],
      ["wrong character observation ownership", p => { p.preparation!.observations.find(row => row.ownerId === "character-a")!.ownerId = "character-b"; }],
    ];
    for (const [index, [label, mutate]] of malformed.entries()) await t.test(`${label}: structural guards remain mandatory at both boundaries`, async () => {
      const payload = structuredClone(candidate.snapshot.payload) as Mutable<StorySourcePayload>;
      mutate(payload);
      const studio = await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } });
      const count = await runtime!.storySourceSnapshot.count();
      await assert.rejects(() => persistPreparedStorylineSource({ selection: scope, candidate: { ...candidate, snapshot: { ...candidate.snapshot, payload } }, expectedRevision: studio.revision },
        { database: runtime!, inspectMedia: media.inspect }), (error: unknown) => error instanceof StorylinePersistenceError && error.code === "INVALID_CANDIDATE");
      assert.deepEqual(await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } }), studio);
      assert.equal(await runtime!.storySourceSnapshot.count(), count);
      payload.id = `malformed-source-${index}`;
      // SQL enforces projections/bounds, not the entire TypeScript source grammar.
      // Even externally inserted JSON with well-shaped hashes must fail lookup.
      const injected = { ...candidate.snapshot, payload, sourceContentHash: contractHash("synthetic-untrusted-content", payload),
        sourceContextHash: contractHash("synthetic-untrusted-context", payload) };
      const scriptSource = { ...candidate.snapshot, payload: { ...candidate.snapshot.payload, id: payload.id },
        sourceContentHash: injected.sourceContentHash, sourceContextHash: injected.sourceContextHash };
      const selected = await inject(injected, scriptSource);
      const invalidContext = (error: unknown) => error instanceof VerificationSecurityError && error.code === "VERIFICATION_CONTEXT_INVALID";
      await assert.rejects(() => service.propose(selected, "claim-1"), invalidContext);
      await assert.rejects(() => service.lookup(selected), invalidContext);
    });

    await t.test("genuine unchanged context accepted; only capture time and snapshot identity excluded", async () => {
      const studio = await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } });
      const freshCapture = await prepareStorylineSource(scope, { database: runtime, inspectMedia: media.inspect, now: () => "2026-10-03T00:00:00.000Z" });
      const result = await persistPreparedStorylineSource({ selection: scope, candidate: freshCapture, expectedRevision: studio.revision }, { database: runtime, inspectMedia: media.inspect });
      assert.equal(result.snapshotId, saved.snapshotId); assert.equal(result.deduplicated, true);
      const script = await persistStorylineScriptDraft({ ...scope, sourceSnapshotId: result.snapshotId, expectedRevision: result.revision,
        origin: "HUMAN", beats: scriptFixture(candidate.snapshot).beats }, { database: runtime, inspectMedia: media.inspect });
      const selected = { ...scope, studioId: saved.studioId, scriptVersionId: script.scriptVersionId };
      assert.ok(await service.propose(selected, "claim-1"));
      assert.equal((await service.lookup(selected)).contextState, "CURRENT");
      // Synthetic source writer change: preserve all immutable historical bytes.
      const historical = await runtime!.storySourceSnapshot.findUniqueOrThrow({ where: { id: saved.snapshotId } });
      await runtime!.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${scope.projectId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Movie" WHERE id=${scope.movieId} FOR UPDATE`;
        await tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Synthetic source writer changed QC" } });
      });
      await assert.rejects(() => service.propose(selected, "claim-1"), staleVerification);
      assert.equal((await service.lookup(selected)).contextState, "STALE");
      assert.deepEqual(await runtime!.storySourceSnapshot.findUniqueOrThrow({ where: { id: saved.snapshotId } }), historical);
      const current = await runtime!.storylineStudio.findUniqueOrThrow({ where: { id: saved.studioId } });
      await assert.rejects(() => persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: current.revision }, { database: runtime, inspectMedia: media.inspect }), stalePersistence);
    });
    assert.equal(await runtime.storySourceVerification.count(), 0, "This integrity suite never authorizes or issues any receipt");
    assert.equal(await runtime.storySourceSnapshot.count(), cases.length + malformed.length + 1, "Rejected persistence never adds artifacts; injected historical fixtures remain");
  } finally {
    await issuer?.$disconnect(); await runtime?.$disconnect(); await owner.$disconnect(); await sql.end(); await owned.stop();
  }
});
