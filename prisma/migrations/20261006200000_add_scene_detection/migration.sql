-- CreateEnum
CREATE TYPE "SceneDetectionMethod" AS ENUM ('VISUAL_TRANSCRIPT_HEURISTIC');

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "detectionMethod" "SceneDetectionMethod" NOT NULL DEFAULT 'VISUAL_TRANSCRIPT_HEURISTIC',
    "boundaryScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Scene_valid_timing" CHECK ("sequence" >= 0 AND "startMs" >= 0 AND "endMs" > "startMs"),
    CONSTRAINT "Scene_valid_score" CHECK ("boundaryScore" IS NULL OR ("boundaryScore" >= 0 AND "boundaryScore" <= 1))
);

-- CreateIndex
CREATE INDEX "Scene_movieId_startMs_endMs_idx" ON "Scene"("movieId", "startMs", "endMs");
CREATE UNIQUE INDEX "Scene_movieId_sequence_key" ON "Scene"("movieId", "sequence");

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
