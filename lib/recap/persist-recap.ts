import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { hashValue } from "@/lib/character-analysis/normalize";
import { loadRecapSource, type RecapSource } from "./source";
import { validateRecapOutput } from "./validate-output";
import { RECAP_LANGUAGE, RecapError, type RecapInput, type RecapReceipt, type RecapReference, type RecapResult } from "./types";

export function validatePersistedRecap(result: RecapResult, source: RecapSource) {
  const input: RecapInput = { stage: "SCENES", characterContext: source.characterContext, characters: source.characters, relationships: source.relationships, summaries: [], scenes: source.scenes.map((scene) => ({ ...scene, segments: source.segments.filter((segment) => segment.startMs < scene.endMs && (segment.endMs > scene.startMs || segment.startMs === segment.endMs && segment.startMs >= scene.startMs)) })) };
  const output = validateRecapOutput(result.output, input);
  if (!result.provider.trim() || !result.model.trim() || !Number.isSafeInteger(result.runtimeMs) || result.runtimeMs < 0 || result.runtimeMs > 2147483647 || !Number.isSafeInteger(result.modelCalls) || result.modelCalls < 1 || !["SINGLE_STAGE", "HIERARCHICAL"].includes(result.strategy)) throw new RecapError("RECAP_INVALID_RESPONSE");
  if (result.usage && Object.entries(result.usage).some(([key, value]) => !["inputTokens", "outputTokens", "totalTokens", "costUsd"].includes(key) || !Number.isFinite(value) || value! < 0 || key !== "costUsd" && !Number.isSafeInteger(value))) throw new RecapError("RECAP_INVALID_RESPONSE");
  return output;
}
export async function persistRecap(result: RecapResult, expected: RecapSource, database: Pick<typeof prisma, "$transaction"> = prisma): Promise<RecapReceipt> {
  const output = validatePersistedRecap(result, expected);
  return database.$transaction(async (tx) => {
    // Same lock order as character analysis; serialize shared project identities and movie source.
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${expected.projectId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Movie" WHERE id = ${expected.movieId} FOR UPDATE`;
    const source = await loadRecapSource(expected.movieId, tx);
    if (source.sourceHash !== expected.sourceHash) throw new RecapError("RECAP_SOURCE_CHANGED");
    const fields = { sourceTranscriptId: source.transcriptId, characterAnalysisRunId: source.characterAnalysisRunId, sourceHash: source.sourceHash, characterContext: source.characterContext, provider: result.provider, model: result.model, language: RECAP_LANGUAGE, title: output.title, summary: output.summary, strategy: result.strategy, runtimeMs: result.runtimeMs, modelCalls: result.modelCalls, usage: result.usage ? { ...result.usage } : Prisma.DbNull };
    const recap = await tx.recap.upsert({ where: { movieId: source.movieId }, create: { movieId: source.movieId, ...fields }, update: fields });
    await tx.recapSection.deleteMany({ where: { recapId: recap.id } });
    await tx.recapCharacterInsight.deleteMany({ where: { recapId: recap.id } });
    await tx.recapRelationshipInsight.deleteMany({ where: { recapId: recap.id } });
    // Child deletion cascades evidence; explicitly clear any old root anchors defensively.
    await tx.recapEvidence.deleteMany({ where: { recapId: recap.id } });
    let evidenceCount = 0;
    async function evidence(rows: RecapReference[], parent: { sectionId: string; evidenceType: "SECTION" } | { characterInsightId: string; evidenceType: "CHARACTER_INSIGHT" } | { relationshipInsightId: string; evidenceType: "RELATIONSHIP_INSIGHT" }) {
      const data = rows.flatMap((row) => row.segmentSequences.map((sequence) => ({ ...parent, recapId: recap.id, movieId: source.movieId, sceneId: source.scenes.find((s) => s.sequence === row.sceneSequence)!.id, sceneSequence: row.sceneSequence, transcriptSegmentId: source.segments.find((s) => s.sequence === sequence)!.id, evidenceKey: hashValue([parent, row, sequence]), note: row.note })));
      evidenceCount += (await tx.recapEvidence.createMany({ data, skipDuplicates: true })).count;
    }
    for (const row of output.sections) {
      const { evidence: refs, ...data } = row;
      const section = await tx.recapSection.create({ data: { recapId: recap.id, ...data } });
      await evidence(refs, { sectionId: section.id, evidenceType: "SECTION" });
    }
    for (const [sequence, row] of output.characterInsights.entries()) {
      const character = source.characters.find((c) => c.ref === row.characterRef)!;
      const insight = await tx.recapCharacterInsight.create({ data: { recapId: recap.id, sequence, characterId: character.ref, displayName: character.name, uncertain: character.uncertain, observation: row.observation, confidence: row.confidence } });
      await evidence(row.evidence, { characterInsightId: insight.id, evidenceType: "CHARACTER_INSIGHT" });
    }
    for (const [sequence, row] of output.relationshipInsights.entries()) {
      const [characterAId, characterBId] = [row.characterARef, row.characterBRef].sort();
      const a = source.characters.find((c) => c.ref === characterAId)!; const b = source.characters.find((c) => c.ref === characterBId)!;
      const insight = await tx.recapRelationshipInsight.create({ data: { recapId: recap.id, sequence, relationshipId: row.relationshipRef, characterAId, characterBId, nameA: a.name, nameB: b.name, uncertainA: a.uncertain, uncertainB: b.uncertain, observation: row.observation, confidence: row.confidence } });
      await evidence(row.evidence, { relationshipInsightId: insight.id, evidenceType: "RELATIONSHIP_INSIGHT" });
    }
    return { movieId: source.movieId, recapId: recap.id, sectionCount: output.sections.length, characterInsightCount: output.characterInsights.length, relationshipInsightCount: output.relationshipInsights.length, evidenceCount, provider: result.provider, model: result.model, runtimeMs: result.runtimeMs, modelCalls: result.modelCalls, strategy: result.strategy, ...(result.usage ? { usage: result.usage } : {}) };
  }, { timeout: 30000 });
}
