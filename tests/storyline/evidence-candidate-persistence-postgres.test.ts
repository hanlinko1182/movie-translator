import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { EVIDENCE_ANALYSIS, type EvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis/contracts";
import { createStoryFakeWire } from "../../lib/storyline/jobs/fake-transport";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { date, scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => { assert.fail("M3-03 cannot contact a provider"); }); });
after(() => mock.restoreAll());

type Fixture = Awaited<ReturnType<typeof transactionalFixture>>;
function candidate(f: Fixture, taskId: string): EvidenceAnalysisCandidate {
  const source = f.source, character = source.payload.characters[0];
  assert(character?.evidence.length);
  const anchor = character.evidence[0].anchor;
  const segment = source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)!;
  const scene = source.payload.scenes.find(row => row.sequence === anchor.sceneSequence)!;
  const admission = source.admissions.find(row => row.sequence === segment.sequence);
  const refs = admission?.status === "ADMITTED" ?
    [{ translationSegmentId: admission.row.id, rowContextHash: admission.rowContextHash }] : [];
  return { schemaVersion: EVIDENCE_ANALYSIS.version, origin: "SYNTHETIC_TEST",
    task: { taskId, generation: 0, recipeHash: f.currentRecipe().recipeHash },
    source: { projectId: scope.projectId, movieId: scope.movieId, studioId: f.saved.studioId,
      snapshotId: source.payload.id, contentHash: source.sourceContentHash, contextHash: source.sourceContextHash,
      dependencyHash: source.payload.preparation!.dependencyHash, bindingHash: source.payload.preparation!.sourceBindingHash },
    model: { providerId: "synthetic", modelId: "synthetic/model", profileId: f.currentProfile().id,
      profileVersion: f.currentProfile().version, responseSchemaVersion: EVIDENCE_ANALYSIS.version },
    findings: [{ id: "observed-chinese", classification: "OBSERVED", category: "DIALOGUE",
      subject: { characterIds: [character.id], relationshipId: null }, statement: segment.text,
      confidence: "LOW", uncertainty: "NONE", evidence: [{ kind: "CHINESE_QUOTE", anchor,
        segmentId: segment.id, sceneId: scene.id, quote: segment.text }], translationContextRefs: refs,
      observedBasisIds: [], qualification: null }], contradictions: [], openQuestions: [] };
}
async function rejected(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, error => error instanceof StoryTaskContractError && error.code === code);
}
async function complete(f: Fixture, outcome: "SUCCESS" | "LOST_RESPONSE" = "SUCCESS") {
  await f.configure(`m3-persist-${outcome}`, "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
  const published = new Map<string, { taskId: string; generation: number }>();
  const services = f.services({ publish: async delivery => { published.set(delivery.id, delivery.payload); return delivery.id; },
    has: async id => published.has(id) });
  const scoped = { ...scope, studioId: f.saved.studioId };
  const ref = await services.admission.admit({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
  await services.reconcile.reconcileOnce({ scope: scoped, batchSize: 10, missingReceipts: [] });
  const worker = await f.fakeWorker(); const claim = await worker.worker.claim(ref);
  assert.equal(claim.outcome, "CLAIMED"); if (claim.outcome !== "CLAIMED") assert.fail("No fake lease");
  const checkpoint = await f.checkpointServices(worker.worker);
  const wire = createStoryFakeWire(outcome);
  assert.equal((await checkpoint.service.runOnce(claim.lease, wire.wire)).state,
    outcome === "SUCCESS" ? "COMPLETED" : "UNKNOWN");
  assert.equal(wire.calls(), 1);
  const service = await f.candidateService(services.resultDatabase);
  return { service, ref, scoped, resultDatabase: services.resultDatabase };
}

for (const m1First of [true, false]) test(`M3-03 immutable scoped candidate: ${m1First ? "M1 first" : "M2 first"}`, async () => {
  const f = await transactionalFixture(m1First, true, true, true, true, true);
  try {
    const { service, ref, scoped, resultDatabase } = await complete(f);
    const input = { scope: scoped, taskId: ref.taskId, generation: ref.generation, candidate: candidate(f, ref.taskId) };
    assert.deepEqual(await service.read({ scope: scoped, taskId: ref.taskId, generation: 0 }),
      { status: "MISSING", humanApproval: "NONE" });
    const rival = await f.candidateService(resultDatabase, { separateConnection: true });
    const [first, competing] = await Promise.all([service.persist(input), rival.persist(input)]);
    assert.equal(competing.id, first.id);
    assert.equal(first.trust, "PROVISIONAL_CANDIDATE");
    assert.equal(first.humanApproval, "NONE");
    const second = await service.persist(input);
    assert.equal(second.id, first.id);
    assert.equal(second.candidateHash, first.candidateHash);
    const reading = await service.read({ scope: scoped, taskId: ref.taskId, generation: 0 });
    assert.equal(reading.status, "VALIDATED_CURRENT");
    if (reading.status !== "VALIDATED_CURRENT") assert.fail("Expected candidate");
    assert.equal(reading.candidateHash, first.candidateHash);
    assert.equal(reading.humanApproval, "NONE");
    const concurrent = await Promise.all([service.persist(input), rival.persist(input)]);
    assert.equal(concurrent[0].id, first.id); assert.equal(concurrent[1].id, first.id);
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "1");
    await assert.rejects(() => f.admin.query(`UPDATE public."StoryEvidenceCandidate" SET "candidateHash"=$1 WHERE id=$2`,
      ["0".repeat(64), first.id]));
    await assert.rejects(() => f.admin.query(`DELETE FROM public."StoryEvidenceCandidate" WHERE id=$1`, [first.id]));
    const changed = structuredClone(input); changed.candidate.openQuestions.push({ id: "question-one",
      reason: "INSUFFICIENT_EVIDENCE", question: "Unknown detail", anchor: null });
    await rejected(() => service.persist(changed), "STORY_TASK_INVALID");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "1");
    await rejected(() => service.persist({ ...input, scope: { ...scoped, movieId: "other-movie" } }), "STORY_TASK_SCOPE_MISMATCH");
    await rejected(() => service.read({ scope: { ...scoped, movieId: "other-movie" }, taskId: ref.taskId, generation: 0 }), "STORY_TASK_INVALID");
    const writer = await f.candidateWriter();
    const [privilege] = await writer.$queryRaw<Array<{ paid: boolean; candidate: boolean; checkpoint: boolean; receipt: boolean }>>`
      SELECT has_table_privilege(current_user,'public."StoryTask"','INSERT,UPDATE,DELETE') paid,
        has_table_privilege(current_user,'public."StoryEvidenceCandidate"','INSERT,UPDATE,DELETE') candidate,
        has_function_privilege(current_user,'public.story_m2_test_checkpoint_open(text,integer,integer,text,text,text)','EXECUTE') checkpoint,
        EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='story_m1_verification_append'
            AND has_function_privilege(current_user,p.oid,'EXECUTE')) receipt`;
    assert.equal(privilege.paid, false); assert.equal(privilege.candidate, false);
    assert.equal(privilege.checkpoint, false); assert.equal(privilege.receipt, false);
    await assert.rejects(() => writer.$executeRaw`DELETE FROM public."StoryEvidenceCandidate"`);
    await assert.rejects(() => writer.$queryRaw`SELECT public.story_m3_test_candidate_finish(${ref.taskId},0,'{}','0','0')`);
    await assert.rejects(() => f.reader.query(`SELECT public.story_m3_test_candidate_open($1,$2,$3,$4,0)`,
      [scope.projectId, scope.movieId, f.saved.studioId, ref.taskId]));
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StorySourceVerification"`)).rows[0].count, "0");
    // Live source changes cannot overwrite the historical immutable candidate.
    await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed QC" } }));
    await rejected(() => service.persist(input), "STORY_TASK_SOURCE_STALE");
    assert.equal((await service.read({ scope: scoped, taskId: ref.taskId, generation: 0 })).status, "STALE_DEPENDENCIES");
    await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" },
      data: { message: "Synthetic finding", updatedAt: new Date(date) } }));
    await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: "Changed Chinese" } }));
    await rejected(() => service.persist(input), "STORY_TASK_SOURCE_STALE");
    await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" },
      data: { text: f.source.payload.transcript.segments[0].text } }));
    f.media.setChanged(true);
    await rejected(() => service.persist(input), "STORY_TASK_SOURCE_STALE");
    f.media.setChanged(false);
    await f.runtime.storylineStudio.update({ where: { id: f.saved.studioId }, data: { revision: { increment: 1 } } });
    await rejected(() => service.persist(input), "STORY_TASK_INVALID");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "1");
  } finally { await f.close(); }
});

test("M3-03 failed transaction cannot leave a candidate or a consumed fence", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true);
  try {
    const { ref, scoped, resultDatabase } = await complete(f);
    const failing = await f.candidateService(resultDatabase,
      { afterInsertForTest: async () => { throw new Error("synthetic post-insert fault"); } });
    const input = { scope: scoped, taskId: ref.taskId, generation: 0, candidate: candidate(f, ref.taskId) };
    await rejected(() => failing.persist(input), "STORY_TASK_INVALID");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "0");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryTestCandidateFence"`)).rows[0].count, "0");
    const normal = await f.candidateService(resultDatabase);
    assert.equal((await normal.persist(input)).trust, "PROVISIONAL_CANDIDATE");
  } finally { await f.close(); }
});

test("M3-03 UNKNOWN cannot persist; failed persistence rolls back", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true);
  try {
    const { service, ref, scoped } = await complete(f, "LOST_RESPONSE");
    await rejected(() => service.persist({ scope: scoped, ...ref, candidate: candidate(f, ref.taskId) }), "STORY_TASK_INVALID");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "0");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryTaskResult"`)).rows[0].count, "0");
  } finally { await f.close(); }
});
