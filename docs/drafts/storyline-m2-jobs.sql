-- REVIEW ONLY: disposable PostgreSQL 18 validation, never a live migration.
-- Apply only after the committed baseline and M1 migration in an owned scratch DB.
-- The final ROLLBACK is deliberate; the test harness replaces it in memory.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE "StoryTaskKind" AS ENUM ('ANALYZE_EVIDENCE','PLAN_BEATS','DRAFT_SCRIPT','REVIEW_EVIDENCE','REVIEW_MYANMAR');
CREATE TYPE "StoryTaskState" AS ENUM ('QUEUED','LEASED','SUBMITTED','UNKNOWN','COMPLETED','FAILED','CANCELLED');
CREATE TYPE "StoryConfirmationState" AS ENUM ('PREPARED','CONSUMED');
CREATE TYPE "StorySubmissionState" AS ENUM ('SUBMITTED','UNKNOWN','RESOLVED');
CREATE TYPE "StoryResultOutcome" AS ENUM ('VALIDATED_CANDIDATE','REJECTED_RESPONSE','DEFINITIVE_FAILURE');
CREATE TYPE "StoryUsageClass" AS ENUM ('UNKNOWN','PARTIAL','REPORTED');

CREATE TABLE "StoryTask" (
  "id" TEXT PRIMARY KEY, "studioId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "movieId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL, "sourceContentHash" VARCHAR(64) NOT NULL, "sourceContextHash" VARCHAR(64) NOT NULL,
  "scriptVersionId" TEXT, "scriptHash" VARCHAR(64), "kind" "StoryTaskKind" NOT NULL,
  "recipeHash" VARCHAR(64) NOT NULL, "canonicalRecipe" TEXT NOT NULL, "profileHash" VARCHAR(64) NOT NULL,
  "expectedStudioRevision" INTEGER NOT NULL, "state" "StoryTaskState" NOT NULL DEFAULT 'QUEUED',
  "generation" INTEGER NOT NULL DEFAULT 0, "stateRevision" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" TEXT, "leaseUntil" TIMESTAMP(3), "cancelRequestedAt" TIMESTAMP(3), "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stateChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryTask_scope_fkey" FOREIGN KEY ("studioId","projectId","movieId") REFERENCES "StorylineStudio"("id","projectId","movieId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryTask_source_fkey" FOREIGN KEY ("sourceSnapshotId","studioId","sourceContentHash","sourceContextHash") REFERENCES "StorySourceSnapshot"("id","studioId","sourceContentHash","sourceContextHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryTask_script_fkey" FOREIGN KEY ("scriptVersionId","studioId","sourceSnapshotId","sourceContentHash","sourceContextHash","scriptHash") REFERENCES "StoryScriptVersion"("id","studioId","sourceSnapshotId","sourceContentHash","sourceContextHash","scriptHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryTask_studioId_kind_recipeHash_key" UNIQUE ("studioId","kind","recipeHash"),
  CONSTRAINT "StoryTask_id_studioId_recipeHash_key" UNIQUE ("id","studioId","recipeHash"),
  CONSTRAINT "StoryTask_bounds" CHECK ((
    story_m1_is_hash("recipeHash") AND story_m1_is_hash("profileHash") AND
    story_m1_is_hash("sourceContentHash") AND story_m1_is_hash("sourceContextHash") AND
    (("kind" IN ('REVIEW_EVIDENCE','REVIEW_MYANMAR') AND "scriptVersionId" IS NOT NULL AND story_m1_is_hash("scriptHash")) OR
     ("kind" NOT IN ('REVIEW_EVIDENCE','REVIEW_MYANMAR') AND "scriptVersionId" IS NULL AND "scriptHash" IS NULL)) AND
    octet_length("canonicalRecipe") BETWEEN 1 AND 16384 AND "expectedStudioRevision" >= 0 AND
    "generation" BETWEEN 0 AND 1000000 AND "stateRevision" >= 0 AND
    ("leaseUntil" IS NULL OR isfinite("leaseUntil")) AND
    ("cancelRequestedAt" IS NULL OR isfinite("cancelRequestedAt")) AND
    ("errorCode" IS NULL OR "errorCode" ~ '^STORY_TASK_[A-Z_]{1,64}$') AND
    isfinite("createdAt") AND isfinite("stateChangedAt")
  ) IS TRUE),
  CONSTRAINT "StoryTask_recipe_projection" CHECK ((
    json_typeof("canonicalRecipe"::json) = 'object' AND
    ("canonicalRecipe"::json->>'schemaVersion') IS NOT DISTINCT FROM 'story-task-recipe-v1' AND
    ("canonicalRecipe"::json->>'projectId') IS NOT DISTINCT FROM "projectId" AND
    ("canonicalRecipe"::json->>'movieId') IS NOT DISTINCT FROM "movieId" AND
    ("canonicalRecipe"::json->>'studioId') IS NOT DISTINCT FROM "studioId" AND
    ("canonicalRecipe"::json->>'kind') IS NOT DISTINCT FROM "kind"::text AND
    ("canonicalRecipe"::json->>'expectedStudioRevision') IS NOT DISTINCT FROM "expectedStudioRevision"::text AND
    ("canonicalRecipe"::json->'source'->>'snapshotId') IS NOT DISTINCT FROM "sourceSnapshotId" AND
    ("canonicalRecipe"::json->'source'->>'contentHash') IS NOT DISTINCT FROM "sourceContentHash" AND
    ("canonicalRecipe"::json->'source'->>'contextHash') IS NOT DISTINCT FROM "sourceContextHash" AND
    ("canonicalRecipe"::json->'script'->>'versionId') IS NOT DISTINCT FROM "scriptVersionId" AND
    ("canonicalRecipe"::json->'script'->>'hash') IS NOT DISTINCT FROM "scriptHash" AND
    ("canonicalRecipe"::json->'profile'->>'definitionHash') IS NOT DISTINCT FROM "profileHash"
  ) IS TRUE)
);
CREATE INDEX "StoryTask_studio_state_created_idx" ON "StoryTask"("studioId","state","createdAt");
CREATE INDEX "StoryTask_movie_created_idx" ON "StoryTask"("projectId","movieId","createdAt");

CREATE TABLE "StoryTaskDispatch" (
  "taskId" TEXT PRIMARY KEY, "generation" INTEGER NOT NULL, "nextDispatchAt" TIMESTAMP(3) NOT NULL,
  "queueReceipt" TEXT, "publishAttempts" INTEGER NOT NULL DEFAULT 0, "preSubmitAttempts" INTEGER NOT NULL DEFAULT 0,
  "owner" TEXT, "leaseUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryTaskDispatch_task_fkey" FOREIGN KEY ("taskId") REFERENCES "StoryTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryTaskDispatch_bounds" CHECK (
    "generation" BETWEEN 0 AND 1000000 AND "publishAttempts" BETWEEN 0 AND 1000 AND
    "preSubmitAttempts" BETWEEN 0 AND 3 AND isfinite("nextDispatchAt") AND isfinite("updatedAt") AND
    ("leaseUntil" IS NULL OR isfinite("leaseUntil")) AND
    ("queueReceipt" IS NULL OR octet_length("queueReceipt") BETWEEN 1 AND 256)
  )
);
CREATE INDEX "StoryTaskDispatch_due_idx" ON "StoryTaskDispatch"("nextDispatchAt","generation");

CREATE TABLE "StoryPaidConfirmation" (
  "id" TEXT PRIMARY KEY, "studioId" TEXT NOT NULL, "taskId" TEXT,
  "generation" INTEGER NOT NULL, "recipeHash" VARCHAR(64) NOT NULL, "profileHash" VARCHAR(64) NOT NULL,
  "expectedStudioRevision" INTEGER NOT NULL, "quoteMaxUsdMicros" BIGINT NOT NULL,
  "authorityRef" TEXT NOT NULL, "state" "StoryConfirmationState" NOT NULL DEFAULT 'PREPARED',
  "preparedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
  CONSTRAINT "StoryPaidConfirmation_studio_fkey" FOREIGN KEY ("studioId") REFERENCES "StorylineStudio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryPaidConfirmation_task_fkey" FOREIGN KEY ("taskId","studioId","recipeHash") REFERENCES "StoryTask"("id","studioId","recipeHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryPaidConfirmation_id_task_generation_key" UNIQUE ("id","taskId","generation"),
  CONSTRAINT "StoryPaidConfirmation_task_generation_key" UNIQUE ("taskId","generation"),
  CONSTRAINT "StoryPaidConfirmation_bounds" CHECK ((
    story_m1_is_hash("recipeHash") AND story_m1_is_hash("profileHash") AND
    "generation" BETWEEN 0 AND 1000000 AND "expectedStudioRevision" >= 0 AND
    "quoteMaxUsdMicros" BETWEEN 1 AND 100000000 AND octet_length("authorityRef") BETWEEN 1 AND 256 AND
    isfinite("preparedAt") AND isfinite("expiresAt") AND "expiresAt" > "preparedAt" AND
    "expiresAt" <= "preparedAt" + interval '5 minutes' AND
    (("state" = 'PREPARED' AND "consumedAt" IS NULL) OR
     ("state" = 'CONSUMED' AND "taskId" IS NOT NULL AND "consumedAt" IS NOT NULL AND isfinite("consumedAt")))
  ) IS TRUE)
);
CREATE INDEX "StoryPaidConfirmation_expiry_idx" ON "StoryPaidConfirmation"("studioId","expiresAt");

CREATE TABLE "StoryProviderSubmission" (
  "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL, "generation" INTEGER NOT NULL,
  "confirmationId" TEXT NOT NULL UNIQUE, "requestHash" VARCHAR(64) NOT NULL, "owner" TEXT NOT NULL,
  "state" "StorySubmissionState" NOT NULL DEFAULT 'SUBMITTED',
  "checkpointAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "definitiveAt" TIMESTAMP(3),
  CONSTRAINT "StoryProviderSubmission_task_fkey" FOREIGN KEY ("taskId") REFERENCES "StoryTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryProviderSubmission_confirmation_fkey" FOREIGN KEY ("confirmationId","taskId","generation") REFERENCES "StoryPaidConfirmation"("id","taskId","generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryProviderSubmission_task_generation_key" UNIQUE ("taskId","generation"),
  CONSTRAINT "StoryProviderSubmission_id_task_generation_key" UNIQUE ("id","taskId","generation"),
  CONSTRAINT "StoryProviderSubmission_bounds" CHECK ((
    story_m1_is_hash("requestHash") AND "generation" BETWEEN 0 AND 1000000 AND
    octet_length("owner") BETWEEN 1 AND 128 AND isfinite("checkpointAt") AND
    (("state" <> 'RESOLVED' AND "definitiveAt" IS NULL) OR
     ("state" = 'RESOLVED' AND "definitiveAt" IS NOT NULL AND isfinite("definitiveAt")))
  ) IS TRUE)
);
-- This is intentionally global across M2 paid tasks. UNKNOWN never times out of the slot.
CREATE UNIQUE INDEX "StoryProviderSubmission_global_unresolved_slot" ON "StoryProviderSubmission" ((true)) WHERE "state" IN ('SUBMITTED','UNKNOWN');
CREATE INDEX "StoryProviderSubmission_state_checkpoint_idx" ON "StoryProviderSubmission"("state","checkpointAt");

CREATE TABLE "StoryTaskResult" (
  "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL, "generation" INTEGER NOT NULL,
  "submissionId" TEXT NOT NULL UNIQUE, "outcome" "StoryResultOutcome" NOT NULL,
  "normalizedPayload" TEXT NOT NULL, "payloadHash" VARCHAR(64) NOT NULL, "validatorVersion" TEXT NOT NULL,
  "usageClass" "StoryUsageClass" NOT NULL, "inputTokens" INTEGER, "outputTokens" INTEGER,
  "reportedUsdMicros" BIGINT, "safeErrorCode" TEXT, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryTaskResult_task_fkey" FOREIGN KEY ("taskId") REFERENCES "StoryTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryTaskResult_submission_fkey" FOREIGN KEY ("submissionId","taskId","generation") REFERENCES "StoryProviderSubmission"("id","taskId","generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryTaskResult_submission_task_generation_key" UNIQUE ("submissionId","taskId","generation"),
  CONSTRAINT "StoryTaskResult_bounds" CHECK ((
    "generation" BETWEEN 0 AND 1000000 AND story_m1_is_hash("payloadHash") AND
    octet_length("normalizedPayload") BETWEEN 2 AND 524288 AND
    json_typeof("normalizedPayload"::json) = 'object' AND
    octet_length("validatorVersion") BETWEEN 1 AND 128 AND
    ("inputTokens" IS NULL OR "inputTokens" BETWEEN 0 AND 100000) AND
    ("outputTokens" IS NULL OR "outputTokens" BETWEEN 0 AND 100000) AND
    ("reportedUsdMicros" IS NULL OR "reportedUsdMicros" BETWEEN 0 AND 1000000000000) AND
    (("usageClass" = 'UNKNOWN' AND "inputTokens" IS NULL AND "outputTokens" IS NULL AND "reportedUsdMicros" IS NULL) OR
     ("usageClass" = 'PARTIAL' AND ("inputTokens" IS NOT NULL OR "outputTokens" IS NOT NULL OR "reportedUsdMicros" IS NOT NULL)) OR
     ("usageClass" = 'REPORTED' AND "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL AND "reportedUsdMicros" IS NOT NULL)) AND
    ("safeErrorCode" IS NULL OR "safeErrorCode" ~ '^STORY_TASK_[A-Z_]{1,64}$') AND isfinite("recordedAt")
  ) IS TRUE)
);
CREATE INDEX "StoryTaskResult_task_generation_idx" ON "StoryTaskResult"("taskId","generation");

CREATE TABLE "StoryTaskEvent" (
  "id" TEXT PRIMARY KEY, "taskId" TEXT NOT NULL, "generation" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL, "state" "StoryTaskState" NOT NULL, "reasonCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryTaskEvent_task_fkey" FOREIGN KEY ("taskId") REFERENCES "StoryTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryTaskEvent_task_sequence_key" UNIQUE ("taskId","sequence"),
  CONSTRAINT "StoryTaskEvent_bounds" CHECK (
    "generation" BETWEEN 0 AND 1000000 AND "sequence" BETWEEN 0 AND 1000000 AND
    "reasonCode" ~ '^STORY_TASK_[A-Z_]{1,64}$' AND isfinite("createdAt")
  )
);
CREATE INDEX "StoryTaskEvent_generation_idx" ON "StoryTaskEvent"("taskId","generation","createdAt");

CREATE FUNCTION story_m2_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'M2 history is append-only' USING ERRCODE = '23514'; END; $$;
CREATE TRIGGER "StoryTaskResult_immutable" BEFORE UPDATE OR DELETE ON "StoryTaskResult" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTaskEvent_append_only" BEFORE UPDATE OR DELETE ON "StoryTaskEvent" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();

CREATE FUNCTION story_m2_guard_task() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_checkpoint BOOLEAN; retry_attempt INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'QUEUED' OR NEW."generation" <> 0 OR NEW."stateRevision" <> 0 THEN
      RAISE EXCEPTION 'Initial task state invalid' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id",NEW."studioId",NEW."projectId",NEW."movieId",NEW."sourceSnapshotId",NEW."sourceContentHash",NEW."sourceContextHash",
      NEW."scriptVersionId",NEW."scriptHash",NEW."kind",NEW."recipeHash",NEW."canonicalRecipe",NEW."profileHash",NEW."expectedStudioRevision",NEW."createdAt") IS DISTINCT FROM
     (OLD."id",OLD."studioId",OLD."projectId",OLD."movieId",OLD."sourceSnapshotId",OLD."sourceContentHash",OLD."sourceContextHash",
      OLD."scriptVersionId",OLD."scriptHash",OLD."kind",OLD."recipeHash",OLD."canonicalRecipe",OLD."profileHash",OLD."expectedStudioRevision",OLD."createdAt") OR
      NEW."stateRevision" <> OLD."stateRevision" + 1 THEN
    RAISE EXCEPTION 'Immutable task recipe or stale revision' USING ERRCODE = '23514'; END IF;
  IF NEW."generation" <> OLD."generation" THEN
    IF NEW."generation" <> OLD."generation" + 1 OR OLD."state" NOT IN ('FAILED','CANCELLED') OR NEW."state" <> 'QUEUED' OR
       NEW."cancelRequestedAt" IS NOT NULL OR NEW."leaseOwner" IS NOT NULL OR NEW."leaseUntil" IS NOT NULL OR
       EXISTS (SELECT 1 FROM "StoryProviderSubmission" WHERE "taskId" = OLD."id" AND "state" <> 'RESOLVED') OR
       NOT EXISTS (SELECT 1 FROM "StoryPaidConfirmation" c WHERE c."taskId" = OLD."id" AND c."generation" = NEW."generation"
         AND c."state" = 'CONSUMED' AND c."expiresAt" > clock_timestamp()) THEN
      RAISE EXCEPTION 'Unsafe task generation advance' USING ERRCODE = '23514'; END IF;
  ELSE
    SELECT EXISTS (SELECT 1 FROM "StoryProviderSubmission" WHERE "taskId" = OLD."id" AND "generation" = OLD."generation") INTO has_checkpoint;
    IF NOT ((OLD."state" = NEW."state") OR
      (OLD."state" = 'QUEUED' AND NEW."state" IN ('LEASED','CANCELLED','FAILED')) OR
      (OLD."state" = 'LEASED' AND NEW."state" IN ('QUEUED','SUBMITTED','CANCELLED','FAILED')) OR
      (OLD."state" = 'SUBMITTED' AND NEW."state" IN ('UNKNOWN','COMPLETED','FAILED','CANCELLED')) OR
      (OLD."state" = 'UNKNOWN' AND NEW."state" IN ('COMPLETED','FAILED','CANCELLED'))) THEN
      RAISE EXCEPTION 'Invalid task transition' USING ERRCODE = '23514'; END IF;
    IF NEW."state" IN ('COMPLETED','FAILED','CANCELLED') AND has_checkpoint AND NOT EXISTS (
      SELECT 1 FROM "StoryProviderSubmission" s JOIN "StoryTaskResult" r ON r."submissionId" = s."id"
      WHERE s."taskId" = OLD."id" AND s."generation" = OLD."generation" AND s."state" = 'RESOLVED') THEN
      RAISE EXCEPTION 'Checkpoint has no definitive result' USING ERRCODE = '23514'; END IF;
    IF has_checkpoint AND OLD."state" = 'LEASED' AND NEW."state" IN ('QUEUED','LEASED','CANCELLED') THEN
      RAISE EXCEPTION 'Checkpoint cannot be treated as pre-submission' USING ERRCODE = '23514'; END IF;
    IF NEW."state" = 'CANCELLED' AND has_checkpoint AND
       (OLD."state" NOT IN ('SUBMITTED','UNKNOWN') OR NEW."cancelRequestedAt" IS NULL) THEN
      RAISE EXCEPTION 'Ambiguous cancellation cannot claim finality' USING ERRCODE = '23514'; END IF;
    IF has_checkpoint AND NEW."state" IN ('COMPLETED','FAILED') AND NEW."cancelRequestedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Cancellation requested before definitive task resolution' USING ERRCODE = '23514'; END IF;
    IF OLD."state" = 'LEASED' AND NEW."state" = 'QUEUED' AND
       (NEW."leaseOwner" IS NOT NULL OR NEW."leaseUntil" IS NOT NULL OR
        NOT EXISTS (SELECT 1 FROM "StoryPaidConfirmation" c WHERE c."taskId" = OLD."id" AND c."generation" = OLD."generation"
          AND c."state" = 'CONSUMED' AND c."expiresAt" > clock_timestamp())) THEN
      RAISE EXCEPTION 'Pre-submission retry requires current grant and bounded dispatch attempt' USING ERRCODE = '23514'; END IF;
    IF OLD."state" = 'LEASED' AND NEW."state" = 'QUEUED' THEN
      UPDATE "StoryTaskDispatch" SET "preSubmitAttempts" = "preSubmitAttempts" + 1, "queueReceipt" = NULL,
        "owner" = NULL, "leaseUntil" = NULL, "updatedAt" = clock_timestamp()
      WHERE "taskId" = OLD."id" AND "generation" = OLD."generation" AND "preSubmitAttempts" < 3
      RETURNING "preSubmitAttempts" INTO retry_attempt;
      IF retry_attempt IS NULL THEN
        RAISE EXCEPTION 'Pre-submission retry limit reached' USING ERRCODE = '23514'; END IF;
    END IF;
    IF NEW."state" = 'SUBMITTED' AND NOT EXISTS (
      SELECT 1 FROM "StoryProviderSubmission" WHERE "taskId"=OLD."id" AND "generation"=OLD."generation" AND "state"='SUBMITTED') THEN
      RAISE EXCEPTION 'Submission checkpoint required' USING ERRCODE = '23514'; END IF;
    IF NEW."state" = 'UNKNOWN' AND NOT EXISTS (
      SELECT 1 FROM "StoryProviderSubmission" WHERE "taskId"=OLD."id" AND "generation"=OLD."generation" AND "state"='UNKNOWN') THEN
      RAISE EXCEPTION 'Unknown outcome checkpoint required' USING ERRCODE = '23514'; END IF;
  END IF;
  IF OLD."cancelRequestedAt" IS NOT NULL AND NEW."cancelRequestedAt" IS DISTINCT FROM OLD."cancelRequestedAt" AND
     NOT (NEW."generation" = OLD."generation" + 1 AND NEW."cancelRequestedAt" IS NULL) THEN
    RAISE EXCEPTION 'Cancellation is sticky' USING ERRCODE = '23514'; END IF;
  IF OLD."cancelRequestedAt" IS NULL AND NEW."cancelRequestedAt" IS NOT NULL AND
     (OLD."state" IN ('COMPLETED','FAILED','CANCELLED') OR NEW."cancelRequestedAt" < OLD."createdAt") THEN
    RAISE EXCEPTION 'Cancellation request outside active task' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "StoryTask_state_guard" BEFORE INSERT OR UPDATE ON "StoryTask" FOR EACH ROW EXECUTE FUNCTION story_m2_guard_task();

CREATE FUNCTION story_m2_guard_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task "StoryTask"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'PREPARED' OR NEW."taskId" IS NOT NULL OR NEW."consumedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Confirmation cannot arrive consumed' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."state" <> 'PREPARED' OR NEW."state" <> 'CONSUMED' OR
    (NEW."id",NEW."studioId",NEW."generation",NEW."recipeHash",NEW."profileHash",NEW."expectedStudioRevision",NEW."quoteMaxUsdMicros",NEW."authorityRef",NEW."preparedAt",NEW."expiresAt") IS DISTINCT FROM
    (OLD."id",OLD."studioId",OLD."generation",OLD."recipeHash",OLD."profileHash",OLD."expectedStudioRevision",OLD."quoteMaxUsdMicros",OLD."authorityRef",OLD."preparedAt",OLD."expiresAt") OR
    NEW."taskId" IS NULL OR NEW."consumedAt" > NEW."expiresAt" OR NEW."consumedAt" < NEW."preparedAt" OR
    NEW."consumedAt" > clock_timestamp() + interval '1 millisecond' OR
    NEW."preparedAt" > clock_timestamp() + interval '1 millisecond' OR NEW."expiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'Single-use confirmation violated' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT task FROM "StoryTask" WHERE "id" = NEW."taskId";
  IF (NEW."studioId",NEW."recipeHash",NEW."profileHash",NEW."expectedStudioRevision") IS DISTINCT FROM
     (task."studioId",task."recipeHash",task."profileHash",task."expectedStudioRevision") OR
     NOT (NEW."generation" = task."generation" OR
       (NEW."generation" = task."generation" + 1 AND task."state" IN ('FAILED','CANCELLED') AND
        NOT EXISTS (SELECT 1 FROM "StoryProviderSubmission" s WHERE s."taskId" = task."id" AND s."state" <> 'RESOLVED'))) THEN
    RAISE EXCEPTION 'Confirmation binding mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "StoryPaidConfirmation_use_guard" BEFORE INSERT OR UPDATE ON "StoryPaidConfirmation" FOR EACH ROW EXECUTE FUNCTION story_m2_guard_confirmation();

CREATE FUNCTION story_m2_guard_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task "StoryTask"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT task FROM "StoryTask" WHERE "id" = NEW."taskId" FOR UPDATE;
  IF NEW."generation" <> task."generation" OR task."state" NOT IN ('QUEUED','LEASED') OR
     (TG_OP = 'UPDATE' AND (OLD."taskId" <> NEW."taskId" OR
       (NEW."generation" = OLD."generation" AND
        (NEW."publishAttempts" < OLD."publishAttempts" OR NEW."preSubmitAttempts" < OLD."preSubmitAttempts")) OR
       (NEW."generation" <> OLD."generation" AND
        (NEW."generation" <> OLD."generation" + 1 OR NEW."preSubmitAttempts" <> 0 OR
         NEW."queueReceipt" IS NOT NULL OR NEW."owner" IS NOT NULL OR NEW."leaseUntil" IS NOT NULL)))) THEN
    RAISE EXCEPTION 'Stale dispatch generation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "StoryTaskDispatch_generation_guard" BEFORE INSERT OR UPDATE ON "StoryTaskDispatch" FOR EACH ROW EXECUTE FUNCTION story_m2_guard_dispatch();

CREATE FUNCTION story_m2_guard_submission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task "StoryTask"%ROWTYPE; grant_row "StoryPaidConfirmation"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'SUBMITTED' OR NEW."definitiveAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Checkpoint state invalid' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT task FROM "StoryTask" WHERE "id" = NEW."taskId" FOR UPDATE;
    SELECT * INTO STRICT grant_row FROM "StoryPaidConfirmation" WHERE "id" = NEW."confirmationId" FOR UPDATE;
    IF task."generation" <> NEW."generation" OR task."state" <> 'LEASED' OR
       task."cancelRequestedAt" IS NOT NULL OR task."leaseOwner" IS DISTINCT FROM NEW."owner" OR
       task."leaseUntil" <= clock_timestamp() OR grant_row."state" <> 'CONSUMED' OR
       grant_row."taskId" IS DISTINCT FROM task."id" OR grant_row."generation" <> NEW."generation" OR
       grant_row."expiresAt" <= clock_timestamp() OR grant_row."consumedAt" IS NULL THEN
      RAISE EXCEPTION 'Checkpoint fencing or grant invalid' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id",NEW."taskId",NEW."generation",NEW."confirmationId",NEW."requestHash",NEW."owner",NEW."checkpointAt") IS DISTINCT FROM
     (OLD."id",OLD."taskId",OLD."generation",OLD."confirmationId",OLD."requestHash",OLD."owner",OLD."checkpointAt") OR
     NOT ((OLD."state" = 'SUBMITTED' AND NEW."state" IN ('UNKNOWN','RESOLVED')) OR
          (OLD."state" = 'UNKNOWN' AND NEW."state" = 'RESOLVED')) THEN
    RAISE EXCEPTION 'Submission outcome cannot move backward' USING ERRCODE = '23514'; END IF;
  IF NEW."state" = 'RESOLVED' AND NOT EXISTS (SELECT 1 FROM "StoryTaskResult" WHERE "submissionId" = OLD."id") THEN
    RAISE EXCEPTION 'Definitive result required to release slot' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "StoryProviderSubmission_outcome_guard" BEFORE INSERT OR UPDATE ON "StoryProviderSubmission" FOR EACH ROW EXECUTE FUNCTION story_m2_guard_submission();

CREATE FUNCTION story_m2_guard_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE submission "StoryProviderSubmission"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT submission FROM "StoryProviderSubmission" WHERE "id" = NEW."submissionId" FOR UPDATE;
  IF submission."state" NOT IN ('SUBMITTED','UNKNOWN') OR
     NEW."taskId" IS DISTINCT FROM submission."taskId" OR NEW."generation" <> submission."generation" THEN
    RAISE EXCEPTION 'Result must bind unresolved original submission' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "StoryTaskResult_binding_guard" BEFORE INSERT ON "StoryTaskResult" FOR EACH ROW EXECUTE FUNCTION story_m2_guard_result();

CREATE FUNCTION story_m2_guard_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_generation INTEGER; expected_sequence INTEGER;
BEGIN
  SELECT "generation" INTO STRICT current_generation FROM "StoryTask" WHERE "id" = NEW."taskId" FOR UPDATE;
  SELECT COALESCE(max("sequence") + 1, 0) INTO expected_sequence FROM "StoryTaskEvent" WHERE "taskId" = NEW."taskId";
  IF NEW."generation" <> current_generation OR NEW."sequence" <> expected_sequence THEN
    RAISE EXCEPTION 'Stale event ledger' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "StoryTaskEvent_sequence_guard" BEFORE INSERT ON "StoryTaskEvent" FOR EACH ROW EXECUTE FUNCTION story_m2_guard_event();

CREATE TRIGGER "StoryTask_no_delete" BEFORE DELETE ON "StoryTask" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTaskDispatch_no_delete" BEFORE DELETE ON "StoryTaskDispatch" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryPaidConfirmation_no_delete" BEFORE DELETE ON "StoryPaidConfirmation" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryProviderSubmission_no_delete" BEFORE DELETE ON "StoryProviderSubmission" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTaskResult_no_delete" BEFORE DELETE ON "StoryTaskResult" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTaskEvent_no_delete" BEFORE DELETE ON "StoryTaskEvent" FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTask_no_truncate" BEFORE TRUNCATE ON "StoryTask" FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTaskDispatch_no_truncate" BEFORE TRUNCATE ON "StoryTaskDispatch" FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryPaidConfirmation_no_truncate" BEFORE TRUNCATE ON "StoryPaidConfirmation" FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryProviderSubmission_no_truncate" BEFORE TRUNCATE ON "StoryProviderSubmission" FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTaskResult_no_truncate" BEFORE TRUNCATE ON "StoryTaskResult" FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryTaskEvent_no_truncate" BEFORE TRUNCATE ON "StoryTaskEvent" FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();

-- Review-only role boundary. Actual grants and trusted gateways are a separate deployment decision.
-- Table ownership and trigger/function ownership stay with the migration owner.
-- No PUBLIC write privileges. A caller-authored JSON proposal never grants spending authority.
REVOKE ALL ON "StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryProviderSubmission", "StoryTaskResult", "StoryTaskEvent" FROM PUBLIC;
-- Proposed provisioning: NOLOGIN runtime_read, admission_writer, checkpoint_writer roles.
-- Grant SELECT to runtime_read; grant only scoped EXECUTE on SECURITY DEFINER gateways
-- after independent auth review. Direct INSERT/UPDATE to grants/submissions is forbidden.
-- This draft intentionally provides NO runtime write grant and NO gateway.

ROLLBACK;
