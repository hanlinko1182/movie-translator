import "server-only";
import { prisma } from "@/lib/prisma";
import { SceneDetectionError, type SceneRow } from "./types";

export function publicSceneRows(rows: readonly { sequence: number; startMs: number; endMs: number; detectionMethod: "VISUAL_TRANSCRIPT_HEURISTIC"; boundaryScore: number | null }[]): SceneRow[] {
  return rows.map(({ sequence, startMs, endMs, detectionMethod, boundaryScore }) => ({ sequence, startMs, endMs, durationMs: endMs - startMs, detectionMethod, boundaryScore }));
}
export async function readMovieScenes(movieId: string) {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true, scenes: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, detectionMethod: true, boundaryScore: true } } } });
  if (!movie) throw new SceneDetectionError("MOVIE_NOT_FOUND");
  return { movieId: movie.id, count: movie.scenes.length, scenes: publicSceneRows(movie.scenes) };
}
