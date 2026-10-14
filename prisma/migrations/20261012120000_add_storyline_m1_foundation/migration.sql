-- Additive Storyline M1 foundation. Apply only after explicit target-database approval.
-- Reviewed against disposable PostgreSQL 18.6; preserve custom guards and role boundaries.
-- See docs/STORYLINE_PERSISTENCE_REVIEW.md for trust/retention/deployment gates.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Additive index over an existing primary key: no row rewrite/backfill.
-- A normal index build takes a write-conflicting lock; approve deployment window.
CREATE UNIQUE INDEX "Movie_id_projectId_key" ON "Movie" ("id", "projectId");

CREATE TYPE "StoryScriptOrigin" AS ENUM ('MODEL', 'HUMAN');
CREATE TYPE "StoryBeatCategory" AS ENUM ('SETUP', 'OBSERVATION', 'CONFLICT', 'DECISION', 'CONSEQUENCE', 'RELATIONSHIP_CHANGE', 'TURNING_POINT', 'RESOLUTION');
CREATE TYPE "StoryVerificationKind" AS ENUM ('RECEIPT', 'REVOCATION');
CREATE TYPE "StoryVerificationOutcome" AS ENUM ('SOURCE_VERIFIED', 'INCONCLUSIVE', 'UNSUPPORTED', 'REVOKED');

CREATE FUNCTION story_m1_is_hash(value TEXT) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$ SELECT value IS NOT NULL AND value ~ '^[0-9a-f]{64}$' $$;

CREATE TABLE "StorylineStudio" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "movieId" TEXT NOT NULL UNIQUE,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "nextScriptVersion" INTEGER NOT NULL DEFAULT 1,
  "verificationGenesisHash" VARCHAR(64) NOT NULL,
  "currentSnapshotId" TEXT,
  "currentScriptVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorylineStudio_scope_key" UNIQUE ("id", "projectId", "movieId"),
  CONSTRAINT "StorylineStudio_movieId_projectId_key" UNIQUE ("movieId", "projectId"),
  CONSTRAINT "StorylineStudio_movie_scope_fkey" FOREIGN KEY ("movieId", "projectId") REFERENCES "Movie" ("id", "projectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorylineStudio_bounds" CHECK (
    "revision" >= 0 AND "nextScriptVersion" >= 1 AND story_m1_is_hash("verificationGenesisHash") AND
    isfinite("createdAt") AND isfinite("updatedAt")
  )
);

CREATE TABLE "StorySourceSnapshot" (
  "id" TEXT PRIMARY KEY,
  "studioId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "movieId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL DEFAULT 'story-source-v1',
  "sourceContentHash" VARCHAR(64) NOT NULL,
  "sourceContextHash" VARCHAR(64) NOT NULL,
  "dependencyHash" VARCHAR(64) NOT NULL,
  "sourceBindingHash" VARCHAR(64) NOT NULL,
  "sourceSha256" VARCHAR(64) NOT NULL,
  "sourceBytes" BIGINT NOT NULL,
  "sourceDurationMs" INTEGER NOT NULL,
  "canonicalPayload" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorySourceSnapshot_studio_key" UNIQUE ("id", "studioId"),
  CONSTRAINT "StorySourceSnapshot_binding_key" UNIQUE ("id", "studioId", "sourceContentHash", "sourceContextHash"),
  CONSTRAINT "StorySourceSnapshot_studioId_sourceContextHash_key" UNIQUE ("studioId", "sourceContextHash"),
  CONSTRAINT "StorySourceSnapshot_scope_fkey" FOREIGN KEY ("studioId", "projectId", "movieId") REFERENCES "StorylineStudio" ("id", "projectId", "movieId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySourceSnapshot_bounds" CHECK (
    "schemaVersion" = 'story-source-v1' AND "sourceDurationMs" > 0 AND
    "sourceBytes" > 0 AND "sourceBytes" <= 9007199254740991 AND
    octet_length("canonicalPayload") BETWEEN 1 AND 16777216 AND
    story_m1_is_hash("sourceContentHash") AND story_m1_is_hash("sourceContextHash") AND
    story_m1_is_hash("dependencyHash") AND story_m1_is_hash("sourceBindingHash") AND story_m1_is_hash("sourceSha256") AND
    isfinite("capturedAt") AND isfinite("createdAt")
  ),
  -- JSON (not JSONB) operators preserve canonical Unicode/escape bytes in TEXT.
  -- Missing fields cannot pass via SQL CHECK's usual NULL success behavior.
  CONSTRAINT "StorySourceSnapshot_payload_binding" CHECK ((
    json_typeof("canonicalPayload"::json) = 'object' AND
    ("canonicalPayload"::json->>'schemaVersion') IS NOT DISTINCT FROM "schemaVersion" AND
    ("canonicalPayload"::json->>'id') IS NOT DISTINCT FROM "id" AND
    ("canonicalPayload"::json->>'projectId') IS NOT DISTINCT FROM "projectId" AND
    ("canonicalPayload"::json->>'movieId') IS NOT DISTINCT FROM "movieId" AND
    ("canonicalPayload"::json->>'translationContextPolicy') IS NOT DISTINCT FROM 'ALL_CURRENT' AND
    ("canonicalPayload"::json->'media'->>'sha256') IS NOT DISTINCT FROM "sourceSha256" AND
    ("canonicalPayload"::json->'media'->>'bytes') IS NOT DISTINCT FROM "sourceBytes"::text AND
    ("canonicalPayload"::json->'media'->>'durationMs') IS NOT DISTINCT FROM "sourceDurationMs"::text AND
    ("canonicalPayload"::json->'preparation'->>'dependencyHash') IS NOT DISTINCT FROM "dependencyHash" AND
    ("canonicalPayload"::json->'preparation'->>'sourceBindingHash') IS NOT DISTINCT FROM "sourceBindingHash" AND
    (("canonicalPayload"::json->>'capturedAt')::timestamptz AT TIME ZONE 'UTC') IS NOT DISTINCT FROM "capturedAt"
  ) IS TRUE)
);

CREATE TABLE "StoryScriptVersion" (
  "id" TEXT PRIMARY KEY,
  "studioId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "sourceContentHash" VARCHAR(64) NOT NULL,
  "sourceContextHash" VARCHAR(64) NOT NULL,
  "scriptHash" VARCHAR(64) NOT NULL,
  "schemaVersion" TEXT NOT NULL DEFAULT 'story-script-v1',
  "version" INTEGER NOT NULL,
  "parentVersionId" TEXT,
  "parentVersion" INTEGER,
  "origin" "StoryScriptOrigin" NOT NULL,
  "canonicalPayload" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryScriptVersion_studioId_version_key" UNIQUE ("studioId", "version"),
  CONSTRAINT "StoryScriptVersion_studioId_scriptHash_key" UNIQUE ("studioId", "scriptHash"),
  CONSTRAINT "StoryScriptVersion_studio_key" UNIQUE ("id", "studioId"),
  CONSTRAINT "StoryScriptVersion_parent_key" UNIQUE ("id", "studioId", "version"),
  CONSTRAINT "StoryScriptVersion_binding_key" UNIQUE ("id", "studioId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash"),
  CONSTRAINT "StoryScriptVersion_studio_fkey" FOREIGN KEY ("studioId") REFERENCES "StorylineStudio" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryScriptVersion_source_fkey" FOREIGN KEY ("sourceSnapshotId", "studioId", "sourceContentHash", "sourceContextHash") REFERENCES "StorySourceSnapshot" ("id", "studioId", "sourceContentHash", "sourceContextHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryScriptVersion_parent_fkey" FOREIGN KEY ("parentVersionId", "studioId", "parentVersion") REFERENCES "StoryScriptVersion" ("id", "studioId", "version") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryScriptVersion_bounds" CHECK ((
    "version" >= 1 AND (
      ("version" = 1 AND "parentVersionId" IS NULL AND "parentVersion" IS NULL) OR
      ("version" > 1 AND "parentVersionId" IS NOT NULL AND "parentVersion" = "version" - 1 AND "parentVersionId" <> "id")
    ) AND "schemaVersion" = 'story-script-v1' AND
    story_m1_is_hash("sourceContentHash") AND story_m1_is_hash("sourceContextHash") AND story_m1_is_hash("scriptHash") AND
    octet_length("canonicalPayload") BETWEEN 1 AND 524288 AND isfinite("createdAt")
  ) IS TRUE),
  CONSTRAINT "StoryScriptVersion_payload_binding" CHECK ((
    json_typeof("canonicalPayload"::json) = 'object' AND
    ("canonicalPayload"::json->>'schemaVersion') IS NOT DISTINCT FROM "schemaVersion" AND
    ("canonicalPayload"::json->>'id') IS NOT DISTINCT FROM "id" AND
    ("canonicalPayload"::json->>'version') IS NOT DISTINCT FROM "version"::text AND
    ("canonicalPayload"::json->>'parentVersionId') IS NOT DISTINCT FROM "parentVersionId" AND
    ("canonicalPayload"::json->>'sourceSnapshotId') IS NOT DISTINCT FROM "sourceSnapshotId" AND
    ("canonicalPayload"::json->>'sourceContentHash') IS NOT DISTINCT FROM "sourceContentHash" AND
    ("canonicalPayload"::json->>'sourceContextHash') IS NOT DISTINCT FROM "sourceContextHash" AND
    ("canonicalPayload"::json->>'origin') IS NOT DISTINCT FROM "origin"::text AND
    ("canonicalPayload"::json->>'style') IS NOT DISTINCT FROM 'CHARACTER_PSYCHOLOGY' AND
    ("canonicalPayload"::json->>'durationMode') IS NOT DISTINCT FROM 'AUTO_STORY_COMPLEXITY' AND
    ("canonicalPayload"::json->>'translationContextPolicy') IS NOT DISTINCT FROM 'ALL_CURRENT' AND
    ("canonicalPayload"::json->>'language') IS NOT DISTINCT FROM 'my' AND
    json_array_length("canonicalPayload"::json->'beats') BETWEEN 1 AND 60
  ) IS TRUE)
);

CREATE TABLE "StoryBeat" (
  "scriptVersionId" TEXT NOT NULL,
  "studioId" TEXT NOT NULL,
  "beatId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "category" "StoryBeatCategory" NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "canonicalPayload" TEXT NOT NULL,
  CONSTRAINT "StoryBeat_pkey" PRIMARY KEY ("scriptVersionId", "beatId"),
  CONSTRAINT "StoryBeat_scriptVersionId_order_key" UNIQUE ("scriptVersionId", "order"),
  CONSTRAINT "StoryBeat_script_fkey" FOREIGN KEY ("scriptVersionId", "studioId") REFERENCES "StoryScriptVersion" ("id", "studioId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryBeat_bounds" CHECK ("order" BETWEEN 0 AND 59 AND "startMs" >= 0 AND "endMs" > "startMs" AND octet_length("canonicalPayload") BETWEEN 1 AND 524288),
  CONSTRAINT "StoryBeat_payload_binding" CHECK ((
    json_typeof("canonicalPayload"::json) = 'object' AND
    ("canonicalPayload"::json->>'id') IS NOT DISTINCT FROM "beatId" AND
    ("canonicalPayload"::json->>'order') IS NOT DISTINCT FROM "order"::text AND
    ("canonicalPayload"::json->>'category') IS NOT DISTINCT FROM "category"::text AND
    ("canonicalPayload"::json->>'startMs') IS NOT DISTINCT FROM "startMs"::text AND
    ("canonicalPayload"::json->>'endMs') IS NOT DISTINCT FROM "endMs"::text
  ) IS TRUE)
);

CREATE TABLE "StorySourceVerification" (
  "id" TEXT PRIMARY KEY,
  "studioId" TEXT NOT NULL,
  "scriptVersionId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "sourceContentHash" VARCHAR(64) NOT NULL,
  "sourceContextHash" VARCHAR(64) NOT NULL,
  "scriptHash" VARCHAR(64) NOT NULL,
  "claimId" TEXT NOT NULL,
  "claimContentHash" VARCHAR(64) NOT NULL,
  "anchorSetHash" VARCHAR(64) NOT NULL,
  "allowedAnchorSetHash" VARCHAR(64) NOT NULL,
  "translationContextHash" VARCHAR(64) NOT NULL,
  "qualificationHash" VARCHAR(64) NOT NULL,
  "policyVersion" TEXT NOT NULL DEFAULT 'story-human-verification-v1',
  "issuerPolicyVersion" TEXT NOT NULL DEFAULT 'story-server-issuer-v1',
  "entryHash" VARCHAR(64) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previousLedgerHash" VARCHAR(64) NOT NULL,
  "previousEntryId" TEXT UNIQUE,
  "kind" "StoryVerificationKind" NOT NULL,
  "outcome" "StoryVerificationOutcome" NOT NULL,
  "canonicalPayload" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorySourceVerification_claim_key" UNIQUE ("id", "studioId", "claimId"),
  CONSTRAINT "StorySourceVerification_studioId_entryHash_key" UNIQUE ("studioId", "entryHash"),
  CONSTRAINT "StorySourceVerification_studioId_sequence_key" UNIQUE ("studioId", "sequence"),
  CONSTRAINT "StorySourceVerification_studio_fkey" FOREIGN KEY ("studioId") REFERENCES "StorylineStudio" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySourceVerification_script_fkey" FOREIGN KEY ("scriptVersionId", "studioId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash") REFERENCES "StoryScriptVersion" ("id", "studioId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySourceVerification_previous_fkey" FOREIGN KEY ("previousEntryId", "studioId", "claimId") REFERENCES "StorySourceVerification" ("id", "studioId", "claimId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySourceVerification_bounds" CHECK ((
    "sequence" BETWEEN 0 AND 2047 AND "id" = 'verification-' || "entryHash" AND
    story_m1_is_hash("entryHash") AND story_m1_is_hash("previousLedgerHash") AND
    story_m1_is_hash("sourceContentHash") AND story_m1_is_hash("sourceContextHash") AND story_m1_is_hash("scriptHash") AND
    story_m1_is_hash("claimContentHash") AND story_m1_is_hash("anchorSetHash") AND story_m1_is_hash("allowedAnchorSetHash") AND
    story_m1_is_hash("translationContextHash") AND story_m1_is_hash("qualificationHash") AND
    "policyVersion" = 'story-human-verification-v1' AND "issuerPolicyVersion" = 'story-server-issuer-v1' AND
    (("kind" = 'RECEIPT' AND "outcome" <> 'REVOKED') OR ("kind" = 'REVOCATION' AND "outcome" = 'REVOKED' AND "previousEntryId" IS NOT NULL)) AND
    octet_length("canonicalPayload") BETWEEN 1 AND 32768 AND
    isfinite("reviewedAt") AND isfinite("issuedAt") AND isfinite("createdAt") AND
    "issuedAt" >= "reviewedAt" AND "issuedAt" <= "reviewedAt" + INTERVAL '5 minutes'
  ) IS TRUE),
  CONSTRAINT "StorySourceVerification_payload_binding" CHECK ((
    json_typeof("canonicalPayload"::json) = 'object' AND
    ("canonicalPayload"::json->>'schemaVersion') IS NOT DISTINCT FROM 'story-persisted-human-verification-v1' AND
    ("canonicalPayload"::json->>'issuerPolicyVersion') IS NOT DISTINCT FROM "issuerPolicyVersion" AND
    ("canonicalPayload"::json->>'kind') IS NOT DISTINCT FROM "kind"::text AND
    ("canonicalPayload"::json->>'outcome') IS NOT DISTINCT FROM "outcome"::text AND
    ("canonicalPayload"::json->>'sequence') IS NOT DISTINCT FROM "sequence"::text AND
    ("canonicalPayload"::json->>'previousEntryId') IS NOT DISTINCT FROM "previousEntryId" AND
    ("canonicalPayload"::json->>'previousLedgerHash') IS NOT DISTINCT FROM "previousLedgerHash" AND
    ("canonicalPayload"::json->'proposal'->>'scriptHash') IS NOT DISTINCT FROM "scriptHash" AND
    ("canonicalPayload"::json->'proposal'->>'ledgerHeadHash') IS NOT DISTINCT FROM "previousLedgerHash" AND
    ("canonicalPayload"::json->'proposal'->>'policyVersion') IS NOT DISTINCT FROM "policyVersion" AND
    ("canonicalPayload"::json->'proposal'->>'rubricVersion') IS NOT DISTINCT FROM 'chinese-source-comparison-v1' AND
    ("canonicalPayload"::json->'proposal'->>'translationContextHash') IS NOT DISTINCT FROM "translationContextHash" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'sourceSnapshotId') IS NOT DISTINCT FROM "sourceSnapshotId" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'sourceContentHash') IS NOT DISTINCT FROM "sourceContentHash" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'sourceContextHash') IS NOT DISTINCT FROM "sourceContextHash" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'claimId') IS NOT DISTINCT FROM "claimId" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'claimContentHash') IS NOT DISTINCT FROM "claimContentHash" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'anchorSetHash') IS NOT DISTINCT FROM "anchorSetHash" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'allowedAnchorSetHash') IS NOT DISTINCT FROM "allowedAnchorSetHash" AND
    ("canonicalPayload"::json->'proposal'->'binding'->>'qualificationHash') IS NOT DISTINCT FROM "qualificationHash" AND
    (("canonicalPayload"::json->>'reviewedAt')::timestamptz AT TIME ZONE 'UTC') IS NOT DISTINCT FROM "reviewedAt" AND
    (("canonicalPayload"::json->>'issuedAt')::timestamptz AT TIME ZONE 'UTC') IS NOT DISTINCT FROM "issuedAt"
  ) IS TRUE)
);

ALTER TABLE "StorylineStudio" ADD CONSTRAINT "StorylineStudio_currentSnapshot_fkey" FOREIGN KEY ("currentSnapshotId", "id") REFERENCES "StorySourceSnapshot" ("id", "studioId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "StorylineStudio" ADD CONSTRAINT "StorylineStudio_currentScript_fkey" FOREIGN KEY ("currentScriptVersionId", "id") REFERENCES "StoryScriptVersion" ("id", "studioId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "StorylineStudio_projectId_updatedAt_idx" ON "StorylineStudio" ("projectId", "updatedAt");
CREATE INDEX "StorySourceSnapshot_studioId_createdAt_idx" ON "StorySourceSnapshot" ("studioId", "createdAt");
CREATE INDEX "StoryScriptVersion_sourceSnapshotId_studioId_idx" ON "StoryScriptVersion" ("sourceSnapshotId", "studioId");
CREATE INDEX "StoryScriptVersion_studioId_createdAt_idx" ON "StoryScriptVersion" ("studioId", "createdAt");
CREATE INDEX "StoryBeat_studioId_scriptVersionId_idx" ON "StoryBeat" ("studioId", "scriptVersionId");
CREATE INDEX "StorySourceVerification_studioId_claimId_sequence_idx" ON "StorySourceVerification" ("studioId", "claimId", "sequence");
CREATE INDEX "StorySourceVerification_scriptVersionId_studioId_idx" ON "StorySourceVerification" ("scriptVersionId", "studioId");
CREATE UNIQUE INDEX "StorySourceVerification_one_claim_root" ON "StorySourceVerification" ("studioId", "claimId") WHERE "previousEntryId" IS NULL;

-- Not SECURITY DEFINER: application credentials/privileges remain an explicit gate.
CREATE FUNCTION story_m1_lock_studio(studio_id TEXT) RETURNS "StorylineStudio"
LANGUAGE plpgsql AS $$
DECLARE result "StorylineStudio"%ROWTYPE;
BEGIN
  -- Same Movie-first order as existing translation/review writes.
  PERFORM 1 FROM "Movie" WHERE "id" = (SELECT "movieId" FROM "StorylineStudio" WHERE "id" = studio_id) FOR UPDATE;
  SELECT * INTO STRICT result FROM "StorylineStudio" WHERE "id" = studio_id FOR UPDATE;
  RETURN result;
END;
$$;

CREATE FUNCTION story_m1_guard_studio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id", NEW."projectId", NEW."movieId", NEW."verificationGenesisHash", NEW."createdAt") IS DISTINCT FROM
     (OLD."id", OLD."projectId", OLD."movieId", OLD."verificationGenesisHash", OLD."createdAt") OR
     NEW."nextScriptVersion" < OLD."nextScriptVersion" THEN
    RAISE EXCEPTION 'Immutable Studio identity or regressing allocation' USING ERRCODE = '23514';
  END IF;
  IF NEW."currentScriptVersionId" IS NOT NULL AND (
    NEW."currentSnapshotId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "StoryScriptVersion" WHERE "id" = NEW."currentScriptVersionId" AND "studioId" = NEW."id" AND "sourceSnapshotId" = NEW."currentSnapshotId"
    )
  ) THEN RAISE EXCEPTION 'Studio pointer context mismatch' USING ERRCODE = '23514'; END IF;
  NEW."revision" := OLD."revision" + 1;
  NEW."updatedAt" := clock_timestamp() AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StorylineStudio_revision_guard" BEFORE UPDATE ON "StorylineStudio" FOR EACH ROW EXECUTE FUNCTION story_m1_guard_studio();

CREATE FUNCTION story_m1_allocate_script() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE studio "StorylineStudio"%ROWTYPE;
BEGIN
  studio := story_m1_lock_studio(NEW."studioId");
  IF NEW."version" <> studio."nextScriptVersion" THEN
    RAISE EXCEPTION 'Stale script version allocation' USING ERRCODE = '23514';
  END IF;
  UPDATE "StorylineStudio" SET "nextScriptVersion" = "nextScriptVersion" + 1 WHERE "id" = NEW."studioId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StoryScriptVersion_allocation_guard" BEFORE INSERT ON "StoryScriptVersion" FOR EACH ROW EXECUTE FUNCTION story_m1_allocate_script();

CREATE FUNCTION story_m1_touch_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM story_m1_lock_studio(NEW."studioId");
  UPDATE "StorylineStudio" SET "revision" = "revision" WHERE "id" = NEW."studioId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StorySourceSnapshot_revision_guard" BEFORE INSERT ON "StorySourceSnapshot" FOR EACH ROW EXECUTE FUNCTION story_m1_touch_snapshot();

-- SQL ensures an exact, complete materialized beat projection at commit.
-- It does NOT replace TypeScript ownership/inference/Unicode/hash validation.
CREATE FUNCTION story_m1_check_beats() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE script_id TEXT; script "StoryScriptVersion"%ROWTYPE; duration INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'StoryBeat' THEN script_id := NEW."scriptVersionId"; ELSE script_id := NEW."id"; END IF;
  SELECT * INTO STRICT script FROM "StoryScriptVersion" WHERE "id" = script_id;
  SELECT "sourceDurationMs" INTO STRICT duration FROM "StorySourceSnapshot" WHERE "id" = script."sourceSnapshotId";
  IF (SELECT count(*) FROM "StoryBeat" WHERE "scriptVersionId" = script_id) <> json_array_length(script."canonicalPayload"::json->'beats') OR EXISTS (
    SELECT 1 FROM "StoryBeat" WHERE "scriptVersionId" = script_id AND (
      "endMs" > duration OR
      "canonicalPayload" IS DISTINCT FROM (script."canonicalPayload"::json->'beats'->"order")::text
    )
  ) THEN RAISE EXCEPTION 'Incomplete or mismatched immutable beats' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "StoryScriptVersion_complete_beats" AFTER INSERT ON "StoryScriptVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION story_m1_check_beats();
CREATE CONSTRAINT TRIGGER "StoryBeat_exact_projection" AFTER INSERT ON "StoryBeat" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION story_m1_check_beats();

CREATE FUNCTION story_m1_append_verification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE studio "StorylineStudio"%ROWTYPE; head "StorySourceVerification"%ROWTYPE; previous "StorySourceVerification"%ROWTYPE; script "StoryScriptVersion"%ROWTYPE;
BEGIN
  studio := story_m1_lock_studio(NEW."studioId");
  SELECT * INTO head FROM "StorySourceVerification" WHERE "studioId" = NEW."studioId" ORDER BY "sequence" DESC LIMIT 1;
  SELECT * INTO previous FROM "StorySourceVerification" WHERE "studioId" = NEW."studioId" AND "claimId" = NEW."claimId" ORDER BY "sequence" DESC LIMIT 1;
  IF NEW."sequence" <> COALESCE(head."sequence" + 1, 0) OR
     NEW."previousLedgerHash" IS DISTINCT FROM COALESCE(head."entryHash", studio."verificationGenesisHash") OR
     NEW."previousEntryId" IS DISTINCT FROM previous."id" OR
     (head."id" IS NOT NULL AND NEW."issuedAt" < head."issuedAt") THEN
    RAISE EXCEPTION 'Stale verification ledger or claim head' USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" = 'REVOCATION' AND (
    previous."id" IS NULL OR previous."kind" <> 'RECEIPT' OR
    (NEW."scriptVersionId", NEW."claimContentHash", NEW."sourceContextHash", NEW."sourceContentHash") IS DISTINCT FROM
    (previous."scriptVersionId", previous."claimContentHash", previous."sourceContextHash", previous."sourceContentHash") OR
    (NEW."canonicalPayload"::json->'proposal'->'binding')::text IS DISTINCT FROM
    (previous."canonicalPayload"::json->'proposal'->'binding')::text
  ) THEN RAISE EXCEPTION 'Invalid revocation target' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT script FROM "StoryScriptVersion" WHERE "id" = NEW."scriptVersionId" AND "studioId" = NEW."studioId";
  IF (NEW."canonicalPayload"::json->'proposal'->'binding'->>'projectId') IS DISTINCT FROM studio."projectId" OR
     (NEW."canonicalPayload"::json->'proposal'->'binding'->>'movieId') IS DISTINCT FROM studio."movieId" OR NOT EXISTS (
       SELECT 1 FROM json_array_elements(script."canonicalPayload"::json->'beats') AS b(value),
         LATERAL json_array_elements(b.value->'claims') AS c(value) WHERE c.value->>'id' = NEW."claimId"
     ) THEN RAISE EXCEPTION 'Verification subject mismatch' USING ERRCODE = '23514'; END IF;
  UPDATE "StorylineStudio" SET "revision" = "revision" WHERE "id" = NEW."studioId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StorySourceVerification_append_guard" BEFORE INSERT ON "StorySourceVerification" FOR EACH ROW EXECUTE FUNCTION story_m1_append_verification();

CREATE FUNCTION story_m1_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Storyline history is immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "StorySourceSnapshot_immutable" BEFORE UPDATE OR DELETE ON "StorySourceSnapshot" FOR EACH ROW EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StoryScriptVersion_immutable" BEFORE UPDATE OR DELETE ON "StoryScriptVersion" FOR EACH ROW EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StoryBeat_immutable" BEFORE UPDATE OR DELETE ON "StoryBeat" FOR EACH ROW EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StorySourceVerification_append_only" BEFORE UPDATE OR DELETE ON "StorySourceVerification" FOR EACH ROW EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StorylineStudio_no_truncate" BEFORE TRUNCATE ON "StorylineStudio" FOR EACH STATEMENT EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StorySourceSnapshot_no_truncate" BEFORE TRUNCATE ON "StorySourceSnapshot" FOR EACH STATEMENT EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StoryScriptVersion_no_truncate" BEFORE TRUNCATE ON "StoryScriptVersion" FOR EACH STATEMENT EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StoryBeat_no_truncate" BEFORE TRUNCATE ON "StoryBeat" FOR EACH STATEMENT EXECUTE FUNCTION story_m1_reject_history_mutation();
CREATE TRIGGER "StorySourceVerification_no_truncate" BEFORE TRUNCATE ON "StorySourceVerification" FOR EACH STATEMENT EXECUTE FUNCTION story_m1_reject_history_mutation();

-- This alone is NOT an issuance authorization system. Dedicated runtime/issuer
-- role grants and a trusted server adapter must pass review before any issuance.
REVOKE ALL ON "StorySourceVerification" FROM PUBLIC;

-- PostgreSQL DDL is transactional; a failure rolls back all changes.
COMMIT;
