import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { canonicalJson } from "./canonical";
import { assertAuthoritativeStorylineSource } from "./authoritative-source";
import type { Identity, StoryScriptPayload } from "./contracts";
import { inspectStorylineMedia, type InspectedStorylineMedia } from "./media";
import { StorylinePreparationError } from "./preparation-errors";
import { StorylinePersistenceError } from "./persistence-errors";
import { lockStorylineSelection, lockStorylineStudio } from "./persistence-locks";
import { captureStorylineSourceInTransaction, readStorylineSource, type StorylineReadDatabase } from "./read-source";
import { validateScriptPayload } from "./script";
import { validateSourceSnapshot } from "./source";
import { StorylineContractError, id, record } from "./validation";

export type PersistedScriptResult = {
  persisted: true; approved: false; sourceVerified: false;
  studioId: string; scriptVersionId: string; sourceSnapshotId: string;
  version: number; scriptHash: string; revision: number;
};
type Dependencies = {
  database?: StorylineReadDatabase;
  inspectMedia?: (key: string | null) => Promise<InspectedStorylineMedia>;
};

/** Draft-only script version. Trust and approval remain separate, unavailable workflows. */
export async function persistStorylineScriptDraft(value: unknown, dependencies: Dependencies = {}): Promise<PersistedScriptResult> {
  let request: Record<string, unknown>, scope: Identity, sourceSnapshotId: string, expectedRevision: number;
  try {
    request = record(value, ["projectId", "movieId", "sourceSnapshotId", "expectedRevision", "origin", "beats"], "scriptDraft");
    scope = { projectId: id(request.projectId, "scriptDraft.projectId"), movieId: id(request.movieId, "scriptDraft.movieId") };
    sourceSnapshotId = id(request.sourceSnapshotId, "scriptDraft.sourceSnapshotId");
    expectedRevision = request.expectedRevision as number;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !["MODEL", "HUMAN"].includes(request.origin as string)) throw new Error();
  } catch { throw new StorylinePersistenceError("SCRIPT_INVALID"); }

  const database = dependencies.database ?? prisma;
  // Immutable source bytes are loaded before the write transaction; currentness is
  // rechecked after Project → Movie → Studio locks and a fresh media inspection.
  const sourceRow = await database.$transaction(tx => tx.storySourceSnapshot.findUnique({ where: { id: sourceSnapshotId } }));
  if (!sourceRow || sourceRow.projectId !== scope.projectId || sourceRow.movieId !== scope.movieId) throw new StorylinePersistenceError("SNAPSHOT_NOT_FOUND");
  let source;
  try {
    source = validateSourceSnapshot(JSON.parse(sourceRow.canonicalPayload), scope);
    if (!source.payload.preparation || source.payload.id !== sourceRow.id || source.sourceContentHash !== sourceRow.sourceContentHash ||
      source.sourceContextHash !== sourceRow.sourceContextHash || canonicalJson(source.payload) !== sourceRow.canonicalPayload ||
      source.payload.preparation.dependencyHash !== sourceRow.dependencyHash || source.payload.preparation.sourceBindingHash !== sourceRow.sourceBindingHash ||
      source.payload.media.sha256 !== sourceRow.sourceSha256 || BigInt(source.payload.media.bytes) !== sourceRow.sourceBytes ||
      source.payload.media.durationMs !== sourceRow.sourceDurationMs) throw new Error();
  } catch { throw new StorylinePersistenceError("SNAPSHOT_CONFLICT"); }
  const initial = await readStorylineSource(scope, database);
  if (initial.dependencyHash !== source.payload.preparation.dependencyHash || initial.sourceBindingHash !== source.payload.preparation.sourceBindingHash) throw new StorylinePersistenceError("STALE_STORYLINE_SOURCE");
  const media = await (dependencies.inspectMedia ?? inspectStorylineMedia)(initial.storageKey);
  if (media.storageKey !== initial.storageKey || media.sha256 !== source.payload.media.sha256 || media.sizeBytes !== source.payload.media.bytes ||
    media.durationMs !== source.payload.media.durationMs || canonicalJson(media.video) !== canonicalJson(source.payload.preparation.video) ||
    initial.recordedSize !== null && initial.recordedSize !== BigInt(media.sizeBytes)) throw new StorylinePersistenceError("SOURCE_MEDIA_CHANGED");
  try {
    return await database.$transaction(async tx => {
      await lockStorylineSelection(tx, scope);
      const studioId = await lockStorylineStudio(tx, scope.movieId);
      if (!studioId) throw new StorylinePersistenceError("SNAPSHOT_NOT_FOUND");
      const studio = await tx.storylineStudio.findUniqueOrThrow({ where: { id: studioId } });
      if (studio.projectId !== scope.projectId || studio.currentSnapshotId !== sourceSnapshotId || sourceRow.studioId !== studioId) throw new StorylinePersistenceError("SNAPSHOT_NOT_FOUND");
      if (studio.revision !== expectedRevision) throw new StorylinePersistenceError("STUDIO_REVISION_CONFLICT");
      const fresh = await captureStorylineSourceInTransaction(scope, tx);
      if (fresh.dependencyHash !== source.payload.preparation!.dependencyHash || fresh.sourceBindingHash !== source.payload.preparation!.sourceBindingHash ||
        fresh.storageKey !== media.storageKey || fresh.recordedSize !== null && fresh.recordedSize !== BigInt(media.sizeBytes)) throw new StorylinePersistenceError("STALE_STORYLINE_SOURCE");
      await media.assertUnchanged();
      assertAuthoritativeStorylineSource(source, fresh, media);
      const version = studio.nextScriptVersion;
      const parent = version === 1 ? null : await tx.storyScriptVersion.findUnique({ where: { studioId_version: { studioId, version: version - 1 } }, select: { id: true } });
      if (version > 1 && !parent) throw new StorylinePersistenceError("SNAPSHOT_CONFLICT");
      const payload: StoryScriptPayload = {
        schemaVersion: "story-script-v1", id: randomUUID(), version, parentVersionId: parent?.id ?? null,
        sourceSnapshotId, sourceContentHash: source.sourceContentHash, sourceContextHash: source.sourceContextHash,
        style: "CHARACTER_PSYCHOLOGY", durationMode: "AUTO_STORY_COMPLEXITY", translationContextPolicy: "ALL_CURRENT",
        language: "my", origin: request.origin as "MODEL" | "HUMAN", beats: request.beats as StoryScriptPayload["beats"],
      };
      const script = validateScriptPayload(payload, source);
      await tx.storyScriptVersion.create({ data: {
        id: script.payload.id, studioId, sourceSnapshotId, sourceContentHash: source.sourceContentHash,
        sourceContextHash: source.sourceContextHash, scriptHash: script.scriptHash, version,
        parentVersionId: script.payload.parentVersionId, parentVersion: version === 1 ? null : version - 1,
        origin: script.payload.origin, canonicalPayload: canonicalJson(script.payload),
      } });
      await tx.storyBeat.createMany({ data: script.payload.beats.map(beat => ({
        scriptVersionId: script.payload.id, studioId, beatId: beat.id, order: beat.order,
        category: beat.category, startMs: beat.startMs, endMs: beat.endMs, canonicalPayload: canonicalJson(beat),
      })) });
      await tx.storylineStudio.update({ where: { id: studioId }, data: { currentScriptVersionId: script.payload.id } });
      await media.assertUnchanged();
      const final = await tx.storylineStudio.findUniqueOrThrow({ where: { id: studioId }, select: { revision: true } });
      return { persisted: true, approved: false, sourceVerified: false, studioId, scriptVersionId: script.payload.id,
        sourceSnapshotId, version, scriptHash: script.scriptHash, revision: final.revision };
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof StorylinePersistenceError) throw error;
    if (error instanceof StorylinePreparationError && error.code === "STALE_STORYLINE_SOURCE") throw new StorylinePersistenceError("STALE_STORYLINE_SOURCE");
    if (error instanceof StorylinePreparationError && ["SOURCE_MEDIA_MISSING", "SOURCE_MEDIA_INVALID", "SOURCE_MEDIA_CHANGED", "STORAGE_UNAVAILABLE"].includes(error.code)) throw new StorylinePersistenceError("SOURCE_MEDIA_CHANGED");
    if (error instanceof StorylineContractError) throw new StorylinePersistenceError("SCRIPT_INVALID");
    throw new StorylinePersistenceError("PERSISTENCE_UNAVAILABLE");
  }
}
