// Real transaction tests in newly owned scratch PostgreSQL only. No provider,
// existing database, Redis, real media or verification receipt is used.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, mock, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { createStoryTaskFakeWorker, executeDeterministicStoryTaskFake, fakeStoryTaskStateEligibility, type FakeStoryTaskLease } from "../../../lib/storyline/jobs/fake-worker";
import { StoryTaskContractError } from "../../../lib/storyline/jobs/errors";
import { StorylinePreparationError } from "../../../lib/storyline/preparation-errors";
import type { StoryTaskReference } from "../../../lib/storyline/jobs/dispatch";
import { scope } from "../fixtures";
import { transactionalFixture } from "./transactional-gateway.fixture";

before(() => mock.method(globalThis, "fetch", () => assert.fail("No provider/network transport")));
after(() => mock.restoreAll());
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const rejected = (run: () => Promise<unknown>) => assert.rejects(run(), (error: unknown) => error instanceof StoryTaskContractError);
const permissionDenied = (run: () => Promise<unknown>) => assert.rejects(run(), (error: unknown) =>
  (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } }).meta?.driverAdapterError?.cause?.originalCode === "42501");

for (const first of [true, false]) test(`M2-04 worker services: M1 ${first ? "before" : "after"} M2`, { timeout: 180000 }, async t => {
  const f = await transactionalFixture(first, true);
  const exactScope = { ...scope, studioId: f.saved.studioId }, receipts = new Map<string, StoryTaskReference>();
  let failDelivery = false;
  const delivery = {
    async publish(d: Readonly<{ id: string; payload: StoryTaskReference }>) {
      assert.deepEqual(Object.keys(d.payload).sort(), ["generation", "taskId"]);
      if (failDelivery) throw new Error("synthetic delivery failure");
      receipts.set(d.id, d.payload); return d.id;
    },
    async has(id: string) { return receipts.has(id); },
  };
  let services = f.services(delivery), a = await f.fakeWorker(), b = await f.fakeWorker(f.media.inspect, true);
  const taskRow = async (ref: StoryTaskReference) => (await f.admin.query(`SELECT * FROM public."StoryTask" WHERE id=$1`, [ref.taskId])).rows[0];
  const inventory = async () => (await f.admin.query(`SELECT
    (SELECT count(*) FROM public."StoryTask") tasks,(SELECT count(*) FROM public."StoryPaidConfirmation") grants,
    (SELECT count(*) FROM public."StoryTaskEvent") events,(SELECT count(*) FROM public."StoryTestWorkerFence") fences,
    (SELECT count(*) FROM public."StoryProviderSubmission") submissions,(SELECT count(*) FROM public."StoryTaskResult") results`)).rows[0];
  const create = async (key: string, last: number, ttl = 120000, kind: "ANALYZE_EVIDENCE" | "REVIEW_EVIDENCE" = "ANALYZE_EVIDENCE") => {
    await f.configure(key, kind, last); services = f.services(delivery); a = await f.fakeWorker(); b = await f.fakeWorker(f.media.inspect, true);
    return services.admission.admit({ decisionId: await f.issue(ttl), selection: f.sourceReference(kind), identity: f.currentRecipe() });
  };
  const dispatch = () => services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [] });
  const lease = async (ref: StoryTaskReference, worker = a.worker) => {
    const result = await worker.claim(ref); assert.equal(result.outcome, "CLAIMED");
    if (result.outcome !== "CLAIMED") assert.fail("Expected lease");
    return result.lease;
  };
  let main: StoryTaskReference, active: FakeStoryTaskLease;
  let crashedRef: StoryTaskReference, crashedHandle: FakeStoryTaskLease, crashedWorker: ReturnType<typeof createStoryTaskFakeWorker>;
  try {
    await t.test("explicit worker construction does no work and grants no implicit authority", async () => {
      assert.deepEqual(await inventory(), { tasks: "0", grants: "0", events: "0", fences: "0", submissions: "0", results: "0" });
      assert.equal(receipts.size, 0);
    });
    await t.test("worker gateway is least-privilege, fixed-search-path and inaccessible to other roles", async () => {
      const catalogs = (await f.admin.query(`SELECT bool_and(p.prosecdef AND p.proowner='storyline_migration_owner'::regrole
        AND 'search_path=pg_catalog, public, pg_temp'=ANY(p.proconfig)
        AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) safe
        FROM pg_proc p WHERE p.proname IN ('story_m2_test_worker_peek','story_m2_test_worker_open','story_m2_test_worker_finish','story_m2_test_worker_lock')`)).rows[0];
      assert.equal(catalogs.safe, true);
      for (const client of [f.rawAdmission, f.outbox, f.reader, f.issuer, f.legacyRuntime, f.checkpoint, f.m1Issuer])
        await assert.rejects(client.query(`SELECT * FROM public.story_m2_test_worker_peek('forged',0)`), { code: "42501" });
      for (const table of ["StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryAdmission", "StorySpendingDecision", "StoryTaskEvent",
        "StoryProviderSubmission", "StoryTaskResult", "StorySourceVerification", "StoryTestWorkerAccess", "StoryTestWorkerFence", "StoryTestValidationKey"])
        await permissionDenied(() => a.database.$executeRawUnsafe(`INSERT INTO public."${table}" DEFAULT VALUES`));
      await permissionDenied(() => a.database.$queryRaw`SELECT public.story_m2_test_issue_decision(1000)`);
      await permissionDenied(() => a.database.$queryRaw`SELECT public.story_m2_test_admit('forged',0,0)`);
      await permissionDenied(() => a.database.$queryRaw`SELECT public.story_m1_verification_append('forged','forged','{}')`);
      await permissionDenied(() => a.database.$queryRaw`SELECT * FROM public.story_m2_test_claim_due(${scope.projectId},${scope.movieId},${f.saved.studioId},1)`);
      await permissionDenied(() => a.database.$queryRaw`SELECT secret FROM public."StoryTestValidationKey"`);
      await permissionDenied(() => a.database.$queryRaw`SELECT * FROM public."StoryTask"`);
      await permissionDenied(() => a.database.$executeRaw`UPDATE public."TranscriptSegment" SET text='forged'`);
      await permissionDenied(() => a.database.$executeRaw`CREATE TABLE public.untrusted_worker_table(id integer)`);
    });
    await t.test("genuine admitted M1 snapshot reaches worker only after committed reference delivery", async () => {
      main = await create("worker-main", 11);
      assert.equal(f.saved.snapshotId, f.candidate.snapshot.payload.id); assert.equal(await f.runtime.storySourceSnapshot.count(), 1);
      await rejected(() => a.worker.claim(main)); // No queue receipt yet.
      const published = await dispatch(); assert.equal(published.deliveries[0].outcome, "ACKNOWLEDGED");
      assert.deepEqual(receipts.get(`story-text-${main.taskId}-g0`), main);
    });
    await t.test("payload accepts only taskId/generation and rejects wrong scope/generation and forged authority", async () => {
      const before = await inventory();
      for (const invalid of [{ ...main, stateRevision: 0 }, { ...main, owner: "forged" }, { ...main, fresh: true }, { ...main, authorityRef: "forged" },
        { taskId: main.taskId, generation: 1 }, { taskId: "foreign-task", generation: 0 }])
        await rejected(() => a.worker.claim(invalid));
      assert.deepEqual(await inventory(), before);
    });
    await t.test("missing validation key or combined admission privileges fail before a lease commits", async () => {
      const before = await inventory();
      await f.keyEnabled(false);
      try { await rejected(() => a.worker.claim(main)); } finally { await f.keyEnabled(true); }
      await f.admin.query(`GRANT EXECUTE ON FUNCTION public.story_m2_test_finalize(text,text,integer,integer) TO storyline_fake_worker`);
      try { await rejected(() => a.worker.claim(main)); }
      finally { await f.admin.query(`REVOKE EXECUTE ON FUNCTION public.story_m2_test_finalize(text,text,integer,integer) FROM storyline_fake_worker`); }
      await f.admin.query(`GRANT UPDATE ON public."StoryTestValidationKey" TO storyline_fake_worker`);
      try { await rejected(() => a.worker.claim(main)); }
      finally { await f.admin.query(`REVOKE UPDATE ON public."StoryTestValidationKey" FROM storyline_fake_worker`); }
      assert.deepEqual(await inventory(), before); assert.equal((await taskRow(main)).state, "QUEUED");
    });
    await t.test("two actual worker connections cannot own the same lease", async () => {
      const claims = await Promise.allSettled([a.worker.claim(main), b.worker.claim(main)]);
      const wins = claims.flatMap((row, index) => row.status === "fulfilled" && row.value.outcome === "CLAIMED" ? [{ ...row.value, index }] : []);
      assert.equal(wins.length, 1);
      if (wins[0].index === 1) [a, b] = [b, a];
      active = wins[0].lease;
      const row = await taskRow(main); assert.equal(row.state, "LEASED"); assert.equal(row.stateRevision, 1); assert.equal(row.generation, 0);
      assert.equal((await b.worker.claim(main)).outcome, "NOT_ELIGIBLE");
      assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryTaskEvent" WHERE "taskId"=$1 AND "reasonCode"='STORY_TASK_FAKE_WORKER_CLAIMED'`, [main.taskId])).rows[0].count, "1");
    });
    await t.test("opaque lease rejects JSON, cloning, foreign factories and forged worker proof", async () => {
      assert.throws(() => JSON.stringify(active), StoryTaskContractError);
      for (const forged of [{}, { ...active }, { taskId: main.taskId, generation: 0, sourceVerified: true }])
        await rejected(() => a.worker.execute(forged));
      await rejected(() => b.worker.execute(active));
      await assert.rejects(a.database.$queryRaw`SELECT * FROM public.story_m2_test_worker_finish(${main.taskId},0,1,'forged','EXECUTE','CURRENT',${"f".repeat(64)})`);
    });
    await t.test("heartbeat renews database lease, bumps revision and invalidates old handle", async () => {
      const original = await taskRow(main); await wait(100);
      const renewed = await a.worker.heartbeat(active); assert.equal(renewed.outcome, "RENEWED");
      if (renewed.outcome !== "RENEWED") assert.fail("Expected renewal");
      const old = active; active = renewed.lease;
      await rejected(() => a.worker.execute(old));
      const row = await taskRow(main); assert.equal(row.stateRevision, 2); assert.ok(row.leaseUntil > original.leaseUntil);
      assert.equal((await b.worker.claim(main)).outcome, "NOT_ELIGIBLE");
    });
    await t.test("zero-cost execution is deferred as FAILED, never falsely completed or published", async () => {
      const result = await a.worker.execute(active);
      assert.equal(result.outcome, "DEFERRED_CHECKPOINT_UNAVAILABLE"); assert.equal(result.state, "FAILED");
      assert.equal(result.reasonCode, "STORY_TASK_FAKE_CHECKPOINT_UNAVAILABLE");
      assert.equal(result.executionDigest, executeDeterministicStoryTaskFake(main, f.currentRecipe().recipeHash));
      assert.equal((await b.worker.runOnce(main)).outcome, "NOT_ELIGIBLE");
      await rejected(() => a.worker.execute(active));
      assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryTaskEvent" WHERE "taskId"=$1 AND "reasonCode"='STORY_TASK_FAKE_CHECKPOINT_UNAVAILABLE'`, [main.taskId])).rows[0].count, "1");
      assert.equal((await inventory()).results, "0"); assert.equal((await inventory()).submissions, "0");
    });
    await t.test("source locks remain held through worker validation and transition commit", async () => {
      // Duplicate terminal delivery is read-only; use the next task's claim to
      // observe an actual competing source writer blocked by the worker fence.
      const ref = await create("worker-crash", 10); await dispatch();
      let writing: Promise<unknown> | undefined, pid = 0, releasePid!: () => void;
      const gotPid = new Promise<void>(resolve => { releasePid = resolve; });
      const fenced = await f.fakeWorker(async storageKey => {
        const media = await f.media.inspect(storageKey); let checked = false;
        return { ...media, assertUnchanged: async () => {
          await media.assertUnchanged(); if (checked) return; checked = true;
          writing = f.runtime.$transaction(async tx => {
            pid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`)[0].pid; releasePid();
            await tx.$queryRaw`SELECT id FROM public."Movie" WHERE id=${scope.movieId} FOR UPDATE`;
            await tx.movie.update({ where: { id: scope.movieId }, data: { title: "Synthetic movie" } });
          });
          await gotPid; let blocked = false;
          for (let i = 0; i < 20; i++) {
            blocked = (await f.admin.query<{ blocked: boolean }>(`SELECT cardinality(pg_blocking_pids($1))>0 blocked`, [pid])).rows[0].blocked;
            if (blocked) break; await wait(10);
          }
          assert.equal(blocked, true);
        } };
      });
      crashedRef = ref; crashedWorker = fenced.worker; crashedHandle = await lease(ref, fenced.worker); await writing;
      // Leave the real durable lease to the following crash-recovery test.
    });
    await t.test("crash before checkpoint recovers durably in same generation and fences old owner", async () => {
      const ref = crashedRef;
      await rejected(() => b.recovery.recoverOnce([ref])); // Live lease cannot be stolen.
      await wait(550); const restarted = await f.fakeWorker();
      const recovered = await restarted.recovery.recoverOnce([ref]); assert.equal(recovered[0].state, "QUEUED");
      assert.equal(recovered[0].generation, 0);
      assert.equal((await f.admin.query(`SELECT "preSubmitAttempts","queueReceipt" FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [ref.taskId])).rows[0].preSubmitAttempts, 1);
      await rejected(() => crashedWorker.heartbeat(crashedHandle)); await rejected(() => crashedWorker.execute(crashedHandle));
      assert.equal((await dispatch()).deliveries[0].outcome, "ACKNOWLEDGED");
      const old = await lease(ref, restarted.worker);
      const renewed = await restarted.worker.heartbeat(old); assert.equal(renewed.outcome, "RENEWED");
      await rejected(() => restarted.worker.heartbeat(old)); await rejected(() => restarted.worker.execute(old));
      if (renewed.outcome !== "RENEWED") assert.fail("Expected renewal");
      assert.equal((await restarted.worker.execute(renewed.lease)).outcome, "DEFERRED_CHECKPOINT_UNAVAILABLE");
    });
    await t.test("pre-checkpoint retry/recovery exhausts publication ceiling without fresh grant or generation", async () => {
      const ref = await create("worker-exhaust", 9); await dispatch();
      for (let i = 0; i < 2; i++) {
        const claimed = await lease(ref);
        if (i === 0) assert.equal((await a.worker.retryBeforeCheckpoint(claimed)).state, "QUEUED");
        else { await wait(550); assert.equal((await b.recovery.recoverOnce([ref]))[0].state, "QUEUED"); }
        assert.equal((await dispatch()).deliveries[0].generation, 0);
      }
      await lease(ref); await wait(550);
      const final = (await b.recovery.recoverOnce([ref]))[0];
      assert.equal(final.state, "FAILED"); assert.equal((await taskRow(ref)).errorCode, "STORY_TASK_RETRY_UNSAFE");
      assert.equal(final.generation, 0);
      const counters = (await f.admin.query(`SELECT "publishAttempts","preSubmitAttempts" FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [ref.taskId])).rows[0];
      assert.deepEqual(counters, { publishAttempts: 3, preSubmitAttempts: 2 });
      assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryPaidConfirmation" WHERE "taskId"=$1`, [ref.taskId])).rows[0].count, "1");
      assert.equal((await a.worker.claim(ref)).outcome, "NOT_ELIGIBLE");
    });
    await t.test("Chinese source changes after claim are rejected before fake execution", async () => {
      const ref = await create("worker-stale-chinese", 8); await dispatch(); const handle = await lease(ref);
      const source = await f.runtime.transcriptSegment.findUniqueOrThrow({ where: { id: "source-1" } });
      await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: source.id }, data: { text: source.text + "变化。" } }));
      try {
        const result = await a.worker.execute(handle); assert.equal(result.outcome, "BLOCKED"); assert.equal(result.state, "FAILED");
        assert.equal(result.errorCode, "STORY_TASK_SOURCE_STALE"); assert.equal(result.executionDigest, null);
      } finally { await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: source.id }, data: { text: source.text } })); }
    });
    await t.test("ALL_CURRENT QC/approval changes are rechecked before claim and recovered execution", async () => {
      const ref = await create("worker-stale-qc", 7); await dispatch();
      const issue = await f.runtime.translationQcIssue.findFirstOrThrow();
      await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: issue.id }, data: { message: issue.message + " synthetic change" } }));
      try { await rejected(() => a.worker.claim(ref)); assert.equal((await taskRow(ref)).state, "QUEUED"); }
      finally { await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: issue.id }, data: { message: issue.message, updatedAt: issue.updatedAt } })); }
      const handle = await lease(ref), translated = await f.runtime.translatedSegment.findFirstOrThrow();
      await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { reviewStatus: translated.reviewStatus === "APPROVED" ? "UNREVIEWED" : "APPROVED" } }));
      try { assert.equal((await a.worker.execute(handle)).errorCode, "STORY_TASK_SOURCE_STALE"); }
      finally { await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { reviewStatus: translated.reviewStatus } })); }
    });
    await t.test("source drift at crash recovery fails rather than requeueing stale material", async () => {
      const ref = await create("worker-stale-recovery", 6); await dispatch(); await lease(ref);
      const translated = await f.runtime.translatedSegment.findFirstOrThrow();
      await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { text: translated.text + "ပြောင်း။" } }));
      try {
        await wait(550); const result = await b.recovery.recoverOnce([ref]);
        assert.equal(result[0].state, "FAILED"); assert.equal((await taskRow(ref)).errorCode, "STORY_TASK_SOURCE_STALE");
      } finally { await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { text: translated.text } })); }
    });
    await t.test("changed media identity blocks worker claim and late descriptor failure rolls back", async () => {
      const ref = await create("worker-media", 5); await dispatch();
      f.media.setInvalid(true);
      try { await rejected(() => a.worker.claim(ref)); } finally { f.media.setInvalid(false); }
      let failLate = false;
      const late = await f.fakeWorker(async storageKey => {
        const media = await f.media.inspect(storageKey); let checks = 0;
        return { ...media, assertUnchanged: async () => {
          await media.assertUnchanged();
          if (++checks === 6 && failLate) throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED");
        } };
      });
      const handle = await lease(ref, late.worker), before = await inventory(), original = await taskRow(ref);
      failLate = true;
      await rejected(() => late.worker.execute(handle)); failLate = false;
      assert.deepEqual(await inventory(), before); assert.deepEqual(await taskRow(ref), original);
      assert.equal((await late.worker.execute(handle)).outcome, "DEFERRED_CHECKPOINT_UNAVAILABLE");
    });
    await t.test("cancellation of queued task prevents claim and rejects stale revision", async () => {
      const ref = await create("worker-cancel-queued", 4); await dispatch();
      await rejected(() => a.worker.cancelBeforeCheckpoint({ ...ref, stateRevision: 99 }));
      assert.equal((await a.worker.cancelBeforeCheckpoint({ ...ref, stateRevision: 0 })).state, "CANCELLED");
      assert.equal((await a.worker.runOnce(ref)).outcome, "NOT_ELIGIBLE");
      assert.ok((await taskRow(ref)).cancelRequestedAt);
    });
    await t.test("cancellation of leased task fences execution and cannot clear sticky cancellation", async () => {
      const ref = await create("worker-cancel-active", 3); await dispatch(); const handle = await lease(ref);
      assert.equal((await b.worker.cancelBeforeCheckpoint({ ...ref, stateRevision: 1 })).state, "CANCELLED");
      await rejected(() => a.worker.execute(handle)); assert.equal((await taskRow(ref)).state, "CANCELLED");
      await rejected(() => b.worker.cancelBeforeCheckpoint({ ...ref, stateRevision: 2 }));
    });
    await t.test("original consumed grant expiry blocks execution and recovery cannot refresh it", async () => {
      const ref = await create("worker-expired", 2, 700); await dispatch(); const handle = await lease(ref);
      const original = (await f.admin.query(`SELECT "expiresAt" FROM public."StoryPaidConfirmation" WHERE "taskId"=$1`, [ref.taskId])).rows[0].expiresAt;
      await wait(750); await rejected(() => a.worker.execute(handle));
      assert.equal((await b.recovery.recoverOnce([ref]))[0].state, "FAILED");
      assert.equal((await taskRow(ref)).errorCode, "STORY_TASK_CONFIRMATION_STALE");
      assert.equal((await f.admin.query(`SELECT "expiresAt" FROM public."StoryPaidConfirmation" WHERE "taskId"=$1`, [ref.taskId])).rows[0].expiresAt.toISOString(), original.toISOString());
    });
    await t.test("fake queue failure remains recoverable and execution never starts from dispatch", async () => {
      const ref = await create("worker-delivery", 1); failDelivery = true;
      try { assert.equal((await dispatch()).deliveries[0].outcome, "DELIVERY_FAILED"); } finally { failDelivery = false; }
      await rejected(() => a.worker.claim(ref)); assert.equal((await taskRow(ref)).state, "QUEUED");
      await wait(35); services = f.services(delivery);
      assert.equal((await dispatch()).deliveries[0].outcome, "ACKNOWLEDGED");
      assert.equal((await a.worker.runOnce(ref)).outcome, "DEFERRED_CHECKPOINT_UNAVAILABLE");
    });
    await t.test("late event insertion failure rolls back lease/state/event and preserves original handle", async () => {
      const ref = await create("worker-rollback", 0); await dispatch(); const handle = await lease(ref), before = await taskRow(ref);
      await f.admin.query(`CREATE FUNCTION public.story_worker_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic worker late failure' USING ERRCODE='23514'; END $$`);
      await f.admin.query(`CREATE TRIGGER "StoryTaskEvent_worker_fail" BEFORE INSERT ON public."StoryTaskEvent" FOR EACH ROW EXECUTE FUNCTION public.story_worker_test_fail()`);
      try { await rejected(() => a.worker.execute(handle)); }
      finally { await f.admin.query(`DROP TRIGGER "StoryTaskEvent_worker_fail" ON public."StoryTaskEvent"`); }
      assert.deepEqual(await taskRow(ref), before); assert.equal((await inventory()).fences, "0");
      assert.equal((await a.worker.execute(handle)).state, "FAILED");
    });
    await t.test("optional current script is independently revalidated before execution", async () => {
      const ref = await create("worker-review", 11, 120000, "REVIEW_EVIDENCE"); await dispatch(); const handle = await lease(ref);
      await f.mutateSource(tx => tx.storylineStudio.update({ where: { id: f.saved.studioId }, data: { currentScriptVersionId: null } }));
      const result = await a.worker.execute(handle); assert.equal(result.errorCode, "STORY_TASK_SOURCE_STALE"); assert.equal(result.executionDigest, null);
    });
    await t.test("bounded recovery excludes terminal jobs, rejects oversized/duplicate input and creates no provider artifacts", async () => {
      assert.equal((await a.recovery.recoverOnce([main]))[0].outcome, "NOT_ELIGIBLE");
      await rejected(() => a.recovery.recoverOnce(Array.from({ length: 11 }, () => main)));
      await rejected(() => a.recovery.recoverOnce([main, main]));
      await rejected(() => a.recovery.recoverOnce([{ ...main, generation: 1 }]));
      const counts = await inventory(); assert.equal(counts.submissions, "0"); assert.equal(counts.results, "0"); assert.equal(counts.fences, "0");
      assert.equal((await f.admin.query(`SELECT count(*) FROM public."StorySourceVerification"`)).rows[0].count, "0");
      assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryTask" WHERE state='COMPLETED'`)).rows[0].count, "0");
      assert.deepEqual((await f.admin.query(`SELECT public.story_m2_test_dispatchable('SUBMITTED') submitted,public.story_m2_test_dispatchable('UNKNOWN') unknown`)).rows[0], { submitted: false, unknown: false });
      assert.equal(await f.runtime.storySourceSnapshot.count(), 1);
    });
    await t.test("owner/wrong-role/missing-key bootstrap cannot become worker authority", async () => {
      const unsafe = new PrismaClient({ adapter: new PrismaPg({ ...f.owned.prismaAdapterConfig(), pipeline: true, max: 1 }) });
      try {
        for (const database of [unsafe, f.admission, f.runtime])
          await rejected(() => createStoryTaskFakeWorker({ database, scope: exactScope, profile: f.currentProfile(), inspectMedia: f.media.inspect, validationKey: new Uint8Array(32) }).claim(main));
        assert.throws(() => createStoryTaskFakeWorker({ database: a.database, scope: exactScope, profile: f.currentProfile(), inspectMedia: f.media.inspect, validationKey: new Uint8Array() }), StoryTaskContractError);
      } finally { await unsafe.$disconnect(); }
    });
  } finally { await f.close(); }
});

test("fake execution hash is deterministic and reference shape is not authority", () => {
  const ref = { taskId: "synthetic-task", generation: 0 }, hash = "a".repeat(64);
  assert.equal(executeDeterministicStoryTaskFake(ref, hash), executeDeterministicStoryTaskFake(ref, hash));
  assert.notEqual(executeDeterministicStoryTaskFake(ref, hash), executeDeterministicStoryTaskFake({ ...ref, generation: 1 }, hash));
  const forged = { ...ref, sourceVerified: true };
  assert.throws(() => executeDeterministicStoryTaskFake(forged, hash));
});
test("SUBMITTED, UNKNOWN and terminal states are never fake-claim/recovery eligible", () => {
  for (const state of ["SUBMITTED", "UNKNOWN", "COMPLETED", "FAILED", "CANCELLED"])
    assert.deepEqual(fakeStoryTaskStateEligibility(state), { claim: false, recover: false });
  assert.deepEqual(fakeStoryTaskStateEligibility("QUEUED"), { claim: true, recover: false });
  assert.deepEqual(fakeStoryTaskStateEligibility("LEASED"), { claim: false, recover: true });
  assert.throws(() => fakeStoryTaskStateEligibility("fresh=true"));
});
test("worker/recovery stay absent from application bootstrap and pure contract barrel", async () => {
  async function inspect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) assert.doesNotMatch(await readFile(path, "utf8"),
        /createStoryTaskFake(?:Worker|Recovery)|story_m2_test_worker_|transactional-gateway\.fixture/);
    }
  }
  await inspect("app"); await inspect("workers");
  assert.doesNotMatch(await readFile("lib/storyline/jobs/index.ts", "utf8"), /fake-worker/);
});
