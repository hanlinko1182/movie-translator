import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { EVIDENCE_ANALYSIS, type EvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis/contracts";
import { createPersistedEvidenceCandidateValidator } from "../../lib/storyline/evidence-analysis/persisted-candidate";
import { createSyntheticEvidenceAnalysisWorkflow } from "../../lib/storyline/evidence-analysis/synthetic-workflow";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { createStoryFakeWire } from "../../lib/storyline/jobs/fake-transport";
import { date, scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("M3 acceptance cannot make provider requests")); });
after(() => mock.restoreAll());

type Fixture = Awaited<ReturnType<typeof transactionalFixture>>;
function deliveryPort() {
  const deliveries = new Map<string, { taskId: string; generation: number }>();
  return { deliveries, port: {
    publish: async (delivery: { id: string; payload: { taskId: string; generation: number } }) => {
      deliveries.set(delivery.id, delivery.payload); return delivery.id;
    }, has: async (id: string) => deliveries.has(id),
  } };
}
async function compose(f: Fixture, delivery: ReturnType<typeof deliveryPort>) {
  const services = f.services(delivery.port), worker = await f.fakeWorker();
  const checkpoint = await f.checkpointServices(worker.worker), wire = createStoryFakeWire("SUCCESS");
  const persistence = await f.candidateService(services.resultDatabase);
  const validator = createPersistedEvidenceCandidateValidator({ sourceDatabase: f.runtime,
    resultDatabase: services.resultDatabase, inspectMedia: f.media.inspect, profile: f.currentProfile() });
  const workflow = createSyntheticEvidenceAnalysisWorkflow({ sourceDatabase: f.admission, inspectMedia: f.media.inspect,
    profile: f.currentProfile(), admission: services.admission, reconcile: services.reconcile, reader: services.read,
    worker: worker.worker, checkpoint: checkpoint.service, validator, persistence, wire: wire.wire });
  return { services, workflow, wire, persistence, validator, taskScope: { ...scope, studioId: f.saved.studioId } };
}
async function rejected(run: () => Promise<unknown>, code?: string) {
  await assert.rejects(run, error => error instanceof StoryTaskContractError && (!code || error.code === code));
}

for (const m1First of [true, false]) test(`M3 final: targeting A never executes queued B, M1 ${m1First ? "first" : "last"}`, async () => {
  const f = await transactionalFixture(m1First, true, true, true, true, true);
  try {
    const delivery = deliveryPort();
    const admitted = [];
    for (const last of [10, 11]) {
      const key = `m305-window-${last}`;
      const identity = await f.configure(key, "ANALYZE_EVIDENCE", last, EVIDENCE_ANALYSIS.version);
      const services = f.services(delivery.port), decisionId = await f.issue(), selection = f.sourceReference();
      const reference = await services.admission.admit({ decisionId, identity, selection });
      admitted.push({ key, last, identity, decisionId, selection, reference });
    }
    // claim_due orders UUID text. Choose A as the later ID, guaranteeing that
    // the first Studio-scoped dispatch selects B, without changing task rows.
    admitted.sort((a, b) => a.reference.taskId < b.reference.taskId ? -1 : 1);
    const [b, a] = admitted;
    await f.configure(a.key, "ANALYZE_EVIDENCE", a.last, EVIDENCE_ANALYSIS.version);
    const x = await compose(f, delivery);
    await rejected(() => x.workflow.run({ decisionId: a.decisionId, identity: a.identity, selection: a.selection }),
      "STORY_TASK_SCOPE_MISMATCH");
    assert.deepEqual([...delivery.deliveries.values()], [b.reference]);
    assert.equal(x.wire.calls(), 0);
    const counts = async () => (await f.admin.query(`SELECT
      (SELECT count(*) FROM public."StoryProviderSubmission") submissions,
      (SELECT count(*) FROM public."StoryTaskResult") results,
      (SELECT count(*) FROM public."StoryEvidenceCandidate") candidates,
      (SELECT count(*) FROM public."StorySourceVerification") receipts`)).rows[0];
    assert.deepEqual(await counts(), { submissions: "0", results: "0", candidates: "0", receipts: "0" });
    for (const reference of [a.reference, b.reference])
      assert.equal((await x.services.read.get({ scope: x.taskScope, taskId: reference.taskId }))?.state, "QUEUED");
    const result = await x.workflow.run({ decisionId: a.decisionId, identity: a.identity, selection: a.selection });
    assert.equal(result.outcome, "CANDIDATE_READY");
    assert.equal(result.reference.taskId, a.reference.taskId);
    assert.equal(x.wire.calls(), 1);
    assert.equal((await x.services.read.get({ scope: x.taskScope, taskId: b.reference.taskId }))?.state, "QUEUED");
    const bEvents = await f.admin.query(`SELECT state FROM public."StoryTaskEvent" WHERE "taskId"=$1 ORDER BY sequence`, [b.reference.taskId]);
    assert.deepEqual(bEvents.rows, [{ state: "QUEUED" }]);
    assert.deepEqual(await counts(), { submissions: "1", results: "1", candidates: "1", receipts: "0" });
    await x.workflow.run({ decisionId: a.decisionId, identity: a.identity, selection: a.selection });
    assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

test("M3 final: exact persisted provenance, canonical bytes, scope and historical staleness", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true);
  try {
    const identity = await f.configure("m305-provenance", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const x = await compose(f, deliveryPort()), selection = f.sourceReference(), decisionId = await f.issue();
    const result = await x.workflow.run({ identity, selection, decisionId });
    assert.equal(result.outcome, "CANDIDATE_READY");
    if (result.outcome !== "CANDIDATE_READY") assert.fail("No candidate");
    const payload = result.candidate.candidate as EvidenceAnalysisCandidate;
    const validated = await x.validator.validate({ scope: x.taskScope, ...result.reference, candidate: payload });
    const stored = (await f.admin.query(`SELECT c."canonicalPayload",c."candidateHash",c."resultId",c."resultHash",
      c."submissionId",c."sourceSnapshotId",c."recipeHash",r."payloadHash",r."normalizedPayload",t.state,
      s."canonicalPayload" AS "sourceBytes"
      FROM public."StoryEvidenceCandidate" c JOIN public."StoryTaskResult" r ON r.id=c."resultId"
      JOIN public."StoryTask" t ON t.id=c."taskId" JOIN public."StorySourceSnapshot" s ON s.id=c."sourceSnapshotId"
      WHERE c.id=$1`, [result.candidate.id])).rows[0];
    assert.equal(stored.state, "COMPLETED");
    assert.equal(stored.sourceSnapshotId, f.saved.snapshotId);
    assert.equal(JSON.parse(stored.sourceBytes).transcript.segments.length, 12);
    assert.equal(payload.source.contentHash, f.source.sourceContentHash);
    assert.equal(payload.source.contextHash, f.source.sourceContextHash);
    assert.equal(stored.canonicalPayload, canonicalJson(payload));
    assert.equal(stored.candidateHash, contractHash(EVIDENCE_ANALYSIS.hashDomain, payload));
    assert.equal(contractHash(EVIDENCE_ANALYSIS.hashDomain, JSON.parse(stored.canonicalPayload)), stored.candidateHash);
    assert.equal(stored.resultId, validated.durableResult.resultId);
    assert.equal(stored.resultHash, validated.durableResult.resultHash);
    assert.equal(stored.resultHash, stored.payloadHash);
    assert.equal(stored.submissionId, validated.durableResult.submissionId);
    assert.equal(stored.recipeHash, identity.recipeHash);
    assert.equal(JSON.parse(stored.normalizedPayload).schemaVersion, "story-fake-result-v1");
    assert(!stored.normalizedPayload.includes("findings"));
    const admission = f.source.admissions.find(row => row.status === "ADMITTED" && row.row.id === payload.findings[0].translationContextRefs[0].translationSegmentId);
    assert(admission?.status === "ADMITTED");
    assert.equal(admission.row.origin, "MANUAL");
    assert.equal(admission.row.reviewStatus, "NEEDS_REVIEW");
    assert(admission.row.qcIssues.some(row => row.resolvedAt === null));
    assert.equal(result.candidate.humanApproval, "NONE");

    for (const field of ["projectId", "movieId", "studioId"] as const) {
      const badScope = { ...x.taskScope, [field]: `foreign-${field}` };
      await rejected(() => x.persistence.read({ scope: badScope, ...result.reference }));
      await rejected(() => x.workflow.resumeCompleted({ selection: { ...selection, [field]: `foreign-${field}` },
        identity, reference: result.reference }));
    }
    const forged = structuredClone(payload);
    Object.assign(forged.findings[0], { sourceVerified: true });
    await rejected(() => x.persistence.persist({ scope: x.taskScope, ...result.reference, candidate: forged }));
    await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed synthetic QC" } }));
    assert.equal((await x.persistence.read({ scope: x.taskScope, ...result.reference })).status, "STALE_DEPENDENCIES");
    await rejected(() => x.workflow.resumeCompleted({ selection, identity, reference: result.reference }), "STORY_TASK_SOURCE_STALE");
    assert.equal(x.wire.calls(), 1);
    const historical = (await f.admin.query(`SELECT "canonicalPayload" FROM public."StoryEvidenceCandidate" WHERE id=$1`, [result.candidate.id])).rows[0];
    assert.equal(historical.canonicalPayload, stored.canonicalPayload);
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StorySourceVerification"`)).rows[0].count, "0");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryScriptVersion"`)).rows[0].count, "1");
  } finally { await f.close(); }
});

test("M3 final: persisted relationship finding requires both actual endpoint allowances", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true, async db => {
    const at = new Date(date);
    await db.character.create({ data: { id: "character-b", projectId: scope.projectId, identityKey: "1".repeat(64),
      canonicalName: "人物乙", normalizedName: "人物乙", uncertain: false, createdAt: at, updatedAt: at } });
    await db.characterEvidence.create({ data: { id: "observation-b", analysisRunId: "analysis-one", characterId: "character-b",
      movieId: scope.movieId, sceneId: "scene-one", sceneSequence: 0, transcriptSegmentId: "source-0",
      evidenceKey: "2".repeat(64), evidenceType: "MENTION", evidenceText: "人物乙说话", inference: "", confidence: "LOW", createdAt: at, updatedAt: at } });
    await db.characterRelationship.create({ data: { id: "relationship-ab", projectId: scope.projectId,
      characterAId: "character-a", characterBId: "character-b", relationshipType: "ALLY", summary: "Synthetic possible alliance",
      confidence: "LOW", createdAt: at, updatedAt: at } });
    await db.characterRelationshipEvidence.create({ data: { id: "observation-ab", analysisRunId: "analysis-one", relationshipId: "relationship-ab",
      movieId: scope.movieId, sceneId: "scene-one", sceneSequence: 0, transcriptSegmentId: "source-0", evidenceKey: "3".repeat(64),
      relationshipType: "ALLY", relationshipSummary: "Synthetic possible alliance", evidenceText: "两人交谈", inference: "",
      confidence: "LOW", createdAt: at } });
  });
  try {
    const identity = await f.configure("m305-relationship", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const x = await compose(f, deliveryPort()), decisionId = await f.issue();
    const result = await x.workflow.run({ selection: f.sourceReference(), identity, decisionId });
    if (result.outcome !== "CANDIDATE_READY") assert.fail("No relationship candidate");
    const payload = result.candidate.candidate as EvidenceAnalysisCandidate;
    const relationship = payload.findings.find(row => row.category === "RELATIONSHIP");
    assert(relationship);
    assert.deepEqual(relationship.subject, { characterIds: ["character-a", "character-b"], relationshipId: "relationship-ab" });
    assert.equal(relationship.statement, "两人交谈");
    assert.equal(relationship.evidence[0].kind, "CAPTURED_OBSERVATION");
    const forged = structuredClone(payload);
    forged.findings.find(row => row.category === "RELATIONSHIP")!.subject.characterIds = ["character-a"];
    await rejected(() => x.validator.validate({ scope: x.taskScope, ...result.reference, candidate: forged }));
    await rejected(() => x.persistence.persist({ scope: x.taskScope, ...result.reference, candidate: forged }));
    assert.equal(x.wire.calls(), 1);
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryEvidenceCandidate"`)).rows[0].count, "1");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StorySourceVerification"`)).rows[0].count, "0");
  } finally { await f.close(); }
});
