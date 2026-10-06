import { hashValue, normalizeName, uncertainName } from "./normalize";
import { CharacterAnalysisError, type AnalysisResult, type BatchResult, type Evidence, type NormalizedCharacter, type NormalizedRelationship } from "./types";

const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
function dedupEvidence(rows: Evidence[]) { return [...new Map(rows.map((row) => [hashValue(row), row])).values()].sort((a, b) => a.sceneSequence - b.sceneSequence || a.segmentSequences[0] - b.segmentSequences[0] || a.inference.localeCompare(b.inference)); }
export function mergeCharacterBatches(results: BatchResult[], movieId: string, sourceHash: string): AnalysisResult {
  const characters: NormalizedCharacter[] = [];
  const relationships = new Map<string, NormalizedRelationship>();
  results.forEach((result) => {
    const mapping = new Map<string, Map<number, NormalizedCharacter>>();
    for (const candidate of result.output.characters) {
      const uncertain = uncertainName(candidate.name);
      const sceneSequences = [...new Set(candidate.evidence.map((row) => row.sceneSequence))].sort((a, b) => a - b);
      const names = [candidate.name, ...candidate.aliases].map(normalizeName).filter((name) => !uncertainName(name));
      const targets = new Map<number, NormalizedCharacter>();
      for (const sceneSequence of sceneSequences) {
        const key = hashValue(uncertain ? ["UNCERTAIN", movieId, sourceHash, sceneSequence, normalizeName(candidate.name)] : ["NAMED", normalizeName(candidate.name)]);
        const matches = characters.filter((character) => character.key === key || (!uncertain && !character.uncertain && (character.aliases.includes(normalizeName(candidate.name)) || names.includes(character.name))));
        if (matches.length > 1) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
        let character = matches[0];
        if (!character) { character = { key, name: normalizeName(candidate.name), aliases: [], uncertain, evidence: [] }; characters.push(character); }
        character.aliases = [...new Set([...character.aliases, ...candidate.aliases.map(normalizeName)])].sort();
        character.evidence = dedupEvidence([...character.evidence, ...candidate.evidence.filter((row) => row.sceneSequence === sceneSequence)]);
        targets.set(sceneSequence, character);
      }
      mapping.set(candidate.temporaryId, targets);
    }
    for (const relationship of result.output.relationships) {
      for (const evidence of relationship.evidence) {
        const a = mapping.get(relationship.characterA)?.get(evidence.sceneSequence);
        const b = mapping.get(relationship.characterB)?.get(evidence.sceneSequence);
        if (!a || !b || a.key === b.key) throw new CharacterAnalysisError("CHARACTER_INVALID_RESPONSE");
        const [characterA, characterB] = [a.key, b.key].sort();
        const key = `${characterA}:${characterB}`;
        const previous = relationships.get(key);
        if (!previous) relationships.set(key, { characterA, characterB, type: relationship.type, summary: relationship.summary, confidence: relationship.confidence, evidence: [evidence] });
        else {
          if (previous.type !== relationship.type) { previous.type = "UNKNOWN"; previous.summary = "Text suggests a possible connection, but the proposed relationship types differ."; previous.confidence = "LOW"; }
          else if (rank[relationship.confidence] < rank[previous.confidence]) previous.confidence = relationship.confidence;
          previous.evidence = dedupEvidence([...previous.evidence, evidence]);
        }
      }
    }
  });
  const usage: AnalysisResult["usage"] = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens", "costUsd"] as const) if (results.every((result) => result.usage?.[key] !== undefined)) usage[key] = results.reduce((total, result) => total + result.usage![key]!, 0);
  return { characters: characters.sort((a, b) => a.key.localeCompare(b.key)), relationships: [...relationships.values()].sort((a, b) => a.characterA.localeCompare(b.characterA) || a.characterB.localeCompare(b.characterB)), provider: results[0].provider, model: results[0].model, runtimeMs: results.reduce((total, result) => total + result.runtimeMs, 0), modelCalls: results.length, ...(Object.keys(usage).length ? { usage } : {}) };
}
