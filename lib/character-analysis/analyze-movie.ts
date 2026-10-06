import "server-only";
import { prisma } from "@/lib/prisma";
import { getCharacterProvider } from "./index";
import type { CharacterAnalysisProvider } from "./provider";
import { loadCharacterSource, buildCharacterBatches, type CharacterSource } from "./source";
import { mergeCharacterBatches } from "./merge";
import { validateCharacterOutput } from "./validate-output";
import { CharacterAnalysisError, type BatchResult } from "./types";

export async function analyzeMovieCharacters(movieId: string, expectedHash: string, dependencies: { provider?: CharacterAnalysisProvider } = {}) {
  const source = await loadCharacterSource(movieId);
  if (source.sourceHash !== expectedHash) throw new CharacterAnalysisError("CHARACTER_SOURCE_CHANGED");
  const known = await prisma.character.findMany({ where: { projectId: source.projectId, uncertain: false }, take: 30, orderBy: { canonicalName: "asc" }, select: { canonicalName: true, aliases: { take: 8, orderBy: { normalizedAlias: "asc" }, select: { alias: true } } } });
  const provider = dependencies.provider ?? getCharacterProvider().provider;
  return { source, result: await analyzeCharacterSource(source, provider, known.map((character) => ({ name: character.canonicalName, aliases: character.aliases.map((alias) => alias.alias) }))) };
}
export async function analyzeCharacterSource(source: CharacterSource, provider: CharacterAnalysisProvider, known: Parameters<typeof buildCharacterBatches>[1] = []) {
  const results: BatchResult[] = [];
  for (const batch of buildCharacterBatches(source, known)) {
    const result = await provider.analyze(batch);
    result.output = validateCharacterOutput(result.output, batch);
    if (!result.provider.trim() || !result.model.trim() || !Number.isSafeInteger(result.runtimeMs) || result.runtimeMs < 0 || (results.length && (result.model !== results[0].model || result.provider !== results[0].provider))) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
    results.push(result);
  }
  return mergeCharacterBatches(results, source.movieId, source.sourceHash);
}
