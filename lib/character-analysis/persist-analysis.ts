import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { hashValue, normalizeName } from "./normalize";
import { loadCharacterSource, type CharacterSource } from "./source";
import { validateCharacterOutput } from "./validate-output";
import { CharacterAnalysisError, type AnalysisResult, type AnalysisReceipt, type Evidence } from "./types";

function validateResult(result: AnalysisResult, source: CharacterSource) {
  const input = { knownCharacters: [], scenes: source.scenes.map((scene) => ({ ...scene, segments: source.segments.filter((segment) => segment.startMs < scene.endMs && (segment.endMs > scene.startMs || segment.startMs === segment.endMs && segment.startMs >= scene.startMs)).map((segment) => ({ ...segment, targetText: source.targets.find((target) => target.sequence === segment.sequence)?.text })) })) };
  const keys = new Set(result.characters.map((character) => character.key));
  if (keys.size !== result.characters.length || !result.provider.trim() || !result.model.trim() || !Number.isSafeInteger(result.runtimeMs) || result.runtimeMs < 0 || result.runtimeMs > 2_147_483_647 || !Number.isSafeInteger(result.modelCalls) || result.modelCalls < 1) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
  for (const character of result.characters) {
    if (!/^[a-f0-9]{64}$/.test(character.key) || !character.evidence.length || new Set(character.aliases.map(normalizeName)).size !== character.aliases.length || character.aliases.some((alias) => !alias.trim() || alias.length > 100)) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
    for (const row of character.evidence) validateCharacterOutput({ characters: [{ temporaryId: "c", name: character.name, aliases: character.aliases.slice(0, 12), evidence: [row] }], relationships: [] }, input);
  }
  for (const relationship of result.relationships) {
    const a = result.characters.find((c) => c.key === relationship.characterA);
    const b = result.characters.find((c) => c.key === relationship.characterB);
    if (!a || !b || a.key === b.key || !relationship.evidence.length) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
    for (const row of relationship.evidence) validateCharacterOutput({ characters: [a, b].map((c, i) => ({ temporaryId: String(i), name: c.name, aliases: c.aliases.slice(0, 12), evidence: c.evidence.filter((e) => e.sceneSequence === row.sceneSequence).slice(0, 1) })), relationships: [{ ...relationship, characterA: "0", characterB: "1", evidence: [row] }] }, input);
  }
  if (result.usage && Object.entries(result.usage).some(([key, value]) => !["inputTokens", "outputTokens", "totalTokens", "costUsd"].includes(key) || !Number.isFinite(value) || value! < 0 || (key !== "costUsd" && !Number.isSafeInteger(value)))) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
}

export async function persistCharacterAnalysis(result: AnalysisResult, expected: CharacterSource, database: Pick<typeof prisma, "$transaction"> = prisma): Promise<AnalysisReceipt> {
  validateResult(result, expected);
  return database.$transaction(async (tx) => {
    // Project identity updates serialize across episodes; Movie protects source mutations.
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${expected.projectId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Movie" WHERE id = ${expected.movieId} FOR UPDATE`;
    const source = await loadCharacterSource(expected.movieId, tx);
    if (source.sourceHash !== expected.sourceHash) throw new CharacterAnalysisError("CHARACTER_SOURCE_CHANGED");
    const metadata = { transcriptId: source.transcriptId, sourceHash: source.sourceHash, provider: result.provider, model: result.model, sceneCount: source.scenes.length, runtimeMs: result.runtimeMs, modelCalls: result.modelCalls, usage: result.usage ? { ...result.usage } : Prisma.DbNull };
    const run = await tx.characterAnalysisRun.upsert({ where: { movieId: source.movieId }, create: { movieId: source.movieId, ...metadata }, update: metadata });
    await tx.characterEvidence.deleteMany({ where: { analysisRunId: run.id } });
    await tx.characterRelationshipEvidence.deleteMany({ where: { analysisRunId: run.id } });
    const identities = await tx.character.findMany({ where: { projectId: source.projectId }, include: { aliases: true } });
    const mapping = new Map<string, string>();
    for (const candidate of result.characters) {
      const names = [candidate.name, ...candidate.aliases].map(normalizeName);
      const exact = identities.find((identity) => identity.identityKey === candidate.key);
      const matches = exact ? [exact] : candidate.uncertain ? [] : identities.filter((identity) => !identity.uncertain && (names.includes(identity.normalizedName) || identity.aliases.some((alias) => alias.normalizedAlias === normalizeName(candidate.name))));
      if (matches.length > 1) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
      const character = matches[0] ?? await tx.character.create({ data: { projectId: source.projectId, identityKey: candidate.key, canonicalName: candidate.name, normalizedName: normalizeName(candidate.name), uncertain: candidate.uncertain } });
      // Never replace existing identity fields or aliases during automated analysis.
      await tx.characterAlias.createMany({ data: candidate.aliases.map((alias) => ({ characterId: character.id, alias, normalizedAlias: normalizeName(alias) })), skipDuplicates: true });
      mapping.set(candidate.key, character.id);
      if (!matches.length) identities.push({ ...character, aliases: candidate.aliases.map((alias) => ({ id: "", characterId: character.id, alias, normalizedAlias: normalizeName(alias) })) });
    }
    function anchors(row: Evidence) {
      const scene = source.scenes.find((scene) => scene.sequence === row.sceneSequence)!;
      return row.segmentSequences.map((sequence) => ({ sceneId: scene.id, sceneSequence: scene.sequence, transcriptSegmentId: source.segments.find((segment) => segment.sequence === sequence)!.id, sequence }));
    }
    let evidenceCount = 0;
    for (const candidate of result.characters) {
      const characterId = mapping.get(candidate.key)!;
      const data = candidate.evidence.flatMap((row) => anchors(row).map(({ sequence, ...anchor }) => ({ ...anchor, analysisRunId: run.id, movieId: source.movieId, characterId, evidenceKey: hashValue([characterId, row, sequence]), evidenceType: row.type, evidenceText: row.evidence, inference: row.inference, confidence: row.confidence })));
      evidenceCount += (await tx.characterEvidence.createMany({ data, skipDuplicates: true })).count;
    }
    const relationshipIds = new Set<string>();
    for (const candidate of result.relationships) {
      const [characterAId, characterBId] = [mapping.get(candidate.characterA)!, mapping.get(candidate.characterB)!].sort();
      if (characterAId === characterBId) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
      const pair = { projectId: source.projectId, characterAId, characterBId };
      const conclusion = { relationshipType: candidate.type, summary: candidate.summary, confidence: candidate.confidence };
      const relationship = await tx.characterRelationship.upsert({ where: { projectId_characterAId_characterBId: pair }, create: { ...pair, ...conclusion }, update: conclusion });
      relationshipIds.add(relationship.id);
      const ranks = { LOW: 0, MEDIUM: 1, HIGH: 2 };
      const data = candidate.evidence.flatMap((row) => anchors(row).map(({ sequence, ...anchor }) => ({ ...anchor, analysisRunId: run.id, movieId: source.movieId, relationshipId: relationship.id, evidenceKey: hashValue([relationship.id, row, sequence]), relationshipType: candidate.type, relationshipSummary: candidate.summary, evidenceText: row.evidence, inference: row.inference, confidence: ranks[row.confidence] < ranks[candidate.confidence] ? row.confidence : candidate.confidence })));
      evidenceCount += (await tx.characterRelationshipEvidence.createMany({ data, skipDuplicates: true })).count;
    }
    return { movieId: source.movieId, analysisRunId: run.id, characterCount: new Set(mapping.values()).size, relationshipCount: relationshipIds.size, evidenceCount, provider: result.provider, model: result.model, runtimeMs: result.runtimeMs, modelCalls: result.modelCalls, ...(result.usage ? { usage: result.usage } : {}) };
  }, { timeout: 30_000 });
}
