import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { createPersistedEvidenceCandidateValidator } from "../../lib/storyline/evidence-analysis/persisted-candidate";
import type { EvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis/contracts";
import { EVIDENCE_ANALYSIS } from "../../lib/storyline/evidence-analysis/contracts";
import { createStoryFakeWire } from "../../lib/storyline/jobs/fake-transport";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { date, scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => { assert.fail("M3-02 must not contact a provider"); }); });
after(() => mock.restoreAll());

type Fixture = Awaited<ReturnType<typeof transactionalFixture>>;
function syntheticCandidate(fixture: Fixture, taskId: string): EvidenceAnalysisCandidate {
  const source = fixture.source, recipe = fixture.currentRecipe(), profile = fixture.currentProfile();
  const character = source.payload.characters[0];
  assert(character?.evidence.length);
  const evidenceAnchor = character.evidence[0].anchor;
  const segment = source.payload.transcript.segments.find(row => row.sequence === evidenceAnchor.segmentSequence)!;
  const scene = source.payload.scenes.find(row => row.sequence === evidenceAnchor.sceneSequence)!;
  const admission = source.admissions.find(row => row.sequence === segment.sequence);
  const refs = admission?.status === "ADMITTED" ? [{ translationSegmentId: admission.row.id, rowContextHash: admission.rowContextHash }] : [];
  return {
    schemaVersion: EVIDENCE_ANALYSIS.version, origin: "SYNTHETIC_TEST",
    task: { taskId, generation: 0, recipeHash: recipe.recipeHash },
    source: { projectId: scope.projectId, movieId: scope.movieId, studioId: fixture.saved.studioId,
      snapshotId: source.payload.id, contentHash: source.sourceContentHash, contextHash: source.sourceContextHash,
      dependencyHash: source.payload.preparation!.dependencyHash, bindingHash: source.payload.preparation!.sourceBindingHash },
    model: { providerId: profile.providerId!, modelId: profile.modelId!, profileId: profile.id,
      profileVersion: profile.version, responseSchemaVersion: profile.responseSchemaVersion },
    findings: [{ id: "observed-chinese", classification: "OBSERVED", category: "DIALOGUE",
      subject: { characterIds: [character.id], relationshipId: null }, statement: segment.text,
      confidence: "LOW", uncertainty: "NONE", evidence: [{ kind: "CHINESE_QUOTE", anchor: evidenceAnchor,
        segmentId: segment.id, sceneId: scene.id, quote: segment.text }], translationContextRefs: refs,
      observedBasisIds: [], qualification: null },
      { id: "possible-motive", classification: "INFERRED", category: "MOTIVATION",
        subject: { characterIds: [character.id], relationshipId: null }, statement: "Possible concern",
        confidence: "LOW", uncertainty: "POSSIBLE", evidence: [{ kind: "CHINESE_QUOTE", anchor: evidenceAnchor,
          segmentId: segment.id, sceneId: scene.id, quote: segment.text }], translationContextRefs: refs,
        observedBasisIds: ["observed-chinese"], qualification: "ဖြစ်နိုင်" }],
    contradictions: [], openQuestions: [],
  };
}

async function rejected(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, error => error instanceof StoryTaskContractError && error.code === code);
}

for (const m1First of [true, false]) test(`M3-02 persisted source and completed M2 result: ${m1First ? "M1 first" : "M2 first"}`, async () => {
  const fixture = await transactionalFixture(m1First, true, true, true, true);
  try {
    await fixture.configure("m3-candidate", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const published = new Map<string, { taskId: string; generation: number }>();
    const services = fixture.services({ publish: async delivery => { published.set(delivery.id, delivery.payload); return delivery.id; },
      has: async id => published.has(id) });
    const taskScope = { ...scope, studioId: fixture.saved.studioId };
    const reference = await services.admission.admit({ decisionId: await fixture.issue(),
      selection: fixture.sourceReference(), identity: fixture.currentRecipe() });
    const candidate = syntheticCandidate(fixture, reference.taskId);
    const validator = createPersistedEvidenceCandidateValidator({ sourceDatabase: fixture.runtime,
      resultDatabase: services.resultDatabase, inspectMedia: fixture.media.inspect, profile: fixture.currentProfile() });
    const request = () => ({ scope: taskScope, taskId: reference.taskId, generation: reference.generation, candidate });
    await rejected(() => validator.validate(request()), "STORY_TASK_RESULT_STALE");
    assert.equal((await services.reconcile.reconcileOnce({ scope: taskScope, batchSize: 10, missingReceipts: [] })).deliveries.length, 1);
    const worker = await fixture.fakeWorker();
    const claim = await worker.worker.claim(reference);
    assert.equal(claim.outcome, "CLAIMED");
    if (claim.outcome !== "CLAIMED") assert.fail("No restricted worker lease");
    const checkpoint = await fixture.checkpointServices(worker.worker);
    const wire = createStoryFakeWire("SUCCESS");
    const complete = await checkpoint.service.runOnce(claim.lease, wire.wire);
    assert.equal(complete.state, "COMPLETED"); assert.equal(wire.calls(), 1);
    const counts = async () => (await fixture.admin.query(`SELECT
      (SELECT count(*) FROM public."StoryTaskResult") results,
      (SELECT count(*) FROM public."StorySourceVerification") verifications,
      (SELECT count(*) FROM public."StoryTaskEvent") events`)).rows[0];
    const before = await counts();
    const validated = await validator.validate(request());
    assert.equal(validated.trust, "PROVISIONAL_CANDIDATE");
    assert.equal(validated.currentness, "CURRENT_AT_VALIDATION");
    assert.equal(validated.durableResult.taskId, reference.taskId);
    assert.equal(validated.candidate.payload.findings.length, 2);
    assert.equal(validated.candidate.payload.findings[0].translationContextRefs.length, 1);
    assert.deepEqual(await counts(), before);
    assert.equal(before.verifications, "0");

    // Only the exact durable task and scoped synthetic payload may validate.
    await rejected(() => validator.validate({ ...request(), taskId: "missing-task" }), "STORY_TASK_SCOPE_MISMATCH");
    await rejected(() => validator.validate({ ...request(), scope: { ...taskScope, movieId: "movie-other" } }), "STORY_TASK_INVALID");
    await rejected(() => validator.validate({ ...request(), scope: { ...taskScope, studioId: "other-studio" } }), "STORY_TASK_INVALID");
    await rejected(() => validator.validate({ ...request(), generation: 1 }), "STORY_TASK_SCOPE_MISMATCH");
    const forged = structuredClone(candidate); forged.task.taskId = "other-task";
    await rejected(() => validator.validate({ ...request(), candidate: forged }), "STORY_TASK_INVALID");
    const wrongQuote = structuredClone(candidate);
    (wrongQuote.findings[0].evidence[0] as { quote: string }).quote = "fabricated quotation";
    await rejected(() => validator.validate({ ...request(), candidate: wrongQuote }), "STORY_TASK_INVALID");
    const wrongOwner = structuredClone(candidate); wrongOwner.findings[0].subject.characterIds = ["other-character"];
    await rejected(() => validator.validate({ ...request(), candidate: wrongOwner }), "STORY_TASK_INVALID");
    const wrongRelationship = structuredClone(candidate); wrongRelationship.findings[0].subject.relationshipId = "other-relationship";
    await rejected(() => validator.validate({ ...request(), candidate: wrongRelationship }), "STORY_TASK_INVALID");
    const wrongProject = structuredClone(candidate); wrongProject.source.projectId = "other-project";
    await rejected(() => validator.validate({ ...request(), candidate: wrongProject }), "STORY_TASK_INVALID");
    await rejected(() => validator.validate({ ...request(), persisted: true }), "STORY_TASK_INVALID");
    const privileged = await fixture.reader.query(`SELECT
      has_table_privilege(current_user,'public."StoryTaskResult"','SELECT') direct_result,
      has_table_privilege(current_user,'public."StoryTask"','INSERT,UPDATE,DELETE') paid_dml`);
    assert.equal(privileged.rows[0].direct_result, false); assert.equal(privileged.rows[0].paid_dml, false);
    await assert.rejects(() => fixture.legacyRuntime.query(`SELECT public.story_m3_test_evidence_result($1,$2,$3,$4,$5)`,
      [scope.projectId, scope.movieId, fixture.saved.studioId, reference.taskId, 0]));

    fixture.media.setChanged(true);
    await rejected(() => validator.validate(request()), "STORY_TASK_SOURCE_STALE");
    fixture.media.setChanged(false);
    await fixture.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed synthetic QC" } }));
    await rejected(() => validator.validate(request()), "STORY_TASK_SOURCE_STALE");
    await fixture.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Synthetic finding", updatedAt: new Date(date) } }));
    await fixture.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: "Changed Chinese source" } }));
    await rejected(() => validator.validate(request()), "STORY_TASK_SOURCE_STALE");
    await fixture.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: fixture.source.payload.transcript.segments[0].text } }));
    assert.equal((await validator.validate(request())).trust, "PROVISIONAL_CANDIDATE");
    await fixture.runtime.storylineStudio.update({ where: { id: fixture.saved.studioId }, data: { revision: { increment: 1 } } });
    await rejected(() => validator.validate(request()), "STORY_TASK_SOURCE_STALE");
    assert.deepEqual(await counts(), before);
  } finally { await fixture.close(); }
});

test("M3-02 UNKNOWN result never validates a candidate or creates a result", async () => {
  const fixture = await transactionalFixture(true, true, true, true, true);
  try {
    await fixture.configure("m3-unknown", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const published = new Map<string, { taskId: string; generation: number }>();
    const services = fixture.services({ publish: async delivery => { published.set(delivery.id, delivery.payload); return delivery.id; },
      has: async id => published.has(id) });
    const taskScope = { ...scope, studioId: fixture.saved.studioId };
    const reference = await services.admission.admit({ decisionId: await fixture.issue(),
      selection: fixture.sourceReference(), identity: fixture.currentRecipe() });
    await services.reconcile.reconcileOnce({ scope: taskScope, batchSize: 10, missingReceipts: [] });
    const worker = await fixture.fakeWorker(); const claim = await worker.worker.claim(reference);
    assert.equal(claim.outcome, "CLAIMED"); if (claim.outcome !== "CLAIMED") assert.fail("No lease");
    const checkpoint = await fixture.checkpointServices(worker.worker);
    const wire = createStoryFakeWire("LOST_RESPONSE");
    assert.equal((await checkpoint.service.runOnce(claim.lease, wire.wire)).state, "UNKNOWN");
    const validator = createPersistedEvidenceCandidateValidator({ sourceDatabase: fixture.runtime,
      resultDatabase: services.resultDatabase, inspectMedia: fixture.media.inspect, profile: fixture.currentProfile() });
    await rejected(() => validator.validate({ scope: taskScope, ...reference, candidate: syntheticCandidate(fixture, reference.taskId) }),
      "STORY_TASK_RESULT_STALE");
    assert.equal(wire.calls(), 1);
    assert.equal((await fixture.admin.query(`SELECT count(*) FROM public."StoryTaskResult"`)).rows[0].count, "0");
  } finally { await fixture.close(); }
});
