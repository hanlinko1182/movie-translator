import "server-only";
import { canonicalJson } from "../canonical";
import { date, enumeration, freeze, id, integer, literal, nullable, record, text } from "../validation";
import { STORY_TASK, STORY_TASK_ERROR_CODES, STORY_TASK_KINDS, STORY_TASK_LIMITS, STORY_TASK_STATES,
  type StoryTaskPublicStatus, type StoryTaskSafeResultMetadata } from "./contracts";
import { taskFail } from "./errors";

/** Shape and secrecy allowlist only; future API must scope the database read before calling it. */
export function parseStoryTaskPublicStatus(value: unknown): StoryTaskPublicStatus {
  canonicalJson(value, STORY_TASK_LIMITS.statusBytes);
  const p = "status", row = record(value, ["schemaVersion", "taskId", "projectId", "movieId", "kind", "profile", "state", "generation",
    "createdAt", "stateChangedAt", "currentness", "candidateAvailable", "errorCode", "usage"], p);
  const profile = record(row.profile, ["id", "version"], `${p}.profile`);
  const usage = record(row.usage, ["classification", "inputTokens", "outputTokens", "costUsdMicros"], `${p}.usage`);
  const classification = enumeration(usage.classification, ["UNKNOWN", "PARTIAL", "REPORTED"], `${p}.usage.classification`);
  const inputTokens = nullable(usage.inputTokens, value => integer(value, `${p}.usage.inputTokens`, STORY_TASK_LIMITS.maxTokens));
  const outputTokens = nullable(usage.outputTokens, value => integer(value, `${p}.usage.outputTokens`, STORY_TASK_LIMITS.maxTokens));
  const costUsdMicros = nullable(usage.costUsdMicros, value => integer(value, `${p}.usage.costUsdMicros`, STORY_TASK_LIMITS.maxReportedUsdMicros));
  const known = [inputTokens, outputTokens, costUsdMicros].filter(value => value !== null).length;
  if (classification === "UNKNOWN" && known !== 0 || classification === "REPORTED" && known !== 3 || classification === "PARTIAL" && (known === 0 || known === 3)) {
    taskFail("STORY_TASK_INVALID", `${p}.usage`);
  }
  if (typeof row.candidateAvailable !== "boolean") taskFail("STORY_TASK_INVALID", `${p}.candidateAvailable`);
  const result: StoryTaskPublicStatus = {
    schemaVersion: literal(row.schemaVersion, STORY_TASK.statusVersion, `${p}.schemaVersion`),
    taskId: id(row.taskId, `${p}.taskId`), projectId: id(row.projectId, `${p}.projectId`), movieId: id(row.movieId, `${p}.movieId`),
    kind: enumeration(row.kind, STORY_TASK_KINDS, `${p}.kind`), profile: { id: text(profile.id, 80, `${p}.profile.id`), version: text(profile.version, 80, `${p}.profile.version`) },
    state: enumeration(row.state, STORY_TASK_STATES, `${p}.state`), generation: integer(row.generation, `${p}.generation`, STORY_TASK_LIMITS.maxGeneration),
    createdAt: date(row.createdAt, `${p}.createdAt`), stateChangedAt: date(row.stateChangedAt, `${p}.stateChangedAt`),
    currentness: enumeration(row.currentness, ["NOT_CHECKED", "CURRENT_AT_LAST_CHECK", "HISTORICAL"], `${p}.currentness`),
    candidateAvailable: row.candidateAvailable,
    errorCode: nullable(row.errorCode, value => enumeration(value, STORY_TASK_ERROR_CODES, `${p}.errorCode`)),
    usage: { classification, inputTokens, outputTokens, costUsdMicros },
  };
  if (result.stateChangedAt < result.createdAt) taskFail("STORY_TASK_INVALID", `${p}.stateChangedAt`);
  if (![result.profile.id, result.profile.version].every(token => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(token))) taskFail("STORY_TASK_INVALID", `${p}.profile`);
  return freeze(result) as StoryTaskPublicStatus;
}

/** The candidate payload and provider envelope are deliberately absent. */
export function parseStoryTaskSafeResultMetadata(value: unknown): StoryTaskSafeResultMetadata {
  canonicalJson(value, STORY_TASK_LIMITS.statusBytes);
  const p = "resultMetadata", row = record(value,
    ["schemaVersion", "taskId", "generation", "outcome", "candidateAvailable", "validationErrorCode", "recordedAt"], p);
  if (typeof row.candidateAvailable !== "boolean") taskFail("STORY_TASK_INVALID", `${p}.candidateAvailable`);
  const result: StoryTaskSafeResultMetadata = {
    schemaVersion: literal(row.schemaVersion, STORY_TASK.resultMetadataVersion, `${p}.schemaVersion`),
    taskId: id(row.taskId, `${p}.taskId`),
    generation: integer(row.generation, `${p}.generation`, STORY_TASK_LIMITS.maxGeneration),
    outcome: enumeration(row.outcome, ["VALIDATED_CANDIDATE", "REJECTED_RESPONSE"], `${p}.outcome`),
    candidateAvailable: row.candidateAvailable,
    validationErrorCode: nullable(row.validationErrorCode, value => enumeration(value, STORY_TASK_ERROR_CODES, `${p}.validationErrorCode`)),
    recordedAt: date(row.recordedAt, `${p}.recordedAt`),
  };
  if (result.outcome === "VALIDATED_CANDIDATE" && (!result.candidateAvailable || result.validationErrorCode !== null) ||
    result.outcome === "REJECTED_RESPONSE" && (result.candidateAvailable || result.validationErrorCode === null)) {
    taskFail("STORY_TASK_INVALID", p);
  }
  return freeze(result) as StoryTaskSafeResultMetadata;
}
