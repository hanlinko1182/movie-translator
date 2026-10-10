-- Additive only: no existing columns, rows or enums are rewritten.
BEGIN;

CREATE TYPE "RenderMode" AS ENUM ('BURN_IN');
CREATE TYPE "RenderScope" AS ENUM ('ALL_CURRENT', 'APPROVED_ONLY');
CREATE TYPE "RenderState" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "RenderFailureCode" AS ENUM ('SOURCE_MEDIA_MISSING', 'SOURCE_MEDIA_INVALID', 'SOURCE_MEDIA_CHANGED', 'STORAGE_UNAVAILABLE', 'SUBTITLE_SNAPSHOT_INVALID', 'RENDER_FAILED', 'RENDER_TIMEOUT', 'OUTPUT_INVALID');

CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "recipeHash" VARCHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "mode" "RenderMode" NOT NULL,
    "scope" "RenderScope" NOT NULL,
    "profileId" TEXT NOT NULL,
    "state" "RenderState" NOT NULL DEFAULT 'QUEUED',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "errorCode" "RenderFailureCode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RenderJob_recipe_hash_check" CHECK ("recipeHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "RenderJob_counters_check" CHECK ("generation" >= 0 AND "attempts" >= 0),
    CONSTRAINT "RenderJob_profile_check" CHECK ("profileId" = 'myanmar-mp4-cpu-v1'),
    CONSTRAINT "RenderJob_snapshot_check" CHECK (
      jsonb_typeof("snapshot") = 'object' AND
      ("snapshot"->>'version') IS NOT DISTINCT FROM '1' AND
      ("snapshot"->>'recipeHash') IS NOT DISTINCT FROM "recipeHash" AND
      ("snapshot"->'recipe'->>'movieId') IS NOT DISTINCT FROM "movieId" AND
      ("snapshot"->'recipe'->>'mode') IS NOT DISTINCT FROM "mode"::text AND
      ("snapshot"->'recipe'->>'scope') IS NOT DISTINCT FROM "scope"::text AND
      ("snapshot"->'recipe'->'profile'->>'id') IS NOT DISTINCT FROM "profileId"
    )
);

CREATE TABLE "RenderOutput" (
    "id" TEXT NOT NULL,
    "renderJobId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'video/mp4',
    "sha256" VARCHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "videoCodec" TEXT NOT NULL,
    "audioCodec" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RenderOutput_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RenderOutput_metadata_check" CHECK (
      "sha256" ~ '^[0-9a-f]{64}$' AND "sizeBytes" > 0 AND "durationMs" > 0 AND
      "width" > 0 AND "height" > 0 AND "mimeType" = 'video/mp4' AND
      "videoCodec" = 'h264' AND ("audioCodec" IS NULL OR "audioCodec" = 'aac')
    )
);

CREATE INDEX "RenderJob_movieId_createdAt_idx" ON "RenderJob"("movieId", "createdAt");
CREATE INDEX "RenderJob_state_createdAt_idx" ON "RenderJob"("state", "createdAt");
CREATE UNIQUE INDEX "RenderJob_movieId_recipeHash_key" ON "RenderJob"("movieId", "recipeHash");
CREATE UNIQUE INDEX "RenderOutput_renderJobId_key" ON "RenderOutput"("renderJobId");
CREATE UNIQUE INDEX "RenderOutput_storageKey_key" ON "RenderOutput"("storageKey");

ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RenderOutput" ADD CONSTRAINT "RenderOutput_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Workers may change lifecycle fields later, never the frozen input/identity.
CREATE FUNCTION protect_render_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR
     NEW."recipeHash" IS DISTINCT FROM OLD."recipeHash" OR
     NEW."movieId" IS DISTINCT FROM OLD."movieId" OR
     NEW."mode" IS DISTINCT FROM OLD."mode" OR
     NEW."scope" IS DISTINCT FROM OLD."scope" OR
     NEW."profileId" IS DISTINCT FROM OLD."profileId" THEN
    RAISE EXCEPTION 'Render snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RenderJob_immutable_snapshot" BEFORE UPDATE ON "RenderJob"
FOR EACH ROW EXECUTE FUNCTION protect_render_snapshot();

COMMIT;
