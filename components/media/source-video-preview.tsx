"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Film } from "lucide-react";
import { mediaFallbackClass, secondaryButtonClass } from "@/components/ui/styles";
import { formatTimestamp } from "@/lib/format-timestamp";
import { sourceVideoUrl } from "@/lib/source-video/selection";
import { EMPTY_SOURCE_PLAYBACK, observeSourcePlayback, seekSourceVideo, sourcePlaybackTimeLabel } from "@/lib/source-video/playback";

export type SourceVideoHandle = { seekTo: (startMs: number) => void };
type Props = {
  projectId: string;
  movie: { id: string; title: string; sourceRecorded: boolean } | null;
  ref?: Ref<SourceVideoHandle>;
  timing?: { startMs: number; endMs: number } | null;
  className?: string;
};

// Native controls provide accessible play/pause, seeking, volume and fullscreen.
// This is the original uploaded media, without rendered/translated subtitles.
export default function SourceVideoPreview(props: Props) {
  // A selected source owns its playback, pending seek and error state. Remount
  // the player when identity/availability changes, even if the parent is reused.
  const key = `${props.projectId}/${props.movie?.id ?? "none"}/${!!props.movie?.sourceRecorded}`;
  return <SourceVideoPlayer key={key} {...props} />;
}

function SourceVideoPlayer({ projectId, movie, ref, timing, className = "" }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const errorAttempt = useRef(0);
  const errorRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [playback, setPlayback] = useState(EMPTY_SOURCE_PLAYBACK);
  const src = movie ? sourceVideoUrl(projectId, movie.id) : null;

  function seekTo(startMs: number) {
    if (!Number.isFinite(startMs) || startMs < 0) return;
    pendingSeek.current = startMs / 1000;
    if (seekSourceVideo(video.current, startMs)) pendingSeek.current = null;
  }
  useImperativeHandle(ref, () => ({ seekTo }));

  const mediaError = useCallback(async (code?: number) => {
    const attempt = ++errorAttempt.current;
    const failedSource = src;
    setError(code === 3 || code === 4 ? "This browser could not decode the source video. Its codec or container may be unsupported." : "Video loading failed. Check the connection and try again.");
    // Distinguish a missing/unsafe file from browser codec failures without
    // fetching its body. This HEAD follows the exact same scoped storage checks.
    if (!failedSource) return;
    errorRequest.current?.abort();
    const controller = new AbortController(); errorRequest.current = controller;
    try {
      const response = await fetch(failedSource, { method: "HEAD", cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted || attempt !== errorAttempt.current) return;
      if (response.status === 404) setError("The uploaded source file is unavailable.");
      else if (response.status === 422) setError("Source media is empty, invalid or cannot be accessed safely.");
      else if (!response.ok) setError("Source media could not be loaded. Please try again.");
    } catch { if (!controller.signal.aborted && attempt === errorAttempt.current) setError("Video loading failed. Check the connection and try again."); }
  }, [src]);

  useEffect(() => () => { errorAttempt.current++; errorRequest.current?.abort(); }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    return observeSourcePlayback(element, (state) => {
      setPlayback(state);
      if (pendingSeek.current !== null && seekSourceVideo(element, pendingSeek.current * 1000)) pendingSeek.current = null;
    }, (code) => void mediaError(code));
  }, [src, error, mediaError]);

  if (!movie?.sourceRecorded || !src || error) return <div className={`${mediaFallbackClass} w-full bg-[#0b0e14] ${className}`}>
    <Film size={28} className="text-zinc-500" aria-hidden="true" />
    <p className="text-sm text-zinc-300">Source playback unavailable</p>
    <p role={error ? "alert" : undefined} className="max-w-sm text-xs leading-5 text-zinc-400">{error || (movie ? "No uploaded source file is recorded for this movie." : "Upload a source movie to begin.")}</p>
    {error && <button type="button" className={secondaryButtonClass} onClick={() => { errorAttempt.current++; errorRequest.current?.abort(); pendingSeek.current = null; setError(""); setPlayback(EMPTY_SOURCE_PLAYBACK); }}>Retry playback</button>}
  </div>;

  return <div className={`min-w-0 overflow-hidden bg-[#0b0e14] ${className}`}>
    <video ref={video} src={src} controls playsInline preload="metadata" aria-label={`Source video: ${movie.title}`} className="block h-48 w-full max-w-full object-contain focus-visible:outline-2 focus-visible:outline-violet-300 sm:h-56" />
    <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1 px-3 py-2 font-mono text-[11px] leading-5 text-zinc-400">
      <span aria-label="Source playback time">{sourcePlaybackTimeLabel(playback)}</span>
      {timing && <span>Selected {formatTimestamp(timing.startMs)} → {formatTimestamp(timing.endMs)}</span>}
    </div>
  </div>;
}
