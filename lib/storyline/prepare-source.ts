import "server-only";
import { prisma } from "@/lib/prisma";
import { assertAuthoritativeStorylineSource, reconstructStorylineSource } from "./authoritative-source";
import type { Identity, Immutable, StorySourceSnapshot } from "./contracts";
import { inspectStorylineMedia, type InspectedStorylineMedia } from "./media";
import { readStorylineSource, type StorylineReadDatabase } from "./read-source";
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
    const snapshot = reconstructStorylineSource(captured, media, (dependencies.now ?? (() => new Date().toISOString()))());
    let current;
    try { current = await readStorylineSource(scope, database); }
    catch (error) {
      if (error instanceof StorylinePreparationError && error.code === "SOURCE_READ_UNAVAILABLE") throw error;
      throw new StorylinePreparationError("STALE_STORYLINE_SOURCE");
    }
    if (current.dependencyHash !== captured.dependencyHash) throw new StorylinePreparationError("STALE_STORYLINE_SOURCE");
    assertAuthoritativeStorylineSource(snapshot, current, media);
    await media.assertUnchanged();
    return freeze({ kind: "PREPARED_CANDIDATE", persisted: false, approved: false, snapshot });
  } catch (error) {
    if (error instanceof StorylinePreparationError) throw error;
    if (error instanceof StorylineContractError) throw new StorylinePreparationError("STORYLINE_SOURCE_INVALID");
    throw new StorylinePreparationError("SOURCE_READ_UNAVAILABLE");
  }
}
