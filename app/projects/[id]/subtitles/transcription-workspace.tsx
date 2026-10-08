"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, AudioLines, FileText, Film, LoaderCircle, RefreshCw } from "lucide-react";
import { formatTimestamp } from "@/lib/format-timestamp";
import { cardClass, StatusBadge } from "../overview-components";
import { languageName, durationLabel } from "../overview-model";
import TranscriptSegments from "./transcript-segments";
import { deriveTranscription, isRunningJob, pollingTarget, POLL_INTERVAL_MS, type JobStatus, type TranscriptionSnapshot } from "./transcription-model";

const primaryButton = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-50";

export default function TranscriptionWorkspace({ initialSnapshot, projectPath }: { initialSnapshot: TranscriptionSnapshot; projectPath: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [previousSnapshot, setPreviousSnapshot] = useState(initialSnapshot);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [requestError, setRequestError] = useState("");
  const [pollError, setPollError] = useState("");
  const [selectedSequence, setSelectedSequence] = useState<number | null>(initialSnapshot.transcript?.segments[0]?.sequence ?? null);
  // A refreshed server snapshot replaces local status without an effect-driven reset.
  if (previousSnapshot !== initialSnapshot) {
    setPreviousSnapshot(initialSnapshot);
    setSnapshot(initialSnapshot);
    setPollError("");
    setRequestError("");
    setFeedback("");
    setAcknowledged(false);
    setSelectedSequence((sequence) => initialSnapshot.transcript?.segments.some((row) => row.sequence === sequence) ? sequence : initialSnapshot.transcript?.segments[0]?.sequence ?? null);
  }
  const view = deriveTranscription(snapshot);
  const target = pollingTarget(snapshot);
  const { movie, transcript } = snapshot;
  const baseApi = `/api/movies/${encodeURIComponent(movie.id)}`;

  useEffect(() => {
    if (!target || pollError) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`${baseApi}/${target === "media" ? "process-media" : "transcribe"}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error("Status unavailable");
        const job = readJob(payload.data);
        if (cancelled) return;
        setSnapshot((current) => ({ ...current, [target === "media" ? "mediaJob" : "transcriptionJob"]: job }));
        if (isRunningJob(job)) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        else router.refresh();
      } catch {
        if (!cancelled) setPollError("Automatic status checks are paused. Refresh to check processing again.");
      }
    }
    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [baseApi, target, pollError, router]);

  function refresh() {
    setPollError("");
    router.refresh();
  }

  // The only processing POST in this workspace lives inside this click handler.
  async function start() {
    if (submissionLock.current || (view.action !== "prepare" && view.action !== "transcribe") || (view.action === "transcribe" && !acknowledged)) return;
    const kind = view.action;
    submissionLock.current = true;
    setSubmitting(true); setRequestError(""); setFeedback("");
    try {
      const response = await fetch(`${baseApi}/${kind === "prepare" ? "process-media" : "transcribe"}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error("Processing unavailable");
      const job = readJob({ state: payload.data?.state, attemptsMade: null });
      if (!job) throw new Error("Processing unavailable");
      setSnapshot((current) => ({ ...current, [kind === "prepare" ? "mediaJob" : "transcriptionJob"]: job }));
      setAcknowledged(false);
      setFeedback(isRunningJob(job) ? "Request accepted. Waiting for the configured worker; status updates every 5 seconds." : job.state === "failed" ? "The retained job failed. Check the processing setup before retrying." : "The existing job has already finished. Refreshing saved results.");
      if (!isRunningJob(job)) router.refresh();
    } catch {
      setRequestError("We couldn’t start processing. Check media availability and worker configuration, then try again.");
    } finally { submissionLock.current = false; setSubmitting(false); }
  }

  const selected = transcript?.segments.find((segment) => segment.sequence === selectedSequence) ?? null;
  const lastEnd = transcript?.segments.reduce((end, segment) => Math.max(end, segment.endMs), 0) ?? 0;
  const extent = Math.max((movie.durationSeconds ?? 0) * 1000, transcript?.durationMs ?? 0, lastEnd);
  const selectedPosition = selected && extent > 0 ? Math.min(100, selected.startMs / extent * 100) : 0;
  const selectedWidth = selected && extent > 0 ? Math.min(100 - selectedPosition, (selected.endMs - selected.startMs) / extent * 100) : 0;
  const translationPath = `${projectPath}/translation?movieId=${encodeURIComponent(movie.id)}`;

  return <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)] xl:grid-rows-[auto_1fr]">
    <aside className="order-1 min-w-0 xl:col-start-2 xl:row-start-1" aria-label="Transcription status and next action">
      <section aria-labelledby="status-heading" className={`${cardClass} border-violet-400/20 p-5`}>
        <div className="mb-4 flex items-center gap-2 text-zinc-400"><AudioLines size={17} aria-hidden="true" /><h2 id="status-heading" className="text-sm font-semibold text-zinc-200">Transcription status</h2></div>
        <div role="status"><StatusBadge status={view.status} tone={view.tone} /></div>
        <p className="mt-4 text-sm leading-6 text-zinc-400">{view.message}</p>
        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-violet-300">Next step</p>
          {view.action === "transcribe" && <div className="mb-4 space-y-3"><p className="text-xs text-zinc-400">AI Action · OpenRouter</p><label className="flex items-start gap-2 text-xs leading-5 text-zinc-300"><input type="checkbox" checked={acknowledged} disabled={submitting} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-300" />I understand transcription may make paid AI requests.</label></div>}
          {view.action === "prepare" && <p className="mb-3 text-xs text-zinc-400">Local processing · FFmpeg media worker</p>}
          {view.action === "translate" || view.action === "overview" ? <Link href={view.action === "translate" ? translationPath : projectPath} className={primaryButton}>{view.actionLabel}<ArrowRight size={16} aria-hidden="true" /></Link> :
            <button type="button" onClick={view.action === "refresh" ? refresh : () => void start()} disabled={submitting || (view.action === "transcribe" && !acknowledged)} className={primaryButton}>
              {submitting ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : view.action === "refresh" ? <RefreshCw size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}{submitting ? "Submitting…" : view.actionLabel}
            </button>}
        </div>
        {feedback && <p role="status" className="mt-4 text-xs leading-5 text-zinc-400">{feedback}</p>}
        {requestError && <p role="alert" className="mt-4 text-xs leading-5 text-amber-200">{requestError}</p>}
        {pollError && <p role="alert" className="mt-4 text-xs leading-5 text-amber-200">{pollError}</p>}
        {target && !pollError && <p className="mt-4 text-xs text-zinc-500">Read-only status checks every 5 seconds.</p>}
      </section>
    </aside>

    <div className="order-2 min-w-0 space-y-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
      <section aria-labelledby="source-heading" className={`${cardClass} overflow-hidden`}>
        <div className="flex aspect-video max-h-80 w-full flex-col items-center justify-center gap-4 border-b border-white/10 bg-[#0b0b0e] p-6 text-center">
          <span className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><Film size={30} className="text-zinc-500" aria-hidden="true" /></span>
          <p className="text-sm text-zinc-300">Video preview unavailable</p>
          <p className="max-w-sm text-xs leading-5 text-zinc-500">Video preview is not available in the current local media pipeline.</p>
        </div>
        <div className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="source-heading" className="min-w-0 break-words text-sm font-semibold">{movie.title}</h2><span className="text-xs text-zinc-500">{durationLabel(movie.durationSeconds)}</span></div><p className="mt-2 break-all text-xs text-zinc-400">{movie.filename ?? "No source filename"}</p><p className="mt-2 text-xs text-zinc-500">Audio · {view.audioLabel}</p></div>
        <div className="border-t border-white/10 p-5">
          <div className="flex flex-wrap justify-between gap-2 text-xs"><h3 className="font-medium text-zinc-300">Transcript position</h3><p className="text-zinc-500">{selected ? `Segment #${selected.sequence + 1} · ${formatTimestamp(selected.startMs)} → ${formatTimestamp(selected.endMs)}` : "No segment selected"}</p></div>
          <div className="relative mt-4 h-2 rounded-full bg-white/[0.07]" aria-hidden="true">{selected && extent > 0 && <span className="absolute h-full min-w-1 rounded-full bg-violet-500" style={{ left: `${selectedPosition}%`, width: `${selectedWidth}%` }} />}</div>
          {extent > 0 && <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-600"><span>{formatTimestamp(0)}</span><span>{formatTimestamp(extent)}</span></div>}
          <p className="mt-3 text-xs leading-5 text-zinc-500">{transcript?.segments.length ? "Select a row to highlight its timestamp range. Playback and seeking are unavailable." : "Timed dialogue will appear after transcription. No waveform data is available."}</p>
        </div>
      </section>
      {transcript ? <TranscriptSegments segments={transcript.segments} transcriptText={transcript.text} sourceLanguage={movie.sourceLanguage} selectedSequence={selectedSequence} onSelect={setSelectedSequence} /> :
        <section aria-labelledby="transcript-empty-heading" className={`${cardClass} p-6 sm:p-8`}>
          {view.tone === "Processing" ? <LoaderCircle size={24} className="animate-spin text-violet-400" aria-hidden="true" /> : <FileText size={24} className="text-zinc-500" aria-hidden="true" />}
          <h2 id="transcript-empty-heading" className="mt-4 text-base font-semibold">{view.tone === "Processing" ? view.status : view.tone === "Failed" ? "Transcription could not be completed" : "No source transcript yet"}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{view.message}</p>
          <p className="mt-4 text-xs text-zinc-500">Use the Next step action above to continue. Chinese source text is read-only in this workspace.</p>
        </section>}
    </div>
    <section aria-labelledby="details-heading" className={`${cardClass} order-3 p-5 xl:col-start-2 xl:row-start-2`}>
        <h2 id="details-heading" className="text-sm font-semibold">Processing details</h2>
        <dl className="mt-5 space-y-4">
          <Detail label="Prepared audio" value={view.audioLabel} />
          <Detail label="Source file" value={snapshot.sourceAvailable === true ? "Available" : snapshot.sourceAvailable === false ? movie.sourceRecorded ? "Unavailable" : "No upload recorded" : "Availability unknown"} />
          <Detail label="Movie duration" value={durationLabel(movie.durationSeconds)} />
          <Detail label="Source language" value={languageName(movie.sourceLanguage)} />
          <Detail label="Media job" value={snapshot.mediaStatusAvailable ? snapshot.mediaJob?.state ?? "Not started" : "Status unavailable"} />
          <Detail label="Transcription job" value={snapshot.transcriptionStatusAvailable ? snapshot.transcriptionJob?.state ?? "Not started" : "Status unavailable"} />
          {snapshot.transcriptionJob?.attemptsMade != null && <Detail label="Recorded attempts" value={String(snapshot.transcriptionJob.attemptsMade)} />}
          {transcript && <>
            <Detail label="Provider" value={transcript.provider.toLowerCase() === "openrouter" ? "OpenRouter" : transcript.provider} />
            <Detail label="Model" value={transcript.model} />
            <Detail label="Transcript language" value={transcript.language ? languageName(transcript.language.toLowerCase() === "chinese" ? "zh" : transcript.language) : "Not specified"} />
            <Detail label="Segments" value={String(transcript.segments.length)} />
            <Detail label="Transcript saved" value={new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(transcript.savedAt)) + " UTC"} />
          </>}
        </dl>
        {(!snapshot.mediaStatusAvailable || !snapshot.transcriptionStatusAvailable) && <p role="status" className="mt-4 text-xs leading-5 text-amber-200">Live job status is unavailable. Any saved transcript remains readable.</p>}
    </section>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 break-words text-sm text-zinc-200 [overflow-wrap:anywhere]">{value}</dd></div>;
}

function readJob(value: unknown): JobStatus {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("state" in value) || typeof value.state !== "string" || !("attemptsMade" in value) || (value.attemptsMade !== null && (!Number.isSafeInteger(value.attemptsMade) || (value.attemptsMade as number) < 0))) throw new Error("Invalid job state");
  return { state: value.state, attemptsMade: value.attemptsMade as number | null };
}
