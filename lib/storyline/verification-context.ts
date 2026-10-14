import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "./canonical";
import { assertAuthoritativeStorylineSource } from "./authoritative-source";
import type { StoryScriptVersion, StorySourceSnapshot } from "./contracts";
import { inspectStorylineMedia, type InspectedStorylineMedia } from "./media";
import { captureStorylineSourceInTransaction, readStorylineSource, type StorylineReadDatabase } from "./read-source";
import { validateScriptPayload } from "./script";
import { validateSourceSnapshot } from "./source";
import type { OperatorScope } from "./operator-authority";
import { VerificationSecurityError } from "./verification-errors";

export type VerificationContext = {
  source: StorySourceSnapshot; script: StoryScriptVersion; scope: OperatorScope; revision: number;
};
export async function loadVerificationContext(tx: Prisma.TransactionClient, scope: OperatorScope, scriptVersionId: string, current: boolean): Promise<VerificationContext> {
  try {
    const studio = await tx.storylineStudio.findUnique({ where: { id: scope.studioId } });
    const row = await tx.storyScriptVersion.findUnique({ where: { id: scriptVersionId }, include: { beats: { orderBy: { order: "asc" } }, source: true } });
    if (!studio || !row || studio.projectId !== scope.projectId || studio.movieId !== scope.movieId || row.studioId !== studio.id ||
      studio.verificationGenesisHash !== contractHash("story-verification-ledger-empty-v1", { projectId: scope.projectId, movieId: scope.movieId })) throw new Error();
    const stored = row.source;
    if (stored.studioId !== studio.id || stored.projectId !== scope.projectId || stored.movieId !== scope.movieId) throw new Error();
    const source = validateSourceSnapshot(JSON.parse(stored.canonicalPayload), scope);
    const prep = source.payload.preparation;
    if (!prep || source.payload.id !== stored.id || canonicalJson(source.payload) !== stored.canonicalPayload ||
      source.sourceContentHash !== stored.sourceContentHash || source.sourceContextHash !== stored.sourceContextHash ||
      prep.dependencyHash !== stored.dependencyHash || prep.sourceBindingHash !== stored.sourceBindingHash ||
      source.payload.media.sha256 !== stored.sourceSha256 || BigInt(source.payload.media.bytes) !== stored.sourceBytes ||
      source.payload.media.durationMs !== stored.sourceDurationMs || source.payload.capturedAt !== stored.capturedAt.toISOString()) throw new Error();
    const script = validateScriptPayload(JSON.parse(row.canonicalPayload), source);
    if (canonicalJson(script.payload) !== row.canonicalPayload || script.payload.id !== row.id || script.scriptHash !== row.scriptHash ||
      script.payload.version !== row.version || script.payload.parentVersionId !== row.parentVersionId || script.payload.origin !== row.origin ||
      row.sourceContentHash !== source.sourceContentHash || row.sourceContextHash !== source.sourceContextHash ||
      row.beats.length !== script.payload.beats.length || row.beats.some((beat, index) => {
        const payload = script.payload.beats[index];
        return beat.studioId !== studio.id || beat.beatId !== payload.id || beat.order !== payload.order || beat.category !== payload.category ||
          beat.startMs !== payload.startMs || beat.endMs !== payload.endMs || beat.canonicalPayload !== canonicalJson(payload);
      }) || current && (studio.currentSnapshotId !== stored.id || studio.currentScriptVersionId !== row.id)) throw new Error();
    return { source, script, scope, revision: studio.revision };
  } catch { throw new VerificationSecurityError("VERIFICATION_CONTEXT_INVALID"); }
}

export type VerificationMediaInspector = (key: string | null) => Promise<InspectedStorylineMedia>;
export async function inspectVerificationSource(context: VerificationContext, database: StorylineReadDatabase, inspector: VerificationMediaInspector = inspectStorylineMedia) {
  try {
    const read = await readStorylineSource({ projectId: context.scope.projectId, movieId: context.scope.movieId }, database);
    const prep = context.source.payload.preparation!, source = context.source.payload.media;
    if (read.dependencyHash !== prep.dependencyHash || read.sourceBindingHash !== prep.sourceBindingHash) throw new Error();
    const media = await inspector(read.storageKey);
    if (read.storageKey !== media.storageKey || read.recordedSize !== null && read.recordedSize !== BigInt(media.sizeBytes) ||
      source.sha256 !== media.sha256 || source.bytes !== media.sizeBytes || source.durationMs !== media.durationMs ||
      canonicalJson(prep.video) !== canonicalJson(media.video)) throw new Error();
    await media.assertUnchanged();
    assertAuthoritativeStorylineSource(context.source, read, media);
    return media;
  } catch { throw new VerificationSecurityError("VERIFICATION_SOURCE_STALE"); }
}
export async function assertVerificationSourceCurrent(tx: Prisma.TransactionClient, context: VerificationContext, media: InspectedStorylineMedia) {
  try {
    const fresh = await captureStorylineSourceInTransaction({ projectId: context.scope.projectId, movieId: context.scope.movieId }, tx), prep = context.source.payload.preparation!;
    if (fresh.dependencyHash !== prep.dependencyHash || fresh.sourceBindingHash !== prep.sourceBindingHash || fresh.storageKey !== media.storageKey ||
      fresh.recordedSize !== null && fresh.recordedSize !== BigInt(media.sizeBytes)) throw new Error();
    await media.assertUnchanged();
    assertAuthoritativeStorylineSource(context.source, fresh, media);
  } catch { throw new VerificationSecurityError("VERIFICATION_SOURCE_STALE"); }
}
