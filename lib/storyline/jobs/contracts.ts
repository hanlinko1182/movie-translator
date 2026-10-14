import type { Immutable } from "../contracts";

export const STORY_TASK = {
  recipeVersion: "story-task-recipe-v1",
  proposalVersion: "story-paid-proposal-v1",
  statusVersion: "story-task-status-v1",
  resultMetadataVersion: "story-task-result-metadata-v1",
} as const;

export const STORY_TASK_KINDS = ["ANALYZE_EVIDENCE", "PLAN_BEATS", "DRAFT_SCRIPT", "REVIEW_EVIDENCE", "REVIEW_MYANMAR"] as const;
export type StoryTaskKind = typeof STORY_TASK_KINDS[number];
export const STORY_TASK_STATES = ["QUEUED", "LEASED", "SUBMITTED", "UNKNOWN", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type StoryTaskState = typeof STORY_TASK_STATES[number];
export const STORY_TASK_LIMITS = {
  recipeBytes: 16 * 1024,
  profileBytes: 4096,
  proposalBytes: 4096,
  statusBytes: 4096,
  maxWindowMs: 15 * 60 * 1000,
  maxWindowSegments: 500,
  maxParents: 32,
  maxRequestBytes: 1024 * 1024,
  maxResponseBytes: 512 * 1024,
  maxTokens: 100_000,
  maxTimeoutMs: 120_000,
  maxEstimatedUsdMicros: 100_000_000,
  maxReportedUsdMicros: 1_000_000_000_000,
  maxProposalTtlMs: 5 * 60 * 1000,
  maxGeneration: 1_000_000,
} as const;

/** A definition supplied by a future fixed server registry. Parsing this shape never approves a model. */
export type StoryTaskProfileDefinition = {
  id: string; version: string; kind: StoryTaskKind; execution: "PAID_TEXT" | "LOCAL";
  providerId: string | null; modelId: string | null;
  promptVersion: string; responseSchemaVersion: string; validatorVersion: string; policyVersion: string;
  limits: { requestBytes: number; responseBytes: number; inputTokens: number; outputTokens: number; timeoutMs: number };
  costPolicy: { id: string; version: string; maxEstimatedUsdMicros: number } | null;
};

/** Structural projection loaded by a future authoritative Studio repository. */
export type StoryTaskStudioBinding = {
  id: string; projectId: string; movieId: string; revision: number;
  currentSourceSnapshotId: string; currentScriptVersionId: string | null;
};

export type StoryTaskRecipe = {
  schemaVersion: typeof STORY_TASK.recipeVersion;
  projectId: string; movieId: string; studioId: string; expectedStudioRevision: number;
  source: {
    snapshotId: string; contentHash: string; contextHash: string; dependencyHash: string; bindingHash: string;
    mediaSha256: string; mediaBytes: number; mediaDurationMs: number; videoMetadataHash: string;
  };
  script: { versionId: string; hash: string } | null;
  kind: StoryTaskKind;
  profile: { id: string; version: string; definitionHash: string };
  policyVersion: string; responseSchemaVersion: string;
  window: { firstSegmentSequence: number; lastSegmentSequence: number; startMs: number; endMs: number };
  parentResultHashes: string[];
};

/** Serializable structural identity only. Does not establish persistence,
 * source currentness, human verification, spending authority or a send permit. */
export type StoryTaskRecipeIdentity = Immutable<{
  recipe: StoryTaskRecipe; canonicalRecipe: string; recipeHash: string; logicalTaskKey: string;
}>;
export type StoryTaskGenerationIdentity = { taskId: string; generation: number; generationKey: string };
export type StoryConfirmationIdentity = { proposalId: string; recipeHash: string };
export type StoryProviderSubmissionIdentity = { submissionId: string; taskId: string; generation: number };

/** Structural proposal only. The authority reference is never an authentication result. */
export type StoryPaidConfirmationProposal = {
  schemaVersion: typeof STORY_TASK.proposalVersion; proposalId: string;
  projectId: string; movieId: string; studioId: string; expectedStudioRevision: number;
  recipeHash: string; logicalTaskKey: string;
  profileId: string; profileVersion: string; profileDefinitionHash: string;
  costPolicyId: string; costPolicyVersion: string; quoteMaxEstimatedUsdMicros: number;
  maxProviderSubmissions: 1; spendingAuthorityRef: string; authorityAssurance: "UNVERIFIED";
  preparedAt: string; expiresAt: string;
};

export const STORY_TASK_ERROR_CODES = [
  "STORY_TASK_INVALID", "STORY_TASK_SCOPE_MISMATCH", "STORY_TASK_SOURCE_STALE",
  "STORY_TASK_PROFILE_INVALID", "STORY_TASK_COST_POLICY_MISSING", "STORY_TASK_TRANSITION_INVALID",
  "STORY_TASK_CONFIRMATION_STALE", "STORY_TASK_CONFIRMATION_UNTRUSTED", "STORY_TASK_RETRY_UNSAFE",
  "STORY_TASK_IDEMPOTENCY_CONFLICT", "STORY_TASK_PROVIDER_OUTCOME_UNKNOWN",
  "STORY_TASK_PROVIDER_FAILED", "STORY_TASK_INVALID_RESPONSE", "STORY_TASK_RESULT_STALE",
] as const;
export type StoryTaskErrorCode = typeof STORY_TASK_ERROR_CODES[number];

export type StoryTaskPublicStatus = {
  schemaVersion: typeof STORY_TASK.statusVersion;
  taskId: string; projectId: string; movieId: string; kind: StoryTaskKind;
  profile: { id: string; version: string }; state: StoryTaskState; generation: number;
  createdAt: string; stateChangedAt: string;
  currentness: "NOT_CHECKED" | "CURRENT_AT_LAST_CHECK" | "HISTORICAL";
  candidateAvailable: boolean; errorCode: StoryTaskErrorCode | null;
  usage: {
    classification: "UNKNOWN" | "PARTIAL" | "REPORTED";
    inputTokens: number | null; outputTokens: number | null; costUsdMicros: number | null;
  };
};

/** Public summary only. Normalized candidate text remains private to a future scoped service. */
export type StoryTaskSafeResultMetadata = {
  schemaVersion: typeof STORY_TASK.resultMetadataVersion;
  taskId: string; generation: number;
  outcome: "VALIDATED_CANDIDATE" | "REJECTED_RESPONSE";
  candidateAvailable: boolean; validationErrorCode: StoryTaskErrorCode | null;
  recordedAt: string;
};

/** No provider promise is assumed until separately verified in M2-05. */
export const PROVIDER_CAPABILITIES = Object.freeze({
  idempotency: "UNVERIFIED", hardCostCap: "UNVERIFIED", billingFinality: "UNVERIFIED",
  remoteCancellation: "UNVERIFIED", ambiguousResultRetrieval: "UNVERIFIED",
} as const);
