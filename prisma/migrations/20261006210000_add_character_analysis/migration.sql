-- CreateEnum
CREATE TYPE "CharacterEvidenceType" AS ENUM ('MENTION', 'SELF_IDENTIFICATION', 'BEHAVIOR', 'SPEECH_STYLE', 'ACTION_INFERENCE', 'RELATIONSHIP_CLUE');

-- CreateEnum
CREATE TYPE "InferenceConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CharacterRelationshipType" AS ENUM ('FAMILY', 'FRIEND', 'ALLY', 'RIVAL', 'ROMANTIC', 'PROFESSIONAL', 'UNKNOWN', 'OTHER');

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterAlias" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,

    CONSTRAINT "CharacterAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterAnalysisRun" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "sourceHash" VARCHAR(64) NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "sceneCount" INTEGER NOT NULL,
    "runtimeMs" INTEGER NOT NULL,
    "modelCalls" INTEGER NOT NULL,
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterEvidence" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "sceneId" TEXT,
    "sceneSequence" INTEGER NOT NULL,
    "transcriptSegmentId" TEXT NOT NULL,
    "evidenceKey" VARCHAR(64) NOT NULL,
    "evidenceType" "CharacterEvidenceType" NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "inference" TEXT NOT NULL,
    "confidence" "InferenceConfidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelationship" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "characterAId" TEXT NOT NULL,
    "characterBId" TEXT NOT NULL,
    "relationshipType" "CharacterRelationshipType" NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" "InferenceConfidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelationshipEvidence" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "sceneId" TEXT,
    "sceneSequence" INTEGER NOT NULL,
    "transcriptSegmentId" TEXT NOT NULL,
    "evidenceKey" VARCHAR(64) NOT NULL,
    "relationshipType" "CharacterRelationshipType" NOT NULL,
    "relationshipSummary" TEXT NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "inference" TEXT NOT NULL,
    "confidence" "InferenceConfidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterRelationshipEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Character_projectId_normalizedName_idx" ON "Character"("projectId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Character_projectId_identityKey_key" ON "Character"("projectId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterAlias_characterId_normalizedAlias_key" ON "CharacterAlias"("characterId", "normalizedAlias");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterAnalysisRun_movieId_key" ON "CharacterAnalysisRun"("movieId");

-- CreateIndex
CREATE INDEX "CharacterAnalysisRun_transcriptId_idx" ON "CharacterAnalysisRun"("transcriptId");

-- CreateIndex
CREATE INDEX "CharacterEvidence_characterId_movieId_idx" ON "CharacterEvidence"("characterId", "movieId");

-- CreateIndex
CREATE INDEX "CharacterEvidence_sceneId_idx" ON "CharacterEvidence"("sceneId");

-- CreateIndex
CREATE INDEX "CharacterEvidence_transcriptSegmentId_idx" ON "CharacterEvidence"("transcriptSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterEvidence_analysisRunId_evidenceKey_key" ON "CharacterEvidence"("analysisRunId", "evidenceKey");

-- CreateIndex
CREATE INDEX "CharacterRelationship_characterAId_idx" ON "CharacterRelationship"("characterAId");

-- CreateIndex
CREATE INDEX "CharacterRelationship_characterBId_idx" ON "CharacterRelationship"("characterBId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterRelationship_projectId_characterAId_characterBId_key" ON "CharacterRelationship"("projectId", "characterAId", "characterBId");

-- CreateIndex
CREATE INDEX "CharacterRelationshipEvidence_relationshipId_movieId_idx" ON "CharacterRelationshipEvidence"("relationshipId", "movieId");

-- CreateIndex
CREATE INDEX "CharacterRelationshipEvidence_sceneId_idx" ON "CharacterRelationshipEvidence"("sceneId");

-- CreateIndex
CREATE INDEX "CharacterRelationshipEvidence_transcriptSegmentId_idx" ON "CharacterRelationshipEvidence"("transcriptSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterRelationshipEvidence_analysisRunId_evidenceKey_key" ON "CharacterRelationshipEvidence"("analysisRunId", "evidenceKey");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAlias" ADD CONSTRAINT "CharacterAlias_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAnalysisRun" ADD CONSTRAINT "CharacterAnalysisRun_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAnalysisRun" ADD CONSTRAINT "CharacterAnalysisRun_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEvidence" ADD CONSTRAINT "CharacterEvidence_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "CharacterAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEvidence" ADD CONSTRAINT "CharacterEvidence_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEvidence" ADD CONSTRAINT "CharacterEvidence_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEvidence" ADD CONSTRAINT "CharacterEvidence_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterEvidence" ADD CONSTRAINT "CharacterEvidence_transcriptSegmentId_fkey" FOREIGN KEY ("transcriptSegmentId") REFERENCES "TranscriptSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_characterAId_fkey" FOREIGN KEY ("characterAId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_characterBId_fkey" FOREIGN KEY ("characterBId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationshipEvidence" ADD CONSTRAINT "CharacterRelationshipEvidence_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "CharacterAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationshipEvidence" ADD CONSTRAINT "CharacterRelationshipEvidence_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CharacterRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationshipEvidence" ADD CONSTRAINT "CharacterRelationshipEvidence_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationshipEvidence" ADD CONSTRAINT "CharacterRelationshipEvidence_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationshipEvidence" ADD CONSTRAINT "CharacterRelationshipEvidence_transcriptSegmentId_fkey" FOREIGN KEY ("transcriptSegmentId") REFERENCES "TranscriptSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Enforce normalized, distinct relationship pairs at the database boundary.
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_ordered_pair_check" CHECK ("characterAId" COLLATE "C" < "characterBId" COLLATE "C");

