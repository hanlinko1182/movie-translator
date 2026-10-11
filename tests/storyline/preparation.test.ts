import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { prepareStorylineSource } from "../../lib/storyline/prepare-source";
import { StorylinePreparationError } from "../../lib/storyline/preparation-errors";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { validateScriptPayload } from "../../lib/storyline/script";
import { evaluateSourceReview } from "../../lib/storyline/verification";
import { canonicalJson } from "../../lib/storyline/canonical";
import { scope, scriptFixture } from "./fixtures";
import { preparationFixture, refreshCharacterHash, addRecap, addRelationship, sourceKey } from "./preparation.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No provider or API calls allowed")); });
after(() => mock.restoreAll());
const code = (code: StorylinePreparationError["code"]) => (error: unknown) => error instanceof StorylinePreparationError && error.code === code;

test("exact older movie: coherent 12-segment/one-scene candidate, no writes and no trusted approval", async () => {
  const deps = preparationFixture(), before = structuredClone(deps.movie), result = await prepareStorylineSource(scope, deps);
  assert.equal(result.kind, "PREPARED_CANDIDATE"); assert.equal(result.persisted, false); assert.equal(result.approved, false);
  const source = result.snapshot; assert.equal(source.payload.movieId, "movie-old"); assert.equal(source.payload.scenes.length, 1); assert.equal(source.payload.transcript.segments.length, 12);
  assert.equal(source.payload.transcript.segments[0].text, "  中文对话 0。\n"); assert.equal(source.payload.preparation!.aliases[0].values[0], "  甲  ");
  assert.equal(source.payload.preparation!.observations[0].evidenceText, "  人物甲说话。  ");
  assert.equal(deps.transactions, 2); assert.equal(deps.inspections, 1); assert.equal(deps.calls.filter(row => row === "READ_ONLY").length, 2); assert.deepEqual(deps.movie, before);
  assert.ok(Object.isFrozen(source.payload.preparation!.observations[0])); assert.ok(!canonicalJson(result).includes("movies/"));
  const script = validateScriptPayload(scriptFixture(source), source); assert.equal(script.payload.beats.length, 2); assert.equal(evaluateSourceReview(source, script).sourceEligible, false);
});
test("ALL_CURRENT preserves approvals, MANUAL metadata, active/resolved QC, missing/stale/invalid rows", async () => {
  const deps = preparationFixture(), { snapshot } = await prepareStorylineSource(scope, deps);
  const targets = snapshot.payload.translation!.rows;
  assert.equal(targets[0].origin, "MANUAL"); assert.equal(targets[0].reviewStatus, "NEEDS_REVIEW"); assert.equal(targets[0].text, "  မြန်မာစာ 0။\n");
  assert.equal(targets[1].reviewStatus, "APPROVED"); assert.equal(targets[2].reviewStatus, "UNREVIEWED");
  assert.equal(targets[0].qcIssues[0].source, "MANUAL"); assert.equal(targets[0].qcIssues[0].resolvedAt, null); assert.ok(targets[1].qcIssues[0].resolvedAt);
  assert.equal(snapshot.payload.preparation!.translationQcState, "SCAN_RECORDED");
  assert.deepEqual(snapshot.admissions.map(row => row.status), [...Array(9).fill("ADMITTED"), "EXCLUDED_STALE", "EXCLUDED_INVALID", "MISSING"]);
});
test("missing translation and unscanned QC remain honest, with zero approval prerequisites", async () => {
  const deps = preparationFixture(); deps.movie.translation!.qcScannedAt = null; deps.movie.translation!.segments.forEach(row => { row.reviewStatus = "UNREVIEWED"; });
  let result = await prepareStorylineSource(scope, deps); assert.equal(result.snapshot.payload.translation!.qcScannedAt, null); assert.equal(result.snapshot.admissions[1].status, "ADMITTED");
  assert.equal(result.snapshot.payload.preparation!.translationQcState, "UNSCANNED");
  deps.movie.translation = null; refreshCharacterHash(deps.movie);
  result = await prepareStorylineSource(scope, deps); assert.ok(result.snapshot.admissions.every(row => row.status === "MISSING"));
  assert.equal(result.snapshot.payload.preparation!.translationQcState, "TRANSLATION_MISSING");
});
test("stale whole translation is explicitly excluded instead of falling back", async () => {
  const deps = preparationFixture(); deps.movie.translation!.sourceTranscriptId = "older-transcript"; refreshCharacterHash(deps.movie);
  const result = await prepareStorylineSource(scope, deps); assert.ok(result.snapshot.admissions.filter(row => row.status !== "MISSING").every(row => row.status === "EXCLUDED_STALE"));
});
test("Chinese language aliases are preserved for movie/transcript, not rewritten", async () => {
  const deps = preparationFixture(); deps.movie.transcript!.language = "cmn";
  const result = await prepareStorylineSource(scope, deps); assert.equal(result.snapshot.payload.sourceLanguage, "zh"); assert.equal(result.snapshot.payload.transcript.language, "cmn");
});
test("selection never falls back to a different/newest movie or project", async () => {
  const deps = preparationFixture();
  await assert.rejects(prepareStorylineSource({ ...scope, movieId: "missing" }, deps), code("MOVIE_NOT_FOUND"));
  await assert.rejects(prepareStorylineSource({ ...scope, projectId: "wrong" }, deps), code("PROJECT_MOVIE_MISMATCH"));
  assert.equal(deps.inspections, 0);
});
for (const prerequisite of ["transcript", "scenes", "analysis", "stale-analysis"] as const) test(`missing/stale prerequisite: ${prerequisite}`, async () => {
  const deps = preparationFixture();
  if (prerequisite === "transcript") deps.movie.transcript = null;
  if (prerequisite === "scenes") deps.movie.scenes = [];
  if (prerequisite === "analysis") deps.movie.characterAnalysis = null;
  if (prerequisite === "stale-analysis") deps.movie.characterAnalysis!.sourceHash = "b".repeat(64);
  await assert.rejects(prepareStorylineSource(scope, deps), code(prerequisite === "transcript" ? "TRANSCRIPT_NOT_FOUND" : prerequisite === "scenes" ? "SCENES_REQUIRED" : "CHARACTER_CONTEXT_REQUIRED"));
  assert.equal(deps.inspections, 0);
});
test("character anchor zero cannot be expanded to segment one by an approved translation", async () => {
  const deps = preparationFixture(), { snapshot } = await prepareStorylineSource(scope, deps), payload = scriptFixture(snapshot);
  payload.beats[1].claims[0].characterRefs = ["character-a"]; assert.throws(() => validateScriptPayload(payload, snapshot));
});
test("multiple observations at one anchor retain exact content and minimum confidence", async () => {
  const deps = preparationFixture(), run = deps.movie.characterAnalysis!;
  run.evidence.push({ ...structuredClone(run.evidence[0]), id: "observation-two", evidenceText: "不同的原始证据", inference: "原始推断", confidence: "HIGH" });
  const { snapshot } = await prepareStorylineSource(scope, deps);
  assert.equal(snapshot.payload.preparation!.observations.length, 2); assert.equal(snapshot.payload.characters[0].evidence.length, 1); assert.equal(snapshot.payload.characters[0].evidence[0].confidence, "LOW");
  assert.equal(snapshot.payload.preparation!.observations[1].evidenceText, "不同的原始证据");
});
test("current persisted recap is advisory and keeps exact text and historical child IDs", async () => {
  const deps = preparationFixture(); await addRecap(deps.movie); const { snapshot } = await prepareStorylineSource(scope, deps), prep = snapshot.payload.preparation!;
  assert.equal(prep.legacyRecapState, "CURRENT_ADVISORY"); assert.equal(prep.legacyRecap!.output.title, "  အကျဉ်းချုပ်  ");
  assert.deepEqual(prep.legacyRecap!.childIds.evidence, ["recap-evidence-one"]);
  const historical = canonicalJson(snapshot); deps.movie.recap = null; deps.movie.scenes[0].id = "replacement-scene"; assert.equal(canonicalJson(snapshot), historical);
});
test("stale or invalid recap never supplies advisory context or expands character anchors", async () => {
  const deps = preparationFixture(); await addRecap(deps.movie); deps.movie.recap!.sourceHash = "b".repeat(64);
  let result = await prepareStorylineSource(scope, deps); assert.equal(result.snapshot.payload.preparation!.legacyRecapState, "EXCLUDED_STALE"); assert.equal(result.snapshot.payload.preparation!.legacyRecap, null);
  await addRecap(deps.movie); deps.movie.recap!.evidence[0].movieId = "wrong-movie";
  result = await prepareStorylineSource(scope, deps); assert.equal(result.snapshot.payload.preparation!.legacyRecapState, "EXCLUDED_INVALID"); assert.equal(result.snapshot.payload.preparation!.legacyRecap, null);
});
for (const change of ["transcript", "translation", "approval", "qc", "qc-scan", "alignment", "scene", "character", "alias", "binding", "delete"] as const) test(`${change} change between reads rejects as stale without writes`, async () => {
  const deps = preparationFixture(); deps.onInspect(() => {
    if (change === "transcript") deps.movie.transcript!.segments[0].text += "变更";
    if (change === "translation") deps.movie.translation!.segments[1].text += " ပြင်ဆင်ချက်။";
    if (change === "approval") deps.movie.translation!.segments[2].reviewStatus = "APPROVED";
    if (change === "qc") deps.movie.translation!.segments[0].qcIssues[0].resolvedAt = new Date("2026-10-02T00:00:00.000Z");
    if (change === "qc-scan") deps.movie.translation!.qcScannedAt = null;
    if (change === "alignment") deps.movie.translation!.segments[2].endMs++;
    if (change === "scene") deps.movie.scenes[0].endMs--;
    if (change === "character") deps.movie.characterAnalysis!.evidence[0].evidenceText += "变更";
    if (change === "alias") deps.movie.characterAnalysis!.evidence[0].character.aliases[0].alias += "变更";
    if (change === "binding") deps.movie.storageKey = "movies/00000000-0000-4000-8000-000000000024.mp4";
    if (change === "delete") deps.movie.transcript = null;
  });
  await assert.rejects(prepareStorylineSource(scope, deps), code("STALE_STORYLINE_SOURCE"));
});
test("media replacement during final check rejects rather than returning a stale candidate", async () => {
  const deps = preparationFixture(); deps.onFinalCheck(() => { throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED"); });
  await assert.rejects(prepareStorylineSource(scope, deps), code("SOURCE_MEDIA_CHANGED"));
});
for (const errorCode of ["SOURCE_MEDIA_MISSING", "SOURCE_MEDIA_INVALID", "SOURCE_PROFILE_UNSUPPORTED", "STORAGE_UNAVAILABLE"] as const) test(`${errorCode} is controlled and never persists anything`, async () => {
  const deps = preparationFixture();
  await assert.rejects(prepareStorylineSource(scope, { ...deps, inspectMedia: async () => { throw new StorylinePreparationError(errorCode); } }), code(errorCode));
  assert.equal(deps.transactions, 1);
});
test("recorded size mismatch and substituted media binding reject", async () => {
  const deps = preparationFixture(); deps.movie.fileSizeBytes = BigInt(100);
  await assert.rejects(prepareStorylineSource(scope, deps), code("SOURCE_MEDIA_CHANGED"));
  deps.movie.fileSizeBytes = BigInt(4096);
  await assert.rejects(prepareStorylineSource(scope, { ...deps, inspectMedia: async key => ({ ...await deps.inspectMedia(key), storageKey: "another-source" }) }), code("SOURCE_MEDIA_CHANGED"));
});
test("equivalent reads/capture timestamps preserve hashes; actual content/provenance changes invalidate", async () => {
  const deps = preparationFixture(), first = await prepareStorylineSource(scope, deps);
  const second = await prepareStorylineSource(scope, { ...deps, now: () => "2026-10-02T00:00:00.000Z" });
  assert.equal(first.snapshot.sourceContextHash, second.snapshot.sourceContextHash); assert.equal(first.snapshot.sourceContentHash, second.snapshot.sourceContentHash);
  deps.movie.translation!.segments[1].text += " ပြင်ဆင်ချက်။"; refreshCharacterHash(deps.movie);
  const third = await prepareStorylineSource(scope, deps); assert.notEqual(first.snapshot.sourceContentHash, third.snapshot.sourceContentHash);
  deps.movie.translation!.segments[2].reviewStatus = "APPROVED";
  const fourth = await prepareStorylineSource(scope, deps); assert.notEqual(third.snapshot.sourceContextHash, fourth.snapshot.sourceContextHash); assert.equal(third.snapshot.sourceContentHash, fourth.snapshot.sourceContentHash);
});
test("parallel preparations are independent, deterministic and write-free", async () => {
  const deps = preparationFixture(), before = structuredClone(deps.movie);
  const results = await Promise.all(Array.from({ length: 8 }, () => prepareStorylineSource(scope, { ...deps, inspectMedia: async key => {
    // Other calls can have read transactions open; this call's DB view was closed.
    return { storageKey: key!, sha256: "a".repeat(64), sizeBytes: 4096, durationMs: 24000, video: { format: "mp4", videoIndex: 0, videoCodec: "h264", width: 320, height: 240, timeBase: "1/12800", frameRate: "25/1", hasAudio: false }, assertUnchanged: async () => {} };
  } })));
  assert.equal(new Set(results.map(row => row.snapshot.sourceContextHash)).size, 1); assert.deepEqual(deps.movie, before); assert.equal(deps.transactions, 16);
});
test("optional capture validation rejects modified observation/recap ownership and unknown metadata", async () => {
  const deps = preparationFixture(), { snapshot } = await prepareStorylineSource(scope, deps), raw = structuredClone(snapshot.payload);
  const invalid = { ...raw, preparation: { ...raw.preparation!, observations: raw.preparation!.observations.map(row => ({ ...row, ownerId: "wrong-character" })) } };
  assert.throws(() => validateSourceSnapshot(invalid, scope));
  assert.throws(() => validateSourceSnapshot({ ...snapshot.payload, preparation: { ...snapshot.payload.preparation!, path: "/synthetic/private" } }, scope));
});
test("database failure keeps raw credentials, source text and paths out of errors", async () => {
  const deps = preparationFixture(); deps.onInspect(() => { throw new Error("PRIVATE_CONTENT credential /synthetic/private/path"); });
  await assert.rejects(prepareStorylineSource(scope, deps), error => error instanceof StorylinePreparationError && !JSON.stringify(error).includes("PRIVATE_CONTENT") && !error.message.includes("credential"));
});

test("relationship context freezes this movie's observations and exact endpoint ownership", async () => {
  const deps = preparationFixture(); addRelationship(deps.movie);
  const { snapshot } = await prepareStorylineSource(scope, deps), relation = snapshot.payload.relationships[0];
  assert.equal(relation.type, "ALLY"); assert.equal(relation.summary, "  本电影中的合作。  ");
  assert.equal(relation.characterAId, "character-a"); assert.equal(relation.characterBId, "character-b");
  assert.deepEqual(relation.evidence.map(row => row.anchor.segmentSequence), [2]);
  assert.deepEqual(snapshot.payload.characters[0].evidence.map(row => row.anchor.segmentSequence), [0]);
  assert.equal(snapshot.payload.preparation!.observations.find(row => row.ownerKind === "RELATIONSHIP")!.relationshipSummary, relation.summary);
  deps.onInspect(() => { deps.movie.characterAnalysis!.relationshipEvidence[0].relationshipSummary += "changed"; });
  await assert.rejects(prepareStorylineSource(scope, deps), code("STALE_STORYLINE_SOURCE"));
});
for (const invalid of ["character-binding", "alias-binding", "relationship-binding", "relationship-project", "relationship-endpoint", "evidence-movie", "evidence-scene", "evidence-segment"] as const) test(`invalid authoritative ownership rejects: ${invalid}`, async () => {
  const deps = preparationFixture(); addRelationship(deps.movie);
  const run = deps.movie.characterAnalysis!, relation = run.relationshipEvidence[0];
  switch (invalid) {
    case "character-binding": run.evidence[0].character.id = "wrong"; break;
    case "alias-binding": run.evidence[0].character.aliases[0].characterId = "wrong"; break;
    case "relationship-binding": relation.relationship.id = "wrong"; break;
    case "relationship-project": relation.relationship.projectId = "wrong"; break;
    case "relationship-endpoint": relation.relationship.characterBId = "wrong"; break;
    case "evidence-movie": relation.movieId = "wrong"; break;
    case "evidence-scene": relation.sceneId = "wrong"; break;
    case "evidence-segment": relation.transcriptSegmentId = "wrong"; break;
  }
  await assert.rejects(prepareStorylineSource(scope, deps), error => error instanceof StorylinePreparationError && ["STORYLINE_SOURCE_INVALID", "CHARACTER_CONTEXT_REQUIRED"].includes(error.code));
  assert.equal(deps.inspections, 0);
});

test("equivalent unordered database collections retain canonical context identity", async () => {
  const deps = preparationFixture(); addRelationship(deps.movie);
  const first = await prepareStorylineSource(scope, deps);
  deps.movie.characterAnalysis!.evidence.reverse();
  // SQL orders source sequences; the service also canonicalizes its captured collections.
  deps.movie.translation!.segments.reverse();
  refreshCharacterHash(deps.movie);
  const second = await prepareStorylineSource(scope, deps);
  assert.equal(first.snapshot.sourceContextHash, second.snapshot.sourceContextHash);
});

test("malformed explicit selection is rejected before any database or media access", async () => {
  const deps = preparationFixture();
  for (const input of [null, {}, { ...scope, movieId: "../movie" }, { ...scope, storageKey: sourceKey }, { projectId: scope.projectId }]) await assert.rejects(prepareStorylineSource(input, deps));
  assert.equal(deps.transactions, 0); assert.equal(deps.inspections, 0);
});
