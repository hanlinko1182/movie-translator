-- REVIEW ONLY: structural ledger proposal for a newly owned disposable PostgreSQL database.
-- Apply after the baseline, M1 and six-table M2 draft. No issuer or admission gateway
-- is installed: these rows cannot authenticate an operator by themselves.
-- The final ROLLBACK is deliberate; disposable tests replace it in memory.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE "StorySpendingDecision" (
  "id" TEXT PRIMARY KEY,
  "studioId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "movieId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "authorityProvider" TEXT NOT NULL, "authorityVersion" TEXT NOT NULL,
  "taskCreateAllowed" BOOLEAN NOT NULL, "spendAllowed" BOOLEAN NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL, "sourceContentHash" VARCHAR(64) NOT NULL,
  "sourceContextHash" VARCHAR(64) NOT NULL, "scriptVersionId" TEXT, "scriptHash" VARCHAR(64),
  "kind" "StoryTaskKind" NOT NULL, "recipeHash" VARCHAR(64) NOT NULL,
  "canonicalRecipe" TEXT NOT NULL, "profileHash" VARCHAR(64) NOT NULL,
  "costPolicyHash" VARCHAR(64) NOT NULL, "quoteMaxUsdMicros" BIGINT NOT NULL,
  "expectedStudioRevision" INTEGER NOT NULL, "generation" INTEGER NOT NULL DEFAULT 0,
  "maxSubmissions" INTEGER NOT NULL DEFAULT 1, "nonceHash" VARCHAR(64) NOT NULL UNIQUE,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL, "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorySpendingDecision_scope_fkey" FOREIGN KEY ("studioId","projectId","movieId")
    REFERENCES "StorylineStudio"("id","projectId","movieId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySpendingDecision_source_fkey" FOREIGN KEY ("sourceSnapshotId","studioId","sourceContentHash","sourceContextHash")
    REFERENCES "StorySourceSnapshot"("id","studioId","sourceContentHash","sourceContextHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySpendingDecision_script_fkey" FOREIGN KEY ("scriptVersionId","studioId","sourceSnapshotId","sourceContentHash","sourceContextHash","scriptHash")
    REFERENCES "StoryScriptVersion"("id","studioId","sourceSnapshotId","sourceContentHash","sourceContextHash","scriptHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySpendingDecision_binding_key" UNIQUE ("id","studioId","projectId","movieId","subjectId","idempotencyKey","recipeHash"),
  CONSTRAINT "StorySpendingDecision_bounds" CHECK ((
    octet_length("subjectId") BETWEEN 1 AND 128 AND octet_length("idempotencyKey") BETWEEN 1 AND 128 AND
    octet_length("authorityProvider") BETWEEN 1 AND 128 AND
    octet_length("authorityVersion") BETWEEN 1 AND 64 AND
    "taskCreateAllowed" AND "spendAllowed" AND "maxSubmissions" = 1 AND
    story_m1_is_hash("recipeHash") AND story_m1_is_hash("profileHash") AND
    story_m1_is_hash("costPolicyHash") AND story_m1_is_hash("nonceHash") AND
    story_m1_is_hash("sourceContentHash") AND story_m1_is_hash("sourceContextHash") AND
    (("scriptVersionId" IS NULL AND "scriptHash" IS NULL) OR
     ("scriptVersionId" IS NOT NULL AND story_m1_is_hash("scriptHash"))) AND
    octet_length("canonicalRecipe") BETWEEN 1 AND 16384 AND
    "quoteMaxUsdMicros" BETWEEN 1 AND 100000000 AND "expectedStudioRevision" >= 0 AND
    "generation" BETWEEN 0 AND 1000000 AND isfinite("acknowledgedAt") AND
    isfinite("issuedAt") AND isfinite("expiresAt") AND
    "acknowledgedAt" <= "issuedAt" AND "issuedAt" < "expiresAt" AND
    "expiresAt" <= "issuedAt" + interval '5 minutes'
  ) IS TRUE),
  CONSTRAINT "StorySpendingDecision_recipe_projection" CHECK ((
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

CREATE TABLE "StoryAdmission" (
  "id" TEXT PRIMARY KEY, "decisionId" TEXT NOT NULL UNIQUE,
  "studioId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "movieId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "taskId" TEXT NOT NULL, "recipeHash" VARCHAR(64) NOT NULL,
  "canonicalRecipe" TEXT NOT NULL, "generation" INTEGER NOT NULL,
  "confirmationId" TEXT NOT NULL UNIQUE, "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryAdmission_scoped_key" UNIQUE ("subjectId","projectId","movieId","idempotencyKey"),
  CONSTRAINT "StoryAdmission_task_generation_key" UNIQUE ("taskId","generation"),
  CONSTRAINT "StoryAdmission_decision_binding_key" UNIQUE ("decisionId","studioId","projectId","movieId","subjectId","idempotencyKey","recipeHash"),
  CONSTRAINT "StoryAdmission_decision_fkey" FOREIGN KEY ("decisionId","studioId","projectId","movieId","subjectId","idempotencyKey","recipeHash")
    REFERENCES "StorySpendingDecision"("id","studioId","projectId","movieId","subjectId","idempotencyKey","recipeHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryAdmission_task_fkey" FOREIGN KEY ("taskId","studioId","recipeHash")
    REFERENCES "StoryTask"("id","studioId","recipeHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryAdmission_confirmation_fkey" FOREIGN KEY ("confirmationId","taskId","generation")
    REFERENCES "StoryPaidConfirmation"("id","taskId","generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryAdmission_bounds" CHECK ((
    octet_length("subjectId") BETWEEN 1 AND 128 AND octet_length("idempotencyKey") BETWEEN 1 AND 128 AND
    story_m1_is_hash("recipeHash") AND octet_length("canonicalRecipe") BETWEEN 1 AND 16384 AND
    "generation" BETWEEN 0 AND 1000000 AND isfinite("admittedAt")
  ) IS TRUE)
);
CREATE INDEX "StoryAdmission_scope_task_idx" ON "StoryAdmission"("studioId","taskId");

-- Structural matching is necessary, but not proof of authenticated authority.
-- A later gateway must recheck exact M1 source/media currentness and operator rights.
CREATE FUNCTION story_m2_guard_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE decision_row "StorySpendingDecision"%ROWTYPE;
        task_row "StoryTask"%ROWTYPE;
        confirmation_row "StoryPaidConfirmation"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT decision_row FROM "StorySpendingDecision" WHERE id = NEW."decisionId";
  SELECT * INTO STRICT task_row FROM "StoryTask" WHERE id = NEW."taskId";
  SELECT * INTO STRICT confirmation_row FROM "StoryPaidConfirmation" WHERE id = NEW."confirmationId";
  IF decision_row."canonicalRecipe" <> NEW."canonicalRecipe" OR
     task_row."canonicalRecipe" <> NEW."canonicalRecipe" OR
     decision_row."generation" <> NEW."generation" OR task_row."generation" <> NEW."generation" OR
     task_row."kind" <> decision_row."kind" OR task_row."sourceSnapshotId" <> decision_row."sourceSnapshotId" OR
     task_row."sourceContentHash" <> decision_row."sourceContentHash" OR
     task_row."sourceContextHash" <> decision_row."sourceContextHash" OR
     task_row."scriptVersionId" IS DISTINCT FROM decision_row."scriptVersionId" OR
     task_row."scriptHash" IS DISTINCT FROM decision_row."scriptHash" OR
     task_row."profileHash" <> decision_row."profileHash" OR
     task_row."expectedStudioRevision" <> decision_row."expectedStudioRevision" OR
     confirmation_row."authorityRef" <> decision_row."id" OR
     confirmation_row."state" <> 'CONSUMED' OR
     confirmation_row."recipeHash" <> decision_row."recipeHash" OR
     confirmation_row."profileHash" <> decision_row."profileHash" OR
     confirmation_row."expectedStudioRevision" <> decision_row."expectedStudioRevision" OR
     confirmation_row."quoteMaxUsdMicros" <> decision_row."quoteMaxUsdMicros" OR
     confirmation_row."expiresAt" > decision_row."expiresAt" OR
     decision_row."expiresAt" <= clock_timestamp() OR
     confirmation_row."expiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid admission binding' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StoryAdmission_binding_guard" BEFORE INSERT ON "StoryAdmission"
  FOR EACH ROW EXECUTE FUNCTION story_m2_guard_admission();
REVOKE ALL ON FUNCTION story_m2_guard_admission() FROM PUBLIC;
CREATE TRIGGER "StorySpendingDecision_immutable" BEFORE UPDATE OR DELETE ON "StorySpendingDecision"
  FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryAdmission_immutable" BEFORE UPDATE OR DELETE ON "StoryAdmission"
  FOR EACH ROW EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StorySpendingDecision_no_truncate" BEFORE TRUNCATE ON "StorySpendingDecision"
  FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();
CREATE TRIGGER "StoryAdmission_no_truncate" BEFORE TRUNCATE ON "StoryAdmission"
  FOR EACH STATEMENT EXECUTE FUNCTION story_m2_reject_history_mutation();

REVOKE ALL ON "StorySpendingDecision", "StoryAdmission" FROM PUBLIC;
-- Deliberately no issuer/admission/checkpoint/ordinary runtime DML or gateway EXECUTE grant.
ROLLBACK;
