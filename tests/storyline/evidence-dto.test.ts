import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { canonicalJson } from "../../lib/storyline/canonical";
import { projectPreparedEvidence, EVIDENCE_DTO_LIMITS } from "../../lib/storyline/evidence-dto";
import { prepareStorylineSource, type PreparedStorylineCandidate } from "../../lib/storyline/prepare-source";
import { StorylineContractError } from "../../lib/storyline/validation";
import { preparationFixture, addRelationship, refreshCharacterHash } from "./preparation.fixture";
import { scope } from "./fixtures";

const selection = { sceneSequence: 0, segmentSequence: 0, qcOffset: 0, observationOffset: 0, limit: 8 };
before(() => { mock.method(globalThis, "fetch", () => assert.fail("No API/provider calls allowed")); });
after(() => mock.restoreAll());
const rule = (rule: StorylineContractError["rule"]) => (error: unknown) => error instanceof StorylineContractError && error.rule === rule;

test("server projection keeps exact selected Chinese/Myanmar text, timing, provenance and provisional identity", async () => {
  const deps = preparationFixture(), candidate = await prepareStorylineSource(scope, deps), before = canonicalJson(candidate);
  const calls = deps.calls.length, dto = projectPreparedEvidence(candidate, scope, selection);
  assert.equal(dto.movieId, "movie-old"); assert.equal(dto.projectId, scope.projectId);
  assert.equal(dto.chinese.text, "  中文对话 0。\n"); assert.equal(dto.chinese.complete, true);
  assert.equal(dto.translation.row!.text, "  မြန်မာစာ 0။\n"); assert.equal(dto.translation.row!.complete, true);
  assert.equal(dto.translation.row!.origin, "MANUAL"); assert.equal(dto.translation.row!.reviewStatus, "NEEDS_REVIEW");
  assert.equal(dto.translation.row!.editedAt, candidate.snapshot.payload.translation!.rows[0].editedAt);
  assert.equal(dto.translation.row!.revision, 2); assert.equal(dto.translation.row!.translationRevision, 3);
  assert.equal(dto.translation.status, "ADMITTED"); assert.equal(dto.translation.independentEvidence, false);
  assert.equal(dto.translation.qc.activeCount, 1); assert.equal(dto.translation.qc.resolvedCount, 0);
  assert.equal(dto.kind, "PREPARED_CONTEXT"); assert.equal(dto.persisted, false); assert.equal(dto.approved, false);
  assert.equal(dto.freshness, "RECHECKED_AT_PREPARATION_ONLY"); assert.equal(dto.semanticVerification, "NOT_PERFORMED");
  assert.equal(canonicalJson(candidate), before); assert.equal(deps.calls.length, calls);
  assert.equal(canonicalJson(projectPreparedEvidence(candidate, scope, selection)), canonicalJson(dto));
  assert.ok(Object.isFrozen(dto.translation.row)); assert.ok(Object.isFrozen(dto.observations.items));
});

test("bounded allowlist omits the private manifest, storage binding, media identity and internal tokens", async () => {
  const dto = projectPreparedEvidence(await prepareStorylineSource(scope, preparationFixture()), scope, selection);
  const json = canonicalJson(dto);
  assert.ok(Buffer.byteLength(json) <= EVIDENCE_DTO_LIMITS.bytes);
  assert.doesNotMatch(json, /snapshot|payload|preparation|sourceBindingHash|dependencyHash|sha256|storageKey|refinementJobId|manualSourceHash|OPENROUTER_API_KEY|DATABASE_URL|movies\//);
  assert.equal(dto.chinese.startMs, 0); assert.equal(dto.chinese.endMs, 2000);
});

test("one scene exposes only each selected anchor's own character/relationship allowance", async () => {
  const candidate = await prepareStorylineSource(scope, preparationFixture());
  const first = projectPreparedEvidence(candidate, scope, selection);
  const second = projectPreparedEvidence(candidate, scope, { ...selection, segmentSequence: 1 });
  assert.deepEqual(first.allowedCharacterIds, ["character-a"]); assert.deepEqual(second.allowedCharacterIds, []);
  assert.deepEqual(first.allowedRelationshipIds, []); assert.equal(first.observations.items[0].ownerId, "character-a");
  assert.equal(second.observations.total, 0);
  assert.equal(second.translation.row!.reviewStatus, "APPROVED"); assert.equal(second.semanticVerification, "NOT_PERFORMED");
  assert.equal(second.translation.qc.resolvedCount, 1);
});

test("relationship evidence cannot be borrowed from character anchors or the project-wide summary", async () => {
  const deps = preparationFixture(); addRelationship(deps.movie);
  const candidate = await prepareStorylineSource(scope, deps);
  const character = projectPreparedEvidence(candidate, scope, selection);
  const relationship = projectPreparedEvidence(candidate, scope, { ...selection, segmentSequence: 2 });
  assert.deepEqual(character.allowedRelationshipIds, []);
  assert.deepEqual(relationship.allowedRelationshipIds, ["relationship-one"]);
  assert.deepEqual(relationship.allowedCharacterIds, []);
  assert.equal(relationship.observations.items[0].ownerKind, "RELATIONSHIP");
  assert.equal(relationship.observations.items[0].relationshipSummary, "  本电影中的合作。  ");
  assert.doesNotMatch(canonicalJson(relationship), /Shared project summary/);
});

for (const sequence of [9, 10, 11]) test(`missing/stale/invalid translation at segment ${sequence} is never draft context`, async () => {
  const candidate = await prepareStorylineSource(scope, preparationFixture());
  const dto = projectPreparedEvidence(candidate, scope, { ...selection, segmentSequence: sequence });
  assert.equal(dto.translation.mayInformDraft, false);
  assert.equal(dto.translation.status, sequence === 9 ? "EXCLUDED_STALE" : sequence === 10 ? "EXCLUDED_INVALID" : "MISSING");
  if (sequence === 11) assert.equal(dto.translation.row, null);
});

test("missing translation and unscanned QC are distinct from clean or approved", async () => {
  const deps = preparationFixture(); deps.movie.translation!.qcScannedAt = null;
  assert.equal(projectPreparedEvidence(await prepareStorylineSource(scope, deps), scope, selection).translation.qc.scanState, "UNSCANNED");
  deps.movie.translation = null;
  refreshCharacterHash(deps.movie);
  const dto = projectPreparedEvidence(await prepareStorylineSource(scope, deps), scope, selection);
  assert.equal(dto.translation.qc.scanState, "TRANSLATION_MISSING"); assert.equal(dto.translation.row, null);
});

test("scope, anchor and strict window validation reject foreign or malformed selections", async () => {
  const candidate = await prepareStorylineSource(scope, preparationFixture());
  assert.throws(() => projectPreparedEvidence(candidate, { ...scope, movieId: "movie-new" }, selection), rule("SCOPE_MISMATCH"));
  assert.throws(() => projectPreparedEvidence(candidate, { ...scope, projectId: "foreign-project" }, selection), rule("SCOPE_MISMATCH"));
  for (const bad of [{ ...selection, sceneSequence: 1 }, { ...selection, segmentSequence: 99 }]) assert.throws(() => projectPreparedEvidence(candidate, scope, bad), rule("INVALID_ANCHOR"));
  for (const bad of [null, {}, { ...selection, extra: true }, { ...selection, limit: 0 }, { ...selection, limit: 9 }, { ...selection, qcOffset: 2 }, { ...selection, observationOffset: 2 }, { ...selection, segmentSequence: -1 }]) assert.throws(() => projectPreparedEvidence(candidate, scope, bad), StorylineContractError);
});

test("forged persisted/approved wrapper, hash or admission is rejected", async () => {
  const candidate = await prepareStorylineSource(scope, preparationFixture());
  for (const change of ["persisted", "approved", "hash", "admission"] as const) {
    const copy = structuredClone(candidate) as unknown as { persisted: boolean; approved: boolean; snapshot: { sourceContextHash: string; admissions: { status: string }[] } };
    if (change === "persisted" || change === "approved") copy[change] = true;
    if (change === "hash") copy.snapshot.sourceContextHash = "f".repeat(64);
    if (change === "admission") copy.snapshot.admissions[9].status = "ADMITTED";
    assert.throws(() => projectPreparedEvidence(copy as unknown as PreparedStorylineCandidate, scope, selection), StorylineContractError);
  }
});

test("QC and observations paginate deterministically without truncating any selected text", async () => {
  const deps = preparationFixture(), findings = deps.movie.translation!.segments[0].qcIssues;
  const observation = deps.movie.characterAnalysis!.evidence[0];
  for (let index = 1; index < 12; index++) {
    findings.push({ ...findings[0], id: `qc-page-${String(index).padStart(2, "0")}` });
    deps.movie.characterAnalysis!.evidence.push({ ...observation, id: `observation-page-${String(index).padStart(2, "0")}` });
  }
  const candidate = await prepareStorylineSource(scope, deps);
  const first = projectPreparedEvidence(candidate, scope, selection), second = projectPreparedEvidence(candidate, scope, { ...selection, qcOffset: 8, observationOffset: 8 });
  assert.equal(first.translation.qc.total, 12); assert.equal(first.translation.qc.items.length, 8); assert.equal(first.translation.qc.nextOffset, 8);
  assert.equal(second.translation.qc.items.length, 4); assert.equal(second.translation.qc.nextOffset, null);
  assert.equal(first.observations.items.length, 8); assert.equal(second.observations.items.length, 4);
  assert.equal(new Set([...first.observations.items, ...second.observations.items].map(row => row.id)).size, 12);
  assert.equal(first.chinese.text, second.chinese.text);
});

test("oversized exact evidence view fails safely; explicit smaller page preserves original content", async () => {
  const deps = preparationFixture(), observation = deps.movie.characterAnalysis!.evidence[0];
  const exact = "က".repeat(6000);
  observation.evidenceText = exact; observation.inference = exact;
  for (let index = 1; index < 8; index++) deps.movie.characterAnalysis!.evidence.push({ ...observation, id: `observation-large-${index}` });
  const candidate = await prepareStorylineSource(scope, deps);
  assert.throws(() => projectPreparedEvidence(candidate, scope, selection), rule("SIZE_LIMIT"));
  const dto = projectPreparedEvidence(candidate, scope, { ...selection, limit: 1 });
  assert.equal(dto.observations.items[0].evidenceText, exact); assert.equal(dto.observations.nextOffset, 1);
});
