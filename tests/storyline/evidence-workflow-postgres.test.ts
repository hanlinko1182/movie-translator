import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { createPersistedEvidenceCandidateValidator } from "../../lib/storyline/evidence-analysis/persisted-candidate";
import { createSyntheticEvidenceAnalysisWorkflow } from "../../lib/storyline/evidence-analysis/synthetic-workflow";
import { EVIDENCE_ANALYSIS, type EvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis/contracts";
import { createStoryFakeWire, type FakeWireScenario } from "../../lib/storyline/jobs/fake-transport";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => { assert.fail("M3-04 must not use a provider or network fetch"); }); });
after(() => mock.restoreAll());

type Fixture = Awaited<ReturnType<typeof transactionalFixture>>;
async function setup(f: Fixture, scenario: FakeWireScenario = "SUCCESS", afterResultForTest?: () => Promise<void>) {
  await f.configure(`m304-${scenario}`, "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
  const deliveries = new Map<string, { taskId: string; generation: number }>();
  const services = f.services({ publish: async delivery => { deliveries.set(delivery.id, delivery.payload); return delivery.id; },
    has: async id => deliveries.has(id) });
  const worker = await f.fakeWorker();
  const checkpoint = await f.checkpointServices(worker.worker);
  const persistence = await f.candidateService(services.resultDatabase);
  const validator = createPersistedEvidenceCandidateValidator({ sourceDatabase: f.runtime,
    resultDatabase: services.resultDatabase, inspectMedia: f.media.inspect, profile: f.currentProfile() });
  const wire = createStoryFakeWire(scenario);
  const dependencies = { sourceDatabase: f.admission, inspectMedia: f.media.inspect, profile: f.currentProfile(),
    admission: services.admission, reconcile: services.reconcile, reader: services.read,
    worker: worker.worker, checkpoint: checkpoint.service, validator, persistence, wire: wire.wire };
  const workflow = createSyntheticEvidenceAnalysisWorkflow({ ...dependencies, afterResultForTest });
  const selection = f.sourceReference(), identity = f.currentRecipe(), taskScope = { ...scope, studioId: f.saved.studioId };
  return { workflow, dependencies, selection, identity, taskScope, wire, persistence, services, deliveries };
}
async function rejected(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, error => error instanceof StoryTaskContractError && error.code === code);
}

for (const m1First of [true, false]) test(`M3-04 complete synthetic workflow: M1 ${m1First ? "before" : "after"} M2`, async () => {
  const f = await transactionalFixture(m1First, true, true, true, true, true);
  try {
    const x = await setup(f), decisionId = await f.issue();
    const input = { decisionId, selection: x.selection, identity: x.identity };
    const result = await x.workflow.run(input);
    assert.equal(result.outcome, "CANDIDATE_READY");
    if (result.outcome !== "CANDIDATE_READY") assert.fail("Candidate was not persisted");
    assert.equal(result.candidate.status, "VALIDATED_CURRENT");
    assert.equal(result.candidate.humanApproval, "NONE");
    assert.equal(result.candidate.trust, "PROVISIONAL_CANDIDATE");
    const candidate = result.candidate.candidate as EvidenceAnalysisCandidate;
    assert(candidate && typeof candidate === "object");
    assert.equal(candidate.origin, "SYNTHETIC_TEST");
    assert.equal(candidate.findings[0].statement, f.source.payload.transcript.segments[0].text);
    assert.equal(candidate.findings[0].classification, "OBSERVED");
    assert.equal(candidate.findings[1].classification, "INFERRED");
    assert.equal(candidate.findings[1].uncertainty, "POSSIBLE");
    assert.equal(x.wire.calls(), 1);
    assert.equal(x.deliveries.size, 1);
    assert.equal((await x.services.read.get({ scope: x.taskScope, taskId: result.reference.taskId }))?.state, "COMPLETED");
    const rows = (await f.admin.query(`SELECT
      (SELECT count(*) FROM public."StoryTask") tasks,
      (SELECT count(*) FROM public."StoryProviderSubmission") submissions,
      (SELECT count(*) FROM public."StoryTaskResult") results,
      (SELECT count(*) FROM public."StoryEvidenceCandidate") candidates,
      (SELECT count(*) FROM public."StorySourceVerification") verifications,
      (SELECT count(*) FROM public."StoryScriptVersion") scripts`)).rows[0];
    assert.deepEqual(rows, { tasks: "1", submissions: "1", results: "1", candidates: "1", verifications: "0", scripts: "1" });
    const marker = (await f.admin.query(`SELECT "normalizedPayload" FROM public."StoryTaskResult"`)).rows[0].normalizedPayload;
    assert.equal(JSON.parse(marker).schemaVersion, "story-fake-result-v1");
    assert(!marker.includes("findings"));
    const repeated = await x.workflow.run(input);
    assert.equal(repeated.outcome, "CANDIDATE_READY");
    if (repeated.outcome !== "CANDIDATE_READY") assert.fail("Duplicate did not resolve");
    assert.equal(repeated.candidate.id, result.candidate.id);
    const resumed = await x.workflow.resumeCompleted({ selection: x.selection, identity: x.identity, reference: result.reference });
    assert.equal(resumed.outcome, "CANDIDATE_READY");
    assert.equal(x.wire.calls(), 1);
    assert.equal(x.deliveries.size, 1);
    const altered = structuredClone(candidate); altered.openQuestions.push({ id: "different-question",
      reason: "INSUFFICIENT_EVIDENCE", question: "Unknown detail", anchor: null });
    await rejected(() => x.persistence.persist({ scope: x.taskScope, ...result.reference, candidate: altered }), "STORY_TASK_INVALID");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "1");
    await rejected(() => x.workflow.resumeCompleted({ selection: { ...x.selection, movieId: "other-movie" },
      identity: x.identity, reference: result.reference }), "STORY_TASK_INVALID");
    await rejected(() => x.workflow.resumeCompleted({ selection: x.selection,
      identity: { ...x.identity, recipeHash: "0".repeat(64) }, reference: result.reference }), "STORY_TASK_SOURCE_STALE");
    await assert.rejects(() => f.runtime.$queryRaw`SELECT public.story_m3_test_candidate_open(${scope.projectId},${scope.movieId},${f.saved.studioId},${result.reference.taskId},0)`);
  } finally { await f.close(); }
});

test("M3-04 source drift after definitive result blocks candidate but never resends", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true);
  try {
    const x = await setup(f, "SUCCESS", async () => {
      await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed QC after result" } }));
    });
    const decisionId = await f.issue();
    await rejected(() => x.workflow.run({ decisionId, selection: x.selection, identity: x.identity }),
      "STORY_TASK_SOURCE_STALE");
    assert.equal(x.wire.calls(), 1);
    assert.equal((await f.admin.query(`SELECT state FROM public."StoryTask"`)).rows[0].state, "COMPLETED");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "0");
    const taskId = (await f.admin.query(`SELECT id FROM public."StoryTask"`)).rows[0].id;
    await rejected(() => x.workflow.resumeCompleted({ selection: x.selection, identity: x.identity,
      reference: { taskId, generation: 0 } }), "STORY_TASK_SOURCE_STALE");
    assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

test("M3-04 post-result interruption resumes candidate persistence without a second send", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true);
  try {
    const x = await setup(f, "SUCCESS", async () => { throw new Error("synthetic crash after definitive result"); });
    const decisionId = await f.issue();
    await rejected(() => x.workflow.run({ decisionId, selection: x.selection, identity: x.identity }), "STORY_TASK_INVALID");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "0");
    const taskId = (await f.admin.query(`SELECT id FROM public."StoryTask"`)).rows[0].id;
    const recovery = createSyntheticEvidenceAnalysisWorkflow(x.dependencies);
    const [first, second] = await Promise.all([0, 1].map(() => recovery.resumeCompleted({
      selection: x.selection, identity: x.identity, reference: { taskId, generation: 0 },
    })));
    assert.equal(first.outcome, "CANDIDATE_READY");
    assert.equal(second.outcome, "CANDIDATE_READY");
    if (first.outcome !== "CANDIDATE_READY" || second.outcome !== "CANDIDATE_READY") assert.fail("Resume did not persist");
    assert.equal(first.candidate.id, second.candidate.id);
    assert.equal(x.wire.calls(), 1);
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "1");
  } finally { await f.close(); }
});

test("M3-04 UNKNOWN remains unresolved and expired authority never admits", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true);
  try {
    const x = await setup(f, "LOST_RESPONSE");
    const decisionId = await f.issue();
    const result = await x.workflow.run({ decisionId, selection: x.selection, identity: x.identity });
    assert.equal(result.outcome, "UNKNOWN");
    assert.equal(x.wire.calls(), 1);
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "0");
    const repeated = await x.workflow.resumeCompleted({ selection: x.selection, identity: x.identity, reference: result.reference });
    assert.equal(repeated.outcome, "UNKNOWN"); assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }

  const expired = await transactionalFixture(true, true, true, true, true, true);
  try {
    const x = await setup(expired), decisionId = await expired.issue(50);
    await new Promise(resolve => setTimeout(resolve, 100));
    await rejected(() => x.workflow.run({ decisionId, selection: x.selection, identity: x.identity }), "STORY_TASK_INVALID");
    assert.equal((await expired.admin.query(`SELECT count(*) FROM public."StoryTask"`)).rows[0].count, "0");
    assert.equal(x.wire.calls(), 0);
  } finally { await expired.close(); }
});
