import "server-only";
import { prisma } from "@/lib/prisma";
import { assertSceneIntervals } from "./boundaries";
import { timingHash, type SceneSource } from "./detect-scenes";
import { SceneDetectionError, type SceneDetectionResult, type SceneReceipt } from "./types";

export async function persistScenes(result: SceneDetectionResult, source: SceneSource): Promise<SceneReceipt> {
  assertSceneIntervals(result.scenes, result.durationMs);
  if (!result.movieId || !Number.isSafeInteger(result.visualCandidateCount) || result.visualCandidateCount < 0 || !Number.isSafeInteger(result.transcriptGapCandidateCount) || result.transcriptGapCandidateCount < 0) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${result.movieId} FOR UPDATE`;
    const movie = await transaction.movie.findUnique({ where: { id: result.movieId }, select: { storageKey: true, transcript: { select: { id: true, segments: { orderBy: { sequence: "asc" }, select: { startMs: true, endMs: true } } } } } });
    if (!movie) throw new SceneDetectionError("MOVIE_NOT_FOUND");
    if (movie.storageKey !== source.storageKey || (movie.transcript?.id ?? null) !== source.transcriptId || timingHash(movie.transcript?.segments ?? []) !== source.timingHash) throw new SceneDetectionError("SCENE_SOURCE_CHANGED");
    await transaction.scene.deleteMany({ where: { movieId: result.movieId, detectionMethod: "VISUAL_TRANSCRIPT_HEURISTIC" } });
    await transaction.scene.createMany({ data: result.scenes.map((scene) => ({ ...scene, movieId: result.movieId, detectionMethod: "VISUAL_TRANSCRIPT_HEURISTIC" })) });
    return { movieId: result.movieId, durationMs: result.durationMs, visualCandidateCount: result.visualCandidateCount, transcriptGapCandidateCount: result.transcriptGapCandidateCount, sceneCount: result.scenes.length };
  }, { timeout: 30_000 });
}
