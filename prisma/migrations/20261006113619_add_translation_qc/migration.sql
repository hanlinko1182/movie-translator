-- CreateEnum
CREATE TYPE "TranslationOrigin" AS ENUM ('UNKNOWN', 'MODEL', 'TRANSLATION_MEMORY', 'REFINED');

-- CreateEnum
CREATE TYPE "TranslationMemoryOrigin" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "TranslationQcCategory" AS ENUM ('EMPTY_OUTPUT', 'EXCESSIVE_LENGTH', 'POSSIBLE_OMISSION', 'NUMBER_MISMATCH', 'MARKDOWN_OR_COMMENTARY', 'GLOSSARY_MISMATCH', 'SUSPICIOUS_REPETITION', 'SOURCE_TARGET_MISMATCH', 'AMBIGUOUS_OR_WORDPLAY');

-- CreateEnum
CREATE TYPE "TranslationQcSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "TranslationQcSource" AS ENUM ('HEURISTIC', 'MODEL', 'MANUAL');

-- AlterTable
ALTER TABLE "TranslatedSegment" ADD COLUMN     "model" TEXT,
ADD COLUMN     "origin" "TranslationOrigin" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "refinementJobId" TEXT;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TranslationMemoryEntry" ADD COLUMN     "origin" "TranslationMemoryOrigin" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "TranslationQcIssue" (
    "id" TEXT NOT NULL,
    "translatedSegmentId" TEXT NOT NULL,
    "category" "TranslationQcCategory" NOT NULL,
    "severity" "TranslationQcSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "source" "TranslationQcSource" NOT NULL DEFAULT 'HEURISTIC',
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationQcIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationQcIssue_translatedSegmentId_resolvedAt_idx" ON "TranslationQcIssue"("translatedSegmentId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "TranslationQcIssue" ADD CONSTRAINT "TranslationQcIssue_translatedSegmentId_fkey" FOREIGN KEY ("translatedSegmentId") REFERENCES "TranslatedSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only full-memory translations have unambiguous legacy segment provenance.
-- Other legacy segments stay UNKNOWN, and legacy memory stays MANUAL/protected.
UPDATE "TranslatedSegment" AS segment
SET "origin" = 'TRANSLATION_MEMORY', "provider" = 'translation-memory', "model" = 'exact-match'
FROM "Translation" AS translation
WHERE segment."translationId" = translation.id
  AND translation.provider = 'translation-memory'
  AND translation.model = 'exact-match';
