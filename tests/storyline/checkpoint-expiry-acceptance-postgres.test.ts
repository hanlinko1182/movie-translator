import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { createStoryFakeWire } from "../../lib/storyline/jobs/fake-transport";
import { scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("Expiry proof cannot call a provider")); });
after(() => mock.restoreAll());
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function fixture(first: boolean, ttl: number) {
  const f = await transactionalFixture(first, true, true), entered = gate(), release = gate();
  let paused = false;
  try {
    await f.configure("m405-expiry", "ANALYZE_EVIDENCE", 11);
    const services = f.services({ publish: async row => row.id, has: async () => true }), worker = await f.fakeWorker();
    const checkpoint = await f.checkpointServices(worker.worker, { inspectMedia: async key => {
      if (paused) { entered.release(); await release.promise; }
      return f.media.inspect(key);
    } });
    const ref = await services.admission.admit({ decisionId: await f.issue(ttl), selection: f.sourceReference(), identity: f.currentRecipe() });
    await services.reconcile.reconcileOnce({ scope: { ...scope, studioId: f.saved.studioId }, batchSize: 1, missingReceipts: [] });
    const claim = await worker.worker.claim(ref);
    if (claim.outcome !== "CLAIMED") assert.fail("Expiry fixture did not claim before grant expiry");
    const clock = async () => (await f.admin.query(`SELECT c."expiresAt"<=clock_timestamp() expired,t."leaseUntil">clock_timestamp() "leaseValid",
      t.state FROM public."StoryTask" t JOIN public."StoryPaidConfirmation" c ON c."taskId"=t.id AND c.generation=t.generation WHERE t.id=$1`, [ref.taskId])).rows[0];
    const expired = async () => {
      const bound = performance.now() + 1500;
      while (performance.now() < bound) { const row = await clock(); if (row.expired) return row; await wait(10); }
      assert.fail("Bounded database expiry observation did not reach deadline");
    };
    const counts = async () => (await f.admin.query(`SELECT (SELECT count(*) FROM public."StoryProviderSubmission") submissions,
      (SELECT count(*) FROM public."StoryTaskResult") results,(SELECT count(*) FROM public."StorySourceVerification") verification`)).rows[0];
    return { ...f, ref, claim, service: checkpoint.service, clock, expired, counts, entered, release,
      pause: () => { paused = true; }, close: async () => { release.release(); await f.close(); } };
  } catch (error) { release.release(); await f.close(); throw error; }
}

for (const first of [true, false]) {
  const roleOrder = first ? "M1 first" : "M1 last";
  test(`M4 expiry ${roleOrder}: expired confirmation and grant-capped worker lease deny checkpoint`, async () => {
    const f = await fixture(first, 700);
    try {
      const at = await f.expired(); assert.equal(at.leaseValid, false);
      await assert.rejects(() => f.service.checkpoint(f.claim.lease), StoryTaskContractError);
      assert.deepEqual(await f.counts(), { submissions: "0", results: "0", verification: "0" });
    } finally { await f.close(); }
  });
  test(`M4 expiry ${roleOrder}: one-use permit deadline denies send while confirmation remains valid`, async () => {
    const f = await fixture(first, 120000), wire = createStoryFakeWire("SUCCESS");
    try {
      const permit = await f.service.checkpoint(f.claim.lease);
      await wait(1050); assert.equal((await f.clock()).expired, false);
      assert.equal((await f.service.send(permit, wire.wire)).outcome, "UNKNOWN"); assert.equal(wire.calls(), 0);
      await assert.rejects(() => f.service.send(permit, wire.wire), StoryTaskContractError);
      assert.equal((await f.service.recoverAfterCheckpoint(f.ref)).state, "UNKNOWN");
      assert.deepEqual(await f.counts(), { submissions: "1", results: "0", verification: "0" });
    } finally { await f.close(); }
  });
  for (let repeat = 1; repeat <= 3; repeat++) {
    test(`M4 expiry ${roleOrder}: forced pre-send confirmation expiry ${repeat} produces zero sends and sticky UNKNOWN`, async () => {
      const f = await fixture(first, 700), wire = createStoryFakeWire("SUCCESS"); let sending: Promise<unknown> | undefined;
      try {
        const started = performance.now(), permit = await f.service.checkpoint(f.claim.lease);
        f.pause(); const run = f.service.send(permit, wire.wire); sending = run;
        await Promise.race([f.entered.promise, run.then(() => assert.fail("Pre-send source inspection was not reached"))]);
        const at = await f.expired(); assert.equal(at.leaseValid, true);
        assert(performance.now() - started < 1000, "Control must isolate confirmation expiry from permit expiry");
        f.release.release(); assert.equal((await run).outcome, "UNKNOWN"); assert.equal(wire.calls(), 0);
        assert.equal((await f.clock()).state, "UNKNOWN");
        await assert.rejects(() => f.service.send(permit, wire.wire), StoryTaskContractError);
        assert.equal((await f.service.recoverAfterCheckpoint(f.ref)).state, "UNKNOWN");
        assert.deepEqual(await f.counts(), { submissions: "1", results: "0", verification: "0" });
      } finally { f.release.release(); await Promise.allSettled([sending]); await f.close(); }
    });
    test(`M4 expiry ${roleOrder}: actual wire before expiry ${repeat} retains original definitive result after expiry`, async () => {
      const f = await fixture(first, 700), wire = createStoryFakeWire("HELD_SUCCESS"); let sending: Promise<unknown> | undefined;
      try {
        const permit = await f.service.checkpoint(f.claim.lease); let settled = false;
        const run = f.service.send(permit, wire.wire); sending = run; void run.then(() => { settled = true; }, () => { settled = true; });
        const bound = performance.now() + 1000;
        while (!wire.calls() && !settled && performance.now() < bound) await wait(5);
        assert.equal(wire.calls(), 1, "Positive control must actually enter wire before grant expiry");
        const at = await f.expired(); assert.equal(at.leaseValid, true); wire.release();
        const sent = await run; if (sent.outcome !== "DEFINITIVE") assert.fail("Original observed result lost");
        assert.equal((await f.service.recordResult(sent.receipt)).state, "COMPLETED");
        assert.equal((await f.service.recordResult(sent.receipt)).state, "COMPLETED");
        await assert.rejects(() => f.service.send(permit, wire.wire), StoryTaskContractError); assert.equal(wire.calls(), 1);
        assert.deepEqual(await f.counts(), { submissions: "1", results: "1", verification: "0" });
      } finally { wire.release(); await Promise.allSettled([sending]); await f.close(); }
    });
  }
}
