import assert from "node:assert/strict";
import { hashValue } from "../../lib/character-analysis/normalize";
import { loadRecapSource } from "../../lib/recap/source";
import type { StorylineMovieRead, StorylineReadDatabase, StorylineReadTransaction } from "../../lib/storyline/read-source";
import { STORYLINE_SOURCE_SELECT } from "../../lib/storyline/read-source";
import type { InspectedStorylineMedia } from "../../lib/storyline/media";
import { sourceFixture, scope, date } from "./fixtures";

export const sourceKey = "movies/00000000-0000-4000-8000-000000000023.mp4";
export function movieFixture(): StorylineMovieRead {
  const source = sourceFixture(), stamp = new Date(date), target = source.translation!;
  const character = { id: "character-a", projectId: scope.projectId, identityKey: "c".repeat(64), canonicalName: "人物甲", normalizedName: "人物甲", uncertain: false, createdAt: stamp, updatedAt: stamp,
    aliases: [{ id: "alias-one", characterId: "character-a", alias: "  甲  ", normalizedAlias: "甲" }] };
  const movie = { ...scope, id: scope.movieId, storageKey: sourceKey, sourceLanguage: "zh", fileSizeBytes: BigInt(4096), durationSeconds: 24,
    project: { id: scope.projectId, sourceLanguage: "zh", targetLanguage: "my" },
    transcript: { ...source.transcript, provider: "synthetic", model: "fixture", createdAt: stamp, updatedAt: stamp },
    scenes: source.scenes,
    translation: { ...target, segments: target.rows.map(row => ({ ...row, createdAt: stamp, editedAt: row.editedAt ? stamp : null, reviewedAt: row.reviewedAt ? stamp : null,
      qcIssues: row.qcIssues.map(issue => ({ ...issue, createdAt: stamp, updatedAt: stamp, resolvedAt: issue.resolvedAt ? stamp : null })) })), rows: undefined, createdAt: stamp, updatedAt: stamp, qcScannedAt: stamp },
    characterAnalysis: { id: "analysis-one", movieId: scope.movieId, transcriptId: source.transcript.id, sourceHash: "a".repeat(64), provider: "synthetic", model: "fixture", sceneCount: 1, runtimeMs: 1, modelCalls: 1, usage: null, createdAt: stamp, updatedAt: stamp,
      evidence: [{ id: "observation-one", analysisRunId: "analysis-one", characterId: character.id, movieId: scope.movieId, sceneId: source.scenes[0].id, sceneSequence: 0, transcriptSegmentId: source.transcript.segments[0].id, evidenceKey: "d".repeat(64), evidenceType: "MENTION", evidenceText: "  人物甲说话。  ", inference: "", confidence: "LOW", createdAt: stamp, updatedAt: stamp, character }], relationshipEvidence: [] },
    recap: null,
  } as unknown as StorylineMovieRead;
  delete (movie.translation as unknown as { rows?: unknown }).rows;
  refreshCharacterHash(movie);
  return movie;
}
function characterView(movie: StorylineMovieRead) {
  const segments = movie.transcript?.segments.map(({ id, sequence, startMs, endMs, text }) => ({ id, sequence, startMs, endMs, text })).sort((a, b) => a.sequence - b.sequence) ?? [];
  return { id: movie.id, projectId: movie.projectId,
    scenes: movie.scenes.map(({ id, sequence, startMs, endMs }) => ({ id, sequence, startMs, endMs })).sort((a, b) => a.sequence - b.sequence),
    transcript: movie.transcript && { id: movie.transcript.id, segments },
    translation: movie.translation && { sourceTranscriptId: movie.translation.sourceTranscriptId, segments: movie.translation.segments.map(({ sequence, startMs, endMs, text }) => ({ sequence, startMs, endMs, text })).sort((a, b) => a.sequence - b.sequence) },
  };
}
export function refreshCharacterHash(movie: StorylineMovieRead) {
  const view = characterView(movie);
  const targets = view.translation?.sourceTranscriptId === view.transcript?.id ? view.translation!.segments.filter(target => view.transcript!.segments.some(segment => segment.sequence === target.sequence && segment.startMs === target.startMs && segment.endMs === target.endMs)) : [];
  if (movie.characterAnalysis) movie.characterAnalysis.sourceHash = hashValue({ version: "characters-v1", projectId: view.projectId, transcriptId: view.transcript?.id, segments: view.transcript?.segments, scenes: view.scenes, targets });
}
function transaction(movie: StorylineMovieRead, calls: string[]): StorylineReadTransaction {
  const only = (name: string, methods: Record<string, unknown>) => new Proxy(methods, { get(target, key: string) { assert.ok(Object.hasOwn(target, key), `Unexpected database operation ${name}.${key}`); return target[key]; } });
  return {
    $executeRaw: async (sql: TemplateStringsArray) => { assert.equal(sql.join(""), "SET TRANSACTION READ ONLY"); calls.push("READ_ONLY"); return 0; },
    movie: only("movie", { findUnique: async (query: { where: { id: string }; select: unknown }) => {
      calls.push(`MOVIE:${query.where.id}`); if (query.where.id !== scope.movieId) return null;
      return query.select === STORYLINE_SOURCE_SELECT ? structuredClone(movie) : characterView(movie);
    } }),
    characterAnalysisRun: only("characterAnalysisRun", { findUnique: async (query: { where: { movieId: string } }) => {
      calls.push(`ANALYSIS:${query.where.movieId}`); assert.equal(query.where.movieId, scope.movieId);
      const run = movie.characterAnalysis; if (!run) return null;
      return { ...run, evidence: run.evidence.map(row => ({ ...row, transcriptSegment: { sequence: movie.transcript!.segments.find(segment => segment.id === row.transcriptSegmentId)?.sequence } })),
        relationshipEvidence: run.relationshipEvidence.map(row => ({ ...row, transcriptSegment: { sequence: movie.transcript!.segments.find(segment => segment.id === row.transcriptSegmentId)?.sequence } })) };
    } }),
  } as unknown as StorylineReadTransaction;
}
export function preparationFixture(initial = movieFixture()) {
  let movie = structuredClone(initial), depth = 0, transactions = 0, inspections = 0;
  let inspectHook: () => void = () => {}, finalHook: () => void = () => {};
  const calls: string[] = [];
  const database = { $transaction: async <T>(run: (tx: StorylineReadTransaction) => Promise<T>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 5000 });
    transactions++; depth++; const view = structuredClone(movie);
    try { return await run(transaction(view, calls)); } finally { depth--; }
  } } as unknown as StorylineReadDatabase;
  const inspectMedia = async (key: string | null): Promise<InspectedStorylineMedia> => {
    assert.equal(depth, 0, "Media inspection must be outside database transactions"); assert.equal(key, movie.storageKey); inspections++; inspectHook();
    return { storageKey: key!, sha256: "a".repeat(64), sizeBytes: 4096, durationMs: 24000,
      video: { format: "mov,mp4,m4a,3gp,3g2,mj2", videoIndex: 0, videoCodec: "h264", width: 320, height: 240, timeBase: "1/12800", frameRate: "25/1", hasAudio: false },
      assertUnchanged: async () => { assert.equal(depth, 0); finalHook(); },
    };
  };
  return { database, inspectMedia, now: () => date, calls,
    get movie() { return movie; }, set movie(value) { movie = value; },
    get transactions() { return transactions; }, get inspections() { return inspections; },
    onInspect(fn: () => void) { inspectHook = fn; }, onFinalCheck(fn: () => void) { finalHook = fn; },
  };
}
export async function addRecap(movie: StorylineMovieRead) {
  const stamp = new Date(date), source = await loadRecapSource(scope.movieId, transaction(movie, []));
  movie.recap = { id: "recap-one", movieId: movie.id, sourceTranscriptId: movie.transcript!.id, characterAnalysisRunId: movie.characterAnalysis!.id,
    sourceHash: source.sourceHash, characterContext: "CURRENT", provider: "synthetic", model: "fixture", language: "my", title: "  အကျဉ်းချုပ်  ", summary: "  စမ်းသပ်ချက်။  ", strategy: "SINGLE_STAGE", runtimeMs: 1, modelCalls: 1, usage: null, createdAt: stamp, updatedAt: stamp,
    sections: [{ id: "section-one", recapId: "recap-one", sequence: 0, sceneStartSequence: 0, sceneEndSequence: 0, heading: "အစပိုင်း", summary: "  စမ်းသပ်ချက်။  ", confidence: "LOW", createdAt: stamp }], characterInsights: [], relationshipInsights: [],
    evidence: [{ id: "recap-evidence-one", recapId: "recap-one", movieId: movie.id, sectionId: "section-one", characterInsightId: null, relationshipInsightId: null, sceneId: movie.scenes[0].id, sceneSequence: 0, transcriptSegmentId: movie.transcript!.segments[0].id, evidenceType: "SECTION", evidenceKey: "f".repeat(64), note: "  အထောက်အထား။  ", createdAt: stamp }],
  };
}

export function addRelationship(movie: StorylineMovieRead) {
  const run = movie.characterAnalysis!, first = run.evidence[0], stamp = new Date(date);
  const character = { ...first.character, id: "character-b", canonicalName: "人物乙", aliases: [] };
  run.evidence.push({ ...first, id: "observation-two", characterId: character.id, transcriptSegmentId: movie.transcript!.segments[1].id, character });
  run.relationshipEvidence.push({ id: "relationship-observation", analysisRunId: run.id, relationshipId: "relationship-one", movieId: movie.id,
    sceneId: movie.scenes[0].id, sceneSequence: 0, transcriptSegmentId: movie.transcript!.segments[2].id,
    evidenceKey: "e".repeat(64), relationshipType: "ALLY", relationshipSummary: "  本电影中的合作。  ", evidenceText: "  两人讨论合作。  ", inference: "可能合作。", confidence: "LOW", createdAt: stamp,
    relationship: { id: "relationship-one", projectId: movie.projectId, characterAId: first.characterId, characterBId: character.id, relationshipType: "UNKNOWN", summary: "Shared project summary is not movie evidence", confidence: "HIGH", createdAt: stamp, updatedAt: stamp } });
}
