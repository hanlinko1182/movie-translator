export const MEDIA_QUEUE_NAME = "movie-processing";
export const MEDIA_JOB_NAME = "process-media";

export type MediaJobData = { movieId: string };

export function mediaJobId(movieId: string) {
  // BullMQ custom IDs cannot contain colons.
  return `media-${encodeURIComponent(movieId)}`;
}
