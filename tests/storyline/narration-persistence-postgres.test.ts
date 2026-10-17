import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { EVIDENCE_ANALYSIS } from "../../lib/storyline/evidence-analysis/contracts";
import { createPersistedEvidenceCandidateValidator } from "../../lib/storyline/evidence-analysis/persisted-candidate";
import { createSyntheticEvidenceAnalysisWorkflow } from "../../lib/storyline/evidence-analysis/synthetic-workflow";
import { createStoryFakeWire } from "../../lib/storyline/jobs/fake-transport";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { createPersistedNarrationPreparation } from "../../lib/storyline/narration-integration/prepare";
import { createProvisionalNarrationPersistence } from "../../lib/storyline/narration-integration/persist";
import { NARRATION_DRAFT } from "../../lib/storyline/narration/contracts";
import { scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No narration provider or TTS calls")); });
after(() => mock.restoreAll());
const scratch = (first = true) => transactionalFixture(first, true, true, true, true, true, undefined, true, true);
type Fixture = Awaited<ReturnType<typeof scratch>>;
const rejected = (run: () => Promise<unknown>) => assert.rejects(run, e => e instanceof StoryTaskContractError);
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

async function setup(f: Fixture) {
  await f.configure("m403-analysis", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
  const deliveries = new Map<string, { taskId: string; generation: number }>();
  const services = f.services({ publish: async item => { deliveries.set(item.id, item.payload); return item.id; }, has: async id => deliveries.has(id) });
  const worker = await f.fakeWorker(), checkpoint = await f.checkpointServices(worker.worker), wire = createStoryFakeWire("SUCCESS");
  const workflow = createSyntheticEvidenceAnalysisWorkflow({ sourceDatabase: f.admission, inspectMedia: f.media.inspect, profile: f.currentProfile(),
    admission: services.admission, reconcile: services.reconcile, reader: services.read, worker: worker.worker, checkpoint: checkpoint.service,
    wire: wire.wire, persistence: await f.candidateService(services.resultDatabase),
    validator: createPersistedEvidenceCandidateValidator({ sourceDatabase: f.runtime, resultDatabase: services.resultDatabase,
      inspectMedia: f.media.inspect, profile: f.currentProfile() }) });
  const result = await workflow.run({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
  if (result.outcome !== "CANDIDATE_READY") assert.fail("Missing durable candidate");
  const selection = { scope: { ...scope, studioId: f.saved.studioId }, candidateId: result.candidate.id, candidateHash: result.candidate.candidateHash };
  const prepared = await createPersistedNarrationPreparation({ database: await f.narrationReader(), inspectMedia: f.media.inspect,
    profile: f.currentProfile() }).prepare(selection);
  return { selection, request: { ...selection, draft: prepared.draft }, prepared, wire, result, services, service: await f.narrationPersistence() };
}
async function counts(f: Fixture) {
  return (await f.admin.query(`SELECT
    (SELECT count(*) FROM public."StoryNarrationDraft") drafts,(SELECT count(*) FROM public."StoryTestNarrationFence") fences,
    (SELECT count(*) FROM public."StoryTask") tasks,(SELECT count(*) FROM public."StoryTaskResult") results,
    (SELECT count(*) FROM public."StoryProviderSubmission") submissions,(SELECT count(*) FROM public."StoryEvidenceCandidate") candidates,
    (SELECT count(*) FROM public."StorySourceVerification") verification,(SELECT count(*) FROM public."StoryScriptVersion") scripts,
    (SELECT count(*) FROM public."StoryTaskEvent") events`)).rows[0];
}
async function waitForLock(f: Fixture, pid: number) {
  for (let i = 0; i < 100; i++) {
    if ((await f.admin.query(`SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`, [pid])).rows[0]?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("No bounded PostgreSQL lock wait");
}

for (const first of [true, false]) test(`M4-03 immutable persistence/read/concurrency with M1 ${first ? "first" : "last"}`, { timeout: 120000 }, async () => {
  const f = await scratch(first);
  try {
    const x = await setup(f), before = await counts(f), twin = await f.narrationPersistence({ separateConnection: true });
    const [a, b] = await Promise.all([x.service.persist(x.request), twin.persist(x.request)]);
    assert.deepEqual(a, b); assert.deepEqual(await x.service.persist(x.request), a);
    assert.equal(a.persisted, true); assert.equal(a.sourceVerified, false); assert.equal(a.humanApproval, "NONE");
    assert.equal(a.candidateHash, x.selection.candidateHash); assert.equal(a.draftHash, x.prepared.draft.draftHash);
    const row = (await f.admin.query(`SELECT * FROM public."StoryNarrationDraft"`)).rows[0];
    assert.notEqual(a.candidateHash, row.resultHash);
    assert.equal(row.movieId, "movie-old"); assert.equal(row.taskId, x.result.reference.taskId);
    assert.equal(row.resultId, x.result.candidate.resultId); assert.equal(row.sourceSnapshotId, f.saved.snapshotId);
    assert.equal(row.canonicalPayload, canonicalJson(x.prepared.draft.payload));
    const readRequest = { scope: x.selection.scope, narrationId: a.id }, read = await x.service.read(readRequest);
    assert.equal(read.status, "PROVISIONAL_CURRENT_AT_READ");
    assert("payload" in read); assert.deepEqual(read.payload, x.prepared.draft.payload);
    assert(!canonicalJson(read).includes("storageKey")); assert(!canonicalJson(read).includes("challenge"));
    assert.equal((await x.service.read({ ...readRequest, narrationId: "missing" })).status, "MISSING");
    for (const field of ["projectId", "movieId", "studioId"] as const) {
      const wrong = { ...x.selection.scope, [field]: field === "movieId" ? "movie-other" : "wrong-id" };
      await rejected(() => x.service.persist({ ...x.request, scope: wrong }));
      await rejected(() => x.service.read({ ...readRequest, scope: wrong }));
    }
    await rejected(() => x.service.persist({ ...x.request, candidateHash: "0".repeat(64) }));
    await rejected(() => x.service.persist({ ...x.request, candidateId: "forged-candidate" }));
    await rejected(() => x.service.persist({ ...x.request, approved: true }));
    const after = await counts(f); assert.deepEqual(after, { ...before, drafts: "1" });
    assert.equal(x.wire.calls(), 1); assert.equal(after.verification, "0"); assert.equal(after.scripts, "1");
    for (const sql of [`UPDATE public."StoryNarrationDraft" SET origin='MODEL_DRAFT'`, `DELETE FROM public."StoryNarrationDraft"`, `TRUNCATE public."StoryNarrationDraft"`])
      await assert.rejects(() => f.admin.query(sql), { code: "23514" });
    assert.equal((await counts(f)).drafts, "1");
    const writer = await f.narrationWriter(), reader = await f.narrationReader();
    for (const database of [writer, reader, f.runtime, f.admission, x.services.resultDatabase]) {
      await assert.rejects(() => database.$executeRaw`DELETE FROM public."StoryNarrationDraft"`);
      await assert.rejects(() => database.$queryRaw`SELECT * FROM public."StoryNarrationDraft"`);
    }
    await assert.rejects(() => reader.$queryRaw`SELECT public.story_m4_test_narration_open(${scope.projectId},${scope.movieId},${f.saved.studioId},${x.selection.candidateId},${x.selection.candidateHash})`);
    for (const fn of ["story_m2_test_issue_decision", "story_m2_test_checkpoint_open", "story_m1_verification_append"]) {
      const [priv] = await writer.$queryRaw<Array<{ allowed: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname=${fn} AND has_function_privilege(current_user,oid,'EXECUTE')) allowed`;
      assert.equal(priv.allowed, false);
    }
    await assert.rejects(() => writer.$transaction(async tx => {
      await tx.$queryRaw`SELECT public.story_m4_test_narration_open(${scope.projectId},${scope.movieId},${f.saved.studioId},${x.selection.candidateId},${x.selection.candidateHash})`;
      await tx.$queryRaw`SELECT public.story_m4_test_narration_finish(${x.selection.candidateId},${row.canonicalPayload},${a.draftHash},${"0".repeat(64)})`;
    }));
    for (const patch of [{ candidateId: "unknown-candidate" }, { approval: "APPROVED" },
      { canonicalPayload: "{}" }, { draftHash: "0".repeat(64) }]) {
      await assert.rejects(() => f.admin.query(`INSERT INTO public."StoryNarrationDraft"
        SELECT (jsonb_populate_record(NULL::public."StoryNarrationDraft",to_jsonb(n)||$2::jsonb||jsonb_build_object('id','invalid-row'))).*
        FROM public."StoryNarrationDraft" n WHERE n.id=$1`, [a.id,JSON.stringify(patch)]));
    }
    const wrongBinding = JSON.parse(row.canonicalPayload);
    wrongBinding.analysis.candidateId = "unknown-candidate";
    const wrongBytes = canonicalJson(wrongBinding);
    await assert.rejects(() => f.admin.query(`INSERT INTO public."StoryNarrationDraft"
      SELECT (jsonb_populate_record(NULL::public."StoryNarrationDraft",to_jsonb(n)||$2::jsonb||jsonb_build_object('id','invalid-fk'))).*
      FROM public."StoryNarrationDraft" n WHERE n.id=$1`, [a.id,JSON.stringify({ candidateId: "unknown-candidate", canonicalPayload: wrongBytes,
        draftHash: contractHash(NARRATION_DRAFT.hashDomain, wrongBinding) })]), { code: "23503" });
    assert.deepEqual(await counts(f), after);
  } finally { await f.close(); }
});

for (const drift of ["CHINESE", "TRANSLATION", "QC", "MEDIA", "STUDIO", "SCRIPT"] as const)
  test(`M4-03 ${drift} drift rejects insertion and exposes historical stale draft`, async () => {
    const f = await scratch();
    try {
      const x = await setup(f), receipt = await x.service.persist(x.request), before = await counts(f);
      if (drift === "CHINESE") await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: "Changed synthetic Chinese" } }));
      if (drift === "TRANSLATION") await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: "target-0" }, data: { text: "ပြောင်းလဲထားသော စာသား" } }));
      if (drift === "QC") await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed synthetic QC" } }));
      if (drift === "MEDIA") f.media.setInvalid(true);
      if (drift === "STUDIO") await f.runtime.storylineStudio.update({ where: { id: f.saved.studioId }, data: { revision: { increment: 1 } } });
      if (drift === "SCRIPT") await f.runtime.storylineStudio.update({ where: { id: f.saved.studioId }, data: { currentScriptVersionId: null } });
      await rejected(() => x.service.persist(x.request));
      const read = await x.service.read({ scope: x.selection.scope, narrationId: receipt.id });
      assert.equal(read.status, "STALE_DEPENDENCIES"); assert("payload" in read); assert.deepEqual(read.payload, x.prepared.draft.payload);
      assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
    } finally { await f.close(); }
  });

test("M4-03 source writer before final fence invalidates previously prepared draft", async () => {
  const f = await scratch(), entered = gate(), proceed = gate(), holding = gate(), finish = gate();
  let run: Promise<unknown> | undefined, writer: Promise<unknown> | undefined;
  try {
    const x = await setup(f), before = await counts(f);
    const [{ pid }] = await (await f.narrationWriter()).$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
    const service = await f.narrationPersistence({ beforeFenceForTest: async () => { entered.release(); await proceed.promise; } });
    run = service.persist(x.request); const denial = rejected(() => run!);
    await Promise.race([entered.promise, run.then(() => assert.fail("Missing fence hook"))]);
    writer = f.mutateSource(async tx => {
      await tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed during preflight" } });
      holding.release(); await finish.promise;
    });
    await Promise.race([holding.promise, writer.then(() => assert.fail("Missing writer hook"))]);
    proceed.release(); await waitForLock(f, pid); finish.release(); await writer; await denial;
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
  } finally { proceed.release(); finish.release(); await Promise.allSettled([run, writer]); await f.close(); }
});

test("M4-03 insertion holds source fence until commit, subsequent read detects writer drift", async () => {
  const f = await scratch(), entered = gate(), finish = gate();
  let run: Promise<unknown> | undefined, writer: Promise<unknown> | undefined;
  try {
    const x = await setup(f), [{ pid }] = await f.runtime.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
    const service = await f.narrationPersistence({ afterInsertForTest: async () => { entered.release(); await finish.promise; } });
    const saving = service.persist(x.request); run = saving;
    await Promise.race([entered.promise, saving.then(() => assert.fail("Missing insertion hook"))]);
    writer = f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "After narration commit" } }));
    await waitForLock(f, pid); finish.release(); const saved = await saving; await writer;
    assert.equal((await x.service.read({ scope: x.selection.scope, narrationId: saved.id })).status, "STALE_DEPENDENCIES");
    assert.equal((await counts(f)).drafts, "1"); assert.equal(x.wire.calls(), 1);
  } finally { finish.release(); await Promise.allSettled([run, writer]); await f.close(); }
});

test("M4-03 rollback after insert or final media check leaves no draft or fence; retry never sends", async () => {
  const f = await scratch();
  try {
    const x = await setup(f), before = await counts(f);
    for (const afterInsertForTest of [async () => { throw new Error("Synthetic rollback"); }, async () => { f.media.setChanged(true); }]) {
      const service = await f.narrationPersistence({ afterInsertForTest });
      await rejected(() => service.persist(x.request)); assert.deepEqual(await counts(f), before); f.media.setChanged(false);
    }
    assert.equal((await x.service.persist(x.request)).persisted, true); assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

test("M4-03 malformed or conflicting narration bytes cannot bypass validation", async () => {
  const f = await scratch();
  try {
    const x = await setup(f), before = await counts(f);
    const bad = JSON.parse(canonicalJson(x.prepared.draft.payload));
    bad.beats[0].narration[0].text = "မမှန်သော စာသား";
    for (const draft of [{ payload: bad, draftHash: contractHash(NARRATION_DRAFT.hashDomain, bad) },
      { ...x.prepared.draft, draftHash: "0".repeat(64) }, { ...x.prepared.draft, approved: true }])
      await rejected(() => x.service.persist({ ...x.request, draft }));
    assert.deepEqual(await counts(f), before);
    // Only fixture administrator introduces this NEW deliberately corrupt row;
    // no immutable historical row is edited or removed. Gateway must not overwrite it.
    const bytes = canonicalJson(bad), badHash = contractHash(NARRATION_DRAFT.hashDomain, bad);
    await f.admin.query(`INSERT INTO public."StoryNarrationDraft"(id,"projectId","movieId","studioId","candidateId","candidateHash","taskId",generation,"resultId","submissionId","resultHash",
      "sourceSnapshotId","sourceContentHash","sourceContextHash","sourceDependencyHash","sourceBindingHash","mediaSha256","expectedStudioRevision","recipeHash","profileHash",
      "schemaVersion","composerVersion","canonicalPayload","draftHash",origin,"reviewStatus",approval)
      SELECT 'conflict-fixture',c."projectId",c."movieId",c."studioId",c.id,c."candidateHash",c."taskId",c.generation,c."resultId",c."submissionId",c."resultHash",
        s.id,s."sourceContentHash",s."sourceContextHash",s."dependencyHash",s."sourceBindingHash",s."sourceSha256",c."expectedStudioRevision",c."recipeHash",c."profileHash",
        'story-narration-draft-v1','story-synthetic-narration-v1',$2,$3,'SYNTHETIC_TEST','NEEDS_HUMAN_REVIEW','PROVISIONAL'
      FROM public."StoryEvidenceCandidate" c JOIN public."StorySourceSnapshot" s ON s.id=c."sourceSnapshotId" WHERE c.id=$1`, [x.selection.candidateId,bytes,badHash]);
    const withConflict = await counts(f);
    await rejected(() => x.service.persist(x.request)); assert.deepEqual(await counts(f), withConflict);
    assert.equal((await f.admin.query(`SELECT "canonicalPayload" FROM public."StoryNarrationDraft"`)).rows[0].canonicalPayload, bytes);
    await rejected(() => x.service.read({ scope: x.selection.scope, narrationId: "conflict-fixture" }));
    assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

test("M4-03 missing keys, wrong roles, incomplete and UNKNOWN task identity fail closed", async () => {
  const f = await scratch();
  try {
    const x = await setup(f), reader = await f.narrationReader();
    assert.throws(() => createProvisionalNarrationPersistence({ database: reader, readerDatabase: reader,
      inspectMedia: f.media.inspect, profile: f.currentProfile(), validationKey: Buffer.alloc(0) }));
    const wrong = createProvisionalNarrationPersistence({ database: reader, readerDatabase: reader,
      inspectMedia: f.media.inspect, profile: f.currentProfile(), validationKey: Buffer.alloc(32) });
    await rejected(() => wrong.persist(x.request));
    const wrongKey = createProvisionalNarrationPersistence({ database: await f.narrationWriter(), readerDatabase: reader,
      inspectMedia: f.media.inspect, profile: f.currentProfile(), validationKey: Buffer.alloc(32) });
    const untouched = await counts(f);
    await rejected(() => wrongKey.persist(x.request)); assert.deepEqual(await counts(f), untouched);
    await f.configure("m403-unknown", "ANALYZE_EVIDENCE", 10, EVIDENCE_ANALYSIS.version);
    const services = f.services({ publish: async delivery => delivery.id, has: async () => true });
    const ref = await services.admission.admit({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
    await f.admin.query(`INSERT INTO public."StoryEvidenceCandidate"
      SELECT (jsonb_populate_record(NULL::public."StoryEvidenceCandidate",to_jsonb(c)||jsonb_build_object('id','forged-candidate','taskId',$2::text))).*
      FROM public."StoryEvidenceCandidate" c WHERE c.id=$1`, [x.selection.candidateId,ref.taskId]);
    const bad = { ...x.request, candidateId: "forged-candidate" };
    await rejected(() => x.service.persist(bad));
    await services.reconcile.reconcileOnce({ scope: x.selection.scope, batchSize: 1, missingReceipts: [] });
    const worker = await f.fakeWorker(), claim = await worker.worker.claim(ref);
    if (claim.outcome !== "CLAIMED") assert.fail("No fake claim");
    const checkpoint = await f.checkpointServices(worker.worker), wire = createStoryFakeWire("LOST_RESPONSE");
    assert.equal((await checkpoint.service.runOnce(claim.lease, wire.wire)).state, "UNKNOWN");
    const before = await counts(f); await rejected(() => x.service.persist(bad)); await rejected(() => x.service.persist(bad));
    assert.deepEqual(await counts(f), before); assert.equal(before.drafts, "0"); assert.equal(wire.calls(), 1); assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});
