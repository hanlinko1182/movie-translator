-- CreateEnum
CREATE TYPE "GlossaryCategory" AS ENUM ('CHARACTER', 'PLACE', 'TITLE', 'ORGANIZATION', 'TERM', 'PHRASE', 'OTHER');

-- CreateTable
CREATE TABLE "GlossaryEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "category" "GlossaryCategory" NOT NULL DEFAULT 'TERM',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlossaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationMemoryEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "sourceHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryEntry_projectId_sourceText_sourceLanguage_targetLan_key" ON "GlossaryEntry"("projectId", "sourceText", "sourceLanguage", "targetLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationMemoryEntry_projectId_sourceLanguage_targetLangu_key" ON "TranslationMemoryEntry"("projectId", "sourceLanguage", "targetLanguage", "sourceHash");

-- AddForeignKey
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
