import "server-only";

export type StorylinePersistenceCode =
  | "INVALID_CANDIDATE"
  | "PROJECT_MOVIE_MISMATCH"
  | "MOVIE_NOT_FOUND"
  | "STALE_STORYLINE_SOURCE"
  | "SOURCE_MEDIA_CHANGED"
  | "STUDIO_REVISION_CONFLICT"
  | "SNAPSHOT_CONFLICT"
  | "SNAPSHOT_NOT_FOUND"
  | "SCRIPT_INVALID"
  | "PERSISTENCE_UNAVAILABLE";

export class StorylinePersistenceError extends Error {
  constructor(readonly code: StorylinePersistenceCode) {
    super(code);
    this.name = "StorylinePersistenceError";
  }
}
