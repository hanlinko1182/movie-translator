import "server-only";
import { prisma } from "@/lib/prisma";
import { loadRecapSource } from "./source";
import { RecapError, type RecapReceipt, type Usage } from "./types";
const evidenceQuery = { include: { scene: { select: { startMs: true, endMs: true } }, transcriptSegment: { select: { sequence: true, startMs: true, endMs: true, text: true } } } };
export async function readMovieRecap(movieId: string) {
  const movie = await prisma.movie.findUnique({ where: { id: movieId }, select: { recap: { include: {
    sections: { orderBy: { sequence: "asc" }, include: { evidence: evidenceQuery } },
    characterInsights: { orderBy: { sequence: "asc" }, include: { evidence: evidenceQuery } },
    relationshipInsights: { orderBy: { sequence: "asc" }, include: { evidence: evidenceQuery } },
  } } } });
  if (!movie) throw new RecapError("MOVIE_NOT_FOUND");
  const recap = movie.recap;
  if (!recap) return { recap: null };
  let stale = true;
  try { stale = (await loadRecapSource(movieId)).sourceHash !== recap.sourceHash; }
  catch (error) { if (!(error instanceof RecapError)) throw error; }
  function evidence(rows: NonNullable<typeof recap>["sections"][number]["evidence"]) {
    return rows.map((row) => ({ id: row.id, sceneSequence: row.sceneSequence, scene: row.scene, segment: { sequence: row.transcriptSegment.sequence, startMs: row.transcriptSegment.startMs, endMs: row.transcriptSegment.endMs, excerpt: row.transcriptSegment.text.slice(0, 500), truncated: row.transcriptSegment.text.length > 500 }, note: row.note })).sort((a, b) => a.sceneSequence - b.sceneSequence || a.segment.sequence - b.segment.sequence || a.note.localeCompare(b.note) || a.id.localeCompare(b.id));
  }
  return { recap: { id: recap.id, sourceHash: recap.sourceHash, sourceTranscriptId: recap.sourceTranscriptId, characterAnalysisRunId: recap.characterAnalysisRunId, characterContext: recap.characterContext, stale, provider: recap.provider, model: recap.model, language: recap.language, strategy: recap.strategy, runtimeMs: recap.runtimeMs, modelCalls: recap.modelCalls, usage: recap.usage as Usage | null, title: recap.title, summary: recap.summary, createdAt: recap.createdAt.toISOString(), updatedAt: recap.updatedAt.toISOString(),
    sections: recap.sections.map((row) => ({ id: row.id, sequence: row.sequence, sceneStartSequence: row.sceneStartSequence, sceneEndSequence: row.sceneEndSequence, heading: row.heading, summary: row.summary, confidence: row.confidence, evidence: evidence(row.evidence) })),
    characterInsights: recap.characterInsights.map((row) => ({ id: row.id, characterId: row.characterId, displayName: row.displayName, uncertain: row.uncertain, observation: row.observation, confidence: row.confidence, evidence: evidence(row.evidence) })),
    relationshipInsights: recap.relationshipInsights.map((row) => ({ id: row.id, relationshipId: row.relationshipId, characterAId: row.characterAId, characterBId: row.characterBId, nameA: row.nameA, nameB: row.nameB, uncertainA: row.uncertainA, uncertainB: row.uncertainB, observation: row.observation, confidence: row.confidence, evidence: evidence(row.evidence) })),
  } };
}
export type RecapRead = Awaited<ReturnType<typeof readMovieRecap>>;
export async function recoverRecapReceipt(movieId: string, sourceHash: string, model: string): Promise<RecapReceipt | null> {
  const { recap } = await readMovieRecap(movieId);
  if (!recap || recap.stale || recap.sourceHash !== sourceHash || recap.model !== model) return null;
  if (!["SINGLE_STAGE", "HIERARCHICAL"].includes(recap.strategy)) return null;
  return { movieId, recapId: recap.id, sectionCount: recap.sections.length, characterInsightCount: recap.characterInsights.length, relationshipInsightCount: recap.relationshipInsights.length, evidenceCount: [...recap.sections, ...recap.characterInsights, ...recap.relationshipInsights].reduce((sum, row) => sum + row.evidence.length, 0), provider: recap.provider, model, runtimeMs: recap.runtimeMs, modelCalls: recap.modelCalls, strategy: recap.strategy as "SINGLE_STAGE" | "HIERARCHICAL", ...(recap.usage ? { usage: recap.usage } : {}), alreadyApplied: true };
}
