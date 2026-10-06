ALTER TYPE "TranslationOrigin" ADD VALUE 'MANUAL';
CREATE TYPE "TranslationReviewStatus" AS ENUM ('UNREVIEWED', 'NEEDS_REVIEW', 'APPROVED');
ALTER TABLE "TranslatedSegment"
  ADD COLUMN "reviewStatus" "TranslationReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "manualSourceHash" VARCHAR(64);
