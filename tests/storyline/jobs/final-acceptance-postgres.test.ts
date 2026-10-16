// M2-07: exported services together, newly owned PostgreSQL and fake wire only.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { createScopedStoryTaskApi, type StoryTaskOperatorAuthority } from "../../../lib/storyline/jobs/api-boundary";
import { storyDeliveryId, type StoryTaskReference } from "../../../lib/storyline/jobs/dispatch";
import { createStoryFakeWire } from "../../../lib/storyline/jobs/fake-transport";
import { scope } from "../fixtures";
import { transactionalFixture } from "./transactional-gateway.fixture";

before(() => mock.method(globalThis, "fetch", () => assert.fail("M2 acceptance must not use network transport")));
after(() => mock.restoreAll());

for (const m1First of [true, false]) test(`M2-07 exported-service acceptance: M1 ${m1First ? "before" : "after"} M2`,
  { timeout: 120000 }, async () => {
    const fixture = await transactionalFixture(m1First, true, true, true);
    const studioId = fixture.saved.studioId;
    const taskScope = { ...scope, studioId };
    const published = new Map<string, StoryTaskReference>();
    const services = fixture.services({
      async publish(delivery) { published.set(delivery.id, delivery.payload); return delivery.id; },
      async has(deliveryId) { return published.has(deliveryId); },
    });
    const worker = await fixture.fakeWorker();
    const checkpoint = await fixture.checkpointServices(worker.worker);
    const counts = async () => (await fixture.admin.query(`SELECT
      (SELECT count(*) FROM public."StoryTask") tasks,
      (SELECT count(*) FROM public."StoryTaskDispatch") dispatches,
      (SELECT count(*) FROM public."StoryTaskEvent") events,
      (SELECT count(*) FROM public."StoryProviderSubmission") submissions,
      (SELECT count(*) FROM public."StoryTaskResult") results,
      (SELECT count(*) FROM public."StorySourceVerification") verifications`)).rows[0];
    try {
      assert.equal(fixture.saved.snapshotId, fixture.candidate.snapshot.payload.id);
      assert.equal(await fixture.runtime.storySourceSnapshot.count(), 1);
      assert.equal(await fixture.runtime.storyScriptVersion.count(), 1);
      const decisionId = await fixture.issue(); // Disposable synthetic issuer, never HTTP authority.
      const reference = await services.admission.admit({ decisionId, selection: fixture.sourceReference(), identity: fixture.currentRecipe() });
      const admitted = (await fixture.admin.query(`SELECT "projectId","movieId","studioId","sourceSnapshotId","canonicalRecipe","recipeHash",generation,state
        FROM public."StoryTask" WHERE id=$1`, [reference.taskId])).rows[0];
      assert.deepEqual([admitted.projectId, admitted.movieId, admitted.studioId, admitted.sourceSnapshotId],
        [scope.projectId, scope.movieId, studioId, fixture.saved.snapshotId]);
      assert.equal(admitted.canonicalRecipe, fixture.currentRecipe().canonicalRecipe);
      assert.equal(admitted.recipeHash, fixture.currentRecipe().recipeHash);
      assert.equal(admitted.generation, 0); assert.equal(admitted.state, "QUEUED");
      assert.equal(published.size, 0); // Admission commits outbox; publication is separate.
      assert.equal((await services.read.get({ scope: taskScope, taskId: reference.taskId }))?.state, "QUEUED");
      const dispatched = await services.reconcile.reconcileOnce({ scope: taskScope, batchSize: 10, missingReceipts: [] });
      assert.equal(dispatched.deliveries.length, 1);
      assert.equal(dispatched.deliveries[0].outcome, "ACKNOWLEDGED");
      assert.deepEqual(published.get(storyDeliveryId(reference)), reference);

      const claimed = await worker.worker.claim(reference);
      assert.equal(claimed.outcome, "CLAIMED");
      if (claimed.outcome !== "CLAIMED") assert.fail("Expected restricted lease");
      assert.equal((await services.read.get({ scope: taskScope, taskId: reference.taskId }))?.state, "LEASED");
      const permit = await checkpoint.service.checkpoint(claimed.lease);
      assert.equal((await services.read.get({ scope: taskScope, taskId: reference.taskId }))?.state, "SUBMITTED");
      const successWire = createStoryFakeWire("SUCCESS");
      const sent = await checkpoint.service.send(permit, successWire.wire);
      assert.equal(sent.outcome, "DEFINITIVE");
      if (sent.outcome !== "DEFINITIVE") assert.fail("Expected definitive fake response");
      assert.equal((await checkpoint.service.recordResult(sent.receipt)).state, "COMPLETED");
      assert.equal(successWire.calls(), 1);
      const completed = await services.read.get({ scope: taskScope, taskId: reference.taskId });
      assert.equal(completed?.state, "COMPLETED");
      assert.equal(completed?.usage.classification, "UNKNOWN"); // Synthetic result has no paid cost.
      const states = (await fixture.admin.query(`SELECT state FROM public."StoryTaskEvent" WHERE "taskId"=$1 ORDER BY sequence`,
        [reference.taskId])).rows.map(row => row.state);
      assert.deepEqual(states, ["QUEUED", "LEASED", "SUBMITTED", "COMPLETED"]);
      assert.equal((await counts()).verifications, "0");

      // A second exact recipe demonstrates that ambiguity remains durable and
      // cannot be turned into a fresh send by duplicate delivery or recovery.
      await fixture.configure("m207-ambiguous", "ANALYZE_EVIDENCE", 10);
      const ambiguous = await services.admission.admit({ decisionId: await fixture.issue(),
        selection: fixture.sourceReference(), identity: fixture.currentRecipe() });
      await services.reconcile.reconcileOnce({ scope: taskScope, batchSize: 10, missingReceipts: [] });
      const secondClaim = await worker.worker.claim(ambiguous);
      assert.equal(secondClaim.outcome, "CLAIMED");
      if (secondClaim.outcome !== "CLAIMED") assert.fail("Expected second restricted lease");
      const uncertainWire = createStoryFakeWire("LOST_RESPONSE");
      const uncertain = await checkpoint.service.runOnce(secondClaim.lease, uncertainWire.wire);
      assert.equal(uncertain.state, "UNKNOWN"); assert.equal(uncertainWire.calls(), 1);
      assert.equal((await services.read.get({ scope: taskScope, taskId: ambiguous.taskId }))?.state, "UNKNOWN");
      assert.equal((await worker.worker.claim(ambiguous)).outcome, "NOT_ELIGIBLE");
      assert.equal((await checkpoint.service.recoverAfterCheckpoint(ambiguous) as { outcome: string }).outcome, "NOT_ELIGIBLE");
      assert.equal((await services.reconcile.reconcileOnce({ scope: taskScope, batchSize: 10, missingReceipts: [] })).deliveries.length, 0);
      assert.equal(uncertainWire.calls(), 1);

      // Test-only session identity lives in this file. Production handlers
      // construct the API with no adapter and always return unavailable.
      const principal = Object.freeze({ subject: "synthetic-reviewer" });
      const sessions = new WeakMap<Request, typeof principal>();
      const authority: StoryTaskOperatorAuthority<typeof principal> = {
        async authenticate(request) { return sessions.get(request) ?? null; },
        async canRead(who, selection) {
          return who === principal && selection.projectId === scope.projectId &&
            selection.movieId === scope.movieId && selection.studioId === studioId;
        },
        async canCreate() { return false; }, async canSpend() { return false; }, async canCancel() { return false; },
      };
      const api = createScopedStoryTaskApi({ authority, reader: services.read });
      const request = new Request(`http://localhost/api/projects/${scope.projectId}/movies/${scope.movieId}/storyline/studios/${studioId}/tasks?limit=10`);
      sessions.set(request, principal);
      const beforeRead = await counts();
      const response = await api.list(request, { params: Promise.resolve({ id: scope.projectId, movieId: scope.movieId, studioId }) });
      assert.equal(response.status, 200);
      const payload = await response.json() as { data: { items: Array<{ taskId: string; state: string }> } };
      assert.deepEqual(payload.data.items.map(item => [item.taskId, item.state]),
        [[ambiguous.taskId, "UNKNOWN"], [reference.taskId, "COMPLETED"]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      assert.doesNotMatch(JSON.stringify(payload), /canonicalRecipe|sourceSnapshotId|normalizedPayload|candidateAvailable|leaseOwner/);
      assert.deepEqual(await counts(), beforeRead);
      assert.equal((await counts()).submissions, "2"); assert.equal((await counts()).results, "1");
    } finally { await fixture.close(); }
  });
