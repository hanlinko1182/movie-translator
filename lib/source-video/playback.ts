import { formatTimestamp } from "@/lib/format-timestamp";

type SeekableVideo = { readyState: number; duration: number; currentTime: number };

export type SourcePlayback = { current: number; duration: number | null; metadataReady: boolean };
export const EMPTY_SOURCE_PLAYBACK: SourcePlayback = { current: 0, duration: null, metadataReady: false };

export function sourcePlaybackTimeLabel(state: SourcePlayback) {
  const duration = state.duration === null ? state.metadataReady ? "Duration unavailable" : "Loading duration…" : formatTimestamp(Math.round(state.duration * 1000));
  return `${formatTimestamp(Math.round(state.current * 1000))} / ${duration}`;
}

export function readSourcePlayback(video: SeekableVideo): SourcePlayback {
  const metadataReady = video.readyState >= 1;
  return {
    current: metadataReady && Number.isFinite(video.currentTime) && video.currentTime >= 0 ? video.currentTime : 0,
    duration: metadataReady && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
    metadataReady,
  };
}

type ObservableVideo = SeekableVideo & Pick<HTMLVideoElement, "addEventListener" | "removeEventListener" | "error">;
// Subscribe before reading: metadata events may have fired before hydration,
// or may fire while the observer is being attached. No polling is necessary.
export function observeSourcePlayback(video: ObservableVideo, onChange: (state: SourcePlayback) => void, onError: (code?: number) => void) {
  let active = true;
  const update = () => { if (active) onChange(readSourcePlayback(video)); };
  const failed = () => { if (active) onError(video.error?.code); };
  const events = ["loadedmetadata", "durationchange", "loadeddata", "canplay", "timeupdate", "seeking", "seeked", "emptied"];
  for (const event of events) video.addEventListener(event, update);
  video.addEventListener("error", failed);
  update();
  if (video.error) failed();
  return () => {
    active = false;
    for (const event of events) video.removeEventListener(event, update);
    video.removeEventListener("error", failed);
  };
}

// False means metadata is not ready; the player keeps the requested timestamp
// pending. Only the playback cursor changes, never persisted source timing.
export function seekSourceVideo(video: SeekableVideo | null, startMs: number) {
  if (!video || !Number.isFinite(startMs) || startMs < 0 || readSourcePlayback(video).duration === null) return false;
  try {
    video.currentTime = Math.min(startMs / 1000, video.duration);
    return true;
  } catch { return false; } // Some browsers cannot seek until more media loads.
}
