-- Stop all old render workers before deployment. Enum values must commit before
-- constraints/queries use them. Additive: no source/domain/snapshot row rewrite.
BEGIN;
ALTER TYPE "RenderMode" ADD VALUE 'SOFT_SUBTITLE';
ALTER TYPE "RenderFailureCode" ADD VALUE 'SUBTITLE_PROFILE_UNSUPPORTED';
COMMIT;

BEGIN;
ALTER TABLE "RenderOutput" ADD COLUMN "streamManifest" JSONB;
ALTER TABLE "RenderJob" DROP CONSTRAINT "RenderJob_profile_check";
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_profile_check" CHECK (
  ("mode" = 'BURN_IN' AND "profileId" = 'myanmar-mp4-cpu-v1') OR
  ("mode" = 'SOFT_SUBTITLE' AND "profileId" = 'myanmar-mp4-soft-copy-v1')
);
ALTER TABLE "RenderJob" DROP CONSTRAINT "RenderJob_snapshot_check";
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_snapshot_check" CHECK (
  jsonb_typeof("snapshot") = 'object' AND
  ("snapshot"->>'version') IS NOT DISTINCT FROM (CASE WHEN "mode" = 'BURN_IN' THEN '1' ELSE '2' END) AND
  ("snapshot"->'recipe'->>'version') IS NOT DISTINCT FROM ("snapshot"->>'version') AND
  ("snapshot"->>'recipeHash') IS NOT DISTINCT FROM "recipeHash" AND
  ("snapshot"->'recipe'->>'movieId') IS NOT DISTINCT FROM "movieId" AND
  ("snapshot"->'recipe'->>'mode') IS NOT DISTINCT FROM "mode"::text AND
  ("snapshot"->'recipe'->>'scope') IS NOT DISTINCT FROM "scope"::text AND
  ("snapshot"->'recipe'->'profile'->>'id') IS NOT DISTINCT FROM "profileId"
);
-- Legacy burn-in receipts remain nullable; immutable recipe trigger unchanged.
ALTER TABLE "RenderOutput" ADD CONSTRAINT "RenderOutput_manifest_check" CHECK (
  "streamManifest" IS NULL OR (jsonb_typeof("streamManifest") = 'object' AND
    ("streamManifest"->>'version') IS NOT DISTINCT FROM '1' AND
    ("streamManifest"->>'mode') IS NOT DISTINCT FROM 'SOFT_SUBTITLE')
);
CREATE OR REPLACE FUNCTION guard_render_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1 FROM "RenderOutput" o WHERE o."renderJobId" = NEW."id" AND o."verifiedAt" IS NOT NULL AND
    (NEW."mode" = 'BURN_IN' OR (
      (o."streamManifest"->>'profileId') IS NOT DISTINCT FROM NEW."profileId" AND
      (o."streamManifest"->'video'->>'codec') IS NOT DISTINCT FROM 'h264' AND
      jsonb_typeof(o."streamManifest"->'audio') = 'array' AND
      jsonb_array_length(o."streamManifest"->'audio') = jsonb_array_length(NEW."snapshot"->'recipe'->'sourceMedia'->'streamPlan'->'audio') AND
      (o."streamManifest"->'subtitle'->>'codec') IS NOT DISTINCT FROM 'mov_text' AND
      (o."streamManifest"->'subtitle'->>'language') IS NOT DISTINCT FROM 'mya' AND
      (o."streamManifest"->'subtitle'->>'title') IS NOT DISTINCT FROM 'Myanmar' AND
      (o."streamManifest"->'subtitle'->>'default') IS NOT DISTINCT FROM 'false' AND
      (o."streamManifest"->'subtitle'->>'forced') IS NOT DISTINCT FROM 'false' AND
      (o."streamManifest"->'subtitle'->>'cueCount') IS NOT DISTINCT FROM jsonb_array_length(NEW."snapshot"->'rows')::text AND
      (o."streamManifest"->'subtitle'->>'textTimingSha256') IS NOT NULL AND
      (o."streamManifest"->'subtitle'->>'textTimingSha256') IS NOT DISTINCT FROM (NEW."snapshot"->'recipe'->'subtitleChecksums'->>'softTextTiming')
    ))
  ) THEN
    RAISE EXCEPTION 'Mode-specific verified render output required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
