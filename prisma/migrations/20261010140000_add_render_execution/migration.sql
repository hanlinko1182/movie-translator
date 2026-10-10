-- Additive only: no snapshot, recipe, output or existing domain records rewritten.
ALTER TYPE "RenderFailureCode" ADD VALUE 'SOURCE_PROFILE_UNSUPPORTED';
ALTER TYPE "RenderFailureCode" ADD VALUE 'MYANMAR_FONT_UNAVAILABLE';
ALTER TYPE "RenderFailureCode" ADD VALUE 'RENDER_RESOURCE_LIMIT';
ALTER TABLE "RenderJob" ADD COLUMN "phase" TEXT, ADD COLUMN "progressPercent" INTEGER;
ALTER TABLE "RenderDispatch" ADD COLUMN "publication" JSONB;
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_execution_metadata" CHECK (
  ("phase" IS NULL OR "phase" IN ('preparing','encoding','verifying','publishing')) AND
  ("progressPercent" IS NULL OR "progressPercent" BETWEEN 0 AND 99)
);
-- Existing immutable-snapshot and verified-completion triggers remain in place.
