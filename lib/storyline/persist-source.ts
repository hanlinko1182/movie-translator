import "server-only";
import { prisma } from "@/lib/prisma";
import { canonicalJson, contractHash } from "./canonical";
import { assertAuthoritativeStorylineSource } from "./authoritative-source";
import type { Identity, StorySourceSnapshot } from "./contracts";
import { inspectStorylineMedia, type InspectedStorylineMedia } from "./media";
import type { PreparedStorylineCandidate } from "./prepare-source";
import { StorylinePreparationError } from "./preparation-errors";
import { StorylinePersistenceError } from "./persistence-errors";
import { lockStorylineSelection, lockStorylineStudio } from "./persistence-locks";
import { captureStorylineSourceInTransaction, readStorylineSource, type StorylineReadDatabase } from "./read-source";
import { validateSourceSnapshot } from "./source";
import { StorylineContractError, id, record } from "./validation";

export type PersistedSourceResult = {
  persisted: true; approved: false; studioId: string; snapshotId: string;
  sourceContentHash: string; sourceContextHash: string; revision: number; deduplicated: boolean;
};
type Dependencies = {
  database?: StorylineReadDatabase;
  inspectMedia?: (key: string | null) => Promise<InspectedStorylineMedia>;
};

function verifyCandidate(value: unknown, scope: Identity): StorySourceSnapshot {
  try {
    const candidate = record(value, ["kind", "persisted", "approved", "snapshot"], "candidate");
    if (candidate.kind !== "PREPARED_CANDIDATE" || candidate.persisted !== false || candidate.approved !== false) throw new Error();
    const supplied = record(candidate.snapshot, ["payload", "admissions", "sourceContentHash", "sourceContextHash"], "candidate.snapshot");
    const checked = validateSourceSnapshot(supplied.payload, scope);
    if (!checked.payload.preparation || checked.sourceContentHash !== supplied.sourceContentHash || checked.sourceContextHash !== supplied.sourceContextHash ||
      canonicalJson(checked.admissions) !== canonicalJson(supplied.admissions)) throw new Error();
    const expectedId = `candidate-${contractHash("story-candidate-v1", {
      dependencyHash: checked.payload.preparation.dependencyHash, sha256: checked.payload.media.sha256,
      video: checked.payload.preparation.video,
    })}`;
    if (checked.payload.id !== expectedId) throw new Error();
    return checked;
  } catch { throw new StorylinePersistenceError("INVALID_CANDIDATE"); }
}

function compareMedia(snapshot: StorySourceSnapshot, media: InspectedStorylineMedia) {
  const source = snapshot.payload;
  if (source.media.sha256 !== media.sha256 || source.media.bytes !== media.sizeBytes || source.media.durationMs !== media.durationMs ||
    canonicalJson(source.preparation!.video) !== canonicalJson(media.video)) throw new StorylinePersistenceError("SOURCE_MEDIA_CHANGED");
}

function comparable(snapshot: StorySourceSnapshot) {
  const { id: ignoredId, capturedAt: ignoredCapture, ...content } = snapshot.payload;
  void ignoredId; void ignoredCapture;
  return canonicalJson(content);
}

/** Explicit server-only commit. No route, GET, worker or provider invokes this service. */
export async function persistPreparedStorylineSource(input: {
  selection: Identity; candidate: PreparedStorylineCandidate; expectedRevision: number | null;
}, dependencies: Dependencies = {}): Promise<PersistedSourceResult> {
  const scope: Identity = { projectId: id(input.selection.projectId, "selection.projectId"), movieId: id(input.selection.movieId, "selection.movieId") };
  if (input.expectedRevision !== null && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) throw new StorylinePersistenceError("INVALID_CANDIDATE");
  const snapshot = verifyCandidate(input.candidate, scope);
  const prep = snapshot.payload.preparation!;
  const database = dependencies.database ?? prisma;
  // This read and full checksum/probe are outside the short write transaction.
  const initial = await readStorylineSource(scope, database);
  if (initial.dependencyHash !== prep.dependencyHash || initial.sourceBindingHash !== prep.sourceBindingHash) throw new StorylinePersistenceError("STALE_STORYLINE_SOURCE");
  const media = await (dependencies.inspectMedia ?? inspectStorylineMedia)(initial.storageKey);
  if (media.storageKey !== initial.storageKey || initial.recordedSize !== null && initial.recordedSize !== BigInt(media.sizeBytes)) throw new StorylinePersistenceError("SOURCE_MEDIA_CHANGED");
  compareMedia(snapshot, media);

  try {
    return await database.$transaction(async tx => {
      await lockStorylineSelection(tx, scope);
      let studioId = await lockStorylineStudio(tx, scope.movieId);
      let createdStudio = false;
      const fresh = await captureStorylineSourceInTransaction(scope, tx);
      if (fresh.dependencyHash !== prep.dependencyHash || fresh.sourceBindingHash !== prep.sourceBindingHash || fresh.storageKey !== media.storageKey ||
        fresh.recordedSize !== null && fresh.recordedSize !== BigInt(media.sizeBytes)) throw new StorylinePersistenceError("STALE_STORYLINE_SOURCE");
      await media.assertUnchanged();
      assertAuthoritativeStorylineSource(snapshot, fresh, media);
      if (!studioId) {
        if (input.expectedRevision !== null) throw new StorylinePersistenceError("STUDIO_REVISION_CONFLICT");
        const created = await tx.storylineStudio.create({ data: {
          projectId: scope.projectId, movieId: scope.movieId,
          verificationGenesisHash: contractHash("story-verification-ledger-empty-v1", scope),
        } });
        studioId = created.id;
        createdStudio = true;
      }
      const studio = await tx.storylineStudio.findUniqueOrThrow({ where: { id: studioId } });
      if (studio.projectId !== scope.projectId || studio.movieId !== scope.movieId) throw new StorylinePersistenceError("PROJECT_MOVIE_MISMATCH");
      const existing = await tx.storySourceSnapshot.findUnique({ where: { studioId_sourceContextHash: { studioId, sourceContextHash: snapshot.sourceContextHash } } });
      if (existing) {
        let stored: StorySourceSnapshot;
        try { stored = validateSourceSnapshot(JSON.parse(existing.canonicalPayload), scope); }
        catch { throw new StorylinePersistenceError("SNAPSHOT_CONFLICT"); }
        if (stored.payload.id !== existing.id || existing.sourceContentHash !== snapshot.sourceContentHash || existing.dependencyHash !== prep.dependencyHash ||
          existing.sourceBindingHash !== prep.sourceBindingHash || existing.sourceSha256 !== media.sha256 ||
          existing.sourceBytes !== BigInt(media.sizeBytes) || existing.sourceDurationMs !== media.durationMs ||
          stored.sourceContextHash !== snapshot.sourceContextHash || comparable(stored) !== comparable(snapshot)) throw new StorylinePersistenceError("SNAPSHOT_CONFLICT");
        if (studio.currentSnapshotId === existing.id) {
          await media.assertUnchanged();
          return { persisted: true, approved: false, studioId, snapshotId: existing.id, sourceContentHash: existing.sourceContentHash,
            sourceContextHash: existing.sourceContextHash, revision: studio.revision, deduplicated: true };
        }
      }
      if (input.expectedRevision !== studio.revision && !(createdStudio && input.expectedRevision === null)) throw new StorylinePersistenceError("STUDIO_REVISION_CONFLICT");
      const saved = existing ?? await tx.storySourceSnapshot.create({ data: {
        id: snapshot.payload.id, studioId, projectId: scope.projectId, movieId: scope.movieId,
        sourceContentHash: snapshot.sourceContentHash, sourceContextHash: snapshot.sourceContextHash,
        dependencyHash: prep.dependencyHash, sourceBindingHash: prep.sourceBindingHash,
        sourceSha256: media.sha256, sourceBytes: BigInt(media.sizeBytes), sourceDurationMs: media.durationMs,
        canonicalPayload: canonicalJson(snapshot.payload), capturedAt: new Date(snapshot.payload.capturedAt),
      } });
      await tx.storylineStudio.update({ where: { id: studioId }, data: { currentSnapshotId: saved.id, currentScriptVersionId: null } });
      await media.assertUnchanged();
      const final = await tx.storylineStudio.findUniqueOrThrow({ where: { id: studioId }, select: { revision: true } });
      return { persisted: true, approved: false, studioId, snapshotId: saved.id, sourceContentHash: saved.sourceContentHash,
        sourceContextHash: saved.sourceContextHash, revision: final.revision, deduplicated: !!existing };
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof StorylinePersistenceError) throw error;
    if (error instanceof StorylinePreparationError && error.code === "STALE_STORYLINE_SOURCE") throw new StorylinePersistenceError("STALE_STORYLINE_SOURCE");
    if (error instanceof StorylinePreparationError && ["SOURCE_MEDIA_MISSING", "SOURCE_MEDIA_INVALID", "SOURCE_MEDIA_CHANGED", "STORAGE_UNAVAILABLE"].includes(error.code)) throw new StorylinePersistenceError("SOURCE_MEDIA_CHANGED");
    if (error instanceof StorylineContractError) throw new StorylinePersistenceError("INVALID_CANDIDATE");
    throw new StorylinePersistenceError("PERSISTENCE_UNAVAILABLE");
  }
}
