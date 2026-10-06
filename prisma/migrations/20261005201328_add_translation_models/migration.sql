-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "sourceTranscriptId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslatedSegment" (
    "id" TEXT NOT NULL,
    "translationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslatedSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Translation_movieId_key" ON "Translation"("movieId");

-- CreateIndex
CREATE INDEX "Translation_sourceTranscriptId_idx" ON "Translation"("sourceTranscriptId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatedSegment_translationId_sequence_key" ON "TranslatedSegment"("translationId", "sequence");

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_sourceTranscriptId_fkey" FOREIGN KEY ("sourceTranscriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslatedSegment" ADD CONSTRAINT "TranslatedSegment_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
