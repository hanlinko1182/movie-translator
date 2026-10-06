import "server-only";
import { createHash } from "node:crypto";
import { inspectMovie, resolveMovieSource } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { buildSceneIntervals, validMs } from "./boundaries";
import { sceneConfig } from "./config";
import { detectVisualCuts } from "./detect-visual-cuts";
import { SceneDetectionError, type SceneDetectionResult, type TranscriptTiming } from "./types";

export function timingHash(rows: readonly TranscriptTiming[]) { return createHash("sha256").update(JSON.stringify(rows.map((row) => [row.startMs, row.endMs]))).digest("hex"); }
export type SceneSource = { storageKey: string; transcriptId: string | null; timingHash: string };

export async function assertSceneMediaReady(movieId: string) {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true, storageKey: true } });
  if (!movie) throw new SceneDetectionError("MOVIE_NOT_FOUND");
  if (!movie.storageKey) throw new SceneDetectionError("MOVIE_STORAGE_REQUIRED");
  await resolveMovieSource(movie.storageKey);
  return movie;
}

export async function detectMovieScenes(movieId: string): Promise<{ result: SceneDetectionResult; source: SceneSource }> {
  const config = sceneConfig();
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: {
    id: true, storageKey: true, transcript: { select: { id: true, segments: { orderBy: { sequence: "asc" }, select: { startMs: true, endMs: true } } } },
  } });
  if (!movie) throw new SceneDetectionError("MOVIE_NOT_FOUND");
  if (!movie.storageKey) throw new SceneDetectionError("MOVIE_STORAGE_REQUIRED");
  const path = await resolveMovieSource(movie.storageKey);
  const inspection = await inspectMovie(path);
  const durationMs = Math.round(inspection.durationSeconds * 1000);
  if (!validMs(durationMs) || !durationMs) throw new SceneDetectionError("SCENE_MEDIA_INVALID");
  const timings = movie.transcript?.segments ?? [];
  // Validate optional timing before starting the expensive visual scan.
  buildSceneIntervals(durationMs, [], timings, config);
  const visual = await detectVisualCuts(path, durationMs, config.visualThreshold);
  const grouped = buildSceneIntervals(durationMs, visual, timings, config);
  return { result: { movieId, durationMs, visualCandidateCount: visual.length, ...grouped }, source: { storageKey: movie.storageKey, transcriptId: movie.transcript?.id ?? null, timingHash: timingHash(timings) } };
}
