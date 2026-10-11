import "server-only";
import { prisma } from "@/lib/prisma";
import { contractHash } from "./canonical";
import type { Identity, Immutable, StorySourceSnapshot } from "./contracts";
import { inspectStorylineMedia, type InspectedStorylineMedia } from "./media";
import { readStorylineSource, captureLegacyRecap, type StorylineReadDatabase } from "./read-source";
import { validateSourceSnapshot } from "./source";
import { StorylinePreparationError } from "./preparation-errors";
import { StorylineContractError, freeze, id, record } from "./validation";

export type PreparedStorylineCandidate = Immutable<{
  kind: "PREPARED_CANDIDATE"; persisted: false; approved: false; snapshot: StorySourceSnapshot;
}>;
type Dependencies = {
  database?: StorylineReadDatabase;
  inspectMedia?: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
  now?: () => string;
};

/** Explicit server service only; deliberately not wired to GET, actions, routes or workers.
 * Rechecked candidate, NOT a durable snapshot/approval or a reservation of live dependencies.
 * M1-C must perform a fresh fenced dependency recheck in its eventual commit transaction.
 */
export async function prepareStorylineSource(value: unknown, dependencies: Dependencies = {}): Promise<PreparedStorylineCandidate> {
  const request = record(value, ["projectId", "movieId"], "selection");
  const scope: Identity = { projectId: id(request.projectId, "selection.projectId"), movieId: id(request.movieId, "selection.movieId") };
  const database = dependencies.database ?? prisma;
  try {
    const captured = await readStorylineSource(scope, database);
    // Hash/probe and file identity checks happen after the read transaction is closed.
    const media = await (dependencies.inspectMedia ?? inspectStorylineMedia)(captured.storageKey);
    if (media.storageKey !== captured.storageKey || captured.recordedSize !== null && captured.recordedSize !== BigInt(media.sizeBytes)) throw new StorylinePreparationError("SOURCE_MEDIA_CHANGED");
    const source = { ...captured.source,
      id: `candidate-${contractHash("story-candidate-v1", { dependencyHash: captured.dependencyHash, sha256: media.sha256, video: media.video })}`,
      capturedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
      media: { sha256: media.sha256, bytes: media.sizeBytes, durationMs: media.durationMs },
    };
    const advisory = captureLegacyRecap(captured, source);
    const snapshot = validateSourceSnapshot({ ...source, preparation: {
      policyVersion: "story-source-preparation-v1", dependencyHash: captured.dependencyHash, sourceBindingHash: captured.sourceBindingHash,
      translationQcState: !source.translation ? "TRANSLATION_MISSING" : source.translation.qcScannedAt === null ? "UNSCANNED" : "SCAN_RECORDED",
      video: media.video, characterAnalysis: captured.characterAnalysis, aliases: captured.aliases, observations: captured.observations, ...advisory,
    } }, scope);
    let current;
    try { current = await readStorylineSource(scope, database); }
    catch (error) {
      if (error instanceof StorylinePreparationError && error.code === "SOURCE_READ_UNAVAILABLE") throw error;
      throw new StorylinePreparationError("STALE_STORYLINE_SOURCE");
    }
    if (current.dependencyHash !== captured.dependencyHash) throw new StorylinePreparationError("STALE_STORYLINE_SOURCE");
    await media.assertUnchanged();
    return freeze({ kind: "PREPARED_CANDIDATE", persisted: false, approved: false, snapshot });
  } catch (error) {
    if (error instanceof StorylinePreparationError) throw error;
    if (error instanceof StorylineContractError) throw new StorylinePreparationError("STORYLINE_SOURCE_INVALID");
    throw new StorylinePreparationError("SOURCE_READ_UNAVAILABLE");
  }
}
