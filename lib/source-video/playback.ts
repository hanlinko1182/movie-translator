type SeekableVideo = { readyState: number; duration: number; currentTime: number };

// False means metadata is not ready; the player keeps the requested timestamp
// pending. Only the playback cursor changes, never persisted source timing.
export function seekSourceVideo(video: SeekableVideo | null, startMs: number) {
  if (!video || !Number.isFinite(startMs) || startMs < 0 || video.readyState < 1 || !Number.isFinite(video.duration)) return false;
  video.currentTime = Math.min(startMs / 1000, video.duration);
  return true;
}
