// Synthetic only. DisposableStorylinePostgres creates and verifies a private PG cluster;
// this suite never reads DATABASE_URL or connects to the application database.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type { Client } from "pg";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { prepareStorylineSource } from "../../../lib/storyline/prepare-source";
import { validateScriptPayload } from "../../../lib/storyline/script";
import { DisposableStorylinePostgres } from "../disposable-postgres";
import { preparationFixture } from "../preparation.fixture";
import { date, scope, scriptFixture } from "../fixtures";

const hash = (value: string) => contractHash("synthetic-m2-db-v1", value);
const fail = async (operation: () => Promise<unknown>, sqlstate: string) => {
  try { await operation(); } catch (error) { assert.equal((error as { code?: string }).code, sqlstate); return; }
  assert.fail(`Expected PostgreSQL ${sqlstate}`);
};
const transact = async (client: Client, operation: () => Promise<void>) => {
  await client.query("BEGIN");
  try { await operation(); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
};

async function bootstrap(client: Client) {
  const migrations = (await readdir("prisma/migrations", { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && !entry.name.includes("storyline_m1_foundation"))
    .map(entry => entry.name).sort();
  assert.ok(migrations.length >= 14);
  for (const folder of migrations) await client.query(await readFile(join("prisma/migrations", folder, "migration.sql"), "utf8"));
  await client.query(await readFile("prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql", "utf8"));
  const reviewSql = await readFile("docs/drafts/storyline-m2-jobs.sql", "utf8");
  assert.match(reviewSql, /ROLLBACK;\s*$/);
  await client.query(reviewSql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
  const tables = (await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Story%'`)).rows.map(row => row.tablename);
  for (const name of ["StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryProviderSubmission", "StoryTaskResult", "StoryTaskEvent"])
    assert.ok(tables.includes(name), name);
}

async function fixtures(client: Client) {
  await client.query(`INSERT INTO "Project" (id,name,slug,"updatedAt") VALUES
    ('fixture-project','Synthetic A','m2-project',$1),('m2-other','Synthetic B','m2-other',$1)`, [date]);
  await client.query(`INSERT INTO "Movie" (id,"projectId",title,"storageKey","updatedAt") VALUES
    ('movie-old','fixture-project','Synthetic older','synthetic-only/old.mp4',$1),
    ('movie-other','m2-other','Synthetic other','synthetic-only/other.mp4',$1)`, [date]);
  await client.query(`INSERT INTO "StorylineStudio" (id,"projectId","movieId","verificationGenesisHash","updatedAt") VALUES
    ('studio-old','fixture-project','movie-old',$1,$3),('studio-other','m2-other','movie-other',$2,$3)`, [
    contractHash("story-verification-ledger-empty-v1", { projectId: "fixture-project", movieId: "movie-old" }),
    contractHash("story-verification-ledger-empty-v1", { projectId: "m2-other", movieId: "movie-other" }), date,
  ]);
  const prepared = preparationFixture();
  const source = (await prepareStorylineSource(scope, { database: prepared.database, inspectMedia: prepared.inspectMedia, now: prepared.now })).snapshot;
  const p = source.payload, prep = p.preparation!;
  await client.query(`INSERT INTO "StorySourceSnapshot" (id,"studioId","projectId","movieId","sourceContentHash","sourceContextHash","dependencyHash","sourceBindingHash","sourceSha256","sourceBytes","sourceDurationMs","canonicalPayload","capturedAt")
    VALUES ($1,'studio-old','fixture-project','movie-old',$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [p.id, source.sourceContentHash, source.sourceContextHash,
    prep.dependencyHash, prep.sourceBindingHash, p.media.sha256, p.media.bytes, p.media.durationMs, canonicalJson(p), p.capturedAt]);
  const script = validateScriptPayload(scriptFixture(source), source), s = script.payload;
  await transact(client, async () => {
    await client.query(`INSERT INTO "StoryScriptVersion" (id,"studioId","sourceSnapshotId","sourceContentHash","sourceContextHash","scriptHash",version,"parentVersionId","parentVersion",origin,"canonicalPayload")
      VALUES ($1,'studio-old',$2,$3,$4,$5,1,NULL,NULL,$6,$7)`, [s.id, s.sourceSnapshotId, s.sourceContentHash, s.sourceContextHash, script.scriptHash, s.origin, canonicalJson(s)]);
    for (const beat of s.beats) await client.query(`INSERT INTO "StoryBeat" ("scriptVersionId","studioId","beatId","order",category,"startMs","endMs","canonicalPayload") VALUES ($1,'studio-old',$2,$3,$4,$5,$6,$7)`,
      [s.id, beat.id, beat.order, beat.category, beat.startMs, beat.endMs, canonicalJson(beat)]);
  });
  return { source, script };
}

function recipe(source: Awaited<ReturnType<typeof fixtures>>["source"], script: Awaited<ReturnType<typeof fixtures>>["script"] | null, kind = "ANALYZE_EVIDENCE") {
  return { schemaVersion: "story-task-recipe-v1", projectId: "fixture-project", movieId: "movie-old", studioId: "studio-old", kind,
    expectedStudioRevision: 3, source: { snapshotId: source.payload.id, contentHash: source.sourceContentHash, contextHash: source.sourceContextHash },
    script: script ? { versionId: script.payload.id, hash: script.scriptHash } : null,
    profile: { definitionHash: hash("profile") }, window: { startMs: 0, endMs: 1000 } };
}
async function addTask(client: Client, id: string, fixture: Awaited<ReturnType<typeof fixtures>>, options?: { script?: boolean; kind?: string; projectId?: string; movieId?: string; studioId?: string; recipeText?: string }) {
  const withScript = options?.script ?? false, kind = options?.kind ?? "ANALYZE_EVIDENCE";
  const subject = recipe(fixture.source, withScript ? fixture.script : null, kind);
  const canonical = options?.recipeText ?? canonicalJson(subject);
  await client.query(`INSERT INTO "StoryTask" (id,"studioId","projectId","movieId","sourceSnapshotId","sourceContentHash","sourceContextHash","scriptVersionId","scriptHash",kind,"recipeHash","canonicalRecipe","profileHash","expectedStudioRevision")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,3)`, [id, options?.studioId ?? "studio-old", options?.projectId ?? "fixture-project", options?.movieId ?? "movie-old",
    fixture.source.payload.id, fixture.source.sourceContentHash, fixture.source.sourceContextHash,
    withScript ? fixture.script.payload.id : null, withScript ? fixture.script.scriptHash : null, kind,
    hash(canonical), canonical, hash("profile")]);
}
async function grant(client: Client, taskId: string, generation = 0, ttl = "4 minutes") {
  const id = `grant-${taskId}-${generation}`;
  await client.query(`INSERT INTO "StoryPaidConfirmation" (id,"studioId",generation,"recipeHash","profileHash","expectedStudioRevision","quoteMaxUsdMicros","authorityRef","preparedAt","expiresAt")
    SELECT $1,'studio-old',$2,"recipeHash","profileHash",3,1000,'synthetic-authority',clock_timestamp(),clock_timestamp()+$4::interval FROM "StoryTask" WHERE id=$3`, [id, generation, taskId, ttl]);
  await client.query(`UPDATE "StoryPaidConfirmation" SET "taskId"=$1,state='CONSUMED',"consumedAt"=clock_timestamp() WHERE id=$2`, [taskId, id]);
  return id;
}
async function lease(client: Client, taskId: string) {
  await client.query(`UPDATE "StoryTask" SET state='LEASED',"stateRevision"="stateRevision"+1,"leaseOwner"='synthetic-worker',"leaseUntil"=clock_timestamp()+interval '2 minutes' WHERE id=$1`, [taskId]);
}
async function checkpoint(client: Client, taskId: string, grantId: string, generation = 0) {
  const id = `submission-${taskId}-${generation}`;
  await client.query(`INSERT INTO "StoryProviderSubmission" (id,"taskId",generation,"confirmationId","requestHash",owner) VALUES ($1,$2,$3,$4,$5,'synthetic-worker')`,
    [id, taskId, generation, grantId, hash(`request:${taskId}:${generation}`)]);
  await client.query(`UPDATE "StoryTask" SET state='SUBMITTED',"stateRevision"="stateRevision"+1 WHERE id=$1`, [taskId]);
  return id;
}
async function result(client: Client, taskId: string, submissionId: string, generation = 0) {
  await client.query(`INSERT INTO "StoryTaskResult" (id,"taskId",generation,"submissionId",outcome,"normalizedPayload","payloadHash","validatorVersion","usageClass")
    VALUES ($1,$2,$3,$4,'VALIDATED_CANDIDATE','{}',$5,'synthetic-v1','UNKNOWN')`, [`result-${submissionId}`, taskId, generation, submissionId, hash("{}")]);
  await client.query(`UPDATE "StoryProviderSubmission" SET state='RESOLVED',"definitiveAt"=clock_timestamp() WHERE id=$1`, [submissionId]);
}

test("M2 review SQL on a newly owned disposable PostgreSQL cluster", { timeout: 150_000 }, async t => {
  const owned = await DisposableStorylinePostgres.start();
  const client = await owned.client();
  try {
    const identity = (await client.query<{ db: string; address: string | null; version: string }>(`SELECT current_database() db, inet_server_addr()::text address, current_setting('server_version') version`)).rows[0];
    assert.match(identity.db, /^m1e15_db_[a-f0-9]{20}$/); assert.equal(identity.address, null); assert.match(identity.version, /^18\./);
    await t.test("baseline, M1, then M2 draft apply without touching application database", async () => { await bootstrap(client); });
    const fixture = await fixtures(client);
    await t.test("project/movie/Studio/source/script scope and recipe deduplication", async () => {
      await addTask(client, "task-one", fixture);
      await fail(() => addTask(client, "task-dup", fixture), "23505");
      await fail(() => addTask(client, "task-cross-movie", fixture, { movieId: "movie-other" }), "23514");
      await fail(() => addTask(client, "task-cross-studio", fixture, { studioId: "studio-other" }), "23514");
      await addTask(client, "task-script", fixture, { script: true, kind: "REVIEW_EVIDENCE" });
      const otherScope = { ...recipe(fixture.source, null), projectId: "m2-other", movieId: "movie-other", studioId: "studio-other" };
      await fail(() => addTask(client, "task-cross-source", fixture, {
        projectId: "m2-other", movieId: "movie-other", studioId: "studio-other", recipeText: canonicalJson(otherScope),
      }), "23503");
      const wrongScript = { ...recipe(fixture.source, fixture.script, "REVIEW_MYANMAR"), script: { versionId: "script-other", hash: fixture.script.scriptHash } };
      await fail(() => addTask(client, "task-wrong-script", fixture, { script: true, kind: "REVIEW_MYANMAR", recipeText: canonicalJson(wrongScript) }), "23514");
      await fail(() => client.query(`UPDATE "StoryTask" SET "canonicalRecipe"='{}',"stateRevision"="stateRevision"+1 WHERE id='task-one'`), "23514");
      await fail(() => client.query(`DELETE FROM "Movie" WHERE id='movie-old'`), "23001");
    });
    await t.test("concurrent identical admission has one winner and rollback leaves no partial task", async () => {
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await addTask(a, "admission-winner", fixture, { kind: "PLAN_BEATS" });
        const loser = addTask(b, "admission-loser", fixture, { kind: "PLAN_BEATS" })
          .then(() => "OK", error => (error as { code?: string }).code ?? "UNKNOWN");
        await new Promise(resolve => setTimeout(resolve, 30));
        await a.query("COMMIT");
        assert.equal(await loser, "23505");
        await b.query("ROLLBACK");
        assert.equal((await client.query<{ n: number }>(`SELECT count(*)::int n FROM "StoryTask" WHERE kind='PLAN_BEATS'`)).rows[0].n, 1);
      } finally { await a.end(); await b.end(); }
    });
    await t.test("state revision, dispatch generation and pre-checkpoint cancellation", async () => {
      await client.query(`INSERT INTO "StoryTaskDispatch" ("taskId",generation,"nextDispatchAt") VALUES ('task-one',0,clock_timestamp())`);
      assert.equal((await client.query<{ queueReceipt: string | null }>(`SELECT "queueReceipt" FROM "StoryTaskDispatch" WHERE "taskId"='task-one'`)).rows[0].queueReceipt, null);
      await fail(() => client.query(`UPDATE "StoryTaskDispatch" SET generation=1 WHERE "taskId"='task-one'`), "23514");
      await fail(() => client.query(`UPDATE "StoryTask" SET state='LEASED' WHERE id='task-one'`), "23514");
      await client.query(`UPDATE "StoryTask" SET state='CANCELLED',"stateRevision"="stateRevision"+1 WHERE id='task-one'`);
      await fail(() => client.query(`UPDATE "StoryTask" SET state='SUBMITTED',"stateRevision"="stateRevision"+1 WHERE id='task-one'`), "23514");
      await fail(() => client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"stateRevision"="stateRevision"+1 WHERE id='task-one'`), "23514");
      await grant(client, "task-one", 1);
      await client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"stateRevision"="stateRevision"+1 WHERE id='task-one'`);
      await fail(() => client.query(`UPDATE "StoryTaskDispatch" SET "queueReceipt"='stale-g0' WHERE "taskId"='task-one'`), "23514");
      await client.query(`UPDATE "StoryTaskDispatch" SET generation=1,"queueReceipt"=NULL WHERE "taskId"='task-one'`);
    });
    await t.test("pre-checkpoint redispatch retains generation, consumes bounded attempts and cannot refresh authority", async () => {
      const alternate = { ...recipe(fixture.source, null), window: { startMs: 6000, endMs: 7000 } };
      await addTask(client, "pre-retry", fixture, { recipeText: canonicalJson(alternate) });
      await client.query(`INSERT INTO "StoryTaskDispatch" ("taskId",generation,"nextDispatchAt") VALUES ('pre-retry',0,clock_timestamp())`);
      await grant(client, "pre-retry");
      for (let attempts = 1; attempts <= 3; attempts++) {
        await lease(client, "pre-retry");
        await fail(() => client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"stateRevision"="stateRevision"+1 WHERE id='pre-retry'`), "23514");
        await client.query(`UPDATE "StoryTask" SET state='QUEUED',"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='pre-retry'`);
        const row = (await client.query<{ generation: number; preSubmitAttempts: number }>(`SELECT generation,"preSubmitAttempts" FROM "StoryTaskDispatch" WHERE "taskId"='pre-retry'`)).rows[0];
        assert.deepEqual(row, { generation: 0, preSubmitAttempts: attempts });
      }
      await lease(client, "pre-retry");
      await fail(() => client.query(`UPDATE "StoryTask" SET state='QUEUED',"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='pre-retry'`), "23514");
      await client.query(`UPDATE "StoryTask" SET state='FAILED',"stateRevision"="stateRevision"+1 WHERE id='pre-retry'`);
      await grant(client, "pre-retry", 1);
      await client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='pre-retry'`);
      await client.query(`UPDATE "StoryTaskDispatch" SET generation=1,"preSubmitAttempts"=0 WHERE "taskId"='pre-retry'`);
      assert.equal((await client.query<{ generation: number }>(`SELECT generation FROM "StoryTask" WHERE id='pre-retry'`)).rows[0].generation, 1);
    });
    await t.test("expired consumed confirmation cannot redispatch or checkpoint", async () => {
      const alternate = { ...recipe(fixture.source, null), window: { startMs: 7100, endMs: 8100 } };
      await addTask(client, "expired-pre", fixture, { recipeText: canonicalJson(alternate) });
      await client.query(`INSERT INTO "StoryTaskDispatch" ("taskId",generation,"nextDispatchAt") VALUES ('expired-pre',0,clock_timestamp())`);
      const grantId = await grant(client, "expired-pre", 0, "100 milliseconds");
      await lease(client, "expired-pre");
      await new Promise(resolve => setTimeout(resolve, 150));
      await fail(() => client.query(`UPDATE "StoryTask" SET state='QUEUED',"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='expired-pre'`), "23514");
      await fail(() => checkpoint(client, "expired-pre", grantId), "23514");
      await client.query(`UPDATE "StoryTask" SET state='FAILED',"stateRevision"="stateRevision"+1 WHERE id='expired-pre'`);
      await fail(() => client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='expired-pre'`), "23514");
      await grant(client, "expired-pre", 1);
      await client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='expired-pre'`);
      await client.query(`UPDATE "StoryTaskDispatch" SET generation=1,"preSubmitAttempts"=0 WHERE "taskId"='expired-pre'`);
    });
    await t.test("single-use confirmation, checkpoint, UNKNOWN and global unresolved slot", async () => {
      const grantId = await grant(client, "task-script");
      await fail(() => client.query(`UPDATE "StoryPaidConfirmation" SET state='PREPARED' WHERE id=$1`, [grantId]), "23514");
      await fail(() => client.query(`UPDATE "StoryPaidConfirmation" SET "taskId"='task-script' WHERE id=$1`, [grantId]), "23514");
      await lease(client, "task-script");
      await fail(() => client.query(`INSERT INTO "StoryProviderSubmission" (id,"taskId",generation,"confirmationId","requestHash",owner) VALUES ('wrong-owner','task-script',0,$1,$2,'other-worker')`, [grantId, hash("wrong-owner")]), "23514");
      const subId = await checkpoint(client, "task-script", grantId);
      await fail(() => checkpoint(client, "task-script", grantId), "23514");
      await client.query(`UPDATE "StoryProviderSubmission" SET state='UNKNOWN' WHERE id=$1`, [subId]);
      await client.query(`UPDATE "StoryTask" SET state='UNKNOWN',"stateRevision"="stateRevision"+1 WHERE id='task-script'`);
      await addTask(client, "task-second", fixture, { script: true, kind: "REVIEW_MYANMAR" });
      const secondGrant = await grant(client, "task-second");
      await lease(client, "task-second");
      await fail(() => checkpoint(client, "task-second", secondGrant), "23505");
      await fail(() => client.query(`UPDATE "StoryProviderSubmission" SET state='RESOLVED',"definitiveAt"=clock_timestamp() WHERE id=$1`, [subId]), "23514");
      await fail(() => client.query(`UPDATE "StoryTask" SET state='FAILED',"stateRevision"="stateRevision"+1 WHERE id='task-script'`), "23514");
      await fail(() => client.query(`UPDATE "StoryProviderSubmission" SET state='SUBMITTED' WHERE id=$1`, [subId]), "23514");
      await fail(() => client.query(`INSERT INTO "StoryTaskResult" (id,"taskId",generation,"submissionId",outcome,"normalizedPayload","payloadHash","validatorVersion","usageClass","inputTokens") VALUES ('bad-usage','task-script',0,$1,'VALIDATED_CANDIDATE','{}',$2,'synthetic-v1','UNKNOWN',1)`, [subId, hash("{}")]), "23514");
      await result(client, "task-script", subId);
      await client.query(`UPDATE "StoryTask" SET state='COMPLETED',"stateRevision"="stateRevision"+1 WHERE id='task-script'`);
      const nextSubmission = await checkpoint(client, "task-second", secondGrant);
      await result(client, "task-second", nextSubmission);
      await client.query(`UPDATE "StoryTask" SET state='COMPLETED',"stateRevision"="stateRevision"+1 WHERE id='task-second'`);
      await fail(() => client.query(`UPDATE "StoryTaskResult" SET "normalizedPayload"='{"x":1}' WHERE "submissionId"=$1`, [subId]), "23514");
    });
    await t.test("two concurrent checkpoint attempts contend on the PostgreSQL global slot", async () => {
      await addTask(client, "slot-a", fixture, { kind: "DRAFT_SCRIPT" });
      const alternate = { ...recipe(fixture.source, null), window: { startMs: 1000, endMs: 2000 } };
      await addTask(client, "slot-b", fixture, { recipeText: canonicalJson(alternate) });
      const grantA = await grant(client, "slot-a"), grantB = await grant(client, "slot-b");
      await lease(client, "slot-a"); await lease(client, "slot-b");
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await a.query(`INSERT INTO "StoryProviderSubmission" (id,"taskId",generation,"confirmationId","requestHash",owner) VALUES ('race-a','slot-a',0,$1,$2,'synthetic-worker')`, [grantA, hash("race-a")]);
        const losing = b.query(`INSERT INTO "StoryProviderSubmission" (id,"taskId",generation,"confirmationId","requestHash",owner) VALUES ('race-b','slot-b',0,$1,$2,'synthetic-worker')`, [grantB, hash("race-b")])
          .then(() => "OK", error => (error as { code?: string }).code ?? "UNKNOWN");
        await new Promise(resolve => setTimeout(resolve, 30));
        await a.query("COMMIT");
        assert.equal(await losing, "23505"); await b.query("ROLLBACK");
        await client.query(`UPDATE "StoryTask" SET state='SUBMITTED',"stateRevision"="stateRevision"+1 WHERE id='slot-a'`);
        await result(client, "slot-a", "race-a");
        await client.query(`UPDATE "StoryTask" SET state='COMPLETED',"stateRevision"="stateRevision"+1 WHERE id='slot-a'`);
      } finally { await a.end(); await b.end(); }
    });
    await t.test("cancel-before-checkpoint prevents submission", async () => {
      await addTask(client, "cancel-pre", fixture, { kind: "ANALYZE_EVIDENCE", recipeText: canonicalJson({ ...recipe(fixture.source, null), window: { startMs: 3000, endMs: 4000 } }) });
      const grantId = await grant(client, "cancel-pre");
      await lease(client, "cancel-pre");
      await client.query(`UPDATE "StoryTask" SET "cancelRequestedAt"=clock_timestamp(),"stateRevision"="stateRevision"+1 WHERE id='cancel-pre'`);
      await fail(() => checkpoint(client, "cancel-pre", grantId), "23514");
      await client.query(`UPDATE "StoryTask" SET state='CANCELLED',"stateRevision"="stateRevision"+1 WHERE id='cancel-pre'`);
    });
    await t.test("post-checkpoint cancellation stays pending until original result is definitive", async () => {
      await addTask(client, "cancel-post", fixture, { recipeText: canonicalJson({ ...recipe(fixture.source, null), window: { startMs: 5000, endMs: 6000 } }) });
      const grantId = await grant(client, "cancel-post");
      await lease(client, "cancel-post");
      const submissionId = await checkpoint(client, "cancel-post", grantId);
      await client.query(`UPDATE "StoryTask" SET "cancelRequestedAt"=clock_timestamp(),"stateRevision"="stateRevision"+1 WHERE id='cancel-post'`);
      await fail(() => client.query(`UPDATE "StoryTask" SET state='CANCELLED',"stateRevision"="stateRevision"+1 WHERE id='cancel-post'`), "23514");
      await result(client, "cancel-post", submissionId);
      await client.query(`UPDATE "StoryTask" SET state='CANCELLED',"stateRevision"="stateRevision"+1 WHERE id='cancel-post'`);
      await fail(() => client.query(`UPDATE "StoryTask" SET "cancelRequestedAt"=NULL,"stateRevision"="stateRevision"+1 WHERE id='cancel-post'`), "23514");
    });
    await t.test("UNKNOWN cancellation resolves only after original result and keeps one checkpoint", async () => {
      const alternate = { ...recipe(fixture.source, null), window: { startMs: 8200, endMs: 9200 } };
      await addTask(client, "cancel-unknown", fixture, { recipeText: canonicalJson(alternate) });
      const grantId = await grant(client, "cancel-unknown");
      await lease(client, "cancel-unknown");
      const submissionId = await checkpoint(client, "cancel-unknown", grantId);
      await client.query(`UPDATE "StoryProviderSubmission" SET state='UNKNOWN' WHERE id=$1`, [submissionId]);
      await client.query(`UPDATE "StoryTask" SET state='UNKNOWN',"stateRevision"="stateRevision"+1 WHERE id='cancel-unknown'`);
      await client.query(`UPDATE "StoryTask" SET "cancelRequestedAt"=clock_timestamp(),"stateRevision"="stateRevision"+1 WHERE id='cancel-unknown'`);
      await fail(() => client.query(`UPDATE "StoryTask" SET state='CANCELLED',"stateRevision"="stateRevision"+1 WHERE id='cancel-unknown'`), "23514");
      await fail(() => checkpoint(client, "cancel-unknown", grantId), "23514");
      await result(client, "cancel-unknown", submissionId);
      await fail(() => client.query(`UPDATE "StoryTask" SET state='COMPLETED',"stateRevision"="stateRevision"+1 WHERE id='cancel-unknown'`), "23514");
      await client.query(`UPDATE "StoryTask" SET state='CANCELLED',"stateRevision"="stateRevision"+1 WHERE id='cancel-unknown'`);
    });
    await t.test("definitive failure needs a fresh consumed grant for a new generation", async () => {
      const alternate = { ...recipe(fixture.source, null), window: { startMs: 9300, endMs: 10300 } };
      await addTask(client, "terminal-fail", fixture, { recipeText: canonicalJson(alternate) });
      const grantId = await grant(client, "terminal-fail");
      await lease(client, "terminal-fail");
      const submissionId = await checkpoint(client, "terminal-fail", grantId);
      await client.query(`INSERT INTO "StoryTaskResult" (id,"taskId",generation,"submissionId",outcome,"normalizedPayload","payloadHash","validatorVersion","usageClass")
        VALUES ('result-terminal-fail','terminal-fail',0,$1,'REJECTED_RESPONSE','{}',$2,'synthetic-v1','UNKNOWN')`, [submissionId, hash("{}")]);
      await client.query(`UPDATE "StoryProviderSubmission" SET state='RESOLVED',"definitiveAt"=clock_timestamp() WHERE id=$1`, [submissionId]);
      await client.query(`UPDATE "StoryTask" SET state='FAILED',"stateRevision"="stateRevision"+1 WHERE id='terminal-fail'`);
      await fail(() => client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='terminal-fail'`), "23514");
      await grant(client, "terminal-fail", 1);
      await client.query(`UPDATE "StoryTask" SET state='QUEUED',generation=1,"leaseOwner"=NULL,"leaseUntil"=NULL,"stateRevision"="stateRevision"+1 WHERE id='terminal-fail'`);
      await lease(client, "terminal-fail");
      await fail(() => client.query(`INSERT INTO "StoryProviderSubmission" (id,"taskId",generation,"confirmationId","requestHash",owner)
        VALUES ('reused-old-grant','terminal-fail',1,$1,$2,'synthetic-worker')`, [grantId, hash("reused")]), "23514");
    });
    await t.test("cancellation and original result race cannot publish completed after cancel wins", async () => {
      const alternate = { ...recipe(fixture.source, null), window: { startMs: 10400, endMs: 11400 } };
      await addTask(client, "cancel-race", fixture, { recipeText: canonicalJson(alternate) });
      const grantId = await grant(client, "cancel-race");
      await lease(client, "cancel-race");
      const submissionId = await checkpoint(client, "cancel-race", grantId);
      const cancel = await owned.client(), complete = await owned.client();
      try {
        await cancel.query("BEGIN"); await complete.query("BEGIN");
        await cancel.query(`UPDATE "StoryTask" SET "cancelRequestedAt"=clock_timestamp(),"stateRevision"="stateRevision"+1 WHERE id='cancel-race'`);
        await result(complete, "cancel-race", submissionId);
        const terminal = complete.query(`UPDATE "StoryTask" SET state='COMPLETED',"stateRevision"="stateRevision"+1 WHERE id='cancel-race'`);
        await cancel.query("COMMIT");
        await fail(() => terminal, "23514");
        await complete.query("ROLLBACK");
        assert.equal((await client.query<{ count: number }>(`SELECT count(*)::int count FROM "StoryTaskResult" WHERE "taskId"='cancel-race'`)).rows[0].count, 0);
        assert.equal((await client.query<{ state: string }>(`SELECT state FROM "StoryProviderSubmission" WHERE id=$1`, [submissionId])).rows[0].state, "SUBMITTED");
        await result(client, "cancel-race", submissionId);
        await client.query(`UPDATE "StoryTask" SET state='CANCELLED',"stateRevision"="stateRevision"+1 WHERE id='cancel-race'`);
      } finally { await cancel.end(); await complete.end(); }
    });
    await t.test("opposite task lock order is bounded; aborted writer rolls back", async () => {
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await a.query(`UPDATE "StoryTask" SET "stateRevision"="stateRevision"+1 WHERE id='slot-a'`);
        await b.query(`UPDATE "StoryTask" SET "stateRevision"="stateRevision"+1 WHERE id='slot-b'`);
        const waitA = a.query(`UPDATE "StoryTask" SET "stateRevision"="stateRevision"+1 WHERE id='slot-b'`)
          .then(() => ({ side: "a", code: "OK" }), error => ({ side: "a", code: (error as { code?: string }).code ?? "UNKNOWN" }));
        const waitB = b.query(`UPDATE "StoryTask" SET "stateRevision"="stateRevision"+1 WHERE id='slot-a'`)
          .then(() => ({ side: "b", code: "OK" }), error => ({ side: "b", code: (error as { code?: string }).code ?? "UNKNOWN" }));
        const first = await Promise.race([waitA, waitB]);
        assert.ok(["40P01", "55P03"].includes(first.code), `Expected bounded deadlock/lock timeout, got ${first.code}`);
        await (first.side === "a" ? a : b).query("ROLLBACK");
        const second = await (first.side === "a" ? waitB : waitA);
        assert.equal(second.code, "OK");
        await (first.side === "a" ? b : a).query("COMMIT");
      } finally { await a.end(); await b.end(); }
    });
    await t.test("event sequence and append-only history", async () => {
      await client.query(`INSERT INTO "StoryTaskEvent" (id,"taskId",generation,sequence,state,"reasonCode") VALUES ('event-0','task-script',0,0,'COMPLETED','STORY_TASK_DONE')`);
      await fail(() => client.query(`INSERT INTO "StoryTaskEvent" (id,"taskId",generation,sequence,state,"reasonCode") VALUES ('event-gap','task-script',0,2,'COMPLETED','STORY_TASK_DONE')`), "23514");
      await fail(() => client.query(`UPDATE "StoryTaskEvent" SET "reasonCode"='STORY_TASK_OTHER' WHERE id='event-0'`), "23514");
      await fail(() => client.query(`DELETE FROM "StoryTaskEvent" WHERE id='event-0'`), "23514");
    });
    await t.test("rollback and restricted role cannot forge confirmation, submission or M1 receipt", async () => {
      const before = Number((await client.query<{ count: string }>(`SELECT count(*)::text count FROM "StoryPaidConfirmation"`)).rows[0].count);
      await fail(() => transact(client, async () => {
        await client.query(`INSERT INTO "StoryPaidConfirmation" (id,"studioId",generation,"recipeHash","profileHash","expectedStudioRevision","quoteMaxUsdMicros","authorityRef","preparedAt","expiresAt") SELECT 'rollback-grant','studio-old',0,"recipeHash","profileHash",3,1000,'synthetic',clock_timestamp(),clock_timestamp()+interval '4 minutes' FROM "StoryTask" WHERE id='task-script'`);
        await client.query(`INSERT INTO "StoryProviderSubmission" (id,"taskId",generation,"confirmationId","requestHash",owner) VALUES ('wrong','task-script',0,'absent',$1,'synthetic-worker')`, [hash("wrong")]);
      }), "P0002");
      assert.equal(Number((await client.query<{ count: string }>(`SELECT count(*)::text count FROM "StoryPaidConfirmation"`)).rows[0].count), before);
      const admin = await owned.securityAdministrator();
      try {
        await admin.query(`CREATE ROLE storyline_runtime NOLOGIN`);
      } finally { await admin.end(); }
      const restricted = await owned.restrictedLogin("storyline_runtime");
      const { Client: PgClient } = await import("pg");
      const probe = new PgClient(restricted);
      await probe.connect();
      try {
        await fail(() => probe.query(`INSERT INTO "StoryProviderSubmission" DEFAULT VALUES`), "42501");
        await fail(() => probe.query(`INSERT INTO "StoryPaidConfirmation" DEFAULT VALUES`), "42501");
        await fail(() => probe.query(`INSERT INTO "StorySourceVerification" DEFAULT VALUES`), "42501");
      } finally { await probe.end(); }
    });
  } finally { await client.end(); await owned.stop(); }
});
