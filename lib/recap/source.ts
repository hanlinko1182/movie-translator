import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { loadCharacterSource, buildCharacterBatches } from "@/lib/character-analysis/source";
import { hashValue } from "@/lib/character-analysis/normalize";
import { CharacterAnalysisError } from "@/lib/character-analysis/types";
import { RECAP_LANGUAGE, RecapError, type RecapCharacter, type RecapRelationship, type SemanticEvidence, type RecapInput } from "./types";

type Database = Pick<Prisma.TransactionClient, "movie" | "characterAnalysisRun">;
export async function loadRecapSource(movieId: string, database: Database = prisma) {
  let base;
  try { base = await loadCharacterSource(movieId, database); }
  catch (error) {
    if (error instanceof CharacterAnalysisError) {
      if (["MOVIE_NOT_FOUND", "TRANSCRIPT_NOT_FOUND", "TRANSCRIPT_EMPTY", "SCENES_REQUIRED"].includes(error.code)) throw new RecapError(error.code as "MOVIE_NOT_FOUND" | "TRANSCRIPT_NOT_FOUND" | "TRANSCRIPT_EMPTY" | "SCENES_REQUIRED");
      throw new RecapError("RECAP_SOURCE_INVALID");
    }
    throw error;
  }
  const run = await database.characterAnalysisRun.findUnique({ where: { movieId }, include: {
    evidence: { include: { character: { include: { aliases: { orderBy: { normalizedAlias: "asc" } } } }, transcriptSegment: { select: { sequence: true } } } },
    relationshipEvidence: { include: { relationship: true, transcriptSegment: { select: { sequence: true } } } },
  } });
  const validAnchor = (row: { movieId: string; sceneId: string | null; sceneSequence: number; transcriptSegmentId: string }) => {
    const scene = base.scenes.find((scene) => scene.id === row.sceneId && scene.sequence === row.sceneSequence);
    const segment = base.segments.find((segment) => segment.id === row.transcriptSegmentId);
    return row.movieId === movieId && !!scene && !!segment && segment.startMs < scene.endMs && (segment.endMs > scene.startMs || segment.startMs === segment.endMs && segment.startMs >= scene.startMs);
  };
  const current = !!run && run.transcriptId === base.transcriptId && run.sourceHash === base.sourceHash && run.evidence.every((row) => row.character.projectId === base.projectId) && run.relationshipEvidence.every((row) => row.relationship.projectId === base.projectId) && [...run.evidence, ...run.relationshipEvidence].every(validAnchor);
  const characterContext: RecapInput["characterContext"] = !run ? "ABSENT" : current ? "CURRENT" : "STALE";
  const characters: RecapCharacter[] = [];
  const relationships: RecapRelationship[] = [];
  const order = (a: SemanticEvidence, b: SemanticEvidence) => a.sceneSequence - b.sceneSequence || a.segmentSequence - b.segmentSequence || JSON.stringify(a).localeCompare(JSON.stringify(b));
  if (current && run) {
    for (const row of run.evidence) {
      let character = characters.find((c) => c.ref === row.characterId);
      if (!character) { character = { ref: row.characterId, name: row.character.canonicalName, uncertain: row.character.uncertain, aliases: row.character.aliases.map((alias) => alias.alias), evidence: [] }; characters.push(character); }
      character.evidence.push({ sceneSequence: row.sceneSequence, segmentSequence: row.transcriptSegment.sequence, evidence: row.evidenceText, inference: row.inference, confidence: row.confidence });
    }
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    // Read this movie's conclusion snapshots, not another episode's current pair summary.
    for (const row of [...run.relationshipEvidence].sort((a, b) => a.relationshipId.localeCompare(b.relationshipId) || a.relationshipSummary.localeCompare(b.relationshipSummary))) {
      if (![row.relationship.characterAId, row.relationship.characterBId].every((id) => characters.some((c) => c.ref === id))) continue;
      let relation = relationships.find((r) => r.ref === row.relationshipId);
      if (!relation) { relation = { ref: row.relationshipId, characterARef: row.relationship.characterAId, characterBRef: row.relationship.characterBId, type: row.relationshipType, summary: row.relationshipSummary, confidence: row.confidence, evidence: [] }; relationships.push(relation); }
      if (rank[row.confidence] < rank[relation.confidence]) relation.confidence = row.confidence;
      relation.evidence.push({ sceneSequence: row.sceneSequence, segmentSequence: row.transcriptSegment.sequence, evidence: row.evidenceText, inference: row.inference, confidence: row.confidence });
    }
  }
  characters.sort((a, b) => a.ref.localeCompare(b.ref)).forEach((c) => c.evidence.sort(order));
  relationships.sort((a, b) => a.ref.localeCompare(b.ref)).forEach((r) => r.evidence.sort(order));
  const sourceHash = hashValue({ version: "recap-v1", language: RECAP_LANGUAGE, transcriptId: base.transcriptId, segments: base.segments, scenes: base.scenes, characterContext, characterAnalysisRunId: current ? run!.id : null, characterSourceHash: current ? run!.sourceHash : null, characters, relationships });
  // Myanmar targets are intentionally excluded from provider input and recap hashing.
  return { movieId, projectId: base.projectId, transcriptId: base.transcriptId, scenes: base.scenes, segments: base.segments, characterContext, characterAnalysisRunId: current ? run!.id : null, characters, relationships, sourceHash };
}
export type RecapSource = Awaited<ReturnType<typeof loadRecapSource>>;
export function recapSceneWindows(source: RecapSource) {
  return buildCharacterBatches({ ...source, targets: [] }).map((batch) => batch.scenes);
}
