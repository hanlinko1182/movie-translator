// Synthetic authority/media and fake delivery only, in process-owned PostgreSQL.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, mock, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../../generated/prisma/client";
import { createStoryTaskAdmission } from "../../../lib/storyline/jobs/admission";
import { createStoryTaskDispatch, storyDeliveryId, type StoryFakeDelivery, type StoryTaskReference } from "../../../lib/storyline/jobs/dispatch";
import { StoryTaskContractError } from "../../../lib/storyline/jobs/errors";
import { createStoryTaskReader } from "../../../lib/storyline/jobs/read";
import { scope } from "../fixtures";
import { transactionalFixture } from "./transactional-gateway.fixture";

before(() => mock.method(globalThis, "fetch", () => assert.fail("No provider/network transport")));
after(() => mock.restoreAll());
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const rejected = (run: () => Promise<unknown>) => assert.rejects(run(), (error: unknown) => error instanceof StoryTaskContractError);

function fakeQueue() {
  const receipts = new Map<string, StoryTaskReference>();
  let fails = false, wrongReceipt = false, publishes = 0;
  let inspectCommit: ((payload: StoryTaskReference) => Promise<void>) | undefined;
  const delivery: StoryFakeDelivery = {
    async publish({ id, payload }) {
      publishes++;
      assert.deepEqual(Object.keys(payload).sort(), ["generation", "taskId"]);
      assert.equal(id, storyDeliveryId(payload));
      await inspectCommit?.(payload);
      if (fails) throw new Error("synthetic delivery failure; never forwarded");
      receipts.set(id, payload);
      return wrongReceipt ? "wrong-receipt" : id;
    },
    async has(id) { return receipts.has(id); },
  };
  return { delivery, receipts, published: () => publishes, fail: (value: boolean) => { fails = value; },
    wrongReceipt: (value: boolean) => { wrongReceipt = value; }, onPublish: (inspect: typeof inspectCommit) => { inspectCommit = inspect; } };
}

for (const m1First of [true, false]) test(`M2-03 exported services: M1 ${m1First ? "before" : "after"} M2`, { timeout: 180000 }, async t => {
  const f = await transactionalFixture(m1First), queue = fakeQueue();
  const exactScope = { ...scope, studioId: f.saved.studioId };
  let services = f.services(queue.delivery);
  const request = (decisionId: string) => ({ decisionId, selection: f.sourceReference(f.currentProfile().kind as "ANALYZE_EVIDENCE" | "REVIEW_EVIDENCE"), identity: f.currentRecipe() });
  const counts = async () => (await f.admin.query(`SELECT
    (SELECT count(*) FROM public."StoryTask") tasks,(SELECT count(*) FROM public."StoryPaidConfirmation") confirmations,
    (SELECT count(*) FROM public."StoryTaskDispatch") dispatches,(SELECT count(*) FROM public."StoryTaskEvent") events,
    (SELECT count(*) FROM public."StoryAdmission") admissions,(SELECT count(*) FROM public."StoryTestAdmissionFence") fences`)).rows[0];
  const state = async () => (await f.admin.query(`SELECT row_to_json(t) task,row_to_json(d) dispatch FROM public."StoryTask" t
    JOIN public."StoryTaskDispatch" d ON d."taskId"=t.id ORDER BY t.id`)).rows;
  let decision = "", taskId = "";
  try {
    await t.test("service construction/import performs no admission, delivery or automatic reconciliation", async () => {
      assert.deepEqual(await counts(), { tasks: "0", confirmations: "0", dispatches: "0", events: "0", admissions: "0", fences: "0" });
      assert.equal(queue.published(), 0);
      const page = await services.read.list({ scope: exactScope, afterTaskId: null, limit: 50 });
      assert.deepEqual(page, { items: [], nextAfterTaskId: null });
      assert.equal(queue.published(), 0);
    });
    await t.test("no key, forged decision, wrong scope and untrusted snapshot flags fail closed", async () => {
      assert.throws(() => createStoryTaskAdmission({ database: f.admission, profile: f.currentProfile(), inspectMedia: f.media.inspect, validationKey: new Uint8Array() }), StoryTaskContractError);
      const before = await counts();
      await rejected(() => services.admission.admit(request("forged-decision")));
      decision = await f.issue();
      for (const changed of [{ projectId: "wrong-project" }, { movieId: "movie-other" }, { studioId: "wrong-studio" },
        { sourceSnapshotId: "unpersisted" }, { expectedStudioRevision: 999 }])
        await rejected(() => services.admission.admit({ ...request(decision), selection: { ...request(decision).selection, ...changed } }));
      await rejected(() => services.admission.admit({ ...request(decision), persisted: true }));
      await f.keyEnabled(false);
      try { await rejected(() => services.admission.admit(request(decision))); } finally { await f.keyEnabled(true); }
      for (const permission of ["canCreate", "canSpend"]) {
        await f.admin.query(`UPDATE public."StorySyntheticAuthority" SET "${permission}"=false WHERE "roleKind"='ADMISSION'`);
        try { await rejected(() => services.admission.admit(request(decision))); }
        finally { await f.admin.query(`UPDATE public."StorySyntheticAuthority" SET "${permission}"=true WHERE "roleKind"='ADMISSION'`); }
      }
      assert.deepEqual(await counts(), before);
    });
    await t.test("exact canonical bytes, full hashes and logical identity are compared", async () => {
      const before = await counts(), original = f.currentRecipe();
      for (const changed of [{ canonicalRecipe: original.canonicalRecipe + " " }, { recipeHash: "f".repeat(64) }, { logicalTaskKey: "forged" },
        { recipe: { ...original.recipe, source: { ...original.recipe.source, contextHash: "f".repeat(64) } } }])
        await rejected(() => services.admission.admit({ ...request(decision), identity: { ...original, ...changed } }));
      assert.deepEqual(await counts(), before);
    });

    const chinese = await f.runtime.transcriptSegment.findUniqueOrThrow({ where: { id: "source-1" } });
    const translated = await f.runtime.translatedSegment.findFirstOrThrow({ orderBy: { sequence: "asc" } });
    const qc = await f.runtime.translationQcIssue.findFirstOrThrow();
    const mutations: Array<[string, (tx: Prisma.TransactionClient) => Promise<unknown>, (tx: Prisma.TransactionClient) => Promise<unknown>]> = [
      ["Chinese transcript", tx => tx.transcriptSegment.update({ where: { id: chinese.id }, data: { text: chinese.text + "变化。" } }),
        tx => tx.transcriptSegment.update({ where: { id: chinese.id }, data: { text: chinese.text } })],
      ["ALL_CURRENT translation", tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { text: translated.text + "ပြောင်း။" } }),
        tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { text: translated.text } })],
      ["subtitle approval", tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { reviewStatus: translated.reviewStatus === "APPROVED" ? "NEEDS_REVIEW" : "APPROVED" } }),
        tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { reviewStatus: translated.reviewStatus } })],
      ["QC", tx => tx.translationQcIssue.update({ where: { id: qc.id }, data: { message: qc.message + " synthetic" } }),
        tx => tx.translationQcIssue.update({ where: { id: qc.id }, data: { message: qc.message, updatedAt: qc.updatedAt } })],
      ["source alignment", tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { endMs: translated.endMs + 1 } }),
        tx => tx.translatedSegment.update({ where: { id: translated.id }, data: { endMs: translated.endMs } })],
    ];
    for (const [name, mutate, restore] of mutations) await t.test(`service rejects changed ${name} without consuming confirmation`, async () => {
      const before = await counts();
      try { await f.mutateSource(mutate); await rejected(() => services.admission.admit(request(decision))); }
      finally { await f.mutateSource(restore); }
      assert.deepEqual(await counts(), before);
    });
    await t.test("changed synthetic media checksum/descriptor cannot admit", async () => {
      const before = await counts();
      f.media.setInvalid(true);
      try { await rejected(() => services.admission.admit(request(decision))); } finally { f.media.setInvalid(false); }
      f.media.setChanged(true);
      try { await rejected(() => services.admission.admit(request(decision))); } finally { f.media.setChanged(false); }
      assert.deepEqual(await counts(), before);
    });
    await t.test("source changed after preflight is rechecked inside the service fence", async () => {
      const before = await counts();
      const changing = f.services(queue.delivery, async storageKey => {
        const inspected = await f.media.inspect(storageKey);
        await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: chinese.id }, data: { text: chinese.text + "变化。" } }));
        return inspected;
      });
      try { await rejected(() => changing.admission.admit(request(decision))); }
      finally { await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: chinese.id }, data: { text: chinese.text } })); }
      assert.deepEqual(await counts(), before);
    });
    await t.test("late event failure rolls back task, confirmation, admission, dispatch and fence", async () => {
      await f.admin.query(`CREATE FUNCTION public.story_service_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic late failure' USING ERRCODE='23514'; END $$`);
      await f.admin.query(`CREATE TRIGGER "StoryTaskEvent_service_fail" BEFORE INSERT ON public."StoryTaskEvent"
        FOR EACH ROW EXECUTE FUNCTION public.story_service_test_fail()`);
      const before = await counts();
      try { await rejected(() => services.admission.admit(request(decision))); }
      finally { await f.admin.query(`DROP TRIGGER "StoryTaskEvent_service_fail" ON public."StoryTaskEvent"`); }
      assert.deepEqual(await counts(), before); assert.equal(queue.published(), 0);
    });
    await t.test("genuine M1 producer to service admission converges under concurrency without ID rewriting", async () => {
      assert.equal(f.saved.snapshotId, f.candidate.snapshot.payload.id);
      assert.match(f.saved.snapshotId, /^candidate-/);
      assert.equal(await f.runtime.storySourceSnapshot.count(), 1);
      const results = await Promise.all(Array.from({ length: 3 }, () => services.admission.admit(request(decision))));
      assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]); taskId = results[0].taskId;
      assert.equal(results[0].generation, 0);
      assert.deepEqual(await counts(), { tasks: "1", confirmations: "1", dispatches: "1", events: "1", admissions: "1", fences: "0" });
      const stored = (await f.admin.query(`SELECT t."sourceSnapshotId",t."canonicalRecipe",t.generation,c.state FROM public."StoryTask" t
        JOIN public."StoryPaidConfirmation" c ON c."taskId"=t.id WHERE t.id=$1`, [taskId])).rows[0];
      assert.equal(stored.sourceSnapshotId, f.saved.snapshotId); assert.equal(stored.canonicalRecipe, f.currentRecipe().canonicalRecipe);
      assert.equal(stored.state, "CONSUMED"); assert.equal(stored.generation, 0); assert.equal(queue.published(), 0);
    });
    await t.test("exact duplicate uses original consumed decision; replay into another recipe/idempotency binding fails", async () => {
      const before = await counts();
      assert.equal((await services.admission.admit(request(decision))).taskId, taskId);
      await f.configure("key-one", "ANALYZE_EVIDENCE", 10); services = f.services(queue.delivery);
      await rejected(() => services.admission.admit(request(decision)));
      const conflicting = await f.issue(); await rejected(() => services.admission.admit(request(conflicting)));
      await f.configure("key-one"); services = f.services(queue.delivery);
      assert.deepEqual(await counts(), before);
    });
    await t.test("cooperating source writer waits through service validation and acknowledged admission", async () => {
      let writing: Promise<unknown> | undefined, releasePid!: () => void, pid = 0;
      const gotPid = new Promise<void>(resolve => { releasePid = resolve; });
      const fenced = f.services(queue.delivery, async storageKey => {
        const media = await f.media.inspect(storageKey);
        let checked = false;
        return { ...media, assertUnchanged: async () => {
          await media.assertUnchanged();
          if (checked) return; checked = true;
          writing = f.runtime.$transaction(async tx => {
            pid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`)[0].pid; releasePid();
            await tx.$queryRaw`SELECT id FROM public."Movie" WHERE id=${scope.movieId} FOR UPDATE`;
            await tx.movie.update({ where: { id: scope.movieId }, data: { title: "Synthetic movie" } });
          });
          await gotPid;
          let blocked = false;
          for (let i = 0; i < 20; i++) {
            blocked = (await f.admin.query<{ blocked: boolean }>(`SELECT cardinality(pg_blocking_pids($1))>0 blocked`, [pid])).rows[0].blocked;
            if (blocked) break; await wait(10);
          }
          assert.equal(blocked, true, "Movie writer must wait for the service-owned fence");
        } };
      });
      assert.equal((await fenced.admission.admit(request(decision))).taskId, taskId);
      await writing;
    });
    await t.test("acknowledged database commit survives fake delivery failure", async () => {
      queue.onPublish(async reference => {
        assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryAdmission" WHERE "taskId"=$1`, [reference.taskId])).rows[0].count, "1");
        assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryTestAdmissionFence"`)).rows[0].count, "0");
      });
      queue.fail(true);
      const delivered = await services.dispatch.dispatchDue(exactScope, 10);
      assert.equal(delivered.length, 1); assert.equal(delivered[0].outcome, "DELIVERY_FAILED");
      assert.equal((await counts()).tasks, "1");
      assert.equal((await f.admin.query(`SELECT "queueReceipt" FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [taskId])).rows[0].queueReceipt, null);
      assert.equal(queue.receipts.size, 0); queue.fail(false);
    });
    let receiptObservation = { taskId: "", generation: 0, stateRevision: 0 };
    await t.test("explicit restarted reconciler delivers durable pending intent in the same generation", async () => {
      await wait(35); services = f.services(queue.delivery);
      const recovered = await services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [] });
      assert.equal(recovered.deliveries.length, 1); assert.equal(recovered.deliveries[0].outcome, "ACKNOWLEDGED");
      const row = recovered.deliveries[0]; receiptObservation = { taskId: row.taskId, generation: row.generation, stateRevision: row.stateRevision };
      assert.equal(receiptObservation.generation, 0); assert.equal(queue.receipts.size, 1);
      const publishes = queue.published();
      assert.deepEqual((await services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [] })).deliveries, []);
      assert.equal(queue.published(), publishes);
    });
    await t.test("lost fake receipt recovers explicitly; deterministic duplicate delivery creates no new admission", async () => {
      const before = await counts(); queue.receipts.clear();
      const recovered = await services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [receiptObservation] });
      assert.equal(recovered.recoveries[0].rearmed, true); assert.equal(recovered.deliveries[0].outcome, "ACKNOWLEDGED");
      assert.equal(queue.receipts.size, 1); assert.deepEqual(await counts(), before);
      assert.equal(await services.dispatch.recoverMissing(exactScope, receiptObservation), false);
    });
    await t.test("stale generation/revision/owner acknowledgements and recovery cannot mutate dispatch", async () => {
      const original = (await f.admin.query(`SELECT owner FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [taskId])).rows[0];
      const claim = { ...receiptObservation, owner: original.owner }, before = await state();
      assert.equal(await services.dispatch.acknowledge(claim, true), false); // idempotent no-write acknowledgement
      for (const changed of [{ generation: 1 }, { stateRevision: 1 }, { owner: "wrong-owner" }])
        await rejected(() => services.dispatch.acknowledge({ ...claim, ...changed }, true));
      queue.receipts.clear();
      await rejected(() => services.dispatch.recoverMissing(exactScope, { ...receiptObservation, generation: 1 }));
      await rejected(() => services.dispatch.recoverMissing(exactScope, { ...receiptObservation, stateRevision: 1 }));
      queue.receipts.set(storyDeliveryId(receiptObservation), { taskId, generation: 0 });
      assert.deepEqual(await state(), before);
    });
    await t.test("reviewed three-publication ceiling stops recovery without extending authority", async () => {
      queue.receipts.clear();
      const result = await services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [receiptObservation] });
      assert.equal(result.recoveries[0].rearmed, true); assert.deepEqual(result.deliveries, []);
      assert.equal((await f.admin.query(`SELECT "publishAttempts" FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [taskId])).rows[0].publishAttempts, 3);
      assert.equal((await counts()).confirmations, "1");
    });
    await t.test("bounded scoped reader returns allowlisted metadata and makes no writes or dispatch", async () => {
      const before = await state(), published = queue.published();
      const result = await services.read.list({ scope: exactScope, afterTaskId: null, limit: 1 });
      assert.equal(result.items.length, 1); assert.equal(result.nextAfterTaskId, taskId);
      assert.deepEqual(Object.keys(result.items[0]).sort(), ["taskId", "kind", "state", "generation", "createdAt", "stateChangedAt", "errorCode", "candidateAvailable", "usage"].sort());
      assert.deepEqual(result.items[0].usage, { classification: "UNKNOWN", inputTokens: null, outputTokens: null, costUsdMicros: null });
      assert.equal(result.items[0].candidateAvailable, false);
      assert.deepEqual((await services.read.list({ scope: exactScope, afterTaskId: taskId, limit: 50 })).items, []);
      assert.deepEqual(await state(), before); assert.equal(queue.published(), published);
    });
    await t.test("wrong reader/outbox scope, invalid pages and unbounded reconciliation fail", async () => {
      const before = await state();
      for (const changed of [{ projectId: "wrong-project" }, { movieId: "movie-other" }, { studioId: "wrong-studio" }]) {
        const wrong = { ...exactScope, ...changed };
        await rejected(() => services.read.list({ scope: wrong, afterTaskId: null, limit: 10 }));
        await rejected(() => services.dispatch.dispatchDue(wrong, 1));
        await rejected(() => services.dispatch.recoverMissing(wrong, receiptObservation));
      }
      for (const limit of [0, 51, -1]) await rejected(() => services.read.list({ scope: exactScope, afterTaskId: null, limit }));
      for (const batchSize of [0, 11]) await rejected(() => services.reconcile.reconcileOnce({ scope: exactScope, batchSize, missingReceipts: [] }));
      await rejected(() => services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 1, missingReceipts: [receiptObservation, receiptObservation] }));
      assert.deepEqual(await state(), before);
    });
    await t.test("unsafe owner and wrong-role bootstrap cannot read, publish or acknowledge", async () => {
      const unsafe = new PrismaClient({ adapter: new PrismaPg({ ...f.owned.prismaAdapterConfig(), pipeline: true }) });
      const before = await state(), published = queue.published();
      try {
        for (const database of [unsafe, f.admission, f.runtime]) {
          await rejected(() => createStoryTaskReader(database).list({ scope: exactScope, afterTaskId: null, limit: 1 }));
          await rejected(() => createStoryTaskDispatch({ database, scope: exactScope, delivery: queue.delivery }).dispatchDue(exactScope, 1));
        }
      } finally { await unsafe.$disconnect(); }
      assert.deepEqual(await state(), before); assert.equal(queue.published(), published);
    });
    await t.test("expired confirmation rejects service admission and consumed-grant redispatch", async () => {
      await f.configure("short-admission", "ANALYZE_EVIDENCE", 9); services = f.services(queue.delivery);
      const expired = await f.issue(50); await wait(70);
      await rejected(() => services.admission.admit(request(expired)));
      const short = await f.issue(500), saved = await services.admission.admit(request(short));
      await wait(550); const before = await state();
      await rejected(() => services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [] }));
      assert.deepEqual(await state(), before);
      // Only synthetic lifecycle setup, not an implemented cancellation/retry service.
      await f.admin.query(`UPDATE public."StoryTask" SET state='FAILED',"stateRevision"="stateRevision"+1,
        "stateChangedAt"=clock_timestamp(),"errorCode"='STORY_TASK_CONFIRMATION_STALE' WHERE id=$1`, [saved.taskId]);
    });
    await t.test("expired fake-delivery owner recovers after restart; old owner cannot acknowledge", async () => {
      await f.configure("lost-ack", "ANALYZE_EVIDENCE", 8); services = f.services(queue.delivery);
      const saved = await services.admission.admit(request(await f.issue()));
      // Simulate lost acknowledgement by making the database reject it after the
      // Map has accepted the reference; no provider/checkpoint is involved.
      queue.onPublish(async () => { await f.admin.query(`REVOKE EXECUTE ON FUNCTION public.story_m2_test_delivery(text,integer,integer,text,boolean) FROM storyline_outbox`); });
      const uncertain = await services.dispatch.dispatchDue(exactScope, 10);
      assert.equal(uncertain[0].outcome, "ACK_UNCONFIRMED");
      const old = (await f.admin.query(`SELECT owner FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [saved.taskId])).rows[0].owner;
      await f.admin.query(`GRANT EXECUTE ON FUNCTION public.story_m2_test_delivery(text,integer,integer,text,boolean) TO storyline_outbox`);
      queue.onPublish(undefined); await wait(550); services = f.services(queue.delivery);
      const recovered = await services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [] });
      assert.equal(recovered.deliveries[0].outcome, "ACKNOWLEDGED"); assert.equal(recovered.deliveries[0].generation, 0);
      await rejected(() => services.dispatch.acknowledge({ taskId: saved.taskId, generation: 0, stateRevision: 0, owner: old }, true));
    });
    await t.test("expired pre-checkpoint task lease recovers in same generation through exported service", async () => {
      const row = (await f.admin.query(`SELECT id FROM public."StoryTask" WHERE "recipeHash"=$1`, [f.currentRecipe().recipeHash])).rows[0];
      await f.admin.query(`UPDATE public."StoryTask" SET state='LEASED',"stateRevision"="stateRevision"+1,
        "leaseOwner"='synthetic-worker',"leaseUntil"=clock_timestamp()-interval '1 second',"stateChangedAt"=clock_timestamp() WHERE id=$1`, [row.id]);
      await wait(35);
      const result = await services.reconcile.reconcileOnce({ scope: exactScope, batchSize: 10, missingReceipts: [] });
      assert.equal(result.deliveries[0].outcome, "ACKNOWLEDGED"); assert.equal(result.deliveries[0].generation, 0);
      assert.equal(result.deliveries[0].stateRevision, 2);
      assert.equal((await f.admin.query(`SELECT "preSubmitAttempts" FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [row.id])).rows[0].preSubmitAttempts, 1);
    });
    await t.test("wrong returned fake receipt is not acknowledged as successful", async () => {
      await f.configure("wrong-receipt", "ANALYZE_EVIDENCE", 7); services = f.services(queue.delivery);
      const saved = await services.admission.admit(request(await f.issue())); queue.wrongReceipt(true);
      try { assert.equal((await services.dispatch.dispatchDue(exactScope, 10))[0].outcome, "DELIVERY_FAILED"); }
      finally { queue.wrongReceipt(false); }
      assert.equal((await f.admin.query(`SELECT "queueReceipt" FROM public."StoryTaskDispatch" WHERE "taskId"=$1`, [saved.taskId])).rows[0].queueReceipt, null);
      await wait(35); await services.dispatch.dispatchDue(exactScope, 10);
    });
    await t.test("optional immutable script binding is preserved and a changed pointer rejects service admission", async () => {
      await f.configure("review-script", "REVIEW_EVIDENCE"); services = f.services(queue.delivery);
      const reviewDecision = await f.issue();
      const saved = await services.admission.admit(request(reviewDecision));
      assert.equal((await f.admin.query(`SELECT "scriptVersionId" FROM public."StoryTask" WHERE id=$1`, [saved.taskId])).rows[0].scriptVersionId, f.scriptSaved.scriptVersionId);
      const before = await counts();
      await f.mutateSource(tx => tx.storylineStudio.update({ where: { id: f.saved.studioId }, data: { currentScriptVersionId: null } }));
      try { await rejected(() => services.admission.admit(request(reviewDecision))); }
      finally { await f.mutateSource(tx => tx.storylineStudio.update({ where: { id: f.saved.studioId }, data: { currentScriptVersionId: f.scriptSaved.scriptVersionId } })); }
      assert.deepEqual(await counts(), before);
    });
    await t.test("SUBMITTED/UNKNOWN remain nondispatchable and no checkpoint/send/receipt issuance occurs", async () => {
      assert.deepEqual((await f.admin.query(`SELECT public.story_m2_test_dispatchable('SUBMITTED') submitted,
        public.story_m2_test_dispatchable('UNKNOWN') unknown`)).rows[0], { submitted: false, unknown: false });
      assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryProviderSubmission"`)).rows[0].count, "0");
      assert.equal((await f.admin.query(`SELECT count(*) FROM public."StorySourceVerification"`)).rows[0].count, "0");
    });
  } finally { await f.close(); }
});

test("service factories remain uninstalled and synthetic authority composition stays test-only", async () => {
  async function files(directory: string): Promise<string[]> {
    const result: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await files(path));
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) result.push(path);
    }
    return result;
  }
  for (const path of await files("app").then(async list => [...list, ...await files("workers")])) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /createStoryTask(?:Admission|Dispatch|Reconciler|Reader)|transactional-gateway\.fixture|story_m2_test_/);
  }
  const barrel = await readFile("lib/storyline/jobs/index.ts", "utf8");
  assert.doesNotMatch(barrel, /admission|dispatch|reconcile|read|service-boundary|persisted-source/);
});
