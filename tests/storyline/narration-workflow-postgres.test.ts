import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { EVIDENCE_ANALYSIS } from "../../lib/storyline/evidence-analysis/contracts";
import { createPersistedEvidenceCandidateValidator } from "../../lib/storyline/evidence-analysis/persisted-candidate";
import { createSyntheticEvidenceAnalysisWorkflow } from "../../lib/storyline/evidence-analysis/synthetic-workflow";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { createStoryFakeWire, type FakeWireScenario } from "../../lib/storyline/jobs/fake-transport";
import { createPersistedNarrationPreparation } from "../../lib/storyline/narration-integration/prepare";
import { createProvisionalNarrationPersistence } from "../../lib/storyline/narration-integration/persist";
import { createSyntheticNarrationWorkflow } from "../../lib/storyline/narration-integration/synthetic-workflow";
import { NARRATION_DRAFT } from "../../lib/storyline/narration/contracts";
import { date, scope } from "./fixtures";
import { transactionalFixture } from "./jobs/transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No provider or TTS requests")); });
after(() => mock.restoreAll());
const scratch = (first = true, seed?: Parameters<typeof transactionalFixture>[6]) => transactionalFixture(first, true, true, true, true, true, seed, true, true);
type Fixture = Awaited<ReturnType<typeof scratch>>;
type Hooks = Pick<Parameters<typeof createSyntheticNarrationWorkflow>[0], "afterCandidateForTest" | "afterPrepareForTest" | "afterPersistForTest">;
const rejected = (run: () => Promise<unknown>, code?: string) => assert.rejects(run, e => e instanceof StoryTaskContractError && (!code || e.code === code));

async function compose(f: Fixture, options: Hooks & {
  scenario?: FakeWireScenario; persistence?: Awaited<ReturnType<Fixture["narrationPersistence"]>>;
} = {}) {
  const deliveries = new Map<string, { taskId: string; generation: number }>();
  const services = f.services({ publish: async row => { deliveries.set(row.id, row.payload); return row.id; }, has: async key => deliveries.has(key) });
  const worker = await f.fakeWorker(), checkpoint = await f.checkpointServices(worker.worker), wire = createStoryFakeWire(options.scenario ?? "SUCCESS");
  const candidates = await f.candidateService(services.resultDatabase);
  const analysis = createSyntheticEvidenceAnalysisWorkflow({ sourceDatabase: f.admission, inspectMedia: f.media.inspect, profile: f.currentProfile(),
    admission: services.admission, reconcile: services.reconcile, reader: services.read, worker: worker.worker, checkpoint: checkpoint.service,
    persistence: candidates, wire: wire.wire, validator: createPersistedEvidenceCandidateValidator({ sourceDatabase: f.runtime,
      resultDatabase: services.resultDatabase, inspectMedia: f.media.inspect, profile: f.currentProfile() }) });
  const preparation = createPersistedNarrationPreparation({ database: await f.narrationReader(), inspectMedia: f.media.inspect, profile: f.currentProfile() });
  const persistence = options.persistence ?? await f.narrationPersistence();
  const dependencies = { analysis, candidateReader: candidates, preparation, persistence };
  return { ...dependencies, dependencies, workflow: createSyntheticNarrationWorkflow({ ...dependencies,
    afterCandidateForTest: options.afterCandidateForTest, afterPrepareForTest: options.afterPrepareForTest, afterPersistForTest: options.afterPersistForTest }),
    services, candidates, wire, deliveries, selection: f.sourceReference(), identity: f.currentRecipe(), taskScope: { ...scope, studioId: f.saved.studioId } };
}
async function setup(f: Fixture, options: Parameters<typeof compose>[1] = {}) {
  await f.configure("m404-analysis", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
  return compose(f, options);
}
async function counts(f: Fixture) {
  return (await f.admin.query(`SELECT (SELECT count(*) FROM public."StoryTask") tasks,
    (SELECT count(*) FROM public."StoryProviderSubmission") submissions,(SELECT count(*) FROM public."StoryTaskResult") results,
    (SELECT count(*) FROM public."StoryEvidenceCandidate") candidates,(SELECT count(*) FROM public."StoryNarrationDraft") narrations,
    (SELECT count(*) FROM public."StoryTestNarrationFence") fences,(SELECT count(*) FROM public."StorySourceVerification") verification,
    (SELECT count(*) FROM public."StoryScriptVersion") scripts,(SELECT count(*) FROM public."StoryTaskEvent") events`)).rows[0];
}
function recovery(result: { reference: { taskId: string; generation: number }; candidate: { id: string; candidateHash: string } }, taskScope: { projectId: string; movieId: string; studioId: string }) {
  return { scope: taskScope, reference: result.reference, candidateId: result.candidate.id, candidateHash: result.candidate.candidateHash };
}

for (const first of [true, false]) test(`M4-04 complete persisted workflow and duplicate invocation, M1 ${first ? "first" : "last"}`, { timeout: 120000 }, async () => {
  const f = await scratch(first);
  try {
    let prepared = 0;
    const x = await setup(f, { afterPrepareForTest: async () => { prepared++; } });
    assert.equal((await counts(f)).tasks, "0"); assert.equal(prepared, 0); assert.equal(x.wire.calls(), 0);
    const input = { decisionId: await f.issue(), selection: x.selection, identity: x.identity };
    const result = await x.workflow.run(input);
    if (result.outcome !== "NARRATION_READY") assert.fail("Narration not ready");
    assert.equal(result.view.status, "PROVISIONAL_CURRENT_AT_READ"); assert.equal(result.view.humanApproval, "NONE");
    assert.equal(result.narration.sourceVerified, false); assert.equal(result.view.payload.origin, "SYNTHETIC_TEST");
    assert.equal(result.view.payload.source.movieId, "movie-old"); assert.equal(result.view.payload.source.snapshotId, f.saved.snapshotId);
    assert.equal(result.view.payload.analysis.candidateId, result.candidate.id);
    assert.equal(result.view.payload.analysis.candidateHash, result.candidate.hash);
    assert.equal(result.view.payload.analysis.taskId, result.reference.taskId);
    assert.notEqual(result.candidate.hash, result.view.payload.analysis.resultHash);
    assert.equal(result.view.payload.beats[0].claims[0].statement, f.source.payload.transcript.segments[0].text);
    assert.equal(result.view.payload.beats[1].claims[0].kind, "INFERRED");
    assert(result.view.payload.beats[1].narration[0].text.includes("ဖြစ်နိုင်"));
    assert(result.view.payload.beats.every(beat => beat.narration.every(p => /\p{Script=Myanmar}/u.test(p.text))));
    assert.equal(result.view.payload.review.approval, "PROVISIONAL"); assert.equal(result.view.payload.duration.budgetMs, null);
    const admitted = f.source.admissions.find(row => row.status === "ADMITTED" && row.sequence === 0);
    assert(admitted?.status === "ADMITTED"); assert.equal(admitted.row.origin, "MANUAL"); assert.equal(admitted.row.reviewStatus, "NEEDS_REVIEW");
    assert(admitted.row.qcIssues.some(row => row.resolvedAt === null));
    const duplicate = await x.workflow.run(input);
    if (duplicate.outcome !== "NARRATION_READY") assert.fail("Duplicate not ready");
    assert.deepEqual(duplicate, result);
    const resumed = await x.workflow.resumeCompleted({ selection: x.selection, identity: x.identity, reference: result.reference });
    if (resumed.outcome !== "NARRATION_READY") assert.fail("Recovery not ready");
    assert.deepEqual(resumed, result);
    const selected = { scope: x.taskScope, reference: result.reference, candidateId: result.candidate.id, candidateHash: result.candidate.hash };
    assert.deepEqual(await x.workflow.resumeCandidate(selected), result);
    const before = await counts(f), beforePrepared = prepared;
    const read = await x.workflow.read({ scope: x.taskScope, narrationId: result.narration.id });
    assert.deepEqual(read, result.view); assert.deepEqual(await counts(f), before); assert.equal(prepared, beforePrepared);
    assert.equal((await x.workflow.read({ scope: x.taskScope, narrationId: "missing" })).status, "MISSING");
    assert.deepEqual({ ...before, events: undefined }, { tasks: "1", submissions: "1", results: "1", candidates: "1", narrations: "1", fences: "0", verification: "0", scripts: "1", events: undefined });
    assert.equal(x.wire.calls(), 1); assert.equal(x.deliveries.size, 1);
    for (const field of ["projectId", "movieId", "studioId"] as const) {
      const bad = { ...x.taskScope, [field]: "foreign-id" };
      await rejected(() => x.workflow.resumeCandidate({ ...selected, scope: bad }));
      await rejected(() => x.workflow.read({ scope: bad, narrationId: result.narration.id }));
    }
    await rejected(() => x.workflow.resumeCandidate({ ...selected, candidateHash: "0".repeat(64) }));
    await rejected(() => x.workflow.resumeCandidate({ ...selected, candidateId: "unknown" }));
    await rejected(() => x.workflow.resumeCandidate({ ...selected, sourceVerified: true }));
    await rejected(() => x.workflow.run({ ...input, approved: true }));
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
    const stored = (await f.admin.query(`SELECT "canonicalPayload","draftHash" FROM public."StoryNarrationDraft"`)).rows[0];
    assert.equal(stored.canonicalPayload, canonicalJson(result.view.payload)); assert.equal(stored.draftHash, contractHash(NARRATION_DRAFT.hashDomain, result.view.payload));
  } finally { await f.close(); }
});

test("M4-04 failed insert recovers concurrently from definitive result without a second send", async () => {
  const f = await scratch();
  try {
    await f.configure("m404-analysis", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const failing = await f.narrationPersistence({ afterInsertForTest: async () => { throw new Error("synthetic interruption"); } });
    const x = await compose(f, { persistence: failing }), input = { decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() };
    const ref = await x.services.admission.admit(input);
    await rejected(() => x.workflow.run(input));
    const before = await counts(f); assert.equal(before.narrations, "0"); assert.equal(before.fences, "0"); assert.equal(before.candidates, "1");
    const one = createSyntheticNarrationWorkflow({ ...x.dependencies, persistence: await f.narrationPersistence() });
    const two = createSyntheticNarrationWorkflow({ ...x.dependencies, persistence: await f.narrationPersistence({ separateConnection: true }) });
    const r = { selection: x.selection, identity: x.identity, reference: ref };
    const [a, b] = await Promise.all([one.resumeCompleted(r), two.resumeCompleted(r)]);
    if (a.outcome !== "NARRATION_READY" || b.outcome !== "NARRATION_READY") assert.fail("No recovery");
    assert.deepEqual(a, b); assert.deepEqual(await counts(f), { ...before, narrations: "1" }); assert.equal(x.wire.calls(), 1);
    assert.deepEqual(await one.resumeCandidate({ scope: x.taskScope, reference: ref, candidateId: a.candidate.id, candidateHash: a.candidate.hash }), a);
    assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

test("M4-04 interrupted receipt/readback recovers existing immutable record", async () => {
  const f = await scratch();
  try {
    const x = await setup(f, { afterPersistForTest: async () => { throw new Error("after commit crash"); } });
    const input = { decisionId: await f.issue(), selection: x.selection, identity: x.identity }, ref = await x.services.admission.admit(input);
    await rejected(() => x.workflow.run(input)); const before = await counts(f); assert.equal(before.narrations, "1");
    const stored = (await f.admin.query(`SELECT id,"canonicalPayload" FROM public."StoryNarrationDraft"`)).rows[0];
    const workflow = createSyntheticNarrationWorkflow(x.dependencies);
    const result = await workflow.resumeCompleted({ selection: x.selection, identity: x.identity, reference: ref });
    if (result.outcome !== "NARRATION_READY") assert.fail("No acknowledged recovery");
    assert.equal(result.narration.id, stored.id); assert.equal(canonicalJson(result.view.payload), stored.canonicalPayload);
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

for (const drift of ["SOURCE", "TRANSLATION", "MEDIA", "QC", "SCRIPT", "STUDIO"] as const)
  test(`M4-04 ${drift} drift between preparation and persistence denies publication`, async () => {
    const f = await scratch();
    try {
      const x = await setup(f, { afterPrepareForTest: async () => {
        if (drift === "SOURCE") await f.mutateSource(tx => tx.transcriptSegment.update({ where: { id: "source-0" }, data: { text: "Changed synthetic source" } }));
        if (drift === "TRANSLATION") await f.mutateSource(tx => tx.translatedSegment.update({ where: { id: "target-0" }, data: { text: "ပြောင်းလဲထားသော စာသား" } }));
        if (drift === "MEDIA") f.media.setInvalid(true);
        if (drift === "QC") await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed synthetic QC" } }));
        if (drift === "SCRIPT") await f.runtime.storylineStudio.update({ where: { id: f.saved.studioId }, data: { currentScriptVersionId: null } });
        if (drift === "STUDIO") await f.runtime.storylineStudio.update({ where: { id: f.saved.studioId }, data: { revision: { increment: 1 } } });
      } });
      const input = { decisionId: await f.issue(), selection: x.selection, identity: x.identity }, ref = await x.services.admission.admit(input);
      await rejected(() => x.workflow.run(input)); const before = await counts(f);
      assert.equal(before.narrations, "0"); assert.equal(before.candidates, "1"); assert.equal(before.fences, "0");
      await rejected(() => createSyntheticNarrationWorkflow(x.dependencies).resumeCompleted({ selection: x.selection, identity: x.identity, reference: ref }));
      assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
    } finally { await f.close(); }
  });

test("M4-04 source drift after commit does not return current or overwrite historical narration", async () => {
  const f = await scratch();
  try {
    const x = await setup(f, { afterPersistForTest: async () => {
      await f.mutateSource(tx => tx.translationQcIssue.update({ where: { id: "qc-0" }, data: { message: "Changed after narration commit" } }));
    } });
    const decisionId = await f.issue();
    await rejected(() => x.workflow.run({ decisionId, selection: x.selection, identity: x.identity }), "STORY_TASK_SOURCE_STALE");
    const before = await counts(f), row = (await f.admin.query(`SELECT id,"canonicalPayload" FROM public."StoryNarrationDraft"`)).rows[0];
    assert.equal((await x.workflow.read({ scope: x.taskScope, narrationId: row.id })).status, "STALE_DEPENDENCIES");
    assert.equal(before.narrations, "1"); assert.equal(x.wire.calls(), 1); assert.deepEqual(await counts(f), before);
  } finally { await f.close(); }
});

for (const first of [true, false]) test(`M4-04 targeting A never executes queued B or consumes B candidate, M1 ${first ? "first" : "last"}`, async () => {
  const f = await scratch(first);
  try {
    const admitted = [];
    for (const last of [10, 11]) {
      const key = `m404-window-${last}`, identity = await f.configure(key, "ANALYZE_EVIDENCE", last, EVIDENCE_ANALYSIS.version);
      const x = await compose(f), decisionId = await f.issue(), selection = f.sourceReference();
      const ref = await x.services.admission.admit({ decisionId, selection, identity });
      admitted.push({ key, last, identity, decisionId, selection, ref });
    }
    admitted.sort((a, b) => a.ref.taskId < b.ref.taskId ? -1 : 1); const [b, a] = admitted;
    await f.configure(a.key, "ANALYZE_EVIDENCE", a.last, EVIDENCE_ANALYSIS.version);
    let preparations = 0;
    const x = await compose(f, { afterPrepareForTest: async () => { preparations++; } });
    const input = { decisionId: a.decisionId, selection: a.selection, identity: a.identity };
    await rejected(() => x.workflow.run(input), "STORY_TASK_SCOPE_MISMATCH");
    assert.deepEqual([...x.deliveries.values()], [b.ref]); assert.equal(preparations, 0); assert.equal(x.wire.calls(), 0);
    assert.equal((await counts(f)).narrations, "0"); assert.equal((await counts(f)).results, "0");
    const ready = await x.workflow.run(input);
    if (ready.outcome !== "NARRATION_READY") assert.fail("A not ready");
    assert.equal(ready.reference.taskId, a.ref.taskId); assert.equal(ready.view.payload.analysis.taskId, a.ref.taskId);
    assert.equal((await x.services.read.get({ scope: x.taskScope, taskId: b.ref.taskId }))?.state, "QUEUED");
    assert.deepEqual((await f.admin.query(`SELECT state FROM public."StoryTaskEvent" WHERE "taskId"=$1`, [b.ref.taskId])).rows, [{ state: "QUEUED" }]);
    assert.deepEqual((await f.admin.query(`SELECT "taskId" FROM public."StoryNarrationDraft"`)).rows, [{ taskId: a.ref.taskId }]);
    assert.equal(x.wire.calls(), 1);
  } finally { await f.close(); }
});

test("M4-04 genuine completed candidate from B cannot satisfy task A recovery", async () => {
  const f = await scratch();
  try {
    const a = await setup(f), resultA = await a.workflow.run({ decisionId: await f.issue(), selection: a.selection, identity: a.identity });
    if (resultA.outcome !== "NARRATION_READY") assert.fail("A not ready");
    await f.configure("m404-B", "ANALYZE_EVIDENCE", 10, EVIDENCE_ANALYSIS.version);
    const b = await compose(f), resultB = await b.analysis.run({ decisionId: await f.issue(), selection: b.selection, identity: b.identity });
    if (resultB.outcome !== "CANDIDATE_READY") assert.fail("B not ready");
    const before = await counts(f), request = recovery(resultB, b.taskScope);
    let preparations = 0;
    const guarded = createSyntheticNarrationWorkflow({ ...b.dependencies, preparation: { prepare: async value => {
      preparations++; return b.preparation.prepare(value);
    } } });
    await rejected(() => guarded.resumeCandidate({ ...request, reference: resultA.reference }), "STORY_TASK_SCOPE_MISMATCH");
    await rejected(() => guarded.resumeCandidate({ scope: b.taskScope, reference: resultB.reference, candidateId: resultA.candidate.id, candidateHash: resultA.candidate.hash }));
    await rejected(() => guarded.resumeCandidate({ ...request, reference: { ...resultB.reference, generation: resultB.reference.generation + 1 } }));
    assert.equal(preparations, 0);
    assert.deepEqual(await counts(f), before); assert.equal(before.narrations, "1"); assert.equal(a.wire.calls(), 1); assert.equal(b.wire.calls(), 1);
  } finally { await f.close(); }
});

for (const scenario of ["UNKNOWN", "INCOMPLETE"] as const) test(`M4-04 ${scenario} cannot produce a narration or resend`, async () => {
  const f = await scratch();
  try {
    const x = await setup(f, { scenario: "LOST_RESPONSE" }), input = { decisionId: await f.issue(), selection: x.selection, identity: x.identity };
    const ref = await x.services.admission.admit(input);
    const result = scenario === "UNKNOWN" ? await x.workflow.run(input) : await x.workflow.resumeCompleted({ selection: x.selection, identity: x.identity, reference: ref });
    assert.equal(result.outcome, scenario === "UNKNOWN" ? "UNKNOWN" : "IN_PROGRESS");
    const before = await counts(f);
    for (let i = 0; i < 2; i++) {
      assert.equal((await x.workflow.resumeCompleted({ selection: x.selection, identity: x.identity, reference: ref })).outcome, result.outcome);
      await rejected(() => x.workflow.resumeCandidate({ scope: x.taskScope, reference: ref, candidateId: "missing", candidateHash: "0".repeat(64) }));
    }
    assert.deepEqual(await counts(f), before); assert.equal(before.narrations, "0"); assert.equal(before.candidates, "0");
    assert.equal(x.wire.calls(), scenario === "UNKNOWN" ? 1 : 0); assert.equal(x.deliveries.size, scenario === "UNKNOWN" ? 1 : 0);
  } finally { await f.close(); }
});

test("M4-04 wrong persistence role denies writes; corrected composition recovers without resend", async () => {
  const f = await scratch();
  try {
    await f.configure("m404-analysis", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const reader = await f.narrationReader();
    const wrong = createProvisionalNarrationPersistence({ database: reader, readerDatabase: reader, inspectMedia: f.media.inspect,
      profile: f.currentProfile(), validationKey: Buffer.alloc(32) });
    const x = await compose(f, { persistence: wrong }), input = { decisionId: await f.issue(), selection: x.selection, identity: x.identity };
    const ref = await x.services.admission.admit(input);
    await rejected(() => x.workflow.run(input)); assert.equal((await counts(f)).narrations, "0");
    const corrected = createSyntheticNarrationWorkflow({ ...x.dependencies, persistence: await f.narrationPersistence() });
    assert.equal((await corrected.resumeCompleted({ selection: x.selection, identity: x.identity, reference: ref })).outcome, "NARRATION_READY");
    assert.equal(x.wire.calls(), 1); assert.equal((await counts(f)).verification, "0");
  } finally { await f.close(); }
});

test("M4-04 conflicting historical bytes are never recreated or overwritten", async () => {
  const f = await scratch();
  try {
    const x = await setup(f), result = await x.analysis.run({ decisionId: await f.issue(), selection: x.selection, identity: x.identity });
    if (result.outcome !== "CANDIDATE_READY") assert.fail("No candidate");
    const request = recovery(result, x.taskScope), prepared = await x.preparation.prepare({ scope: request.scope, candidateId: request.candidateId, candidateHash: request.candidateHash });
    const bad = JSON.parse(canonicalJson(prepared.draft.payload)); bad.beats[0].narration[0].text = "မမှန်သော စာသား";
    const bytes = canonicalJson(bad), badHash = contractHash(NARRATION_DRAFT.hashDomain, bad);
    // New intentionally corrupt synthetic fixture; no existing history is edited.
    await f.admin.query(`INSERT INTO public."StoryNarrationDraft"(id,"projectId","movieId","studioId","candidateId","candidateHash","taskId",generation,"resultId","submissionId","resultHash",
      "sourceSnapshotId","sourceContentHash","sourceContextHash","sourceDependencyHash","sourceBindingHash","mediaSha256","expectedStudioRevision","recipeHash","profileHash",
      "schemaVersion","composerVersion","canonicalPayload","draftHash",origin,"reviewStatus",approval)
      SELECT 'conflict-fixture',c."projectId",c."movieId",c."studioId",c.id,c."candidateHash",c."taskId",c.generation,c."resultId",c."submissionId",c."resultHash",
        s.id,s."sourceContentHash",s."sourceContextHash",s."dependencyHash",s."sourceBindingHash",s."sourceSha256",c."expectedStudioRevision",c."recipeHash",c."profileHash",
        'story-narration-draft-v1','story-synthetic-narration-v1',$2,$3,'SYNTHETIC_TEST','NEEDS_HUMAN_REVIEW','PROVISIONAL'
      FROM public."StoryEvidenceCandidate" c JOIN public."StorySourceSnapshot" s ON s.id=c."sourceSnapshotId" WHERE c.id=$1`, [request.candidateId,bytes,badHash]);
    const before = await counts(f); await rejected(() => x.workflow.resumeCandidate(request)); await rejected(() => x.workflow.resumeCandidate(request));
    assert.deepEqual(await counts(f), before); assert.equal(x.wire.calls(), 1);
    assert.equal((await f.admin.query(`SELECT "canonicalPayload" FROM public."StoryNarrationDraft"`)).rows[0].canonicalPayload, bytes);
  } finally { await f.close(); }
});

test("M4-04 relationship narration preserves both captured character endpoints", async () => {
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
    const x = await setup(f), result = await x.workflow.run({ decisionId: await f.issue(), selection: x.selection, identity: x.identity });
    if (result.outcome !== "NARRATION_READY") assert.fail("No relationship narration");
    const beat = result.view.payload.beats.find(beat => beat.claims[0].relationshipRef === "relationship-ab");
    assert(beat); assert.deepEqual(beat.claims[0].characterRefs, ["character-a", "character-b"]);
    assert.equal(beat.claims[0].statement, "两人交谈"); assert.equal(beat.claims[0].evidence[0].segmentSequence, 0);
    assert.equal(result.view.payload.sections.find(section => section.beatId === beat.id)?.focus, "RELATIONSHIP_CONTEXT");
    assert(/\p{Script=Myanmar}/u.test(beat.narration[0].text));
    assert.equal(x.wire.calls(), 1); assert.equal((await counts(f)).verification, "0");
  } finally { await f.close(); }
});

test("M4-04 workflow remains unwired and cannot install production authority or transport", async () => {
  const code = await readFile("lib/storyline/narration-integration/synthetic-workflow.ts", "utf8");
  assert.match(code, /import "server-only"/);
  assert.doesNotMatch(code, /process\.env|fetch\(|new Worker|new Queue|setInterval|OPENROUTER|DATABASE_URL|\$queryRaw|\$executeRaw/);
  const { readdir } = await import("node:fs/promises");
  async function walk(directory: string): Promise<void> {
    for (const row of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}/${row.name}`;
      if (row.isDirectory()) await walk(path);
      else if (/\.[tj]sx?$/.test(row.name)) assert(!(await readFile(path, "utf8")).includes("createSyntheticNarrationWorkflow"), path);
    }
  }
  for (const root of ["app", "components", "workers"]) await walk(root);
});
