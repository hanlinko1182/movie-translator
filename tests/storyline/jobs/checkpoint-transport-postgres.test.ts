// Owned disposable PostgreSQL, synthetic media and in-process wire only.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, mock, test } from "node:test";
import { StoryTaskContractError } from "../../../lib/storyline/jobs/errors";
import { createStoryTaskFakeCheckpoint } from "../../../lib/storyline/jobs/fake-checkpoint";
import { createStoryFakeWire, type FakeWireScenario } from "../../../lib/storyline/jobs/fake-transport";
import type { StoryTaskReference } from "../../../lib/storyline/jobs/dispatch";
import { scope } from "../fixtures";
import { transactionalFixture } from "./transactional-gateway.fixture";

before(() => mock.method(globalThis, "fetch", () => assert.fail("Fake-only: network forbidden")));
after(() => mock.restoreAll());
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const rejected = (run: () => Promise<unknown>) => assert.rejects(run(), (e: unknown) => e instanceof StoryTaskContractError);
const denied = (run: () => Promise<unknown>) => assert.rejects(run(), (e: unknown) =>
  (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } }).meta?.driverAdapterError?.cause?.originalCode === "42501");

async function fixture(first: boolean) {
  const f = await transactionalFixture(first, true, true), deliveries = new Map<string, StoryTaskReference>();
  let index = 0;
  const delivery = {
    async publish(d: Readonly<{ id: string; payload: StoryTaskReference }>) { deliveries.set(d.id, d.payload); return d.id; },
    async has(id: string) { return deliveries.has(id); },
  };
  async function create(options: { ttl?: number; ack?: "DROP_AFTER_COMMIT"; separate?: boolean; kind?: "ANALYZE_EVIDENCE" | "REVIEW_EVIDENCE" } = {}) {
    await f.configure(`checkpoint-${index}`, options.kind ?? "ANALYZE_EVIDENCE", 11 - index++);
    const services = f.services(delivery), worker = await f.fakeWorker(f.media.inspect, options.separate);
    const checkpoint = await f.checkpointServices(worker.worker, { acknowledgementFault: options.ack, separateConnection: options.separate });
    const ref = await services.admission.admit({ decisionId: await f.issue(options.ttl ?? 120000),
      selection: f.sourceReference(options.kind ?? "ANALYZE_EVIDENCE"), identity: f.currentRecipe() });
    await services.reconcile.reconcileOnce({ scope: { ...scope, studioId: f.saved.studioId }, batchSize: 10, missingReceipts: [] });
    const claim = await worker.worker.claim(ref); assert.equal(claim.outcome, "CLAIMED");
    if (claim.outcome !== "CLAIMED") assert.fail("Expected genuine lease");
    return { ...checkpoint, worker: worker.worker, recovery: worker.recovery, services, ref, lease: claim.lease };
  }
  const row = async (ref: StoryTaskReference) => (await f.admin.query(`SELECT * FROM public."StoryTask" WHERE id=$1`, [ref.taskId])).rows[0];
  const counts = async () => (await f.admin.query(`SELECT
    (SELECT count(*) FROM public."StoryProviderSubmission") submissions,
    (SELECT count(*) FROM public."StoryTaskResult") results,
    (SELECT count(*) FROM public."StoryTestCheckpointFence") fences,
    (SELECT count(*) FROM public."StorySourceVerification") verifications`)).rows[0];
  const changeQc = async () => {
    const issue = await f.runtime.translationQcIssue.findFirstOrThrow();
    await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: issue.id }, data: { message: issue.message + " synthetic drift" } }));
  };
  return { ...f, create, row, counts, changeQc };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function owned(first: boolean, run: (f: Fixture) => Promise<void>) {
  const f = await fixture(first); try { await run(f); } finally { await f.close(); }
}
async function untilWire(wire: ReturnType<typeof createStoryFakeWire>) {
  for (let i = 0; i < 100 && wire.calls() === 0; i++) await wait(5);
  assert.equal(wire.calls(), 1);
}

for (const first of [true, false]) test(`M2-05 checkpoint services: M1 ${first ? "before" : "after"} M2`, { timeout: 180000 }, async t => {
  await t.test("commit precedes send; opaque one-use permits, duplicate delivery and immutable idempotent results", () => owned(first, async f => {
    const a = await f.create(), wire = createStoryFakeWire("SUCCESS"), permit = await a.service.checkpoint(a.lease);
    assert.equal(wire.calls(), 0);
    assert.equal((await f.row(a.ref)).state, "SUBMITTED"); // Independent connection sees committed checkpoint.
    const sub = (await f.admin.query(`SELECT * FROM public."StoryProviderSubmission"`)).rows[0];
    assert.equal(sub.state, "SUBMITTED"); assert.equal(sub.generation, 0);
    assert.throws(() => JSON.stringify(permit), StoryTaskContractError);
    await rejected(() => a.service.send({ ...permit }, wire.wire));
    await rejected(() => a.service.checkpoint(a.lease));
    assert.equal((await a.worker.claim(a.ref)).outcome, "NOT_ELIGIBLE");
    const sends = await Promise.allSettled([a.service.send(permit, wire.wire), a.service.send(permit, wire.wire)]);
    assert.equal(sends.filter(s => s.status === "rejected").length, 1);
    const success = sends.find(s => s.status === "fulfilled");
    if (!success || success.status !== "fulfilled") assert.fail("Expected one accepted send");
    const sent = success.value; assert.equal(sent.outcome, "DEFINITIVE");
    if (sent.outcome !== "DEFINITIVE") assert.fail("Expected original fake observation");
    await rejected(() => a.service.send(permit, wire.wire));
    await rejected(() => a.service.recordResult({ ...sent.receipt }));
    const recorded = await a.service.recordResult(sent.receipt); assert.equal(recorded.state, "COMPLETED");
    assert.deepEqual(await a.service.recordResult(sent.receipt), recorded);
    assert.equal(wire.calls(), 1); assert.equal((await f.counts()).results, "1");
    const result = (await f.admin.query(`SELECT * FROM public."StoryTaskResult"`)).rows[0];
    assert.equal(JSON.parse(result.normalizedPayload).synthetic, true); assert.equal(result.usageClass, "UNKNOWN");
    assert.equal(result.reportedUsdMicros, null);
    assert.equal((await f.admin.query(`SELECT state FROM public."StoryProviderSubmission"`)).rows[0].state, "RESOLVED");
    assert.equal((await f.counts()).verifications, "0"); assert.equal(await f.runtime.storySourceSnapshot.count(), 1);
    await assert.rejects(f.admin.query(`UPDATE public."StoryProviderSubmission" SET "requestHash"=$1 WHERE id=$2`, ["f".repeat(64), sub.id]));
    await assert.rejects(f.admin.query(`DELETE FROM public."StoryTaskResult" WHERE id=$1`, [result.id]));
  }));
  await t.test("definitive fake failure is resolved once and releases the unresolved slot", () => owned(first, async f => {
    const a = await f.create(), wire = createStoryFakeWire("FAILURE");
    assert.equal((await a.service.runOnce(a.lease, wire.wire)).state, "FAILED");
    assert.equal((await f.row(a.ref)).errorCode, "STORY_TASK_PROVIDER_FAILED");
    const b = await f.create(), success = createStoryFakeWire("SUCCESS");
    assert.equal((await b.service.runOnce(b.lease, success.wire)).state, "COMPLETED");
    assert.equal((await f.counts()).submissions, "2"); assert.equal(wire.calls(), 1);
  }));
  for (const scenario of ["LOST_RESPONSE", "TIMEOUT", "MALFORMED", "OVERSIZE"] as FakeWireScenario[])
    await t.test(`${scenario} is UNKNOWN, retains slot and never resends`, () => owned(first, async f => {
      const a = await f.create(), wire = createStoryFakeWire(scenario), permit = await a.service.checkpoint(a.lease);
      assert.equal((await a.service.send(permit, wire.wire)).outcome, "UNKNOWN");
      assert.equal((await f.row(a.ref)).state, "UNKNOWN"); assert.equal(wire.calls(), 1);
      await rejected(() => a.service.send(permit, wire.wire));
      assert.equal((await a.worker.runOnce(a.ref)).outcome, "NOT_ELIGIBLE");
      assert.equal((await a.service.recoverAfterCheckpoint(a.ref) as { outcome?: string }).outcome, "NOT_ELIGIBLE");
      const b = await f.create(); await rejected(() => b.service.checkpoint(b.lease));
      assert.deepEqual(await f.counts(), { submissions: "1", results: "0", fences: "0", verifications: "0" });
    }));
  await t.test("lost commit acknowledgement and restart cannot mint a permit or send", () => owned(first, async f => {
    const a = await f.create({ ack: "DROP_AFTER_COMMIT" }), wire = createStoryFakeWire("SUCCESS");
    await rejected(() => a.service.runOnce(a.lease, wire.wire));
    assert.equal((await f.row(a.ref)).state, "SUBMITTED"); assert.equal(wire.calls(), 0);
    const restarted = await f.checkpointServices(a.worker, { separateConnection: true });
    await rejected(() => restarted.service.send({ ...a.ref }, wire.wire));
    await rejected(() => restarted.service.recoverAfterCheckpoint(a.ref));
    await wait(2100); assert.equal((await restarted.service.recoverAfterCheckpoint(a.ref)).state, "UNKNOWN");
    assert.equal(wire.calls(), 0); assert.equal((await f.counts()).results, "0");
  }));
  await t.test("checkpoint transaction failure rolls back checkpoint, task, event and fence; zero sends", () => owned(first, async f => {
    const a = await f.create(), original = await f.row(a.ref), wire = createStoryFakeWire("SUCCESS");
    await f.admin.query(`CREATE FUNCTION public.story_checkpoint_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic transaction failure' USING ERRCODE='23514'; END $$`);
    await f.admin.query(`CREATE TRIGGER checkpoint_fail BEFORE INSERT ON public."StoryTaskEvent" FOR EACH ROW EXECUTE FUNCTION public.story_checkpoint_test_fail()`);
    await rejected(() => a.service.runOnce(a.lease, wire.wire));
    assert.deepEqual(await f.row(a.ref), original); assert.equal(wire.calls(), 0);
    assert.deepEqual(await f.counts(), { submissions: "0", results: "0", fences: "0", verifications: "0" });
    await rejected(() => a.service.checkpoint(a.lease)); // Lost local lease is never restored speculatively.
  }));
  await t.test("crash after acknowledged checkpoint is recovered as UNKNOWN, not sent again", () => owned(first, async f => {
    const a = await f.create(), permit = await a.service.checkpoint(a.lease), restarted = await f.checkpointServices(a.worker, { separateConnection: true });
    const wire = createStoryFakeWire("SUCCESS");
    await rejected(() => restarted.service.send(permit, wire.wire));
    await wait(2100); assert.equal((await restarted.service.recoverAfterCheckpoint(a.ref)).state, "UNKNOWN");
    assert.equal((await a.service.send(permit, wire.wire)).outcome, "UNKNOWN"); assert.equal(wire.calls(), 0);
  }));
  await t.test("global slot arbitrates concurrent checkpoints; one durable checkpoint and one send", () => owned(first, async f => {
    const a = await f.create(), b = await f.create({ separate: true });
    const claims = await Promise.allSettled([a.service.checkpoint(a.lease), b.service.checkpoint(b.lease)]);
    const wins = claims.flatMap((r, i) => r.status === "fulfilled" ? [{ permit: r.value, i }] : []);
    assert.equal(wins.length, 1); assert.equal((await f.counts()).submissions, "1");
    const wire = createStoryFakeWire("SUCCESS"), winner = [a, b][wins[0].i];
    const sent = await winner.service.send(wins[0].permit, wire.wire);
    if (sent.outcome !== "DEFINITIVE") assert.fail("Expected definitive response");
    assert.equal((await winner.service.recordResult(sent.receipt)).state, "COMPLETED"); assert.equal(wire.calls(), 1);
  }));
  await t.test("stale lease/revision, wrong generation and fabricated ownership fail before checkpoint", () => owned(first, async f => {
    const a = await f.create();
    await rejected(() => a.service.checkpoint({ ...a.lease }));
    await rejected(() => a.service.checkpoint({ ...a.ref, owner: "forged" }));
    await rejected(() => a.service.recoverAfterCheckpoint({ ...a.ref, generation: 1 }));
    const renewed = await a.worker.heartbeat(a.lease); assert.equal(renewed.outcome, "RENEWED");
    await rejected(() => a.service.checkpoint(a.lease));
    if (renewed.outcome !== "RENEWED") assert.fail("Expected renewed lease");
    await wait(550); await rejected(() => a.service.checkpoint(renewed.lease));
    assert.equal((await f.counts()).submissions, "0");
  }));
  for (const source of ["CHINESE", "TRANSLATION", "QC", "MEDIA", "SCRIPT"])
    await t.test(`${source} freshness is revalidated before checkpoint`, () => owned(first, async f => {
      const a = await f.create({ kind: source === "SCRIPT" ? "REVIEW_EVIDENCE" : "ANALYZE_EVIDENCE" }), wire = createStoryFakeWire("SUCCESS");
      if (source === "CHINESE") await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-1" }, data: { text: "合成变化。" } }));
      if (source === "TRANSLATION") {
        const row = await f.runtime.translatedSegment.findFirstOrThrow();
        await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: row.id }, data: { text: row.text + "ပြောင်း။" } }));
      }
      if (source === "QC") await f.changeQc();
      if (source === "MEDIA") f.media.setInvalid(true);
      if (source === "SCRIPT") await f.mutateSource(tx => tx.storylineStudio.update({ where: { id: f.saved.studioId }, data: { currentScriptVersionId: null } }));
      await rejected(() => a.service.runOnce(a.lease, wire.wire));
      assert.equal(wire.calls(), 0); assert.equal((await f.counts()).submissions, "0");
    }));
  await t.test("source drift after checkpoint denies send and retains UNKNOWN slot", () => owned(first, async f => {
    const a = await f.create(), permit = await a.service.checkpoint(a.lease), wire = createStoryFakeWire("SUCCESS");
    await f.changeQc(); assert.equal((await a.service.send(permit, wire.wire)).outcome, "UNKNOWN"); assert.equal(wire.calls(), 0);
  }));
  await t.test("source drift after fake send retains historical result without current publication", () => owned(first, async f => {
    const a = await f.create(), wire = createStoryFakeWire("HELD_SUCCESS"), permit = await a.service.checkpoint(a.lease);
    const sending = a.service.send(permit, wire.wire); await untilWire(wire); await f.changeQc(); wire.release();
    const sent = await sending; if (sent.outcome !== "DEFINITIVE") assert.fail("Expected definitive observation");
    assert.equal((await a.service.recordResult(sent.receipt)).state, "FAILED");
    assert.equal((await f.row(a.ref)).errorCode, "STORY_TASK_RESULT_STALE");
    assert.equal((await f.counts()).results, "1"); assert.equal((await f.counts()).verifications, "0");
  }));
  await t.test("cancellation before checkpoint denies submission", () => owned(first, async f => {
    const a = await f.create(); await a.worker.cancelBeforeCheckpoint({ ...a.ref, stateRevision: 1 });
    await rejected(() => a.service.checkpoint(a.lease)); assert.equal((await f.counts()).submissions, "0");
  }));
  await t.test("cancellation before send denies wire; cancellation cannot falsely release UNKNOWN", () => owned(first, async f => {
    const a = await f.create(), permit = await a.service.checkpoint(a.lease), wire = createStoryFakeWire("SUCCESS");
    await rejected(() => a.service.cancelAfterCheckpoint({ ...a.ref, stateRevision: 1 }));
    const cancelled = await a.service.cancelAfterCheckpoint({ ...a.ref, stateRevision: 2 }); assert.equal(cancelled.state, "SUBMITTED");
    assert.equal((await a.service.send(permit, wire.wire)).outcome, "UNKNOWN"); assert.equal(wire.calls(), 0);
    const again = await a.service.cancelAfterCheckpoint({ ...a.ref, stateRevision: 4 }); assert.equal(again.state, "UNKNOWN");
  }));
  await t.test("cancel during send retains slot until original definitive result, then CANCELLED", () => owned(first, async f => {
    const a = await f.create(), permit = await a.service.checkpoint(a.lease), wire = createStoryFakeWire("HELD_SUCCESS");
    const sending = a.service.send(permit, wire.wire); await untilWire(wire);
    await a.service.cancelAfterCheckpoint({ ...a.ref, stateRevision: 2 }); assert.equal((await f.row(a.ref)).state, "SUBMITTED");
    wire.release(); const sent = await sending; if (sent.outcome !== "DEFINITIVE") assert.fail("Expected original result");
    assert.equal((await a.service.recordResult(sent.receipt)).state, "CANCELLED");
    assert.equal((await f.counts()).results, "1"); assert.equal(wire.calls(), 1);
  }));
  await t.test("expired original confirmation cannot checkpoint, renew or send", () => owned(first, async f => {
    const a = await f.create({ ttl: 700 }); await wait(750); await rejected(() => a.service.checkpoint(a.lease));
    assert.equal((await f.counts()).submissions, "0");
    assert.equal((await a.recovery.recoverOnce([a.ref]))[0].state, "FAILED");
    assert.equal((await f.row(a.ref)).errorCode, "STORY_TASK_CONFIRMATION_STALE");
    const b = await f.create({ ttl: 700 }), permit = await b.service.checkpoint(b.lease), wire = createStoryFakeWire("SUCCESS");
    await wait(750); assert.equal((await b.service.send(permit, wire.wire)).outcome, "UNKNOWN"); assert.equal(wire.calls(), 0);
  }));
  await t.test("expiry after an actual send does not discard its original definitive observation", () => owned(first, async f => {
    const a = await f.create({ ttl: 700 }), wire = createStoryFakeWire("HELD_SUCCESS"), permit = await a.service.checkpoint(a.lease);
    const sending = a.service.send(permit, wire.wire); await untilWire(wire); await wait(750); wire.release();
    const sent = await sending; if (sent.outcome !== "DEFINITIVE") assert.fail("Expected original observation");
    assert.equal((await a.service.recordResult(sent.receipt)).state, "COMPLETED"); assert.equal(wire.calls(), 1);
  }));
  await t.test("result transaction rollback preserves checkpoint and allows result-only retry", () => owned(first, async f => {
    const a = await f.create(), wire = createStoryFakeWire("SUCCESS"), sent = await a.service.send(await a.service.checkpoint(a.lease), wire.wire);
    if (sent.outcome !== "DEFINITIVE") assert.fail("Expected response");
    await f.admin.query(`CREATE FUNCTION public.story_result_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic late result failure' USING ERRCODE='23514'; END $$`);
    await f.admin.query(`CREATE TRIGGER result_fail BEFORE INSERT ON public."StoryTaskEvent" FOR EACH ROW EXECUTE FUNCTION public.story_result_test_fail()`);
    await rejected(() => a.service.recordResult(sent.receipt));
    assert.equal((await f.row(a.ref)).state, "SUBMITTED"); assert.equal((await f.counts()).results, "0");
    assert.equal((await f.admin.query(`SELECT state FROM public."StoryProviderSubmission"`)).rows[0].state, "SUBMITTED");
    await f.admin.query(`DROP TRIGGER result_fail ON public."StoryTaskEvent"`);
    assert.equal((await a.service.recordResult(sent.receipt)).state, "COMPLETED"); assert.equal(wire.calls(), 1);
  }));
  await t.test("late original result cannot automatically investigate or resolve UNKNOWN", () => owned(first, async f => {
    const a = await f.create(), wire = createStoryFakeWire("SUCCESS"), sent = await a.service.send(await a.service.checkpoint(a.lease), wire.wire);
    if (sent.outcome !== "DEFINITIVE") assert.fail("Expected response");
    await wait(2100); await a.service.recoverAfterCheckpoint(a.ref);
    await rejected(() => a.service.recordResult(sent.receipt)); assert.equal((await f.row(a.ref)).state, "UNKNOWN");
    assert.equal(wire.calls(), 1); assert.equal((await f.counts()).results, "0");
  }));
  await t.test("restricted gateway permissions, unforgeable validation fence and both role-script orders", () => owned(first, async f => {
    const a = await f.create();
    for (const client of [f.rawAdmission, f.outbox, f.reader, f.issuer, f.legacyRuntime, f.m1Issuer])
      await assert.rejects(client.query(`SELECT public.story_m2_test_checkpoint_peek('forged',0)`), { code: "42501" });
    // Same group but no private login-to-scope registration: function EXECUTE
    // exists, scoped access still fails closed (constraint rather than ACL).
    await assert.rejects(f.checkpoint.query(`SELECT public.story_m2_test_checkpoint_peek('forged',0)`), { code: "23514" });
    const other = await f.fakeWorker();
    await denied(() => other.database.$queryRaw`SELECT public.story_m2_test_checkpoint_peek('forged',0)`);
    for (const table of ["StoryTask", "StoryPaidConfirmation", "StoryAdmission", "StorySpendingDecision", "StoryProviderSubmission", "StoryTaskResult", "StoryTaskEvent", "StorySourceVerification", "StoryTestCheckpointAccess", "StoryTestCheckpointFence", "StoryTestValidationKey"])
      await denied(() => a.database.$executeRawUnsafe(`INSERT INTO public."${table}" DEFAULT VALUES`));
    await denied(() => a.database.$queryRaw`SELECT public.story_m2_test_issue_decision(1000)`);
    await denied(() => a.database.$queryRaw`SELECT public.story_m1_verification_append('forged','forged','{}')`);
    await denied(() => a.database.$queryRaw`SELECT * FROM public.story_m2_test_worker_peek('forged',0)`);
    await denied(() => a.database.$executeRaw`CREATE TABLE public.fake_checkpoint_table(id integer)`);
    await rejected(() => a.service.checkpoint({ taskId: a.ref.taskId, generation: 0, stateRevision: 1 }));
    await assert.rejects(a.database.$queryRaw`SELECT public.story_m2_test_checkpoint_finish(${a.ref.taskId},0,1,'forged','CHECKPOINT',${"a".repeat(64)},'CURRENT','{}',${"f".repeat(64)})`);
    // Even knowing the disposable lease token cannot forge the transaction's
    // HMAC source-validation attestation. The genuine service never accepts it.
    const original = await f.row(a.ref);
    await assert.rejects(a.database.$transaction(async tx => {
      await tx.$queryRaw`SELECT public.story_m2_test_checkpoint_open(${a.ref.taskId},0,1,${original.leaseOwner},'CHECKPOINT',${"a".repeat(64)})`;
      await tx.$queryRaw`SELECT public.story_m2_test_checkpoint_finish(${a.ref.taskId},0,1,${original.leaseOwner},'CHECKPOINT',${"a".repeat(64)},'CURRENT','{}',${"f".repeat(64)})`;
    }), (e: unknown) => (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } }).meta?.driverAdapterError?.cause?.originalCode === "42501");
    assert.deepEqual(await f.row(a.ref), original);
    const config = { database: a.database, worker: a.worker, scope: { ...scope, studioId: f.saved.studioId },
      profile: f.currentProfile(), validationKey: new Uint8Array(32), inspectMedia: f.media.inspect };
    assert.throws(() => createStoryTaskFakeCheckpoint({ ...config, validationKey: new Uint8Array() }), StoryTaskContractError);
    assert.throws(() => createStoryTaskFakeCheckpoint({ ...config, profile: { ...config.profile, modelId: "real/model" } }), StoryTaskContractError);
    await rejected(() => createStoryTaskFakeCheckpoint({ ...config, database: f.admission }).recoverAfterCheckpoint(a.ref));
    await denied(() => a.database.$queryRaw`SELECT public.story_m2_test_checkpoint_lock(${a.ref.taskId},0,1)`);
    const catalog = (await f.admin.query(`SELECT bool_and(p.prosecdef AND p.proowner='storyline_migration_owner'::regrole
      AND 'search_path=pg_catalog, public, pg_temp'=ANY(p.proconfig)
      AND NOT EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) safe
      FROM pg_proc p WHERE p.proname LIKE 'story_m2_test_checkpoint_%'`)).rows[0];
    assert.equal(catalog.safe, true); assert.equal((await f.counts()).submissions, "0");
  }));
});

test("checkpoint/fake wire remain uninstalled and absent from production/bootstrap and contract barrel", async () => {
  async function inspect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) assert.doesNotMatch(await readFile(path, "utf8"), /createStoryTaskFakeCheckpoint|story_m2_test_checkpoint_|createStoryFakeWire/);
    }
  }
  await inspect("app"); await inspect("workers");
  assert.doesNotMatch(await readFile("lib/storyline/jobs/index.ts", "utf8"), /fake-checkpoint|fake-transport/);
  for (const file of ["fake-checkpoint.ts", "fake-transport.ts"])
    assert.doesNotMatch(await readFile(`lib/storyline/jobs/${file}`, "utf8"), /fetch\(|OpenRouter|process\.env|console\.|https?:\/\//);
});
