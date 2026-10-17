import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { EVIDENCE_ANALYSIS } from "../../lib/storyline/evidence-analysis/contracts";
import { createPersistedEvidenceCandidateValidator } from "../../lib/storyline/evidence-analysis/persisted-candidate";
import { createSyntheticEvidenceAnalysisWorkflow } from "../../lib/storyline/evidence-analysis/synthetic-workflow";
import { createStoryFakeWire, type FakeWireScenario } from "../../lib/storyline/jobs/fake-transport";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { createPersistedNarrationPreparation } from "../../lib/storyline/narration-integration/prepare";
import { createSyntheticNarrationWorkflow } from "../../lib/storyline/narration-integration/synthetic-workflow";
import { NARRATION_DRAFT } from "../../lib/storyline/narration/contracts";
import { assessNarrationVoiceHandoff, parseVoiceRequestProposal } from "../../lib/storyline/voice/handoff";
import { voiceProposal } from "./voice-handoff.fixture";
import { scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("Acceptance has no TTS/provider transport")); });
after(() => mock.restoreAll());
type Fixture = Awaited<ReturnType<typeof transactionalFixture>>;
async function compose(f: Fixture, scenario: FakeWireScenario = "SUCCESS") {
  await f.configure("m405-final", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
  const services = f.services({ publish: async row => row.id, has: async () => true }), worker = await f.fakeWorker();
  const checkpoint = await f.checkpointServices(worker.worker), candidates = await f.candidateService(services.resultDatabase), wire = createStoryFakeWire(scenario);
  const analysis = createSyntheticEvidenceAnalysisWorkflow({ sourceDatabase: f.admission, inspectMedia: f.media.inspect, profile: f.currentProfile(),
    admission: services.admission, reconcile: services.reconcile, reader: services.read, worker: worker.worker, checkpoint: checkpoint.service,
    persistence: candidates, wire: wire.wire, validator: createPersistedEvidenceCandidateValidator({ sourceDatabase: f.runtime,
      resultDatabase: services.resultDatabase, inspectMedia: f.media.inspect, profile: f.currentProfile() }) });
  const preparation = createPersistedNarrationPreparation({ database: await f.narrationReader(), inspectMedia: f.media.inspect, profile: f.currentProfile() });
  const persistence = await f.narrationPersistence(), dependencies = { analysis, candidateReader: candidates, preparation, persistence };
  return { workflow: createSyntheticNarrationWorkflow(dependencies), dependencies, wire,
    input: { decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() }, taskScope: { ...scope, studioId: f.saved.studioId } };
}
const counts = async (f: Fixture) => (await f.admin.query(`SELECT (SELECT count(*) FROM public."StoryTask") tasks,
  (SELECT count(*) FROM public."StoryProviderSubmission") submissions,(SELECT count(*) FROM public."StoryTaskResult") results,
  (SELECT count(*) FROM public."StoryEvidenceCandidate") candidates,(SELECT count(*) FROM public."StoryNarrationDraft") narrations,
  (SELECT count(*) FROM public."StorySourceVerification") receipts,(SELECT count(*) FROM public."StoryScriptVersion") scripts,
  (SELECT count(*) FROM public."StoryTestNarrationFence") fences`)).rows[0];

for (const first of [true, false]) test(`M4 final acceptance: exact durable lineage and blocked M5 handoff, M1 ${first ? "first" : "last"}`, { timeout: 120000 }, async () => {
  const f = await transactionalFixture(first, true, true, true, true, true, undefined, true, true);
  try {
    const x = await compose(f), result = await x.workflow.run(x.input);
    if (result.outcome !== "NARRATION_READY") assert.fail("No definitive provisional narration");
    const row = (await f.admin.query(`SELECT n.*,c."canonicalPayload" "candidateBytes",c."candidateHash" "persistedCandidateHash",
      r."payloadHash" "persistedResultHash",r."normalizedPayload" "markerBytes",t.state "taskState",t."canonicalRecipe",
      s."canonicalPayload" "sourceBytes",s."sourceSha256" "sourceSha"
      FROM public."StoryNarrationDraft" n JOIN public."StoryEvidenceCandidate" c ON c.id=n."candidateId"
      JOIN public."StoryTaskResult" r ON r.id=n."resultId" JOIN public."StoryTask" t ON t.id=n."taskId"
      JOIN public."StorySourceSnapshot" s ON s.id=n."sourceSnapshotId" WHERE n.id=$1`, [result.narration.id])).rows[0];
    const p = result.view.payload, c = JSON.parse(row.candidateBytes), source = JSON.parse(row.sourceBytes);
    assert.equal(row.taskState, "COMPLETED"); assert.equal(source.transcript.segments.length, 12);
    assert.equal(row.movieId, "movie-old"); assert.equal(row.studioId, f.saved.studioId); assert.equal(row.sourceSnapshotId, f.saved.snapshotId);
    assert.equal(row.candidateId, p.analysis.candidateId); assert.equal(row.candidateHash, p.analysis.candidateHash);
    assert.equal(row.candidateHash, row.persistedCandidateHash); assert.equal(row.candidateHash, contractHash(EVIDENCE_ANALYSIS.hashDomain, c));
    assert.notEqual(row.candidateHash, row.persistedResultHash); assert.equal(row.resultHash, row.persistedResultHash);
    for (const key of ["taskId", "generation", "resultId", "resultHash", "submissionId", "recipeHash"] as const) assert.equal(row[key], p.analysis[key]);
    for (const [db, key] of [["sourceContentHash", "contentHash"], ["sourceContextHash", "contextHash"], ["sourceDependencyHash", "dependencyHash"], ["sourceBindingHash", "bindingHash"]] as const)
      assert.equal(row[db], p.source[key]);
    assert.equal(row.sourceSha, p.source.mediaSha256); assert.equal(row.expectedStudioRevision, p.source.expectedStudioRevision);
    assert.equal(row.canonicalPayload, canonicalJson(p)); assert.equal(row.draftHash, contractHash(NARRATION_DRAFT.hashDomain, p));
    assert.equal(JSON.parse(row.markerBytes).schemaVersion, "story-fake-result-v1"); assert(!row.markerBytes.includes("findings"));
    assert.equal(p.review.approval, "PROVISIONAL"); assert.equal(p.origin, "SYNTHETIC_TEST"); assert.equal(result.narration.sourceVerified, false);

    const proposal = voiceProposal({ payload: p, draftHash: result.narration.draftHash }, result.narration.id);
    assert.equal(parseVoiceRequestProposal(proposal).executable, false);
    assert.equal(assessNarrationVoiceHandoff(proposal, { payload: p, draftHash: row.draftHash }, result.narration).eligibleForProviderSubmission, false);
    const before = await counts(f);
    assert.deepEqual(before, { tasks: "1", submissions: "1", results: "1", candidates: "1", narrations: "1", receipts: "0", scripts: "1", fences: "0" });
    const twin = createSyntheticNarrationWorkflow({ ...x.dependencies, persistence: await f.narrationPersistence({ separateConnection: true }) });
    const recovery = { scope: x.taskScope, reference: result.reference, candidateId: result.candidate.id, candidateHash: result.candidate.hash };
    const [a, b] = await Promise.all([x.workflow.resumeCandidate(recovery), twin.resumeCandidate(recovery)]);
    assert.deepEqual(a, result); assert.deepEqual(b, result); assert.deepEqual(await x.workflow.run(x.input), result);
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
    for (const key of ["projectId", "movieId", "studioId"] as const)
      await assert.rejects(() => x.workflow.read({ scope: { ...x.taskScope, [key]: "foreign" }, narrationId: row.id }), StoryTaskContractError);
    await assert.rejects(() => x.workflow.resumeCandidate({ ...recovery, reference: { taskId: "wrong-task", generation: 0 } }), StoryTaskContractError);
    for (const sql of [`UPDATE public."StoryNarrationDraft" SET approval='APPROVED'`, `DELETE FROM public."StoryNarrationDraft"`, `TRUNCATE public."StoryNarrationDraft"`])
      await assert.rejects(() => f.admin.query(sql), { code: "23514" });
    await assert.rejects(() => (async () => (await f.narrationWriter()).$executeRaw`DELETE FROM public."StoryNarrationDraft"`)());
    await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Final acceptance QC drift" } }));
    assert.equal((await x.workflow.read({ scope: x.taskScope, narrationId: row.id })).status, "STALE_DEPENDENCIES");
    await assert.rejects(() => x.workflow.resumeCandidate(recovery), StoryTaskContractError);
    assert.equal((await f.admin.query(`SELECT "canonicalPayload" FROM public."StoryNarrationDraft" WHERE id=$1`, [row.id])).rows[0].canonicalPayload, row.canonicalPayload);
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

test("M4 final acceptance: UNKNOWN remains unresolved with no narration or voice publication", async () => {
  const f = await transactionalFixture(true, true, true, true, true, true, undefined, true, true);
  try {
    const x = await compose(f, "LOST_RESPONSE"), result = await x.workflow.run(x.input);
    assert.equal(result.outcome, "UNKNOWN"); const before = await counts(f);
    assert.equal(before.narrations, "0"); assert.equal(before.candidates, "0"); assert.equal(before.receipts, "0");
    assert.equal((await x.workflow.resumeCompleted({ selection: x.input.selection, identity: x.input.identity, reference: result.reference })).outcome, "UNKNOWN");
    assert.equal((await x.workflow.read({ scope: x.taskScope, narrationId: "nonexistent" })).status, "MISSING");
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});
