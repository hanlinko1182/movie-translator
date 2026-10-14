import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { prepareStorylineSource } from "../../lib/storyline/prepare-source";
import { persistPreparedStorylineSource } from "../../lib/storyline/persist-source";
import { persistStorylineScriptDraft } from "../../lib/storyline/persist-script";
import { StorylinePersistenceError } from "../../lib/storyline/persistence-errors";
import { STORYLINE_VERIFICATION_ISSUANCE_ENABLED } from "../../lib/storyline/verification-issuance";
import { DisposableStorylinePostgres } from "./disposable-postgres";
import { movieFixture, sourceKey } from "./preparation.fixture";
import { date, scope, scriptFixture, sourceFixture } from "./fixtures";

import { seedPersistenceFixture, fakePersistenceMedia } from "./persistence.fixture";

const at = new Date(date);

test("M1-E2A services use only an owned disposable PostgreSQL database", { timeout: 120_000 }, async t => {
  const owned = await DisposableStorylinePostgres.start();
  const sql = await owned.client();
  let db: PrismaClient | undefined;
  try {
    const folders = (await readdir("prisma/migrations", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    assert.ok(folders.some(name => name.includes("storyline_m1_foundation")));
    for (const folder of folders) await sql.query(await readFile(join("prisma/migrations", folder, "migration.sql"), "utf8"));
    assert.equal((await sql.query(`SELECT count(*)::int AS n FROM "StorylineStudio"`)).rows[0].n, 0);
    db = new PrismaClient({ adapter: new PrismaPg({ ...owned.prismaAdapterConfig(), pipeline: true }) });
    await seedPersistenceFixture(db);
    const baseline = await db.movie.findUniqueOrThrow({ where: { id: scope.movieId }, include: { transcript: { include: { segments: true } }, translation: { include: { segments: true } }, recap: true } });
    const media = fakePersistenceMedia();
    const candidate = await prepareStorylineSource(scope, { database: db, inspectMedia: media.inspect, now: () => date });
    await t.test("validated snapshot persists, deduplicates, and leaves legacy data unchanged", async () => {
      const first = await persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: db!, inspectMedia: media.inspect });
      assert.equal(first.persisted, true); assert.equal(first.approved, false); assert.equal(first.deduplicated, false);
      const again = await persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: db!, inspectMedia: media.inspect });
      assert.equal(again.snapshotId, first.snapshotId); assert.equal(again.deduplicated, true);
      assert.equal(await db!.storySourceSnapshot.count(), 1);
      const after = await db!.movie.findUniqueOrThrow({ where: { id: scope.movieId }, include: { transcript: { include: { segments: true } }, translation: { include: { segments: true } }, recap: true } });
      assert.deepEqual(after, baseline);
    });
    await t.test("draft script allocation is atomic and does not issue verification", async () => {
      assert.equal(STORYLINE_VERIFICATION_ISSUANCE_ENABLED, false);
      const studio = await db!.storylineStudio.findUniqueOrThrow({ where: { movieId: scope.movieId } });
      const beats = scriptFixture(candidate.snapshot).beats;
      const first = await persistStorylineScriptDraft({ ...scope, sourceSnapshotId: candidate.snapshot.payload.id,
        expectedRevision: studio.revision, origin: "HUMAN", beats }, { database: db!, inspectMedia: media.inspect });
      assert.equal(first.version, 1); assert.equal(first.approved, false); assert.equal(first.sourceVerified, false);
      assert.equal(await db!.storyBeat.count(), 2);
      assert.equal(await db!.storySourceVerification.count(), 0);
      await assert.rejects(() => persistStorylineScriptDraft({ ...scope, sourceSnapshotId: candidate.snapshot.payload.id,
        expectedRevision: studio.revision, origin: "HUMAN", beats }, { database: db!, inspectMedia: media.inspect }),
      (error: unknown) => error instanceof StorylinePersistenceError && error.code === "STUDIO_REVISION_CONFLICT");
      const current = await db!.storylineStudio.findUniqueOrThrow({ where: { movieId: scope.movieId } });
      assert.equal(current.nextScriptVersion, 2);
    });
    await t.test("wrong selection, stale media and media replacement fail without writing", async () => {
      await assert.rejects(() => persistPreparedStorylineSource({ selection: { projectId: "another-project", movieId: scope.movieId }, candidate,
        expectedRevision: null }, { database: db!, inspectMedia: media.inspect }),
      (error: unknown) => error instanceof StorylinePersistenceError && error.code === "INVALID_CANDIDATE");
      await assert.rejects(() => persistPreparedStorylineSource({ selection: { projectId: scope.projectId, movieId: "movie-other" }, candidate,
        expectedRevision: null }, { database: db!, inspectMedia: media.inspect }),
      (error: unknown) => error instanceof StorylinePersistenceError && error.code === "INVALID_CANDIDATE");
      await assert.rejects(() => persistStorylineScriptDraft({ projectId: scope.projectId, movieId: "movie-other",
        sourceSnapshotId: candidate.snapshot.payload.id, expectedRevision: 0, origin: "HUMAN", beats: scriptFixture(candidate.snapshot).beats },
      { database: db!, inspectMedia: media.inspect }),
      (error: unknown) => error instanceof StorylinePersistenceError && error.code === "SNAPSHOT_NOT_FOUND");
      media.setInvalid(true);
      await assert.rejects(() => persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: db!, inspectMedia: media.inspect }),
      (error: unknown) => error instanceof StorylinePersistenceError && error.code === "SOURCE_MEDIA_CHANGED");
      media.setInvalid(false); media.setChanged(true);
      await assert.rejects(() => persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: db!, inspectMedia: media.inspect }),
      (error: unknown) => error instanceof StorylinePersistenceError && error.code === "SOURCE_MEDIA_CHANGED");
      media.setChanged(false);
      assert.equal(await db!.storySourceSnapshot.count(), 1);
      assert.equal(await db!.storySourceVerification.count(), 0);
    });
    await t.test("translation text, approval, QC, alignment, scene and evidence changes stale the candidate", async () => {
      const cases: Array<[string, () => Promise<void>, () => Promise<void>]> = [
        ["text", () => db!.translatedSegment.update({ where: { id: "target-0" }, data: { text: "ပြောင်းလဲထားသည်။" } }).then(() => undefined),
          () => db!.translatedSegment.update({ where: { id: "target-0" }, data: { text: sourceFixture().translation!.rows[0].text } }).then(() => undefined)],
        ["approval", () => db!.translatedSegment.update({ where: { id: "target-0" }, data: { reviewStatus: "APPROVED" } }).then(() => undefined),
          () => db!.translatedSegment.update({ where: { id: "target-0" }, data: { reviewStatus: "NEEDS_REVIEW" } }).then(() => undefined)],
        ["QC", () => db!.translationQcIssue.update({ where: { id: "qc-0" }, data: { resolution: "synthetic edit" } }).then(() => undefined),
          () => db!.translationQcIssue.update({ where: { id: "qc-0" }, data: { resolution: null, updatedAt: at } }).then(() => undefined)],
        ["alignment", () => db!.translatedSegment.update({ where: { id: "target-0" }, data: { endMs: 2001 } }).then(() => undefined),
          () => db!.translatedSegment.update({ where: { id: "target-0" }, data: { endMs: 2000 } }).then(() => undefined)],
        ["scene", () => db!.scene.update({ where: { id: "scene-one" }, data: { endMs: 23999 } }).then(() => undefined),
          () => db!.scene.update({ where: { id: "scene-one" }, data: { endMs: 24000, updatedAt: at } }).then(() => undefined)],
        ["character evidence", () => db!.characterEvidence.update({ where: { id: "observation-one" }, data: { evidenceText: "Synthetic changed evidence" } }).then(() => undefined),
          () => db!.characterEvidence.update({ where: { id: "observation-one" }, data: { evidenceText: movieFixture().characterAnalysis!.evidence[0].evidenceText, updatedAt: at } }).then(() => undefined)],
      ];
      for (const [name, change, restore] of cases) {
        await change();
        try {
          await assert.rejects(() => persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null },
            { database: db!, inspectMedia: media.inspect }), () => true, `${name} must invalidate the prepared candidate`);
          assert.equal(await db!.storySourceSnapshot.count(), 1);
        } finally { await restore(); }
      }
    });
    await t.test("Movie key update while snapshot persistence waits is rejected after the lock", async () => {
      let inspected!: () => void;
      const inspectedPromise = new Promise<void>(resolve => { inspected = resolve; });
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let locked!: () => void;
      const lockedPromise = new Promise<void>(resolve => { locked = resolve; });
      const blocker = db!.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${scope.projectId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Movie" WHERE id=${scope.movieId} FOR UPDATE`;
        locked(); await gate;
        await tx.movie.update({ where: { id: scope.movieId }, data: { storageKey: "movies/00000000-0000-4000-8000-000000000099.mp4" } });
      }, { maxWait: 5000, timeout: 10000 });
      await lockedPromise;
      const waiting = persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: db!,
        inspectMedia: async key => { inspected(); return media.inspect(key); } });
      await inspectedPromise;
      release(); await blocker;
      await assert.rejects(waiting, (error: unknown) => error instanceof StorylinePersistenceError && error.code === "STALE_STORYLINE_SOURCE");
      await db!.movie.update({ where: { id: scope.movieId }, data: { storageKey: sourceKey, updatedAt: at } });
      assert.equal(await db!.storySourceSnapshot.count(), 1);
    });
    await t.test("competing script drafts allocate only one version and invalid draft rolls back", async () => {
      const studio = await db!.storylineStudio.findUniqueOrThrow({ where: { movieId: scope.movieId } });
      const input = { ...scope, sourceSnapshotId: candidate.snapshot.payload.id, expectedRevision: studio.revision,
        origin: "HUMAN", beats: scriptFixture(candidate.snapshot).beats };
      const results = await Promise.allSettled([
        persistStorylineScriptDraft(input, { database: db!, inspectMedia: media.inspect }),
        persistStorylineScriptDraft(input, { database: db!, inspectMedia: media.inspect }),
      ]);
      assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
      assert.equal(results.filter(row => row.status === "rejected").length, 1);
      const next = await db!.storylineStudio.findUniqueOrThrow({ where: { movieId: scope.movieId } });
      assert.equal(next.nextScriptVersion, 3);
      assert.equal(await db!.storyScriptVersion.count(), 2);
      assert.equal(await db!.storyBeat.count(), 4);
      const invalid = structuredClone(scriptFixture(candidate.snapshot).beats);
      invalid[0].claims[0].evidence[0].segmentSequence = 11;
      await assert.rejects(() => persistStorylineScriptDraft({ ...input, expectedRevision: next.revision, beats: invalid },
        { database: db!, inspectMedia: media.inspect }),
      (error: unknown) => error instanceof StorylinePersistenceError && error.code === "SCRIPT_INVALID");
      assert.equal((await db!.storylineStudio.findUniqueOrThrow({ where: { movieId: scope.movieId } })).nextScriptVersion, 3);
      assert.equal(await db!.storySourceVerification.count(), 0);
    });
    const afterAll = await db.movie.findUniqueOrThrow({ where: { id: scope.movieId }, include: {
      transcript: { include: { segments: true } }, translation: { include: { segments: true } }, recap: true,
    } });
    assert.deepEqual({ transcript: afterAll.transcript, translation: afterAll.translation, recap: afterAll.recap },
      { transcript: baseline.transcript, translation: baseline.translation, recap: baseline.recap },
      "Storyline writes must not mutate existing subtitle, transcript or Recap rows");
  } finally {
    await db?.$disconnect();
    await sql.end();
    await owned.stop();
  }
});
