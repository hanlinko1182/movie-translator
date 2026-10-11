const messages = {
  MOVIE_NOT_FOUND: "The selected movie was not found.",
  PROJECT_MOVIE_MISMATCH: "The selected movie does not belong to the selected project.",
  TRANSCRIPT_NOT_FOUND: "A Chinese source transcript is required.",
  SCENES_REQUIRED: "Source scene intervals are required.",
  CHARACTER_CONTEXT_REQUIRED: "Current movie-specific character analysis is required.",
  STORYLINE_SOURCE_INVALID: "The selected source context is invalid or unsupported.",
  STALE_STORYLINE_SOURCE: "Source dependencies changed during preparation; prepare again explicitly.",
  SOURCE_MEDIA_MISSING: "The selected source media is missing.",
  SOURCE_MEDIA_INVALID: "The selected source media is invalid or unsafe.",
  SOURCE_MEDIA_CHANGED: "The source media changed during preparation.",
  SOURCE_PROFILE_UNSUPPORTED: "The source media is outside the supported inspection profile.",
  STORAGE_UNAVAILABLE: "Private media storage is unavailable.",
  SOURCE_READ_UNAVAILABLE: "The source context could not be read consistently.",
} as const;
export class StorylinePreparationError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]); this.name = "StorylinePreparationError";
  }
}
