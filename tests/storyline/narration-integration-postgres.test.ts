import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { EVIDENCE_ANALYSIS } from "../../lib/storyline/evidence-analysis/contracts";
import { createPersistedEvidenceCandidateValidator } from "../../lib/storyline/evidence-analysis/persisted-candidate";
import { createSyntheticEvidenceAnalysisWorkflow } from "../../lib/storyline/evidence-analysis/synthetic-workflow";
import { createStoryFakeWire } from "../../lib/storyline/jobs/fake-transport";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { createPersistedNarrationPreparation } from "../../lib/storyline/narration-integration/prepare";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { generateSyntheticEvidenceCandidate } from "../../lib/storyline/evidence-analysis/synthetic-generator";
import { scope, date } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No M4 provider/TTS requests")); });
after(() => mock.restoreAll());
type Fixture = Awaited<ReturnType<typeof transactionalFixture>>;
const scratch = (first = true, seed?: Parameters<typeof transactionalFixture>[6]) =>
  transactionalFixture(first, true, true, true, true, true, seed, true);
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const rejected = (run: () => Promise<unknown>, code?: string) => assert.rejects(run,
  error => error instanceof StoryTaskContractError && (!code || error.code === code));

async function complete(f: Fixture) {
  await f.configure("m402-analysis", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
  const deliveries = new Map<string, { taskId: string; generation: number }>();
  const services = f.services({ publish: async item => { deliveries.set(item.id, item.payload); return item.id; }, has: async id => deliveries.has(id) });
  const worker = await f.fakeWorker(), checkpoint = await f.checkpointServices(worker.worker), wire = createStoryFakeWire("SUCCESS");
  const persistence = await f.candidateService(services.resultDatabase);
  const workflow = createSyntheticEvidenceAnalysisWorkflow({ sourceDatabase: f.admission, inspectMedia: f.media.inspect, profile: f.currentProfile(),
    admission: services.admission, reconcile: services.reconcile, reader: services.read, worker: worker.worker,
    checkpoint: checkpoint.service, wire: wire.wire, persistence,
    validator: createPersistedEvidenceCandidateValidator({ sourceDatabase: f.runtime, resultDatabase: services.resultDatabase,
      inspectMedia: f.media.inspect, profile: f.currentProfile() }) });
  const result = await workflow.run({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
  if (result.outcome !== "CANDIDATE_READY") assert.fail("M3 did not complete");
  const request = { scope: { ...scope, studioId: f.saved.studioId }, candidateId: result.candidate.id, candidateHash: result.candidate.candidateHash };
  const database = await f.narrationReader();
  const dependencies = { database, inspectMedia: f.media.inspect, profile: f.currentProfile() };
  return { result, request, database, dependencies, service: createPersistedNarrationPreparation(dependencies), wire, services, worker, checkpoint };
}
async function counts(f: Fixture) {
  return (await f.admin.query(`SELECT
    (SELECT count(*) FROM public."StoryTask") tasks,(SELECT count(*) FROM public."StoryProviderSubmission") submissions,
    (SELECT count(*) FROM public."StoryTaskResult") results,(SELECT count(*) FROM public."StoryEvidenceCandidate") candidates,
    (SELECT count(*) FROM public."StoryTaskEvent") events,(SELECT count(*) FROM public."StorySourceVerification") verification,
    (SELECT count(*) FROM public."StoryScriptVersion") scripts,(SELECT count(*) FROM public."StorySourceSnapshot") snapshots,
    (SELECT count(*) FROM public."StoryTestCandidateFence") fences`)).rows[0];
}
async function waitForLock(f: Fixture, pid: number) {
  for (let i = 0; i < 50; i++) {
    if ((await f.admin.query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`, [pid])).rows[0]?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Expected bounded PostgreSQL lock wait");
}

for (const first of [true, false]) test(`M4-02 persisted M1/M2/M3 narration: M1 ${first ? "first" : "last"}`, { timeout: 120000 }, async () => {
  const f = await scratch(first);
  try {
    const x = await complete(f), before = await counts(f), prepared = await x.service.prepare(x.request);
    assert.equal(prepared.persisted, false); assert.equal(prepared.sourceVerified, false);
    assert.equal(prepared.humanApproval, "NONE"); assert.equal(prepared.trust, "PROVISIONAL_SYNTHETIC_DRAFT");
    assert.equal(prepared.currentness, "CURRENT_AT_VALIDATION");
    assert.equal(prepared.draft.payload.analysis.candidateId, x.request.candidateId);
    assert.equal(prepared.draft.payload.analysis.candidateHash, x.request.candidateHash);
    assert.equal(prepared.draft.payload.analysis.taskId, x.result.reference.taskId);
    assert.equal(prepared.draft.payload.analysis.resultId, x.result.candidate.resultId);
    assert.equal(prepared.draft.payload.source.snapshotId, f.saved.snapshotId);
    assert.equal(prepared.draft.payload.source.movieId, "movie-old");
    assert.equal(prepared.draft.payload.beats[0].claims[0].statement, f.source.payload.transcript.segments[0].text);
    assert.equal(prepared.draft.payload.beats[1].claims[0].kind, "INFERRED");
    assert(prepared.draft.payload.beats[1].narration[0].text.includes("ဖြစ်နိုင်"));
    const admission = f.source.admissions.find(row => row.status === "ADMITTED" && row.sequence === 0);
    assert(admission?.status === "ADMITTED"); assert.equal(admission.row.origin, "MANUAL"); assert.equal(admission.row.reviewStatus, "NEEDS_REVIEW");
    assert(admission.row.qcIssues.some(row => row.resolvedAt === null));
    const twin = createPersistedNarrationPreparation({ ...x.dependencies, database: await f.narrationReader(true) });
    const reads = await Promise.all([x.service.prepare(x.request), twin.prepare(x.request), x.service.prepare(x.request)]);
    assert(reads.every(row => row.draft.draftHash === prepared.draft.draftHash));
    assert(reads.every(row => canonicalJson(row) === canonicalJson(prepared)));
    for (const field of ["projectId", "movieId", "studioId"] as const)
      await rejected(() => x.service.prepare({ ...x.request, scope: { ...x.request.scope, [field]: field === "movieId" ? "movie-other" : "foreign-id" } }));
    await rejected(() => x.service.prepare({ ...x.request, candidateId: "missing-candidate" }));
    await rejected(() => x.service.prepare({ ...x.request, candidateHash: "0".repeat(64) }));
    for (const assertions of [{ sourceVerified: true }, { currentness: "CURRENT" }, { approved: true },
      { taskId: "forged-task" }, { resultId: "forged-result" }, { candidate: {} }])
      await rejected(() => x.service.prepare({ ...x.request, ...assertions }), "STORY_TASK_INVALID");
    assert.equal(x.wire.calls(), 1); assert.deepEqual(await counts(f), before);
    assert.equal(before.verification, "0"); assert.equal(before.scripts, "1"); assert.equal(before.fences, "0");
    assert(!canonicalJson(prepared).includes("storageKey")); assert(!canonicalJson(prepared).includes("canonicalMarker"));

    const [privileges] = await x.database.$queryRaw<Array<{ dml: boolean; rawRead: boolean; issuer: boolean }>>`
      SELECT has_table_privilege(current_user,'public."Movie"','UPDATE') dml,
        has_table_privilege(current_user,'public."StoryEvidenceCandidate"','SELECT') "rawRead",
        has_function_privilege(current_user,'public.story_m1_verification_append(text,text,text)','EXECUTE') issuer`;
    assert.deepEqual(privileges, { dml: false, rawRead: false, issuer: false });
    await assert.rejects(() => x.database.$executeRaw`UPDATE public."Movie" SET title='forbidden' WHERE id=${scope.movieId}`);
    await assert.rejects(() => x.database.$queryRaw`SELECT public.story_m2_test_issue_decision(1000)`);
    await assert.rejects(() => x.database.$queryRaw`SELECT public.story_m3_test_candidate_open(${scope.projectId},${scope.movieId},${f.saved.studioId},${x.result.reference.taskId},0)`);
    await assert.rejects(() => x.database.$queryRaw`SELECT * FROM public."StoryTaskResult"`);
    await assert.rejects(() => f.reader.query(`SELECT public.story_m4_test_narration_read($1,$2,$3,$4,$5)`,
      [scope.projectId,scope.movieId,f.saved.studioId,x.request.candidateId,x.request.candidateHash]));
    for (const database of [f.runtime, f.admission, x.services.resultDatabase, await f.candidateWriter()])
      await rejected(() => createPersistedNarrationPreparation({ ...x.dependencies, database }).prepare(x.request));
    const owner = new PrismaClient({ adapter: new PrismaPg({ ...f.owned.prismaAdapterConfig(), pipeline: true, max: 1 }) });
    try { await rejected(() => createPersistedNarrationPreparation({ ...x.dependencies, database: owner }).prepare(x.request)); }
    finally { await owner.$disconnect(); }
  } finally { await f.close(); }
});

for (const drift of ["CHINESE", "QC", "TRANSLATION", "MEDIA", "STUDIO", "SCRIPT", "CHARACTER"] as const)
  test(`M4-02 rejects ${drift} drift without persistence or resend`, async () => {
    const f = await scratch();
    try {
      const x = await complete(f), before = await counts(f);
      if (drift === "CHINESE") await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: "Changed Chinese" } }));
      if (drift === "QC") await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed synthetic QC" } }));
      if (drift === "TRANSLATION") await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: "target-0" }, data: { text: "ပြောင်းလဲထားသော စာသား" } }));
      if (drift === "MEDIA") f.media.setInvalid(true);
      if (drift === "STUDIO") await f.runtime.storylineStudio.update({ where: { id: f.saved.studioId }, data: { revision: { increment: 1 } } });
      if (drift === "SCRIPT") await f.runtime.storylineStudio.update({ where: { id: f.saved.studioId }, data: { currentScriptVersionId: null } });
      if (drift === "CHARACTER") await f.mutateSource(tx => tx.characterEvidence.update({ where: { id: "observation-one" }, data: { evidenceText: "Changed character ownership context" } }));
      await rejected(() => x.service.prepare(x.request));
      assert.equal(x.wire.calls(), 1); assert.deepEqual(await counts(f), before);
    } finally { await f.close(); }
  });

test("M4-02 source writer between media inspection and final fence cannot return stale narration", async () => {
  const f = await scratch(), entered = gate(), proceed = gate(), writerHolding = gate(), finishWriter = gate();
  let preparation: Promise<unknown> | undefined, writer: Promise<unknown> | undefined;
  try {
    const x = await complete(f), before = await counts(f);
    const [{ pid }] = await x.database.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
    const service = createPersistedNarrationPreparation({ ...x.dependencies, beforeFenceForTest: async () => { entered.release(); await proceed.promise; } });
    preparation = service.prepare(x.request); const denied = rejected(() => preparation!);
    await Promise.race([entered.promise, preparation.then(() => assert.fail("Final-fence hook did not run"))]);
    writer = f.mutateSource(async tx => {
      await tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Writer changed source" } });
      writerHolding.release(); await finishWriter.promise;
    });
    await Promise.race([writerHolding.promise, writer.then(() => assert.fail("Source-writer hook did not run"))]);
    proceed.release(); await waitForLock(f, pid); finishWriter.release();
    await writer; await denied;
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
  } finally { proceed.release(); finishWriter.release(); await Promise.allSettled([preparation, writer]); await f.close(); }
});

test("M4-02 final fence blocks cooperating writer and currentness is never a future lease", async () => {
  const f = await scratch(), entered = gate(), release = gate();
  let preparation: Promise<unknown> | undefined, writer: Promise<unknown> | undefined;
  try {
    const x = await complete(f);
    const [{ pid }] = await f.runtime.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
    const service = createPersistedNarrationPreparation({ ...x.dependencies, afterComposeForTest: async () => { entered.release(); await release.promise; } });
    const run = service.prepare(x.request); preparation = run;
    await Promise.race([entered.promise, run.then(() => assert.fail("Composition hook did not run"))]);
    writer = f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "After fenced read" } }));
    await waitForLock(f, pid); release.release();
    assert.equal((await run).currentness, "CURRENT_AT_VALIDATION"); await writer;
    await rejected(() => x.service.prepare(x.request)); assert.equal(x.wire.calls(), 1);
  } finally { release.release(); await Promise.allSettled([preparation, writer]); await f.close(); }
});

test("M4-02 media failure after composition fails closed without writes", async () => {
  const f = await scratch();
  try {
    const x = await complete(f), before = await counts(f);
    const service = createPersistedNarrationPreparation({ ...x.dependencies, afterComposeForTest: async () => { f.media.setChanged(true); } });
    await rejected(() => service.prepare(x.request)); assert.deepEqual(await counts(f), before);
    f.media.setChanged(false); assert.equal((await x.service.prepare(x.request)).persisted, false);
  } finally { await f.close(); }
});

test("M4-02 mismatched durable task/result and UNKNOWN cannot supply candidate authority", async () => {
  const f = await scratch();
  try {
    const x = await complete(f);
    await f.configure("m402-other", "ANALYZE_EVIDENCE", 10, EVIDENCE_ANALYSIS.version);
    const services = f.services({ publish: async delivery => delivery.id, has: async () => true });
    const reference = await services.admission.admit({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
    // Deliberately corrupt SYNTHETIC fixture row. No existing history is changed.
    // Individual FKs permit this; the narrow gateway must reject exact binding.
    await f.admin.query(`INSERT INTO public."StoryEvidenceCandidate"
      SELECT (jsonb_populate_record(NULL::public."StoryEvidenceCandidate",to_jsonb(c)||jsonb_build_object('id','forged-candidate','taskId',$2::text))).*
      FROM public."StoryEvidenceCandidate" c WHERE c.id=$1`, [x.request.candidateId, reference.taskId]);
    const bad = { ...x.request, candidateId: "forged-candidate" };
    await rejected(() => x.service.prepare(bad));
    await services.reconcile.reconcileOnce({ scope: x.request.scope, batchSize: 1, missingReceipts: [] });
    const worker = await f.fakeWorker(), claim = await worker.worker.claim(reference);
    if (claim.outcome !== "CLAIMED") assert.fail("No fake claim");
    const checkpoint = await f.checkpointServices(worker.worker), lost = createStoryFakeWire("LOST_RESPONSE");
    assert.equal((await checkpoint.service.runOnce(claim.lease, lost.wire)).state, "UNKNOWN");
    const before = await counts(f);
    await rejected(() => x.service.prepare(bad)); await rejected(() => x.service.prepare(bad));
    assert.deepEqual(await counts(f), before);
    assert.equal(lost.calls(), 1); assert.equal(x.wire.calls(), 1);
    assert.equal((await services.read.get({ scope: x.request.scope, taskId: reference.taskId }))?.state, "UNKNOWN");
    assert.equal((await f.admin.query(`SELECT count(*) FROM public."StorySourceVerification"`)).rows[0].count, "0");
  } finally { await f.close(); }
});

test("M4-02 persisted JSON shape and recomputed hash cannot replace evidence ownership validation", async () => {
  const f = await scratch();
  try {
    await f.configure("m402-corrupt-fixture", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const services = f.services({ publish: async delivery => delivery.id, has: async () => true });
    const taskScope = { ...scope, studioId: f.saved.studioId };
    const reference = await services.admission.admit({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
    await services.reconcile.reconcileOnce({ scope: taskScope, batchSize: 1, missingReceipts: [] });
    const worker = await f.fakeWorker(), claim = await worker.worker.claim(reference);
    if (claim.outcome !== "CLAIMED") assert.fail("No fake claim");
    const checkpoint = await f.checkpointServices(worker.worker), wire = createStoryFakeWire("SUCCESS");
    assert.equal((await checkpoint.service.runOnce(claim.lease, wire.wire)).state, "COMPLETED");
    const original = generateSyntheticEvidenceCandidate({ source: f.source, recipe: f.currentRecipe(), profile: f.currentProfile(), reference }).payload;
    const bad = { ...original, findings: original.findings.map((finding, index) => index === 0
      ? { ...finding, subject: { ...finding.subject, characterIds: ["unknown-character"] } } : finding) };
    const bytes = canonicalJson(bad), badHash = contractHash(EVIDENCE_ANALYSIS.hashDomain, bad);
    // Only the disposable fixture administrator can introduce this intentionally
    // invalid record. Existing immutable records are never changed or deleted.
    await f.admin.query(`INSERT INTO public."StoryEvidenceCandidate"(id,"projectId","movieId","studioId","taskId",generation,"resultId","submissionId","resultHash",
      "sourceSnapshotId","sourceContentHash","sourceContextHash","sourceDependencyHash","sourceBindingHash","expectedStudioRevision","recipeHash","profileHash",
      "schemaVersion","canonicalPayload","candidateHash","validationStatus",origin)
      SELECT 'invalid-grounding',t."projectId",t."movieId",t."studioId",t.id,t.generation,r.id,r."submissionId",r."payloadHash",
        s.id,s."sourceContentHash",s."sourceContextHash",s."dependencyHash",s."sourceBindingHash",t."expectedStudioRevision",t."recipeHash",t."profileHash",
        'story-evidence-candidate-v1',$2,$3,'STRUCTURALLY_GROUNDED','SYNTHETIC_TEST'
      FROM public."StoryTask" t JOIN public."StoryTaskResult" r ON r."taskId"=t.id AND r.generation=t.generation
      JOIN public."StorySourceSnapshot" s ON s.id=t."sourceSnapshotId" WHERE t.id=$1`, [reference.taskId, bytes, badHash]);
    const before = await counts(f);
    const service = createPersistedNarrationPreparation({ database: await f.narrationReader(), inspectMedia: f.media.inspect, profile: f.currentProfile() });
    await rejected(() => service.prepare({ scope: taskScope, candidateId: "invalid-grounding", candidateHash: badHash }), "STORY_TASK_INVALID");
    assert.deepEqual(await counts(f), before); assert.equal(wire.calls(), 1);
  } finally { await f.close(); }
});

test("M4-02 reconstructs real persisted relationship endpoints and Chinese anchors", async () => {
  const f = await scratch(true, async db => {
    const at = new Date(date);
    await db.character.create({ data: { id: "character-b", projectId: scope.projectId, identityKey: "1".repeat(64), canonicalName: "人物乙", normalizedName: "人物乙", createdAt: at, updatedAt: at } });
    await db.characterEvidence.create({ data: { id: "observation-b", analysisRunId: "analysis-one", characterId: "character-b", movieId: scope.movieId,
      sceneId: "scene-one", sceneSequence: 0, transcriptSegmentId: "source-0", evidenceKey: "2".repeat(64), evidenceType: "MENTION", evidenceText: "人物乙说话", inference: "", confidence: "LOW", createdAt: at, updatedAt: at } });
    await db.characterRelationship.create({ data: { id: "relationship-ab", projectId: scope.projectId, characterAId: "character-a", characterBId: "character-b",
      relationshipType: "ALLY", summary: "Synthetic alliance", confidence: "LOW", createdAt: at, updatedAt: at } });
    await db.characterRelationshipEvidence.create({ data: { id: "observation-ab", analysisRunId: "analysis-one", relationshipId: "relationship-ab", movieId: scope.movieId,
      sceneId: "scene-one", sceneSequence: 0, transcriptSegmentId: "source-0", evidenceKey: "3".repeat(64), relationshipType: "ALLY", relationshipSummary: "Synthetic alliance",
      evidenceText: "两人交谈", inference: "", confidence: "LOW", createdAt: at } });
  });
  try {
    const x = await complete(f), prepared = await x.service.prepare(x.request);
    const claim = prepared.draft.payload.beats.find(beat => beat.claims[0].relationshipRef === "relationship-ab")!.claims[0];
    assert.deepEqual(claim.characterRefs, ["character-a", "character-b"]);
    assert.equal(claim.evidence[0].segmentSequence, 0); assert.equal(claim.statement, "两人交谈");
    await f.mutateSource(tx => tx.characterRelationshipEvidence.update({ where: { id: "observation-ab" }, data: { transcriptSegmentId: "source-1" } }));
    await rejected(() => x.service.prepare(x.request));
  } finally { await f.close(); }
});
