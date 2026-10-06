import "server-only";
import { prisma } from "@/lib/prisma";
import { loadCharacterSource } from "./source";
import { CharacterAnalysisError, type AnalysisReceipt, type Usage } from "./types";

function groupRows<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const id = key(row); const group = groups.get(id); if (group) group.push(row); else groups.set(id, [row]); }
  return [...groups.values()];
}

export async function readMovieCharacters(movieId: string) {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: { characterAnalysis: { include: {
    evidence: { orderBy: [{ characterId: "asc" }, { sceneSequence: "asc" }, { transcriptSegmentId: "asc" }, { evidenceKey: "asc" }], include: { character: { include: { aliases: { orderBy: { normalizedAlias: "asc" } } } }, scene: { select: { startMs: true, endMs: true } }, transcriptSegment: { select: { sequence: true, startMs: true, endMs: true, text: true } } } },
    relationshipEvidence: { orderBy: [{ relationshipId: "asc" }, { sceneSequence: "asc" }, { transcriptSegmentId: "asc" }, { evidenceKey: "asc" }], include: { relationship: { include: { characterA: { select: { id: true, canonicalName: true } }, characterB: { select: { id: true, canonicalName: true } } } }, scene: { select: { startMs: true, endMs: true } }, transcriptSegment: { select: { sequence: true, startMs: true, endMs: true, text: true } } } },
  } } } });
  if (!movie) throw new CharacterAnalysisError("MOVIE_NOT_FOUND");
  const run = movie.characterAnalysis;
  if (!run) return { analysis: null, characters: [], relationships: [] };
  let stale = true;
  try { stale = (await loadCharacterSource(movieId)).sourceHash !== run.sourceHash; }
  catch (error) { if (!(error instanceof CharacterAnalysisError)) throw error; }
  function evidence(row: NonNullable<typeof run>["evidence"][number] | NonNullable<typeof run>["relationshipEvidence"][number]) {
    return { id: row.id, sceneSequence: row.sceneSequence, scene: row.scene, segment: row.transcriptSegment, evidence: row.evidenceText, inference: row.inference, confidence: row.confidence };
  }
  const orderEvidence = (a: { sceneSequence: number; segment: { sequence: number }; id: string }, b: { sceneSequence: number; segment: { sequence: number }; id: string }) => a.sceneSequence - b.sceneSequence || a.segment.sequence - b.segment.sequence || a.id.localeCompare(b.id);
  const characters = groupRows(run.evidence, (row) => row.characterId).map((rows) => {
    const character = rows[0].character;
    return { id: character.id, name: character.canonicalName, uncertain: character.uncertain, aliases: character.aliases.map((alias) => alias.alias), evidence: rows.map((row) => ({ ...evidence(row), type: row.evidenceType })).sort(orderEvidence) };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const relationships = groupRows(run.relationshipEvidence, (row) => row.relationshipId).map((rows) => {
    const row = rows[0];
    return { id: row.relationshipId, characterA: { id: row.relationship.characterA.id, name: row.relationship.characterA.canonicalName }, characterB: { id: row.relationship.characterB.id, name: row.relationship.characterB.canonicalName }, type: row.relationshipType, summary: row.relationshipSummary, confidence: rows.reduce((confidence, e) => rank[e.confidence] < rank[confidence] ? e.confidence : confidence, row.confidence), evidence: rows.map(evidence).sort(orderEvidence) };
  }).sort((a, b) => a.characterA.name.localeCompare(b.characterA.name) || a.characterB.name.localeCompare(b.characterB.name) || a.id.localeCompare(b.id));
  return { analysis: { id: run.id, sourceHash: run.sourceHash, stale, provider: run.provider, model: run.model, sceneCount: run.sceneCount, runtimeMs: run.runtimeMs, modelCalls: run.modelCalls, usage: run.usage as Usage | null, createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() }, characters, relationships };
}
export type CharacterRead = Awaited<ReturnType<typeof readMovieCharacters>>;

// Recover a committed receipt after a worker crash; no second model call is needed.
export async function recoverCharacterReceipt(movieId: string, sourceHash: string, model: string): Promise<AnalysisReceipt | null> {
  const data = await readMovieCharacters(movieId);
  if (!data.analysis || data.analysis.stale || data.analysis.sourceHash !== sourceHash || data.analysis.model !== model) return null;
  return { movieId, analysisRunId: data.analysis.id, characterCount: data.characters.length, relationshipCount: data.relationships.length, evidenceCount: data.characters.reduce((count, character) => count + character.evidence.length, 0) + data.relationships.reduce((count, relationship) => count + relationship.evidence.length, 0), provider: data.analysis.provider, model, runtimeMs: data.analysis.runtimeMs, modelCalls: data.analysis.modelCalls, ...(data.analysis.usage ? { usage: data.analysis.usage } : {}), alreadyApplied: true };
}
