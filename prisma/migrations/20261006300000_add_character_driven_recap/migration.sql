-- CreateEnum
CREATE TYPE "RecapCharacterContext" AS ENUM ('CURRENT', 'ABSENT', 'STALE');

-- CreateEnum
CREATE TYPE "RecapEvidenceType" AS ENUM ('SECTION', 'CHARACTER_INSIGHT', 'RELATIONSHIP_INSIGHT');

-- CreateTable
CREATE TABLE "Recap" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "sourceTranscriptId" TEXT NOT NULL,
    "characterAnalysisRunId" TEXT,
    "sourceHash" VARCHAR(64) NOT NULL,
    "characterContext" "RecapCharacterContext" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "runtimeMs" INTEGER NOT NULL,
    "modelCalls" INTEGER NOT NULL,
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecapSection" (
    "id" TEXT NOT NULL,
    "recapId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sceneStartSequence" INTEGER NOT NULL,
    "sceneEndSequence" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" "InferenceConfidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecapSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecapCharacterInsight" (
    "id" TEXT NOT NULL,
    "recapId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "characterId" TEXT,
    "displayName" TEXT NOT NULL,
    "uncertain" BOOLEAN NOT NULL,
    "observation" TEXT NOT NULL,
    "confidence" "InferenceConfidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecapCharacterInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecapRelationshipInsight" (
    "id" TEXT NOT NULL,
    "recapId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "relationshipId" TEXT,
    "characterAId" TEXT,
    "characterBId" TEXT,
    "nameA" TEXT NOT NULL,
    "nameB" TEXT NOT NULL,
    "uncertainA" BOOLEAN NOT NULL,
    "uncertainB" BOOLEAN NOT NULL,
    "observation" TEXT NOT NULL,
    "confidence" "InferenceConfidence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecapRelationshipInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecapEvidence" (
    "id" TEXT NOT NULL,
    "recapId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "sectionId" TEXT,
    "characterInsightId" TEXT,
    "relationshipInsightId" TEXT,
    "sceneId" TEXT,
    "sceneSequence" INTEGER NOT NULL,
    "transcriptSegmentId" TEXT NOT NULL,
    "evidenceType" "RecapEvidenceType" NOT NULL,
    "evidenceKey" VARCHAR(64) NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecapEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recap_movieId_key" ON "Recap"("movieId");

-- CreateIndex
CREATE INDEX "Recap_sourceTranscriptId_idx" ON "Recap"("sourceTranscriptId");

-- CreateIndex
CREATE INDEX "Recap_characterAnalysisRunId_idx" ON "Recap"("characterAnalysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "RecapSection_recapId_sequence_key" ON "RecapSection"("recapId", "sequence");

-- CreateIndex
CREATE INDEX "RecapCharacterInsight_characterId_idx" ON "RecapCharacterInsight"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "RecapCharacterInsight_recapId_sequence_key" ON "RecapCharacterInsight"("recapId", "sequence");

-- CreateIndex
CREATE INDEX "RecapRelationshipInsight_relationshipId_idx" ON "RecapRelationshipInsight"("relationshipId");

-- CreateIndex
CREATE INDEX "RecapRelationshipInsight_characterAId_idx" ON "RecapRelationshipInsight"("characterAId");

-- CreateIndex
CREATE INDEX "RecapRelationshipInsight_characterBId_idx" ON "RecapRelationshipInsight"("characterBId");

-- CreateIndex
CREATE UNIQUE INDEX "RecapRelationshipInsight_recapId_sequence_key" ON "RecapRelationshipInsight"("recapId", "sequence");

-- CreateIndex
CREATE INDEX "RecapEvidence_movieId_idx" ON "RecapEvidence"("movieId");

-- CreateIndex
CREATE INDEX "RecapEvidence_sectionId_idx" ON "RecapEvidence"("sectionId");

-- CreateIndex
CREATE INDEX "RecapEvidence_characterInsightId_idx" ON "RecapEvidence"("characterInsightId");

-- CreateIndex
CREATE INDEX "RecapEvidence_relationshipInsightId_idx" ON "RecapEvidence"("relationshipInsightId");

-- CreateIndex
CREATE INDEX "RecapEvidence_sceneId_idx" ON "RecapEvidence"("sceneId");

-- CreateIndex
CREATE INDEX "RecapEvidence_transcriptSegmentId_idx" ON "RecapEvidence"("transcriptSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RecapEvidence_recapId_evidenceKey_key" ON "RecapEvidence"("recapId", "evidenceKey");

-- AddForeignKey
ALTER TABLE "Recap" ADD CONSTRAINT "Recap_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recap" ADD CONSTRAINT "Recap_sourceTranscriptId_fkey" FOREIGN KEY ("sourceTranscriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recap" ADD CONSTRAINT "Recap_characterAnalysisRunId_fkey" FOREIGN KEY ("characterAnalysisRunId") REFERENCES "CharacterAnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapSection" ADD CONSTRAINT "RecapSection_recapId_fkey" FOREIGN KEY ("recapId") REFERENCES "Recap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapCharacterInsight" ADD CONSTRAINT "RecapCharacterInsight_recapId_fkey" FOREIGN KEY ("recapId") REFERENCES "Recap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapCharacterInsight" ADD CONSTRAINT "RecapCharacterInsight_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapRelationshipInsight" ADD CONSTRAINT "RecapRelationshipInsight_recapId_fkey" FOREIGN KEY ("recapId") REFERENCES "Recap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapRelationshipInsight" ADD CONSTRAINT "RecapRelationshipInsight_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CharacterRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapRelationshipInsight" ADD CONSTRAINT "RecapRelationshipInsight_characterAId_fkey" FOREIGN KEY ("characterAId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapRelationshipInsight" ADD CONSTRAINT "RecapRelationshipInsight_characterBId_fkey" FOREIGN KEY ("characterBId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_recapId_fkey" FOREIGN KEY ("recapId") REFERENCES "Recap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "RecapSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_characterInsightId_fkey" FOREIGN KEY ("characterInsightId") REFERENCES "RecapCharacterInsight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_relationshipInsightId_fkey" FOREIGN KEY ("relationshipInsightId") REFERENCES "RecapRelationshipInsight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_transcriptSegmentId_fkey" FOREIGN KEY ("transcriptSegmentId") REFERENCES "TranscriptSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Each evidence anchor belongs to exactly one recap claim.
ALTER TABLE "RecapEvidence" ADD CONSTRAINT "RecapEvidence_claim_parent_check" CHECK (
    ("evidenceType" = 'SECTION' AND "sectionId" IS NOT NULL AND "characterInsightId" IS NULL AND "relationshipInsightId" IS NULL)
 OR ("evidenceType" = 'CHARACTER_INSIGHT' AND "sectionId" IS NULL AND "characterInsightId" IS NOT NULL AND "relationshipInsightId" IS NULL)
 OR ("evidenceType" = 'RELATIONSHIP_INSIGHT' AND "sectionId" IS NULL AND "characterInsightId" IS NULL AND "relationshipInsightId" IS NOT NULL)
);
ALTER TABLE "RecapSection" ADD CONSTRAINT "RecapSection_scene_range_check" CHECK ("sequence" >= 0 AND "sceneStartSequence" >= 0 AND "sceneEndSequence" >= "sceneStartSequence");
ALTER TABLE "RecapRelationshipInsight" ADD CONSTRAINT "RecapRelationshipInsight_distinct_pair_check" CHECK ("characterAId" IS NULL OR "characterBId" IS NULL OR "characterAId" COLLATE "C" < "characterBId" COLLATE "C");

