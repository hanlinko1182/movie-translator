import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { hashValue } from "./normalize";
import { CharacterAnalysisError, type AnalysisBatch } from "./types";

export async function loadCharacterSource(movieId: string, database: Pick<Prisma.TransactionClient, "movie"> = prisma) {
  const movie = await database.movie.findUnique({ where: { id: movieId }, select: {
    id: true, projectId: true,
    scenes: { orderBy: { sequence: "asc" }, select: { id: true, sequence: true, startMs: true, endMs: true } },
    transcript: { select: { id: true, segments: { orderBy: { sequence: "asc" }, select: { id: true, sequence: true, startMs: true, endMs: true, text: true } } } },
    translation: { select: { sourceTranscriptId: true, segments: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true } } } },
  } });
  if (!movie) throw new CharacterAnalysisError("MOVIE_NOT_FOUND");
  if (!movie.transcript) throw new CharacterAnalysisError("TRANSCRIPT_NOT_FOUND");
  if (!movie.transcript.segments.length || movie.transcript.segments.every((segment) => !segment.text.trim())) throw new CharacterAnalysisError("TRANSCRIPT_EMPTY");
  if (!movie.scenes.length) throw new CharacterAnalysisError("SCENES_REQUIRED");
  let previous = -1;
  for (const row of movie.transcript.segments) {
    if (!Number.isSafeInteger(row.sequence) || row.sequence <= previous || !Number.isInteger(row.startMs) || !Number.isInteger(row.endMs) || row.startMs < 0 || row.endMs < row.startMs || row.endMs > 2_147_483_647 || !row.text.trim() || row.text.length > 6000) throw new CharacterAnalysisError("CHARACTER_SOURCE_INVALID");
    previous = row.sequence;
  }
  let end = 0;
  movie.scenes.forEach((scene, sequence) => {
    if (scene.sequence !== sequence || scene.startMs !== end || !Number.isInteger(scene.endMs) || scene.endMs <= scene.startMs || scene.endMs > 2_147_483_647) throw new CharacterAnalysisError("CHARACTER_SOURCE_INVALID");
    end = scene.endMs;
  });
  const targets = movie.translation?.sourceTranscriptId === movie.transcript.id ? movie.translation.segments.filter((target) => movie.transcript!.segments.some((segment) => segment.sequence === target.sequence && segment.startMs === target.startMs && segment.endMs === target.endMs)) : [];
  const sourceHash = hashValue({ version: "characters-v1", projectId: movie.projectId, transcriptId: movie.transcript.id, segments: movie.transcript.segments, scenes: movie.scenes, targets });
  return { movieId, projectId: movie.projectId, transcriptId: movie.transcript.id, segments: movie.transcript.segments, scenes: movie.scenes, targets, sourceHash };
}
export type CharacterSource = Awaited<ReturnType<typeof loadCharacterSource>>;

export function buildCharacterBatches(source: CharacterSource, knownCharacters: AnalysisBatch["knownCharacters"] = []): AnalysisBatch[] {
  // Advisory identities have a separate small budget, independent of movie length.
  let knownSize = 0;
  knownCharacters = knownCharacters.slice(0, 30).flatMap((character) => {
    const aliases = character.aliases.slice(0, 8).filter((alias) => alias.length <= 100);
    const size = character.name.length + aliases.join("").length;
    if (character.name.length > 100 || knownSize + size > 2000) return [];
    knownSize += size;
    return [{ name: character.name, aliases }];
  });
  const batches: AnalysisBatch[] = [];
  let group: AnalysisBatch["scenes"] = [];
  let characters = 0; let segments = 0;
  function flush() { if (group.length) batches.push({ scenes: group, knownCharacters }); group = []; characters = 0; segments = 0; }
  for (const scene of source.scenes) {
    const rows = source.segments.filter((segment) => segment.startMs < scene.endMs && (segment.endMs > scene.startMs || segment.startMs === segment.endMs && segment.startMs >= scene.startMs));
    // Partition an unusually talkative scene, rather than creating an unbounded request.
    let chunk: AnalysisBatch["scenes"][number]["segments"] = [];
    for (const row of rows) {
      const target = source.targets.find((target) => target.sequence === row.sequence)?.text;
      const size = row.text.length + (target && target.length <= 6000 ? target.length : 0);
      if (chunk.length && (characters + size > 12000 || segments >= 24)) {
        group.push({ sequence: scene.sequence, startMs: scene.startMs, endMs: scene.endMs, segments: chunk }); flush(); chunk = [];
      } else if (!chunk.length && group.length && (characters + size > 12000 || segments >= 24 || group.length >= 4)) flush();
      chunk.push({ sequence: row.sequence, startMs: row.startMs, endMs: row.endMs, text: row.text, ...(target && target.length <= 6000 ? { targetText: target } : {}) });
      characters += size; segments++;
    }
    if (chunk.length) group.push({ sequence: scene.sequence, startMs: scene.startMs, endMs: scene.endMs, segments: chunk });
  }
  flush();
  if (!batches.length) throw new CharacterAnalysisError("TRANSCRIPT_EMPTY");
  return batches;
}
