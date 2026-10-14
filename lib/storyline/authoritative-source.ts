import "server-only";
import { canonicalJson, contractHash } from "./canonical";
import { LIMITS, type StorySourceSnapshot } from "./contracts";
import type { InspectedStorylineMedia } from "./media";
import { StorylinePreparationError } from "./preparation-errors";
import { captureLegacyRecap, type StorylineSourceRead } from "./read-source";
import { validateSourceSnapshot } from "./source";

/** Trusted server capture + inspected media only. No client hash authenticates content.
 * Shared by genuine preparation and every current-source acceptance boundary.
 */
export function reconstructStorylineSource(captured: StorylineSourceRead, media: InspectedStorylineMedia, capturedAt: string): StorySourceSnapshot {
  if (media.storageKey !== captured.storageKey || captured.recordedSize !== null && captured.recordedSize !== BigInt(media.sizeBytes)) {
    throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED");
  }
  const source = { ...captured.source,
    id: `candidate-${contractHash("story-candidate-v1", { dependencyHash: captured.dependencyHash, sha256: media.sha256, video: media.video })}`,
    capturedAt, media: { sha256: media.sha256, bytes: media.sizeBytes, durationMs: media.durationMs },
  };
  return validateSourceSnapshot({ ...source, preparation: {
    policyVersion: "story-source-preparation-v1", dependencyHash: captured.dependencyHash, sourceBindingHash: captured.sourceBindingHash,
    translationQcState: !source.translation ? "TRANSLATION_MISSING" : source.translation.qcScannedAt === null ? "UNSCANNED" : "SCAN_RECORDED",
    video: media.video, characterAnalysis: captured.characterAnalysis, aliases: captured.aliases, observations: captured.observations,
    ...captureLegacyRecap(captured, source),
  } }, { projectId: source.projectId, movieId: source.movieId });
}

function content(snapshot: StorySourceSnapshot): string {
  // These two fields describe the historical capture, not source equivalence.
  // Every domain timestamp, identifier, sequence, excluded row and preparation
  // field remains included. Canonical serialization preserves Unicode and order.
  const { id: snapshotId, capturedAt, ...payload } = snapshot.payload;
  void snapshotId; void capturedAt;
  return canonicalJson(payload, LIMITS.snapshotBytes);
}

/** Caller owns the read transaction/locks and independently inspects media.
 * Does not reserve currentness, grant receipt trust or rewrite historical data.
 */
export function assertAuthoritativeStorylineSource(snapshot: StorySourceSnapshot, captured: StorylineSourceRead, media: InspectedStorylineMedia): void {
  const authoritative = reconstructStorylineSource(captured, media, snapshot.payload.capturedAt);
  if (content(snapshot) !== content(authoritative)) throw new StorylinePreparationError("STALE_STORYLINE_SOURCE");
}
