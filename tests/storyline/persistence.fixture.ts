import assert from "node:assert/strict";
import type { PrismaClient } from "../../generated/prisma/client";
import { loadRecapSource } from "../../lib/recap/source";
import type { InspectedStorylineMedia } from "../../lib/storyline/media";
import { StorylinePreparationError } from "../../lib/storyline/preparation-errors";
import { movieFixture, sourceKey } from "./preparation.fixture";
import { date, scope, sourceFixture } from "./fixtures";

const at = new Date(date);
export async function seedPersistenceFixture(db: PrismaClient) {
  const source = sourceFixture(), movie = movieFixture(), run = movie.characterAnalysis!;
  await db.project.create({ data: { id: scope.projectId, name: "Synthetic project", slug: "synthetic-project", sourceLanguage: "zh", targetLanguage: "my" } });
  await db.movie.create({ data: { id: scope.movieId, projectId: scope.projectId, title: "Synthetic movie", storageKey: sourceKey,
    sourceLanguage: "zh", fileSizeBytes: BigInt(4096), durationSeconds: 24 } });
  await db.movie.create({ data: { id: "movie-other", projectId: scope.projectId, title: "Other synthetic movie",
    storageKey: "movies/00000000-0000-4000-8000-000000000024.mp4", sourceLanguage: "zh" } });
  await db.transcript.create({ data: { id: source.transcript.id, movieId: scope.movieId, provider: "synthetic", model: "fixture", language: "zh", durationMs: 24000,
    text: source.transcript.segments.map(row => row.text).join("\n"), createdAt: at, updatedAt: at } });
  await db.transcriptSegment.createMany({ data: source.transcript.segments.map(row => ({ ...row, createdAt: at })) });
  await db.scene.create({ data: { ...source.scenes[0], createdAt: at, updatedAt: at } });
  const translation = source.translation!;
  await db.translation.create({ data: { id: translation.id, movieId: scope.movieId, sourceTranscriptId: source.transcript.id,
    provider: translation.provider, model: translation.model, sourceLanguage: "zh", targetLanguage: "my", revision: translation.revision,
    qcScannedAt: at, createdAt: at, updatedAt: at } });
  for (const row of translation.rows) {
    await db.translatedSegment.create({ data: { ...row, qcIssues: undefined, createdAt: at, editedAt: row.editedAt ? at : null, reviewedAt: row.reviewedAt ? at : null } });
    for (const issue of row.qcIssues) await db.translationQcIssue.create({ data: { ...issue, createdAt: at, updatedAt: at, resolvedAt: issue.resolvedAt ? at : null } });
  }
  const observation = run.evidence[0], character = observation.character;
  await db.character.create({ data: { id: character.id, projectId: scope.projectId, identityKey: character.identityKey,
    canonicalName: character.canonicalName, normalizedName: character.normalizedName, uncertain: false, createdAt: at, updatedAt: at } });
  for (const alias of character.aliases) await db.characterAlias.create({ data: { ...alias } });
  await db.characterAnalysisRun.create({ data: { id: run.id, movieId: scope.movieId, transcriptId: source.transcript.id, sourceHash: run.sourceHash,
    provider: "synthetic", model: "fixture", sceneCount: 1, runtimeMs: 1, modelCalls: 1, createdAt: at, updatedAt: at } });
  await db.characterEvidence.create({ data: { id: observation.id, analysisRunId: run.id, characterId: character.id,
    movieId: scope.movieId, sceneId: source.scenes[0].id, sceneSequence: 0, transcriptSegmentId: source.transcript.segments[0].id,
    evidenceKey: observation.evidenceKey, evidenceType: "MENTION", evidenceText: observation.evidenceText,
    inference: observation.inference, confidence: "LOW", createdAt: at, updatedAt: at } });
  const recapSource = await loadRecapSource(scope.movieId, db);
  assert.equal(recapSource.characterContext, "CURRENT");
  await db.recap.create({ data: { id: "recap-one", movieId: scope.movieId, sourceTranscriptId: source.transcript.id, characterAnalysisRunId: run.id,
    sourceHash: recapSource.sourceHash, characterContext: "CURRENT", provider: "synthetic", model: "fixture", language: "my",
    title: "Synthetic recap", summary: "စမ်းသပ်ချက်။", strategy: "SINGLE_STAGE", runtimeMs: 1, modelCalls: 1,
    createdAt: at, updatedAt: at } });
  await db.recapSection.create({ data: { id: "section-one", recapId: "recap-one", sequence: 0, sceneStartSequence: 0, sceneEndSequence: 0,
    heading: "အစပိုင်း", summary: "စမ်းသပ်ချက်။", confidence: "LOW", createdAt: at } });
  await db.recapEvidence.create({ data: { id: "recap-evidence-one", recapId: "recap-one", movieId: scope.movieId,
    sectionId: "section-one", sceneId: source.scenes[0].id, sceneSequence: 0, transcriptSegmentId: source.transcript.segments[0].id,
    evidenceType: "SECTION", evidenceKey: "f".repeat(64), note: "အထောက်အထား။", createdAt: at } });
}
export function fakePersistenceMedia() {
  let invalid = false, changed = false;
  const inspect = async (storageKey: string | null): Promise<InspectedStorylineMedia> => {
    assert.equal(storageKey, sourceKey);
    return { storageKey: sourceKey, sha256: invalid ? "b".repeat(64) : "a".repeat(64), sizeBytes: 4096, durationMs: 24000,
      video: { format: "mov,mp4,m4a,3gp,3g2,mj2", videoIndex: 0, videoCodec: "h264", width: 320, height: 240,
        timeBase: "1/12800", frameRate: "25/1", hasAudio: false },
      assertUnchanged: async () => { if (changed) throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED"); } };
  };
  return { inspect, setInvalid: (value: boolean) => { invalid = value; }, setChanged: (value: boolean) => { changed = value; } };
}

