// Run: node --conditions=react-server --import tsx tests/storyline/evidence-analysis.test.ts
// Synthetic fixtures only: no database, media, Redis or provider transport.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import type { CandidateEvidence, CandidateFinding, EvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis";
import type { StorySourcePayload } from "../../lib/storyline/contracts";
import { validateEvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis";
import { createStoryTaskRecipe, storyTaskGenerationIdentity } from "../../lib/storyline/jobs/recipe";
import { StoryTaskContractError } from "../../lib/storyline/jobs/errors";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { StorylineContractError } from "../../lib/storyline/validation";
import { anchor, date, scope, sourceFixture } from "./fixtures";

before(() => { mock.method(globalThis, "fetch", () => { assert.fail("M3-01 must not reach a provider"); }); });
after(() => mock.restoreAll());

function setup() {
  const raw = sourceFixture();
  raw.preparation = {
    policyVersion: "story-source-preparation-v1", dependencyHash: "d".repeat(64), sourceBindingHash: "e".repeat(64), translationQcState: "SCAN_RECORDED",
    video: { format: "mp4", videoIndex: 0, videoCodec: "h264", width: 320, height: 240, timeBase: "1/12800", frameRate: "25/1", hasAudio: false },
    characterAnalysis: { id: "analysis-one", sourceHash: "f".repeat(64), provider: "synthetic", model: "fixture", createdAt: date, updatedAt: date },
    aliases: [], observations: [{ id: "observation-one", ownerKind: "CHARACTER", ownerId: "character-a", anchor: anchor(), sceneId: "scene-one", transcriptSegmentId: "source-0", kind: "BEHAVIOR", evidenceText: "人物甲说话", inference: "", confidence: "LOW", relationshipType: null, relationshipSummary: null, createdAt: date, updatedAt: null }],
    legacyRecapState: "ABSENT", legacyRecap: null,
  };
  const source = validateSourceSnapshot(raw, scope);
  const profile = { id: "synthetic-text", version: "v1", kind: "ANALYZE_EVIDENCE" as const, execution: "PAID_TEXT" as const, providerId: "synthetic", modelId: "synthetic/model", promptVersion: "p1", responseSchemaVersion: "story-evidence-candidate-v1", validatorVersion: "v1", policyVersion: "policy-v1", limits: { requestBytes: 100000, responseBytes: 50000, inputTokens: 1000, outputTokens: 500, timeoutMs: 1000 }, costPolicy: { id: "synthetic-quote", version: "v1", maxEstimatedUsdMicros: 10000 } };
  const recipe = createStoryTaskRecipe({ projectId: scope.projectId, movieId: scope.movieId, studioId: "studio-old", expectedStudioRevision: 3, sourceSnapshotId: source.payload.id, scriptVersionId: null, kind: "ANALYZE_EVIDENCE", profileId: profile.id, profileVersion: profile.version, window: { firstSegmentSequence: 0, lastSegmentSequence: 11 }, parentResultHashes: [] }, source, profile, null, { id: "studio-old", ...scope, revision: 3, currentSourceSnapshotId: source.payload.id, currentScriptVersionId: null });
  const admission = source.admissions.find(item => item.status === "ADMITTED" && item.sequence === 0);
  assert(admission?.status === "ADMITTED");
  const chinese = source.payload.transcript.segments[0].text;
  const observed: CandidateFinding = { id: "observation-a", classification: "OBSERVED", category: "DIALOGUE", subject: { characterIds: ["character-a"], relationshipId: null }, statement: chinese, confidence: "LOW", uncertainty: "NONE", evidence: [{ kind: "CHINESE_QUOTE", anchor: anchor(), segmentId: "source-0", sceneId: "scene-one", quote: chinese }], translationContextRefs: [{ translationSegmentId: admission.row.id, rowContextHash: admission.rowContextHash }], observedBasisIds: [], qualification: null };
  const inferred: CandidateFinding = { ...structuredClone(observed), id: "hypothesis-a", classification: "INFERRED", category: "MOTIVATION", statement: "Perhaps the character is worried", uncertainty: "POSSIBLE", observedBasisIds: ["observation-a"], qualification: "ဖြစ်နိုင်" };
  const candidate: EvidenceAnalysisCandidate = { schemaVersion: "story-evidence-candidate-v1", origin: "SYNTHETIC_TEST", task: { taskId: "task-one", generation: 0, recipeHash: recipe.recipeHash }, source: { projectId: scope.projectId, movieId: scope.movieId, studioId: recipe.recipe.studioId, snapshotId: source.payload.id, contentHash: source.sourceContentHash, contextHash: source.sourceContextHash, dependencyHash: source.payload.preparation!.dependencyHash, bindingHash: source.payload.preparation!.sourceBindingHash }, model: { providerId: "synthetic", modelId: "synthetic/model", profileId: profile.id, profileVersion: profile.version, responseSchemaVersion: profile.responseSchemaVersion }, findings: [observed, inferred], contradictions: [], openQuestions: [] };
  const generation = storyTaskGenerationIdentity({ taskId: "task-one", generation: 0 });
  return { source, recipe, candidate, observed, inferred, raw, profile, generation };
}

function validate(f = setup()) { return validateEvidenceAnalysisCandidate(f.candidate, f.source, f.recipe, f.generation, f.profile); }
function chineseEvidence(f: ReturnType<typeof setup>) { return f.candidate.findings[0].evidence[0] as Extract<CandidateEvidence, { kind: "CHINESE_QUOTE" }>; }
function reject(mutate: (fixture: ReturnType<typeof setup>) => void, rule?: string) {
  const f = setup(); mutate(f);
  assert.throws(() => validate(f), error => error instanceof StorylineContractError && (!rule || error.rule === rule) ||
    error instanceof StoryTaskContractError && (!rule || error.code === rule));
}

test("grounded Chinese dialogue and provisional Myanmar context remain unverified candidates", () => {
  const result = validate();
  assert.equal(result.trust, "PROVISIONAL_CANDIDATE");
  assert.equal(result.payload.findings[0].statement, setup().source.payload.transcript.segments[0].text);
  assert.equal(result.payload.findings[0].translationContextRefs.length, 1);
  assert.equal(result.payload.findings[1].classification, "INFERRED");
  assert.equal(Object.isFrozen(result.payload.findings[0]), true);
  assert(!JSON.stringify(result).includes("SOURCE_VERIFIED"));
});

test("multiple characters in one scene retain their own evidence ownership", () => {
  const f = setup();
  const raw = structuredClone(f.raw);
  raw.characters.push({ id: "character-b", ...scope, name: "人物乙", uncertain: false, evidence: [{ anchor: anchor(1), confidence: "LOW", evidenceText: "人物乙说话", inference: "" }] });
  raw.preparation!.observations.push({ ...raw.preparation!.observations[0], id: "observation-b", ownerId: "character-b", anchor: anchor(1), transcriptSegmentId: "source-1", evidenceText: "人物乙说话" });
  f.source = validateSourceSnapshot(raw, scope);
  const profile = { id: "synthetic-text", version: "v1", kind: "ANALYZE_EVIDENCE" as const, execution: "PAID_TEXT" as const, providerId: "synthetic", modelId: "synthetic/model", promptVersion: "p1", responseSchemaVersion: "story-evidence-candidate-v1", validatorVersion: "v1", policyVersion: "policy-v1", limits: { requestBytes: 100000, responseBytes: 50000, inputTokens: 1000, outputTokens: 500, timeoutMs: 1000 }, costPolicy: { id: "synthetic-quote", version: "v1", maxEstimatedUsdMicros: 10000 } };
  f.recipe = createStoryTaskRecipe({ projectId: scope.projectId, movieId: scope.movieId, studioId: "studio-old", expectedStudioRevision: 3, sourceSnapshotId: f.source.payload.id, scriptVersionId: null, kind: "ANALYZE_EVIDENCE", profileId: profile.id, profileVersion: profile.version, window: { firstSegmentSequence: 0, lastSegmentSequence: 11 }, parentResultHashes: [] }, f.source, profile, null, { id: "studio-old", ...scope, revision: 3, currentSourceSnapshotId: f.source.payload.id, currentScriptVersionId: null });
  f.candidate.task.recipeHash = f.recipe.recipeHash;
  f.candidate.source.contentHash = f.source.sourceContentHash; f.candidate.source.contextHash = f.source.sourceContextHash;
  f.candidate.findings.push({ ...structuredClone(f.observed), id: "observation-b", category: "BEHAVIOR", subject: { characterIds: ["character-b"], relationshipId: null }, statement: "人物乙说话", evidence: [{ kind: "CAPTURED_OBSERVATION", anchor: anchor(1), segmentId: "source-1", sceneId: "scene-one", observationId: "observation-b" }], translationContextRefs: [] });
  assert.equal(validate(f).payload.findings.length, 3);
  f.candidate.findings[2].subject.characterIds = ["character-a"];
  assert.throws(() => validate(f), error => error instanceof StorylineContractError && error.rule === "EVIDENCE_OWNERSHIP");
});

test("competing interpretations are explicit, provisional and hash stable", () => {
  const f = setup();
  f.candidate.findings[1].uncertainty = "COMPETING";
  f.candidate.findings.push({ ...structuredClone(f.inferred), id: "hypothesis-b", statement: "Perhaps the character is confident", uncertainty: "COMPETING" });
  f.candidate.contradictions.push({ firstFindingId: "hypothesis-a", secondFindingId: "hypothesis-b", explanation: "Opposing interpretations of the same utterance" });
  const first = validate(f);
  const second = validate({ ...f, candidate: structuredClone(f.candidate) });
  assert.equal(first.candidateHash, second.candidateHash);
  assert.equal(first.payload.contradictions.length, 1);
  f.candidate.findings[2].statement += "!";
  assert.notEqual(validate(f).candidateHash, first.candidateHash);
  f.candidate.findings[2].uncertainty = "POSSIBLE";
  assert.throws(() => validate(f), error => error instanceof StorylineContractError && error.rule === "INFERENCE_INVALID");
});

test("relationship findings require the exact relationship and both endpoint allowances", () => {
  const f = setup(), raw = structuredClone(f.raw);
  raw.characters.push({ id: "character-b", ...scope, name: "人物乙", uncertain: false, evidence: [{ anchor: anchor(), confidence: "LOW", evidenceText: "人物乙说话", inference: "" }] });
  raw.relationships.push({ id: "relationship-ab", ...scope, characterAId: "character-a", characterBId: "character-b", type: "ALLY", summary: "Possible alliance", confidence: "LOW", evidence: [{ anchor: anchor(), confidence: "LOW", evidenceText: "人物甲说话", inference: "" }] });
  raw.preparation!.observations.push({ ...raw.preparation!.observations[0], id: "observation-b", ownerId: "character-b", evidenceText: "人物乙说话" });
  raw.preparation!.observations.push({ ...raw.preparation!.observations[0], id: "observation-ab", ownerKind: "RELATIONSHIP", ownerId: "relationship-ab", kind: "RELATIONSHIP", relationshipType: "ALLY", relationshipSummary: "Possible alliance" });
  f.source = validateSourceSnapshot(raw, scope);
  f.recipe = createStoryTaskRecipe({ projectId: scope.projectId, movieId: scope.movieId, studioId: "studio-old", expectedStudioRevision: 3, sourceSnapshotId: f.source.payload.id, scriptVersionId: null, kind: "ANALYZE_EVIDENCE", profileId: f.profile.id, profileVersion: f.profile.version, window: { firstSegmentSequence: 0, lastSegmentSequence: 11 }, parentResultHashes: [] }, f.source, f.profile, null, { id: "studio-old", ...scope, revision: 3, currentSourceSnapshotId: f.source.payload.id, currentScriptVersionId: null });
  f.candidate.task.recipeHash = f.recipe.recipeHash;
  f.candidate.source.contentHash = f.source.sourceContentHash; f.candidate.source.contextHash = f.source.sourceContextHash;
  f.candidate.findings.push({ ...structuredClone(f.observed), id: "relationship-finding", category: "RELATIONSHIP", subject: { characterIds: ["character-a", "character-b"], relationshipId: "relationship-ab" }, evidence: [{ kind: "CAPTURED_OBSERVATION", anchor: anchor(), segmentId: "source-0", sceneId: "scene-one", observationId: "observation-ab" }], statement: "人物甲说话", translationContextRefs: [] });
  assert.equal(validate(f).payload.findings.length, 3);
  f.candidate.findings[2].confidence = "MEDIUM";
  assert.throws(() => validate(f), error => error instanceof StorylineContractError && error.rule === "CONFIDENCE_INVALID");
  f.candidate.findings[2].confidence = "LOW";
  f.candidate.findings[2].subject.characterIds = ["character-a"];
  assert.throws(() => validate(f), error => error instanceof StorylineContractError && error.rule === "EVIDENCE_OWNERSHIP");
});

test("weak evidence and unknown evidence are rejected", () => {
  reject(f => { f.candidate.findings[0].evidence = []; }, "SIZE_LIMIT");
  reject(f => { chineseEvidence(f).quote = "捏造的话"; }, "INVALID_ANCHOR");
  reject(f => { f.candidate.findings[0].evidence[0].segmentId = "missing"; }, "INVALID_ANCHOR");
  reject(f => { f.candidate.findings[0].evidence[0].anchor.segmentSequence = 8; f.candidate.findings[0].evidence[0].segmentId = "source-8"; }, "EVIDENCE_OWNERSHIP");
  reject(f => { f.candidate.findings[0].evidence[0].anchor.movieId = "other-movie"; }, "INVALID_ANCHOR");
  reject(f => { f.candidate.findings[0].evidence[0].anchor.sceneSequence = 99; }, "INVALID_ANCHOR");
  reject(f => { f.candidate.findings[0].statement = "Unsupported factual paraphrase"; }, "INVALID_ANCHOR");
  reject(f => { f.candidate.findings[0].category = "ACTION"; }, "INVALID_ANCHOR");
  reject(f => { f.candidate.findings[1].observedBasisIds = ["missing"]; }, "INFERENCE_INVALID");
  reject(f => { f.candidate.findings[1].classification = "OBSERVED"; }, "INFERENCE_INVALID");
  reject(f => { f.candidate.findings[1].confidence = "HIGH"; }, "INFERENCE_INVALID");
  reject(f => { f.candidate.findings[1].qualification = "certainly"; }, "INFERENCE_INVALID");
});

test("translation context remains advisory and exact row hashes are required", () => {
  reject(f => { f.candidate.findings[0].translationContextRefs[0].rowContextHash = "f".repeat(64); }, "STALE_CONTEXT");
  reject(f => { f.candidate.findings[0].translationContextRefs[0].translationSegmentId = "target-10"; }, "STALE_CONTEXT");
  reject(f => { f.candidate.findings[0].translationContextRefs.push(f.candidate.findings[0].translationContextRefs[0]); }, "DUPLICATE_ID");
  const f = setup(); assert.equal(f.source.admissions.find(row => row.sequence === 0)?.status, "ADMITTED");
  assert.equal(f.source.admissions.find(row => row.sequence === 10)?.status, "EXCLUDED_INVALID");
  assert.equal(f.source.admissions.find(row => row.sequence === 11)?.status, "MISSING");
  assert.equal(validate(f).payload.findings[0].translationContextRefs.length, 1);
});

test("snapshot, recipe, project, media and model bindings fail closed", () => {
  reject(f => { f.candidate.source.movieId = "other-movie"; }, "SCOPE_MISMATCH");
  reject(f => { f.candidate.source.dependencyHash = "a".repeat(64); }, "SCOPE_MISMATCH");
  reject(f => { f.candidate.task.recipeHash = "b".repeat(64); }, "STALE_CONTEXT");
  reject(f => { f.candidate.task.taskId = "task-forged"; }, "STALE_CONTEXT");
  reject(f => { f.candidate.task.generation = 1; }, "STALE_CONTEXT");
  reject(f => { f.candidate.model.modelId = "other/model"; }, "STALE_CONTEXT");
  reject(f => { f.candidate.model.profileId = "other-profile"; }, "STALE_CONTEXT");
  reject(f => { const raw = structuredClone(f.source.payload) as StorySourcePayload; raw.transcript.segments[0].text += "变更"; f.source = validateSourceSnapshot(raw, scope); }, "STORY_TASK_SOURCE_STALE");
  reject(f => { const raw = structuredClone(f.source.payload) as StorySourcePayload; raw.translation!.rows[0].text += " ပြင်ဆင်ချက်"; f.source = validateSourceSnapshot(raw, scope); }, "STORY_TASK_SOURCE_STALE");
  reject(f => { const raw = structuredClone(f.source.payload) as StorySourcePayload; raw.media.sha256 = "b".repeat(64); f.source = validateSourceSnapshot(raw, scope); }, "STORY_TASK_SOURCE_STALE");
});

test("strict unknown fields, Unicode, limits, duplicates and source bounds", () => {
  reject(f => { Object.assign(f.candidate, { trusted: true }); }, "UNKNOWN_FIELDS");
  reject(f => { Object.assign(f.candidate.findings[0], { sourceVerified: true }); }, "UNKNOWN_FIELDS");
  reject(f => { f.candidate.findings[0].statement = "\ud800"; }, "INVALID_TEXT");
  reject(f => { f.candidate.findings[1].statement = "x".repeat(1201); }, "SIZE_LIMIT");
  reject(f => { f.candidate.findings.push(structuredClone(f.observed)); }, "DUPLICATE_ID");
  reject(f => { f.candidate.openQuestions.push({ id: "question-one", reason: "INSUFFICIENT_EVIDENCE", question: "What is unknown?", anchor: { ...anchor(), sceneSequence: 99 } }); }, "INVALID_ANCHOR");
  reject(f => { (f.candidate as unknown as { schemaVersion: string }).schemaVersion = "future-version"; }, "INVALID_ENUM");
  reject(f => { f.profile.limits.responseBytes = 128; }, "SIZE_LIMIT");
});

test("candidate schema must match the immutable M2 response profile", () => {
  const f = setup();
  f.profile.responseSchemaVersion = "different-response-v1";
  f.recipe = createStoryTaskRecipe({ projectId: scope.projectId, movieId: scope.movieId, studioId: "studio-old", expectedStudioRevision: 3,
    sourceSnapshotId: f.source.payload.id, scriptVersionId: null, kind: "ANALYZE_EVIDENCE", profileId: f.profile.id,
    profileVersion: f.profile.version, window: { firstSegmentSequence: 0, lastSegmentSequence: 11 }, parentResultHashes: [] },
  f.source, f.profile, null, { id: "studio-old", ...scope, revision: 3, currentSourceSnapshotId: f.source.payload.id, currentScriptVersionId: null });
  f.candidate.task.recipeHash = f.recipe.recipeHash;
  f.candidate.model.responseSchemaVersion = f.profile.responseSchemaVersion;
  assert.throws(() => validate(f), error => error instanceof StorylineContractError && error.rule === "STALE_CONTEXT");
});
