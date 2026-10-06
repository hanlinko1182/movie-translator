import { RecapError, type RecapInput, type RecapOutput, type RecapScene } from "./types";
import type { RecapSource } from "./source";
export function referencePairs(input: Pick<RecapInput, "scenes" | "summaries">) {
  const pairs = new Set<string>();
  for (const scene of input.scenes) for (const segment of scene.segments) pairs.add(`${scene.sequence}:${segment.sequence}`);
  for (const output of input.summaries) for (const item of [...output.sections, ...output.characterInsights, ...output.relationshipInsights]) for (const row of item.evidence) for (const sequence of row.segmentSequences) pairs.add(`${row.sceneSequence}:${sequence}`);
  return pairs;
}
export function recapInput(source: RecapSource, scenes: RecapScene[], summaries: RecapOutput[] = []): RecapInput {
  const input: RecapInput = { stage: summaries.length ? "SYNTHESIS" : "SCENES", characterContext: source.characterContext, scenes, summaries, characters: [], relationships: [] };
  const pairs = referencePairs(input);
  const relevant = (row: { sceneSequence: number; segmentSequence: number }) => pairs.has(`${row.sceneSequence}:${row.segmentSequence}`);
  // Keep semantic context advisory, bounded, and local to cited windows.
  for (const character of source.characters) {
    const evidence = character.evidence.filter(relevant).slice(0, 3);
    if (!evidence.length || input.characters.length >= 12) continue;
    const candidate = { ...character, aliases: character.aliases.slice(0, 4), evidence };
    if (JSON.stringify({ characters: [...input.characters, candidate], relationships: input.relationships }).length <= 6000) input.characters.push(candidate);
  }
  for (const relationship of source.relationships) {
    const evidence = relationship.evidence.filter(relevant).slice(0, 3);
    if (!evidence.length || input.relationships.length >= 12 || ![relationship.characterARef, relationship.characterBRef].every((ref) => input.characters.some((c) => c.ref === ref))) continue;
    const candidate = { ...relationship, evidence };
    if (JSON.stringify({ characters: input.characters, relationships: [...input.relationships, candidate] }).length <= 6000) input.relationships.push(candidate);
  }
  if (JSON.stringify(input).length > 30000) throw new RecapError("RECAP_SOURCE_INVALID");
  return input;
}
