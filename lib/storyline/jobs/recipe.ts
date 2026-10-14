import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import type { StorySourceSnapshot, StoryScriptVersion } from "../contracts";
import { validateScriptPayload } from "../script";
import { validateSourceSnapshot } from "../source";
import { array, enumeration, fail, freeze, hash, id, integer, literal, nullable, record, text, unique } from "../validation";
import { STORY_TASK, STORY_TASK_KINDS, STORY_TASK_LIMITS, type StoryTaskGenerationIdentity,
  type StoryTaskKind, type StoryTaskProfileDefinition, type StoryTaskRecipe, type StoryTaskRecipeIdentity,
  type StoryConfirmationIdentity, type StoryProviderSubmissionIdentity, type StoryTaskStudioBinding } from "./contracts";
import { taskFail } from "./errors";

function fixedToken(value: unknown, path: string, max = 80): string {
  const checked = text(value, max, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(checked)) fail("INVALID_TEXT", path);
  return checked;
}

/** Structural validation only; only a future server-owned registry can make a profile fixed/approved. */
export function parseStoryTaskProfile(value: unknown): StoryTaskProfileDefinition {
  canonicalJson(value, STORY_TASK_LIMITS.profileBytes);
  const p = "profile", row = record(value,
    ["id", "version", "kind", "execution", "providerId", "modelId", "promptVersion", "responseSchemaVersion", "validatorVersion", "policyVersion", "limits", "costPolicy"], p);
  const execution = enumeration(row.execution, ["PAID_TEXT", "LOCAL"], `${p}.execution`);
  const limitsRaw = record(row.limits, ["requestBytes", "responseBytes", "inputTokens", "outputTokens", "timeoutMs"], `${p}.limits`);
  const limits = {
    requestBytes: integer(limitsRaw.requestBytes, `${p}.limits.requestBytes`, STORY_TASK_LIMITS.maxRequestBytes),
    responseBytes: integer(limitsRaw.responseBytes, `${p}.limits.responseBytes`, STORY_TASK_LIMITS.maxResponseBytes),
    inputTokens: integer(limitsRaw.inputTokens, `${p}.limits.inputTokens`, STORY_TASK_LIMITS.maxTokens),
    outputTokens: integer(limitsRaw.outputTokens, `${p}.limits.outputTokens`, STORY_TASK_LIMITS.maxTokens),
    timeoutMs: integer(limitsRaw.timeoutMs, `${p}.limits.timeoutMs`, STORY_TASK_LIMITS.maxTimeoutMs),
  };
  if (!limits.requestBytes || !limits.responseBytes || !limits.timeoutMs || execution === "PAID_TEXT" && (!limits.inputTokens || !limits.outputTokens)) {
    taskFail("STORY_TASK_PROFILE_INVALID", `${p}.limits`);
  }
  const cost = nullable(row.costPolicy, raw => {
    const item = record(raw, ["id", "version", "maxEstimatedUsdMicros"], `${p}.costPolicy`);
    return { id: fixedToken(item.id, `${p}.costPolicy.id`), version: fixedToken(item.version, `${p}.costPolicy.version`),
      maxEstimatedUsdMicros: integer(item.maxEstimatedUsdMicros, `${p}.costPolicy.maxEstimatedUsdMicros`, STORY_TASK_LIMITS.maxEstimatedUsdMicros) };
  });
  const providerId = nullable(row.providerId, value => fixedToken(value, `${p}.providerId`, 128));
  const modelId = nullable(row.modelId, value => fixedToken(value, `${p}.modelId`, 160));
  if (execution === "PAID_TEXT" && !cost) taskFail("STORY_TASK_COST_POLICY_MISSING", `${p}.costPolicy`);
  if (execution === "PAID_TEXT" && (!providerId || !modelId) || execution === "LOCAL" && (providerId !== null || modelId !== null || cost !== null || limits.inputTokens !== 0 || limits.outputTokens !== 0)) {
    taskFail("STORY_TASK_PROFILE_INVALID", p);
  }
  return freeze({
    id: fixedToken(row.id, `${p}.id`), version: fixedToken(row.version, `${p}.version`),
    kind: enumeration(row.kind, STORY_TASK_KINDS, `${p}.kind`), execution, providerId, modelId,
    promptVersion: fixedToken(row.promptVersion, `${p}.promptVersion`),
    responseSchemaVersion: fixedToken(row.responseSchemaVersion, `${p}.responseSchemaVersion`),
    validatorVersion: fixedToken(row.validatorVersion, `${p}.validatorVersion`),
    policyVersion: fixedToken(row.policyVersion, `${p}.policyVersion`), limits, costPolicy: cost,
  }) as StoryTaskProfileDefinition;
}

function checkedSource(value: unknown, projectId: string, movieId: string): StorySourceSnapshot {
  const raw = record(value, ["payload", "admissions", "sourceContentHash", "sourceContextHash"], "sourceSnapshot");
  const source = validateSourceSnapshot(raw.payload, { projectId, movieId });
  if (!source.payload.preparation ||
    raw.sourceContentHash !== source.sourceContentHash || raw.sourceContextHash !== source.sourceContextHash ||
    canonicalJson(raw.admissions) !== canonicalJson(source.admissions)) {
    taskFail("STORY_TASK_SOURCE_STALE", "sourceSnapshot");
  }
  return source;
}

function checkedScript(value: unknown, source: StorySourceSnapshot): StoryScriptVersion {
  const raw = record(value, ["payload", "scriptHash"], "scriptVersion");
  const script = validateScriptPayload(raw.payload, source);
  if (raw.scriptHash !== script.scriptHash) taskFail("STORY_TASK_SOURCE_STALE", "scriptVersion.scriptHash");
  return script;
}

/** Pure structural recipe assembly, never proof of persistence or paid authority.
 * Snapshot IDs are opaque, including M1's persisted candidate-* IDs. Use the
 * separate persisted-source access for database-backed eligibility. */
export function createStoryTaskRecipe(input: unknown, sourceValue: unknown, profileValue: unknown,
  scriptValue: unknown, studioValue: unknown): StoryTaskRecipeIdentity {
  canonicalJson(input, STORY_TASK_LIMITS.recipeBytes);
  const p = "task", row = record(input,
    ["projectId", "movieId", "studioId", "expectedStudioRevision", "sourceSnapshotId", "scriptVersionId", "kind", "profileId", "profileVersion", "window", "parentResultHashes"], p);
  const projectId = id(row.projectId, `${p}.projectId`), movieId = id(row.movieId, `${p}.movieId`);
  const studioId = id(row.studioId, `${p}.studioId`);
  const expectedStudioRevision = integer(row.expectedStudioRevision, `${p}.expectedStudioRevision`);
  const kind = enumeration(row.kind, STORY_TASK_KINDS, `${p}.kind`);
  const source = checkedSource(sourceValue, projectId, movieId);
  if (id(row.sourceSnapshotId, `${p}.sourceSnapshotId`) !== source.payload.id) taskFail("STORY_TASK_SCOPE_MISMATCH", `${p}.sourceSnapshotId`);
  const studioRaw = record(studioValue, ["id", "projectId", "movieId", "revision", "currentSourceSnapshotId", "currentScriptVersionId"], "studioBinding");
  const studio: StoryTaskStudioBinding = { id: id(studioRaw.id, "studioBinding.id"),
    projectId: id(studioRaw.projectId, "studioBinding.projectId"), movieId: id(studioRaw.movieId, "studioBinding.movieId"),
    revision: integer(studioRaw.revision, "studioBinding.revision"),
    currentSourceSnapshotId: id(studioRaw.currentSourceSnapshotId, "studioBinding.currentSourceSnapshotId"),
    currentScriptVersionId: nullable(studioRaw.currentScriptVersionId, value => id(value, "studioBinding.currentScriptVersionId")) };
  if (studio.id !== studioId || studio.projectId !== projectId || studio.movieId !== movieId ||
    studio.currentSourceSnapshotId !== source.payload.id) taskFail("STORY_TASK_SCOPE_MISMATCH", "studioBinding");
  if (studio.revision !== expectedStudioRevision) taskFail("STORY_TASK_SOURCE_STALE", "studioBinding.revision");
  const profile = parseStoryTaskProfile(profileValue);
  if (profile.kind !== kind || row.profileId !== profile.id || row.profileVersion !== profile.version) taskFail("STORY_TASK_PROFILE_INVALID", `${p}.profileId`);
  const scriptVersionId = nullable(row.scriptVersionId, value => id(value, `${p}.scriptVersionId`));
  const needsScript = isScriptDependent(kind);
  if (needsScript !== (scriptVersionId !== null) || needsScript !== (scriptValue !== null)) taskFail("STORY_TASK_INVALID", `${p}.scriptVersionId`);
  const script = needsScript ? checkedScript(scriptValue, source) : null;
  if (script && script.payload.id !== scriptVersionId) taskFail("STORY_TASK_SCOPE_MISMATCH", `${p}.scriptVersionId`);
  if (script && studio.currentScriptVersionId !== script.payload.id) taskFail("STORY_TASK_SOURCE_STALE", "studioBinding.currentScriptVersionId");
  const windowRaw = record(row.window, ["firstSegmentSequence", "lastSegmentSequence"], `${p}.window`);
  const first = integer(windowRaw.firstSegmentSequence, `${p}.window.firstSegmentSequence`);
  const last = integer(windowRaw.lastSegmentSequence, `${p}.window.lastSegmentSequence`);
  const segments = source.payload.transcript.segments;
  const firstIndex = segments.findIndex(segment => segment.sequence === first);
  const lastIndex = segments.findIndex(segment => segment.sequence === last);
  if (firstIndex < 0 || lastIndex < firstIndex || lastIndex - firstIndex + 1 > STORY_TASK_LIMITS.maxWindowSegments) fail("INVALID_INTERVAL", `${p}.window`);
  const startMs = segments[firstIndex].startMs, endMs = segments[lastIndex].endMs;
  if (endMs <= startMs || endMs - startMs > STORY_TASK_LIMITS.maxWindowMs) fail("INVALID_INTERVAL", `${p}.window`);
  const parentResultHashes = array(row.parentResultHashes, STORY_TASK_LIMITS.maxParents, `${p}.parentResultHashes`).map((value, index) => hash(value, `${p}.parentResultHashes.${index}`));
  unique(parentResultHashes, value => value, `${p}.parentResultHashes`);
  if (kind === "ANALYZE_EVIDENCE" && parentResultHashes.length ||
    (kind === "PLAN_BEATS" || kind === "DRAFT_SCRIPT") && !parentResultHashes.length) taskFail("STORY_TASK_INVALID", `${p}.parentResultHashes`);
  const prep = source.payload.preparation!;
  const recipe: StoryTaskRecipe = {
    schemaVersion: STORY_TASK.recipeVersion, projectId, movieId, studioId, expectedStudioRevision,
    source: { snapshotId: source.payload.id, contentHash: source.sourceContentHash, contextHash: source.sourceContextHash,
      dependencyHash: prep.dependencyHash, bindingHash: prep.sourceBindingHash,
      mediaSha256: source.payload.media.sha256, mediaBytes: source.payload.media.bytes,
      mediaDurationMs: source.payload.media.durationMs, videoMetadataHash: contractHash("story-task-video-v1", prep.video) },
    script: script ? { versionId: script.payload.id, hash: script.scriptHash } : null,
    kind, profile: { id: profile.id, version: profile.version, definitionHash: contractHash("story-task-profile-v1", profile) },
    policyVersion: profile.policyVersion, responseSchemaVersion: profile.responseSchemaVersion,
    window: { firstSegmentSequence: first, lastSegmentSequence: last, startMs, endMs }, parentResultHashes,
  };
  const canonicalRecipe = canonicalJson(recipe, STORY_TASK_LIMITS.recipeBytes);
  const recipeHash = contractHash("story-task-recipe-v1", recipe);
  const logicalTaskKey = contractHash("story-logical-task-v1", { studioId, kind, recipeHash });
  return freeze({ recipe, canonicalRecipe, recipeHash, logicalTaskKey });
}

/** Rechecks a serialized recipe against explicit current inputs; does not establish live-source authority. */
export function validateStoryTaskRecipe(value: unknown, source: unknown, profile: unknown,
  script: unknown, studio: unknown): StoryTaskRecipeIdentity {
  canonicalJson(value, STORY_TASK_LIMITS.recipeBytes);
  const row = record(value, ["schemaVersion", "projectId", "movieId", "studioId", "expectedStudioRevision", "source", "script", "kind", "profile", "policyVersion", "responseSchemaVersion", "window", "parentResultHashes"], "recipe");
  literal(row.schemaVersion, STORY_TASK.recipeVersion, "recipe.schemaVersion");
  const sourceRow = record(row.source, ["snapshotId", "contentHash", "contextHash", "dependencyHash", "bindingHash", "mediaSha256", "mediaBytes", "mediaDurationMs", "videoMetadataHash"], "recipe.source");
  const profileRow = record(row.profile, ["id", "version", "definitionHash"], "recipe.profile");
  const windowRow = record(row.window, ["firstSegmentSequence", "lastSegmentSequence", "startMs", "endMs"], "recipe.window");
  const scriptRow = row.script === null ? null : record(row.script, ["versionId", "hash"], "recipe.script");
  const identity = createStoryTaskRecipe({ projectId: row.projectId, movieId: row.movieId, studioId: row.studioId,
    expectedStudioRevision: row.expectedStudioRevision, sourceSnapshotId: sourceRow.snapshotId, scriptVersionId: scriptRow?.versionId ?? null,
    kind: row.kind, profileId: profileRow.id, profileVersion: profileRow.version,
    window: { firstSegmentSequence: windowRow.firstSegmentSequence, lastSegmentSequence: windowRow.lastSegmentSequence },
    parentResultHashes: row.parentResultHashes }, source, profile, script, studio);
  if (canonicalJson(value, STORY_TASK_LIMITS.recipeBytes) !== identity.canonicalRecipe) taskFail("STORY_TASK_SOURCE_STALE", "recipe");
  return identity;
}

export function storyTaskGenerationIdentity(value: unknown): StoryTaskGenerationIdentity {
  const row = record(value, ["taskId", "generation"], "generation");
  const taskId = id(row.taskId, "generation.taskId");
  const generation = integer(row.generation, "generation.generation", STORY_TASK_LIMITS.maxGeneration);
  return { taskId, generation, generationKey: contractHash("story-task-generation-v1", { taskId, generation }) };
}

/** IDs are supplied by future durable services, never derived from a recipe hash. */
export function parseStoryConfirmationIdentity(value: unknown): StoryConfirmationIdentity {
  const row = record(value, ["proposalId", "recipeHash"], "confirmationIdentity");
  return { proposalId: id(row.proposalId, "confirmationIdentity.proposalId"),
    recipeHash: hash(row.recipeHash, "confirmationIdentity.recipeHash") };
}

/** Structural identity only; no caller-supplied ID can prove provider submission. */
export function parseStoryProviderSubmissionIdentity(value: unknown): StoryProviderSubmissionIdentity {
  const row = record(value, ["submissionId", "taskId", "generation"], "submissionIdentity");
  return { submissionId: id(row.submissionId, "submissionIdentity.submissionId"),
    taskId: id(row.taskId, "submissionIdentity.taskId"),
    generation: integer(row.generation, "submissionIdentity.generation", STORY_TASK_LIMITS.maxGeneration) };
}

/** Future persistence must scope this key to a real authenticated principal. */
export function assertSameIdempotentRecipe(existing: unknown, requested: unknown): "REUSE" {
  const fields = ["idempotencyKey", "spendingAuthorityRef", "projectId", "movieId", "recipeHash"];
  const a = record(existing, fields, "existingIdempotency"), b = record(requested, fields, "requestedIdempotency");
  const parse = (row: Record<string, unknown>) => ({ idempotencyKey: id(row.idempotencyKey, "idempotencyKey"),
    spendingAuthorityRef: id(row.spendingAuthorityRef, "spendingAuthorityRef"), projectId: id(row.projectId, "projectId"),
    movieId: id(row.movieId, "movieId"), recipeHash: hash(row.recipeHash, "recipeHash") });
  if (canonicalJson(parse(a)) !== canonicalJson(parse(b))) taskFail("STORY_TASK_IDEMPOTENCY_CONFLICT", "idempotencyKey");
  return "REUSE";
}

export function isScriptDependent(kind: StoryTaskKind): boolean {
  return kind === "REVIEW_EVIDENCE" || kind === "REVIEW_MYANMAR";
}
