// Run: node --conditions=react-server --import tsx tests/storyline/jobs/contracts.test.ts
// Pure synthetic fixtures. No application database, Redis, media or provider access.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { canonicalJson } from "../../../lib/storyline/canonical";
import type { StorySourcePayload, StorySourceSnapshot, StoryScriptVersion } from "../../../lib/storyline/contracts";
import { validateScriptPayload } from "../../../lib/storyline/script";
import { validateSourceSnapshot } from "../../../lib/storyline/source";
import { StorylineContractError } from "../../../lib/storyline/validation";
import { assertSameIdempotentRecipe, canAutomaticallyRetryBeforeSubmission, createStoryTaskRecipe as createWithStudioBinding,
  decideStoryTaskTransition, inspectUntrustedStoryPaidProposal, parseStoryTaskProfile, parseStoryTaskPublicStatus,
  parseStoryTaskSafeResultMetadata,
  parseStoryConfirmationIdentity, parseStoryProviderSubmissionIdentity, PROVIDER_CAPABILITIES,
  storyTaskGenerationIdentity, StoryTaskContractError, validateStoryTaskRecipe,
  type StoryTaskProfileDefinition, type StoryTaskRecipeIdentity, type StoryTaskState } from "../../../lib/storyline/jobs";
import { anchor, date, scope, scriptFixture, sourceFixture } from "../fixtures";

before(() => { mock.method(globalThis, "fetch", () => { assert.fail("Network access is forbidden in M2-01 tests"); }); });
after(() => { mock.restoreAll(); });

function rawSource(): StorySourcePayload {
  const source = sourceFixture();
  source.preparation = {
    policyVersion: "story-source-preparation-v1", dependencyHash: "d".repeat(64), sourceBindingHash: "e".repeat(64),
    translationQcState: "SCAN_RECORDED",
    video: { format: "mp4", videoIndex: 0, videoCodec: "h264", width: 320, height: 240, timeBase: "1/12800", frameRate: "25/1", hasAudio: false },
    characterAnalysis: { id: "analysis-one", sourceHash: "f".repeat(64), provider: "synthetic", model: "fixture", createdAt: date, updatedAt: date },
    aliases: [], observations: [{ id: "observation-one", ownerKind: "CHARACTER", ownerId: "character-a", anchor: anchor(),
      sceneId: "scene-one", transcriptSegmentId: "source-0", kind: "MENTION", evidenceText: "人物甲说话", inference: "", confidence: "LOW",
      relationshipType: null, relationshipSummary: null, createdAt: date, updatedAt: null }],
    legacyRecapState: "ABSENT", legacyRecap: null,
  };
  return source;
}
function source(raw = rawSource()): StorySourceSnapshot { return validateSourceSnapshot(raw, scope); }
function profile(kind: StoryTaskProfileDefinition["kind"] = "ANALYZE_EVIDENCE"): StoryTaskProfileDefinition {
  return { id: "synthetic-text", version: "v1", kind, execution: "PAID_TEXT", providerId: "synthetic", modelId: "synthetic/model",
    promptVersion: "p1", responseSchemaVersion: "s1", validatorVersion: "v1", policyVersion: "policy-v1",
    limits: { requestBytes: 100000, responseBytes: 50000, inputTokens: 1000, outputTokens: 500, timeoutMs: 1000 },
    costPolicy: { id: "synthetic-quote", version: "v1", maxEstimatedUsdMicros: 10000 } };
}
function recipeInput(snapshot: StorySourceSnapshot, kind: StoryTaskProfileDefinition["kind"] = "ANALYZE_EVIDENCE") {
  return { projectId: scope.projectId, movieId: scope.movieId, studioId: "studio-old", expectedStudioRevision: 3,
    sourceSnapshotId: snapshot.payload.id, scriptVersionId: null as string | null,
    kind, profileId: "synthetic-text", profileVersion: "v1",
    window: { firstSegmentSequence: 0, lastSegmentSequence: 11 },
    parentResultHashes: kind === "ANALYZE_EVIDENCE" ? [] : ["a".repeat(64)] };
}
function studioBinding(snapshot: StorySourceSnapshot, script: StoryScriptVersion | null = null) {
  return { id: "studio-old", projectId: scope.projectId, movieId: scope.movieId, revision: 3,
    currentSourceSnapshotId: snapshot.payload.id, currentScriptVersionId: script?.payload.id ?? null };
}
function createStoryTaskRecipe(input: unknown, snapshot: StorySourceSnapshot, profileValue: unknown,
  script: StoryScriptVersion | null = null, studio = studioBinding(snapshot, script)) {
  return createWithStudioBinding(input, snapshot, profileValue, script, studio);
}
function recipe(snapshot = source(), kind: StoryTaskProfileDefinition["kind"] = "ANALYZE_EVIDENCE",
  script: StoryScriptVersion | null = null, profileValue = profile(kind)): StoryTaskRecipeIdentity {
  const input = recipeInput(snapshot, kind);
  input.scriptVersionId = script?.payload.id ?? null;
  return createStoryTaskRecipe(input, snapshot, profileValue, script);
}
function reject(fn: () => unknown, code?: string) {
  assert.throws(fn, error => (error instanceof StorylineContractError && (code === undefined || error.rule === code)) ||
    (error instanceof StoryTaskContractError && (code === undefined || error.code === code)));
}
function action(kind: string, overrides: Record<string, boolean> = {}) {
  return { kind, definitiveOriginalResultStored: false, currentAtPublication: false, freshConfirmationBound: false, ...overrides };
}
function state(state: StoryTaskState, checkpoint: "ABSENT" | "ACKNOWLEDGED" | "RESULT_STORED", overrides: Record<string, unknown> = {}) {
  return { state, generation: 0, checkpoint, sendPermitEverIssued: checkpoint !== "ABSENT",
    unresolvedSubmission: checkpoint === "ACKNOWLEDGED", preSubmissionAttempts: 0, cancelRequested: false,
    confirmation: "CONSUMED_CURRENT", ...overrides };
}
function proposal(identity: StoryTaskRecipeIdentity) {
  const r = identity.recipe;
  return { schemaVersion: "story-paid-proposal-v1", proposalId: "proposal-one", projectId: r.projectId, movieId: r.movieId,
    studioId: r.studioId, expectedStudioRevision: r.expectedStudioRevision,
    recipeHash: identity.recipeHash, logicalTaskKey: identity.logicalTaskKey,
    profileId: r.profile.id, profileVersion: r.profile.version, profileDefinitionHash: r.profile.definitionHash,
    costPolicyId: "synthetic-quote", costPolicyVersion: "v1", quoteMaxEstimatedUsdMicros: 9000,
    maxProviderSubmissions: 1, spendingAuthorityRef: "synthetic-future-subject", authorityAssurance: "UNVERIFIED",
    preparedAt: date, expiresAt: "2026-10-01T00:05:00.000Z" };
}

test("canonical recipe, logical key and generation identities are deterministic", () => {
  const snapshot = source(), first = recipe(snapshot), second = recipe(snapshot);
  assert.equal(first.canonicalRecipe, second.canonicalRecipe);
  assert.equal(first.recipeHash, second.recipeHash);
  assert.equal(first.logicalTaskKey, second.logicalTaskKey);
  assert.equal(validateStoryTaskRecipe(structuredClone(first.recipe), snapshot, profile(), null, studioBinding(snapshot)).recipeHash, first.recipeHash);
  assert.equal(first.recipe.movieId, "movie-old");
  assert.equal(first.recipe.window.startMs, 0); assert.equal(first.recipe.window.endMs, 24000);
  assert.notEqual(storyTaskGenerationIdentity({ taskId: "task-one", generation: 0 }).generationKey,
    storyTaskGenerationIdentity({ taskId: "task-one", generation: 1 }).generationKey);
  assert.equal(first.recipe.source.mediaSha256, "a".repeat(64));
  assert.equal(first.recipe.source.dependencyHash, "d".repeat(64));
  assert.deepEqual(parseStoryConfirmationIdentity({ proposalId: "proposal-one", recipeHash: first.recipeHash }),
    { proposalId: "proposal-one", recipeHash: first.recipeHash });
  assert.deepEqual(parseStoryProviderSubmissionIdentity({ submissionId: "submission-one", taskId: "task-one", generation: 1 }),
    { submissionId: "submission-one", taskId: "task-one", generation: 1 });
});

for (const [name, change] of [
  ["Chinese transcript", (raw: StorySourcePayload) => { raw.transcript.segments[2].text += "增补"; }],
  ["Myanmar text", (raw: StorySourcePayload) => { raw.translation!.rows[1].text += " ပြင်ဆင်"; }],
  ["subtitle approval", (raw: StorySourcePayload) => { raw.translation!.rows[2].reviewStatus = "APPROVED"; }],
  ["QC finding", (raw: StorySourcePayload) => { raw.translation!.rows[1].qcIssues[0].resolution = "Changed"; }],
  ["human edit provenance", (raw: StorySourcePayload) => { raw.translation!.rows[2].origin = "MANUAL"; raw.translation!.rows[2].editedAt = date; }],
  ["media checksum", (raw: StorySourcePayload) => { raw.media.sha256 = "b".repeat(64); }],
  ["source dependency", (raw: StorySourcePayload) => { raw.preparation!.dependencyHash = "c".repeat(64); }],
] as const) test(`${name} changes recipe identity`, () => {
  const original = recipe(), raw = rawSource(); change(raw);
  assert.notEqual(recipe(source(raw)).recipeHash, original.recipeHash);
});

test("profile, policy, revision, source window, ordered parents and script version change identity", () => {
  const snapshot = source(), baseline = recipe(snapshot), editedProfile = profile();
  editedProfile.policyVersion = "policy-v2";
  assert.notEqual(recipe(snapshot, "ANALYZE_EVIDENCE", null, editedProfile).recipeHash, baseline.recipeHash);
  editedProfile.policyVersion = "policy-v1"; editedProfile.modelId = "synthetic/other";
  assert.notEqual(recipe(snapshot, "ANALYZE_EVIDENCE", null, editedProfile).recipeHash, baseline.recipeHash);
  const input = recipeInput(snapshot); input.expectedStudioRevision++;
  assert.notEqual(createStoryTaskRecipe(input, snapshot, profile(), null, { ...studioBinding(snapshot), revision: 4 }).recipeHash, baseline.recipeHash);
  input.expectedStudioRevision--; input.window.lastSegmentSequence = 10;
  assert.notEqual(createStoryTaskRecipe(input, snapshot, profile()).recipeHash, baseline.recipeHash);
  const script = validateScriptPayload(scriptFixture(snapshot), snapshot);
  const reviewOne = recipe(snapshot, "REVIEW_EVIDENCE", script);
  const edited = structuredClone(scriptFixture(snapshot)); edited.version = 2; edited.id = "script-two"; edited.parentVersionId = "script-one";
  edited.beats[0].narration[0].text += " ပြန်ရေးသည်။";
  const scriptTwo = validateScriptPayload(edited, snapshot);
  assert.notEqual(recipe(snapshot, "REVIEW_EVIDENCE", scriptTwo).recipeHash, reviewOne.recipeHash);
  const planInput = recipeInput(snapshot, "PLAN_BEATS"); planInput.parentResultHashes = ["a".repeat(64), "b".repeat(64)];
  const forward = createStoryTaskRecipe(planInput, snapshot, profile("PLAN_BEATS"));
  planInput.parentResultHashes.reverse();
  assert.notEqual(createStoryTaskRecipe(planInput, snapshot, profile("PLAN_BEATS")).recipeHash, forward.recipeHash);
});

test("exact older movie, script dependency and foreign selection are enforced", () => {
  const snapshot = source(), input = recipeInput(snapshot);
  assert.equal(createStoryTaskRecipe(input, snapshot, profile()).recipe.movieId, "movie-old");
  reject(() => createStoryTaskRecipe({ ...input, movieId: "movie-newest" }, snapshot, profile()), "SCOPE_MISMATCH");
  reject(() => createStoryTaskRecipe({ ...input, projectId: "other-project" }, snapshot, profile()), "SCOPE_MISMATCH");
  reject(() => createStoryTaskRecipe({ ...input, sourceSnapshotId: "snapshot-elsewhere" }, snapshot, profile()), "STORY_TASK_SCOPE_MISMATCH");
  reject(() => createStoryTaskRecipe(input, snapshot, profile(), null, { ...studioBinding(snapshot), id: "studio-other" }), "STORY_TASK_SCOPE_MISMATCH");
  reject(() => createStoryTaskRecipe(input, snapshot, profile(), null, { ...studioBinding(snapshot), movieId: "movie-newest" }), "STORY_TASK_SCOPE_MISMATCH");
  reject(() => createStoryTaskRecipe(input, snapshot, profile(), null, { ...studioBinding(snapshot), revision: 4 }), "STORY_TASK_SOURCE_STALE");
  reject(() => createStoryTaskRecipe({ ...input, kind: "REVIEW_EVIDENCE" }, snapshot, profile("REVIEW_EVIDENCE")), "STORY_TASK_INVALID");
  const script = validateScriptPayload(scriptFixture(snapshot), snapshot);
  reject(() => createStoryTaskRecipe(input, snapshot, profile(), script), "STORY_TASK_INVALID");
  reject(() => createStoryTaskRecipe({ ...input, scriptVersionId: "wrong-script", kind: "REVIEW_EVIDENCE" }, snapshot, profile("REVIEW_EVIDENCE"), script), "STORY_TASK_SCOPE_MISMATCH");
  reject(() => createStoryTaskRecipe({ ...input, scriptVersionId: script.payload.id, kind: "REVIEW_EVIDENCE" }, snapshot,
    profile("REVIEW_EVIDENCE"), script, { ...studioBinding(snapshot), currentScriptVersionId: "script-other" }), "STORY_TASK_SOURCE_STALE");
  const foreignRaw = rawSource(); foreignRaw.movieId = "movie-newest";
  reject(() => createStoryTaskRecipe(input, validateSourceSnapshot(foreignRaw, { projectId: scope.projectId, movieId: "movie-newest" }), profile()), "SCOPE_MISMATCH");
});

test("unknown fields, getters, oversized windows, duplicate parents and invalid profile are rejected", () => {
  const snapshot = source(), input = recipeInput(snapshot);
  reject(() => createStoryTaskRecipe({ ...input, trusted: true }, snapshot, profile()), "UNKNOWN_FIELDS");
  reject(() => createStoryTaskRecipe({ ...input, window: { ...input.window, secret: "x" } }, snapshot, profile()), "UNKNOWN_FIELDS");
  reject(() => createStoryTaskRecipe({ ...input, window: { firstSegmentSequence: 0, lastSegmentSequence: 500 } }, snapshot, profile()), "INVALID_INTERVAL");
  reject(() => createStoryTaskRecipe({ ...input, studioId: "../escape" }, snapshot, profile()), "INVALID_TEXT");
  reject(() => createStoryTaskRecipe({ ...input, kind: "PLAN_BEATS", parentResultHashes: ["a".repeat(64), "a".repeat(64)] }, snapshot, profile("PLAN_BEATS")), "DUPLICATE_ID");
  reject(() => createStoryTaskRecipe({ ...input, kind: "DRAFT_SCRIPT", parentResultHashes: [] }, snapshot, profile("DRAFT_SCRIPT")), "STORY_TASK_INVALID");
  const raw = { ...profile(), costPolicy: null };
  reject(() => parseStoryTaskProfile(raw), "STORY_TASK_COST_POLICY_MISSING");
  reject(() => parseStoryTaskProfile({ ...profile(), modelId: "provider?key=secret" }), "INVALID_TEXT");
  reject(() => parseStoryTaskProfile({ ...profile(), limits: { ...profile().limits, outputTokens: 100_001 } }), "INVALID_NUMBER");
  const getter = { ...input, get injected(): never { throw new Error("getter must not run"); } };
  reject(() => createStoryTaskRecipe(getter, snapshot, profile()), "INVALID_SERIALIZATION");
  const tampered = structuredClone(recipe(snapshot).recipe) as unknown as { profile: { definitionHash: string } };
  tampered.profile.definitionHash = "f".repeat(64);
  reject(() => validateStoryTaskRecipe(tampered, snapshot, profile(), null, studioBinding(snapshot)), "STORY_TASK_SOURCE_STALE");
  const forged = structuredClone(snapshot); forged.sourceContextHash = "f".repeat(64);
  reject(() => createStoryTaskRecipe(input, forged, profile()), "STORY_TASK_SOURCE_STALE");
  const provisional = rawSource(); provisional.id = "candidate-fixture";
  // Pure hashing validates structure, never persistence. Durable eligibility is
  // exercised separately through the server-owned persisted-source access.
  assert.equal(createStoryTaskRecipe({ ...input, sourceSnapshotId: "candidate-fixture" }, source(provisional), profile()).recipe.source.snapshotId,"candidate-fixture");
  const dotted = { ...profile(), version: "v1.2" };
  const dottedInput = { ...input, profileVersion: "v1.2" };
  assert.equal(createStoryTaskRecipe(dottedInput, snapshot, dotted).recipe.profile.version, "v1.2");
});

test("exact Unicode is preserved without normalization and lone surrogates are rejected", () => {
  const rawA = rawSource(), rawB = rawSource();
  rawA.translation!.rows[1].text += "ကွ";
  rawB.translation!.rows[1].text += "ကွ";
  // Different code-point sequences remain distinct even when visually similar.
  rawB.translation!.rows[1].text += "\u200d";
  assert.notEqual(recipe(source(rawA)).recipeHash, recipe(source(rawB)).recipeHash);
  const invalid = rawSource(); invalid.translation!.rows[1].text += "\ud800";
  reject(() => validateSourceSnapshot(invalid, scope), "INVALID_TEXT");
  assert.equal(canonicalJson({ text: "  မြန်မာစာ  " }), '{"text":"  မြန်မာစာ  "}');
});

test("state decisions respect checkpoint, unknown outcome and cancellation boundaries", () => {
  const queued = state("QUEUED", "ABSENT"), leased = state("LEASED", "ABSENT");
  assert.equal(decideStoryTaskTransition(queued, action("CLAIM_LEASE")).state, "LEASED");
  assert.equal(decideStoryTaskTransition(leased, action("CANCEL")).state, "CANCELLED");
  const preRetry = decideStoryTaskTransition(leased, action("RETRY_BEFORE_SUBMISSION"));
  assert.deepEqual({ state: preRetry.state, generation: preRetry.generation, authorized: preRetry.providerSubmissionAuthorized },
    { state: "QUEUED", generation: 0, authorized: false });
  assert.equal(canAutomaticallyRetryBeforeSubmission(leased), true);
  assert.equal(canAutomaticallyRetryBeforeSubmission(state("LEASED", "ABSENT", { confirmation: "CONSUMED_EXPIRED" })), false);
  assert.equal(canAutomaticallyRetryBeforeSubmission(state("LEASED", "ABSENT", { preSubmissionAttempts: 3 })), false);
  reject(() => decideStoryTaskTransition(state("LEASED", "ABSENT", { confirmation: "CONSUMED_EXPIRED" }),
    action("RETRY_BEFORE_SUBMISSION")), "STORY_TASK_TRANSITION_INVALID");
  const submitted = state("SUBMITTED", "ACKNOWLEDGED");
  assert.equal(decideStoryTaskTransition(submitted, action("MARK_OUTCOME_UNKNOWN")).state, "UNKNOWN");
  assert.equal(decideStoryTaskTransition(submitted, action("CANCEL")).state, "SUBMITTED");
  assert.equal(decideStoryTaskTransition(submitted, action("CANCEL")).cancelRequested, true);
  assert.equal(canAutomaticallyRetryBeforeSubmission(state("UNKNOWN", "ACKNOWLEDGED")), false);
  reject(() => decideStoryTaskTransition(state("UNKNOWN", "ACKNOWLEDGED"), action("RETRY_TERMINAL", { freshConfirmationBound: true })), "STORY_TASK_RETRY_UNSAFE");
  reject(() => decideStoryTaskTransition(leased, action("ACKNOWLEDGE_CHECKPOINT")), "STORY_TASK_TRANSITION_INVALID");
  reject(() => decideStoryTaskTransition(submitted, action("STORE_VALID_RESULT", { definitiveOriginalResultStored: true, currentAtPublication: true })), "STORY_TASK_TRANSITION_INVALID");
  const result = state("SUBMITTED", "RESULT_STORED");
  assert.equal(decideStoryTaskTransition(result, action("STORE_VALID_RESULT", { definitiveOriginalResultStored: true, currentAtPublication: true })).state, "COMPLETED");
  assert.equal(decideStoryTaskTransition(result, action("STORE_VALID_RESULT", { definitiveOriginalResultStored: true })).state, "FAILED");
  assert.equal(decideStoryTaskTransition(state("SUBMITTED", "RESULT_STORED", { cancelRequested: true }),
    action("STORE_VALID_RESULT", { definitiveOriginalResultStored: true, currentAtPublication: true })).state, "CANCELLED");
  assert.equal(decideStoryTaskTransition(state("SUBMITTED", "RESULT_STORED", { cancelRequested: true }),
    action("STORE_INVALID_RESULT", { definitiveOriginalResultStored: true })).state, "CANCELLED");
  assert.equal(decideStoryTaskTransition(state("UNKNOWN", "RESULT_STORED"), action("RESOLVE_ORIGINAL_INVALID", { definitiveOriginalResultStored: true })).state, "FAILED");
  assert.equal(decideStoryTaskTransition(state("UNKNOWN", "RESULT_STORED", { cancelRequested: true }), action("RESOLVE_ORIGINAL_VALID", { definitiveOriginalResultStored: true, currentAtPublication: true })).state, "CANCELLED");
  assert.equal(decideStoryTaskTransition(state("UNKNOWN", "RESULT_STORED", { cancelRequested: true }), action("RESOLVE_ORIGINAL_INVALID", { definitiveOriginalResultStored: true })).state, "CANCELLED");
  reject(() => decideStoryTaskTransition(state("UNKNOWN", "ACKNOWLEDGED", { cancelRequested: true }),
    action("RESOLVE_ORIGINAL_VALID", { definitiveOriginalResultStored: true })), "STORY_TASK_TRANSITION_INVALID");
  const retry = decideStoryTaskTransition(state("FAILED", "RESULT_STORED"), action("RETRY_TERMINAL", { definitiveOriginalResultStored: true, freshConfirmationBound: true }));
  assert.deepEqual({ state: retry.state, generation: retry.generation, fresh: retry.requiresFreshConfirmation, authorized: retry.providerSubmissionAuthorized },
    { state: "QUEUED", generation: 1, fresh: true, authorized: false });
  reject(() => decideStoryTaskTransition(state("FAILED", "RESULT_STORED"), action("RETRY_TERMINAL", { definitiveOriginalResultStored: true })), "STORY_TASK_TRANSITION_INVALID");
  reject(() => decideStoryTaskTransition(state("COMPLETED", "RESULT_STORED"), action("CANCEL")), "STORY_TASK_TRANSITION_INVALID");
  reject(() => decideStoryTaskTransition({ ...queued, state: "DEFERRED" }, action("CLAIM_LEASE")), "INVALID_ENUM");
});

test("confirmation proposals are bound, short-lived and never trusted spending grants", () => {
  const identity = recipe(), raw = proposal(identity), checked = inspectUntrustedStoryPaidProposal(raw, identity, profile(), "2026-10-01T00:02:00.000Z");
  assert.equal(checked.assessment, "STRUCTURALLY_CURRENT_UNTRUSTED");
  assert.equal(checked.authorizesProviderSubmission, false);
  reject(() => inspectUntrustedStoryPaidProposal(raw, identity, profile(), "2026-10-01T00:05:00.000Z"), "STORY_TASK_CONFIRMATION_STALE");
  reject(() => inspectUntrustedStoryPaidProposal({ ...raw, maxProviderSubmissions: 2 }, identity, profile(), "2026-10-01T00:02:00.000Z"), "STORY_TASK_INVALID");
  reject(() => inspectUntrustedStoryPaidProposal({ ...raw, recipeHash: "b".repeat(64) }, identity, profile(), "2026-10-01T00:02:00.000Z"), "STORY_TASK_CONFIRMATION_STALE");
  reject(() => inspectUntrustedStoryPaidProposal({ ...raw, movieId: "movie-newest" }, identity, profile(), "2026-10-01T00:02:00.000Z"), "STORY_TASK_CONFIRMATION_STALE");
  reject(() => inspectUntrustedStoryPaidProposal({ ...raw, expiresAt: "2026-10-01T00:10:00.000Z" }, identity, profile(), "2026-10-01T00:02:00.000Z"), "STORY_TASK_CONFIRMATION_STALE");
  reject(() => inspectUntrustedStoryPaidProposal({ ...raw, hiddenToken: "secret" }, identity, profile(), "2026-10-01T00:02:00.000Z"), "UNKNOWN_FIELDS");
  const noCost = { ...profile(), costPolicy: null };
  reject(() => inspectUntrustedStoryPaidProposal(raw, identity, noCost, "2026-10-01T00:02:00.000Z"), "STORY_TASK_COST_POLICY_MISSING");
  assert.equal(Object.values(PROVIDER_CAPABILITIES).every(value => value === "UNVERIFIED"), true);
});

test("idempotency reuse requires the same scoped recipe and future authority reference", () => {
  const first = recipe(), secondRaw = rawSource(); secondRaw.media.sha256 = "b".repeat(64);
  const second = recipe(source(secondRaw));
  const claim = { idempotencyKey: "request-one", spendingAuthorityRef: "synthetic-future-subject",
    projectId: scope.projectId, movieId: scope.movieId, recipeHash: first.recipeHash };
  assert.equal(assertSameIdempotentRecipe(claim, structuredClone(claim)), "REUSE");
  reject(() => assertSameIdempotentRecipe(claim, { ...claim, recipeHash: second.recipeHash }), "STORY_TASK_IDEMPOTENCY_CONFLICT");
  reject(() => assertSameIdempotentRecipe(claim, { ...claim, movieId: "movie-newest" }), "STORY_TASK_IDEMPOTENCY_CONFLICT");
  reject(() => assertSameIdempotentRecipe(claim, { ...claim, spendingAuthorityRef: "different-subject" }), "STORY_TASK_IDEMPOTENCY_CONFLICT");
});

test("public status uses bounded allowlisted metadata and honest usage classification", () => {
  const raw = { schemaVersion: "story-task-status-v1", taskId: "task-one", ...scope, kind: "ANALYZE_EVIDENCE",
    profile: { id: "synthetic-text", version: "v1" }, state: "UNKNOWN", generation: 1,
    createdAt: date, stateChangedAt: date, currentness: "NOT_CHECKED", candidateAvailable: false,
    errorCode: "STORY_TASK_PROVIDER_OUTCOME_UNKNOWN", usage: { classification: "UNKNOWN", inputTokens: null, outputTokens: null, costUsdMicros: null } };
  const checked = parseStoryTaskPublicStatus(raw);
  assert.equal(checked.usage.costUsdMicros, null);
  assert.equal(checked.state, "UNKNOWN");
  reject(() => parseStoryTaskPublicStatus({ ...raw, storageKey: "private/key" }), "UNKNOWN_FIELDS");
  reject(() => parseStoryTaskPublicStatus({ ...raw, providerResponse: "private" }), "UNKNOWN_FIELDS");
  reject(() => parseStoryTaskPublicStatus({ ...raw, usage: { ...raw.usage, classification: "REPORTED" } }), "STORY_TASK_INVALID");
  assert.equal(parseStoryTaskPublicStatus({ ...raw, usage: { classification: "PARTIAL", inputTokens: 10, outputTokens: null, costUsdMicros: null } }).usage.classification, "PARTIAL");
  reject(() => parseStoryTaskPublicStatus({ ...raw, usage: { classification: "UNKNOWN", inputTokens: 10, outputTokens: null, costUsdMicros: null } }), "STORY_TASK_INVALID");
  const result = { schemaVersion: "story-task-result-metadata-v1", taskId: "task-one", generation: 1,
    outcome: "VALIDATED_CANDIDATE", candidateAvailable: true, validationErrorCode: null, recordedAt: date };
  assert.equal(parseStoryTaskSafeResultMetadata(result).candidateAvailable, true);
  reject(() => parseStoryTaskSafeResultMetadata({ ...result, rawResponse: "private" }), "UNKNOWN_FIELDS");
  reject(() => parseStoryTaskSafeResultMetadata({ ...result, candidateAvailable: false }), "STORY_TASK_INVALID");
});
