import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadRecapSource } from "@/lib/recap/source";
import { RecapError, type RecapOutput, type RecapReference } from "@/lib/recap/types";
import { canonicalJson, contractHash } from "./canonical";
import type { Identity, StorySourcePayload, StoryCapturedObservation, StoryLegacyRecap, StoryRelationship } from "./contracts";
import { observationAllowances, validateAdvisoryOutput } from "./preparation-context";
import { StorylinePreparationError } from "./preparation-errors";
import { StorylineContractError } from "./validation";

// Source relations only; cost/usage is excluded from identity and never copied to the candidate.
export const STORYLINE_SOURCE_SELECT = {
  id: true, projectId: true, storageKey: true, sourceLanguage: true, fileSizeBytes: true, durationSeconds: true,
  project: { select: { id: true, sourceLanguage: true, targetLanguage: true } },
  transcript: { select: { id: true, movieId: true, language: true, provider: true, model: true, createdAt: true, updatedAt: true,
    segments: { orderBy: { sequence: "asc" }, select: { id: true, transcriptId: true, sequence: true, startMs: true, endMs: true, text: true } } } },
  translation: { include: { segments: { orderBy: { sequence: "asc" }, include: { qcIssues: { orderBy: { id: "asc" } } } } } },
  scenes: { orderBy: { sequence: "asc" }, select: { id: true, movieId: true, sequence: true, startMs: true, endMs: true } },
  characterAnalysis: { include: {
    evidence: { orderBy: { id: "asc" }, include: { character: { include: { aliases: { orderBy: { id: "asc" } } } } } },
    relationshipEvidence: { orderBy: { id: "asc" }, include: { relationship: true } },
  } },
  recap: { include: { sections: { orderBy: { sequence: "asc" } }, characterInsights: { orderBy: { sequence: "asc" } }, relationshipInsights: { orderBy: { sequence: "asc" } }, evidence: { orderBy: { id: "asc" } } } },
} as const satisfies Prisma.MovieSelect;
export type StorylineMovieRead = Prisma.MovieGetPayload<{ select: typeof STORYLINE_SOURCE_SELECT }>;
export type StorylineReadTransaction = Pick<Prisma.TransactionClient, "movie" | "characterAnalysisRun" | "$executeRaw">;
export type StorylineReadDatabase = Pick<typeof prisma, "$transaction">;

function jsonData(value: unknown): unknown {
  // Internal DB fingerprint only. BigInt file sizes become decimal strings, never lossy numbers.
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map(jsonData);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "usage").map(([key, nested]) => [key, jsonData(nested)]));
  return value;
}
function sortedRead(movie: StorylineMovieRead) {
  // Collection order is not content identity. Ordered source/recap sequences stay numeric.
  const sort = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const run = movie.characterAnalysis;
  return { ...movie,
    transcript: movie.transcript && { ...movie.transcript, segments: [...movie.transcript.segments].sort((a, b) => a.sequence - b.sequence) },
    scenes: [...movie.scenes].sort((a, b) => a.sequence - b.sequence),
    translation: movie.translation && { ...movie.translation, segments: [...movie.translation.segments].sort((a, b) => a.sequence - b.sequence).map(row => ({ ...row, qcIssues: sort(row.qcIssues) })) },
    characterAnalysis: run && { ...run, evidence: sort(run.evidence).map(row => ({ ...row, character: { ...row.character, aliases: sort(row.character.aliases) } })), relationshipEvidence: sort(run.relationshipEvidence) },
    recap: movie.recap && { ...movie.recap, sections: [...movie.recap.sections].sort((a, b) => a.sequence - b.sequence), characterInsights: [...movie.recap.characterInsights].sort((a, b) => a.sequence - b.sequence), relationshipInsights: [...movie.recap.relationshipInsights].sort((a, b) => a.sequence - b.sequence), evidence: sort(movie.recap.evidence) },
  };
}
type SourceBase = Omit<StorySourcePayload, "id" | "capturedAt" | "media" | "preparation">;
export async function readStorylineSource(scope: Identity, database: StorylineReadDatabase = prisma) {
  try { return await database.$transaction(async tx => {
    // Enforced by PostgreSQL as well as the service's read-only contract.
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const found = await tx.movie.findUnique({ where: { id: scope.movieId }, select: STORYLINE_SOURCE_SELECT });
    if (!found) throw new StorylinePreparationError("MOVIE_NOT_FOUND");
    if (found.id !== scope.movieId || found.projectId !== scope.projectId || found.project.id !== scope.projectId) throw new StorylinePreparationError("PROJECT_MOVIE_MISMATCH");
    if (!found.transcript) throw new StorylinePreparationError("TRANSCRIPT_NOT_FOUND");
    if (!found.scenes.length) throw new StorylinePreparationError("SCENES_REQUIRED");
    const movie = sortedRead(found), transcript = movie.transcript!, run = movie.characterAnalysis;
    if (!run) throw new StorylinePreparationError("CHARACTER_CONTEXT_REQUIRED");
    const legacySource = await loadRecapSource(scope.movieId, tx);
    if (legacySource.projectId !== scope.projectId || legacySource.characterContext !== "CURRENT" || legacySource.characterAnalysisRunId !== run.id || run.movieId !== scope.movieId) throw new StorylinePreparationError("CHARACTER_CONTEXT_REQUIRED");
    if (!["zh", "cmn"].includes(movie.sourceLanguage) || !["zh", "cmn"].includes(transcript.language ?? "") || movie.project.targetLanguage !== "my") throw new StorylinePreparationError("STORYLINE_SOURCE_INVALID");
    const observations: StoryCapturedObservation[] = [];
    function observation(row: NonNullable<typeof run>["evidence"][number] | NonNullable<typeof run>["relationshipEvidence"][number], ownerKind: "CHARACTER" | "RELATIONSHIP", ownerId: string): StoryCapturedObservation {
      const segment = transcript.segments.find(segment => segment.id === row.transcriptSegmentId);
      const scene = movie.scenes.find(scene => scene.id === row.sceneId && scene.sequence === row.sceneSequence);
      if (row.movieId !== movie.id || row.analysisRunId !== run!.id || !segment || !scene || segment.transcriptId !== transcript.id) throw new StorylinePreparationError("STORYLINE_SOURCE_INVALID");
      return { id: row.id, ownerKind, ownerId, anchor: { movieId: movie.id, transcriptId: transcript.id, sceneSequence: scene.sequence, segmentSequence: segment.sequence }, sceneId: scene.id, transcriptSegmentId: segment.id,
        kind: "evidenceType" in row ? row.evidenceType : "RELATIONSHIP", evidenceText: row.evidenceText, inference: row.inference, confidence: row.confidence,
        relationshipType: "relationshipType" in row ? row.relationshipType : null, relationshipSummary: "relationshipSummary" in row ? row.relationshipSummary : null,
        createdAt: row.createdAt.toISOString(), updatedAt: "updatedAt" in row ? row.updatedAt.toISOString() : null };
    }
    run.evidence.forEach(row => {
      if (row.characterId !== row.character.id || row.character.projectId !== scope.projectId || row.character.aliases.some(alias => alias.characterId !== row.characterId)) throw new StorylinePreparationError("STORYLINE_SOURCE_INVALID");
      observations.push(observation(row, "CHARACTER", row.characterId));
    });
    run.relationshipEvidence.forEach(row => {
      if (row.relationshipId !== row.relationship.id || row.relationship.projectId !== scope.projectId || row.relationship.characterAId === row.relationship.characterBId ||
        ![row.relationship.characterAId, row.relationship.characterBId].every(id => legacySource.characters.some(character => character.ref === id))) throw new StorylinePreparationError("STORYLINE_SOURCE_INVALID");
      observations.push(observation(row, "RELATIONSHIP", row.relationshipId));
    });
    observations.sort((a, b) => a.id < b.id ? -1 : 1);
    const translation = movie.translation;
    const translationContext = translation && {
      id: translation.id, movieId: translation.movieId, sourceTranscriptId: translation.sourceTranscriptId,
      sourceLanguage: translation.sourceLanguage, targetLanguage: translation.targetLanguage, provider: translation.provider, model: translation.model, revision: translation.revision,
      createdAt: translation.createdAt.toISOString(), updatedAt: translation.updatedAt.toISOString(), qcScannedAt: translation.qcScannedAt?.toISOString() ?? null,
      rows: translation.segments.map(({ qcIssues, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString(), editedAt: row.editedAt?.toISOString() ?? null, reviewedAt: row.reviewedAt?.toISOString() ?? null,
        qcIssues: qcIssues.map(issue => ({ ...issue, createdAt: issue.createdAt.toISOString(), updatedAt: issue.updatedAt.toISOString(), resolvedAt: issue.resolvedAt?.toISOString() ?? null })) })),
    };
    const source: SourceBase = { schemaVersion: "story-source-v1", ...scope, sourceLanguage: movie.sourceLanguage as "zh" | "cmn", targetLanguage: "my", transcript: { id: transcript.id, movieId: transcript.movieId, language: transcript.language as "zh" | "cmn", segments: transcript.segments.map(row => ({ ...row })) },
      scenes: movie.scenes.map(row => ({ ...row })), characterContext: "CURRENT", translationContextPolicy: "ALL_CURRENT",
      characters: legacySource.characters.map(row => ({ id: row.ref, ...scope, name: row.name, uncertain: row.uncertain, evidence: observationAllowances(observations.filter(item => item.ownerKind === "CHARACTER" && item.ownerId === row.ref)) })),
      relationships: legacySource.relationships.map(row => ({ id: row.ref, ...scope, characterAId: row.characterARef, characterBId: row.characterBRef, type: row.type as StoryRelationship["type"], summary: row.summary, confidence: row.confidence, evidence: observationAllowances(observations.filter(item => item.ownerKind === "RELATIONSHIP" && item.ownerId === row.ref)) })),
      translation: translationContext,
    };
    const aliases = legacySource.characters.map(row => ({ characterId: row.ref, values: [...row.aliases].sort() })).sort((a, b) => a.characterId < b.characterId ? -1 : 1);
    const dependencyHash = contractHash("story-source-dependencies-v1", jsonData(movie));
    return { source, storageKey: movie.storageKey, recordedSize: movie.fileSizeBytes, dependencyHash,
      sourceBindingHash: contractHash("story-source-binding-v1", { ...scope, storageKey: movie.storageKey }), observations, aliases,
      characterAnalysis: { id: run.id, sourceHash: run.sourceHash, provider: run.provider, model: run.model, createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() },
      // Recap validation needs actual duration later; no file operation occurs in this transaction.
      recap: movie.recap, legacySourceHash: legacySource.sourceHash,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000, maxWait: 5000 }); }
  catch (error) {
    if (error instanceof StorylinePreparationError) throw error;
    if (error instanceof StorylineContractError || error instanceof RecapError) throw new StorylinePreparationError("STORYLINE_SOURCE_INVALID");
    throw new StorylinePreparationError("SOURCE_READ_UNAVAILABLE");
  }
}
export type StorylineSourceRead = Awaited<ReturnType<typeof readStorylineSource>>;

export function captureLegacyRecap(read: StorylineSourceRead, source: StorySourcePayload): Pick<NonNullable<StorySourcePayload["preparation"]>, "legacyRecap" | "legacyRecapState"> {
  const recap = read.recap;
  if (!recap) return { legacyRecapState: "ABSENT", legacyRecap: null };
  if (recap.sourceHash !== read.legacySourceHash || recap.sourceTranscriptId !== source.transcript.id || recap.characterAnalysisRunId !== read.characterAnalysis.id) return { legacyRecapState: "EXCLUDED_STALE", legacyRecap: null };
  try {
    const evidence = (parent: string, type: "SECTION" | "CHARACTER_INSIGHT" | "RELATIONSHIP_INSIGHT"): RecapReference[] => {
      const groups = new Map<string, RecapReference>();
      for (const row of recap.evidence) {
        const parentId = type === "SECTION" ? row.sectionId : type === "CHARACTER_INSIGHT" ? row.characterInsightId : row.relationshipInsightId;
        if (parentId !== parent) continue;
        const segment = source.transcript.segments.find(segment => segment.id === row.transcriptSegmentId);
        if (row.recapId !== recap.id || row.movieId !== source.movieId || row.evidenceType !== type || !segment || !source.scenes.some(scene => scene.id === row.sceneId && scene.sequence === row.sceneSequence)) throw new Error();
        const key = canonicalJson([row.sceneSequence, row.note]);
        const group = groups.get(key) ?? { sceneSequence: row.sceneSequence, segmentSequences: [], note: row.note };
        group.segmentSequences.push(segment.sequence); groups.set(key, group);
      }
      return [...groups.values()].map(row => ({ ...row, segmentSequences: [...new Set(row.segmentSequences)].sort((a, b) => a - b) })).sort((a, b) => a.sceneSequence - b.sceneSequence || (a.note < b.note ? -1 : a.note > b.note ? 1 : 0));
    };
    if (recap.movieId !== source.movieId || recap.language !== "my" || recap.characterContext !== "CURRENT" || [...recap.sections, ...recap.characterInsights, ...recap.relationshipInsights].some(row => row.recapId !== recap.id) || recap.evidence.some(row => [row.sectionId, row.characterInsightId, row.relationshipInsightId].filter(Boolean).length !== 1 || ![...recap.sections, ...recap.characterInsights, ...recap.relationshipInsights].some(parent => parent.id === (row.sectionId ?? row.characterInsightId ?? row.relationshipInsightId)))) throw new Error();
    const output: RecapOutput = { title: recap.title, summary: recap.summary,
      sections: recap.sections.map(row => ({ sequence: row.sequence, sceneStartSequence: row.sceneStartSequence, sceneEndSequence: row.sceneEndSequence, heading: row.heading, summary: row.summary, confidence: row.confidence, evidence: evidence(row.id, "SECTION") })),
      characterInsights: recap.characterInsights.map(row => ({ characterRef: row.characterId!, observation: row.observation, confidence: row.confidence, evidence: evidence(row.id, "CHARACTER_INSIGHT") })),
      relationshipInsights: recap.relationshipInsights.map(row => ({ relationshipRef: row.relationshipId!, characterARef: row.characterAId!, characterBRef: row.characterBId!, observation: row.observation, confidence: row.confidence, evidence: evidence(row.id, "RELATIONSHIP_INSIGHT") })),
    };
    const childIds = { sections: recap.sections.map(row => row.id).sort(), characterInsights: recap.characterInsights.map(row => row.id).sort(), relationshipInsights: recap.relationshipInsights.map(row => row.id).sort(), evidence: recap.evidence.map(row => row.id).sort() };
    const legacyRecap: StoryLegacyRecap = { id: recap.id, sourceHash: recap.sourceHash, sourceTranscriptId: recap.sourceTranscriptId, characterAnalysisRunId: recap.characterAnalysisRunId!, provider: recap.provider, model: recap.model, language: "my", createdAt: recap.createdAt.toISOString(), updatedAt: recap.updatedAt.toISOString(), childIds, output: validateAdvisoryOutput(output, source) };
    return { legacyRecapState: "CURRENT_ADVISORY", legacyRecap };
  } catch { return { legacyRecapState: "EXCLUDED_INVALID", legacyRecap: null }; }
}
