"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Film, ScanLine, RefreshCw, LoaderCircle, Clock3 } from "lucide-react";
import { badgeClass, badgeTones, cardClass, focusClass, linkClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/styles";
import { formatTimestamp } from "@/lib/format-timestamp";
import type { SceneJobStatus, SceneRow } from "@/lib/scenes/types";

type TranscriptRow = { sequence: number; startMs: number; endMs: number; text: string };
const methodLabel = "Visual / transcript heuristic";

export default function SceneWorkspace({ movieId, initialScenes, canDetect, durationSeconds, transcriptSegments, overviewPath }: { movieId: string; initialScenes: SceneRow[]; canDetect: boolean; durationSeconds: number | null; transcriptSegments: TranscriptRow[]; overviewPath: string }) {
  const [scenes, setScenes] = useState(initialScenes);
  const [selectedSequence, setSelectedSequence] = useState(initialScenes[0]?.sequence ?? 0);
  const [job, setJob] = useState<SceneJobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(true);
  const [pollGeneration, setPollGeneration] = useState(0);
  const [error, setError] = useState("");
  const endpoint = `/api/movies/${encodeURIComponent(movieId)}/scenes`;
  async function request(url: string, method = "GET") {
    const response = await fetch(url, { method, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Unable to access scene detection");
    return body.data;
  }
  async function detect() {
    setBusy(true); setError("");
    try {
      const queued = await request(`${endpoint}/detect`, "POST");
      setJob({ ...queued, attemptsMade: 0 }); setPollGeneration((current) => current + 1); setWatching(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Scene detection request failed"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${endpoint}/detect`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Unable to read detection status");
        const current: SceneJobStatus | null = body.data;
        if (cancelled) return;
        setJob(current);
        if (!current || current.state === "failed") {
          if (current) setError(current.error ?? "Scene detection failed; inspect the worker or source media.");
          setWatching(false); return;
        }
        if (current.state === "completed") {
          const latest = await fetch(endpoint, { cache: "no-store" }); const data = await latest.json();
          if (!latest.ok) throw new Error(data.error?.message ?? "Unable to refresh scenes");
          if (cancelled) return;
          setScenes(data.data.scenes); setWatching(false); return;
        }
        timer = setTimeout(() => void poll(), 2_000);
      } catch (failure) {
        if (!cancelled) { setError(failure instanceof Error ? failure.message : "Detection status unavailable"); setWatching(false); }
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [endpoint, watching, pollGeneration]);
  const running = !!job && !["completed", "failed"].includes(job.state);
  const state = job?.state === "active" ? "Processing" : job?.state === "completed" ? "Completed" : job?.state === "failed" ? "Failed" : job ? `Waiting (${job.state})` : "Not queued";

  const selected = scenes.find((scene) => scene.sequence === selectedSequence) ?? scenes[0];
  const related = selected ? transcriptSegments.filter((segment) => segment.startMs < selected.endMs && segment.endMs > selected.startMs) : [];
  const timelineEnd = Math.max(durationSeconds === null ? 0 : durationSeconds * 1000, ...scenes.map((scene) => scene.endMs), 1);
  async function refresh() {
    setBusy(true); setError("");
    try { const latest = await request(endpoint); setScenes(latest.scenes); setWatching(true); setPollGeneration((current) => current + 1); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to refresh scenes"); }
    finally { setBusy(false); }
  }

  return <div className="min-w-0 space-y-5">
    <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby="detect-scenes-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl"><h2 id="detect-scenes-title" className="flex items-center gap-2 text-sm font-semibold"><ScanLine size={16} className="text-violet-300" aria-hidden="true" />Scene detection</h2>
          <p className="mt-2 text-xs leading-6 text-zinc-400">Local FFmpeg processing · CPU only. Visual cuts and optional transcript gaps estimate intervals, not narrative scenes. No paid AI request.</p>
        </div>
        {scenes.length ? <button type="button" onClick={() => void refresh()} disabled={busy} className={secondaryButtonClass}><RefreshCw size={14} className={busy ? "animate-spin" : ""} aria-hidden="true" />{busy ? "Refreshing…" : "Refresh"}</button>
          : canDetect && <button type="button" onClick={() => void detect()} disabled={busy || running} className={primaryButtonClass}>{busy || running ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <ScanLine size={15} aria-hidden="true" />}{busy ? "Queueing…" : running ? "Detecting scenes…" : "Detect Scenes"}</button>}
      </div>
      <div aria-live="polite" className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
        <span role="status" className={`${badgeClass} ${badgeTones[job?.state === "failed" ? "red" : running ? "violet" : job?.state === "completed" ? "green" : "neutral"]}`}>{running && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}{state}</span>
        {job && <span className="text-xs text-zinc-500">{job.attemptsMade} attempts completed</span>}
        {job?.result && <span className="text-xs text-zinc-400">{job.result.visualCandidateCount} visual cut candidates · {job.result.transcriptGapCandidateCount} transcript gap candidates</span>}
        {error && <p role="alert" className="w-full break-words text-sm leading-6 text-rose-300">{error}</p>}
      </div>
      {error && !watching && <button type="button" onClick={() => { setError(""); setWatching(true); setPollGeneration((current) => current + 1); }} className={`${secondaryButtonClass} mt-3`}>Refresh detection status</button>}
    </section>
    <dl className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Persisted intervals", value: String(scenes.length) }, { label: "Movie duration", value: durationSeconds === null ? "Not recorded" : formatTimestamp(durationSeconds * 1000) }, { label: "Detection method", value: scenes.length ? methodLabel : "No results yet" }].map((item) => <div key={item.label} className={`${cardClass} p-4`}><dt className="text-xs text-zinc-500">{item.label}</dt><dd className="mt-2 text-sm font-medium leading-6 text-zinc-200">{item.value}</dd></div>)}
    </dl>
    {!scenes.length ? <section className={`${cardClass} p-6 sm:p-8`}>
      <Film size={24} aria-hidden="true" className="text-zinc-500" /><h2 className="mt-4 text-base font-semibold">No scenes have been detected for this movie.</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{canDetect ? "Use Detect Scenes above to queue local processing. The scene worker must be running to save intervals." : "Upload a source movie file to enable local detection and inspect its intervals."}</p>
      {!canDetect && <Link href={overviewPath} className={`${linkClass} mt-4`}>Upload source in Project Overview</Link>}
    </section> : <>
      <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby="scene-timeline-title">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="scene-timeline-title" className="text-sm font-semibold">Scene timeline</h2><span className="text-xs text-zinc-500">Select an interval to inspect</span></div>
        <div className="relative mt-4 h-12 rounded-lg bg-black/20" aria-label="Proportional scene intervals">
          {scenes.map((scene) => <button key={scene.sequence} type="button" onClick={() => setSelectedSequence(scene.sequence)} aria-pressed={selected?.sequence === scene.sequence} aria-label={`Select scene ${scene.sequence + 1}, ${formatTimestamp(scene.startMs)} to ${formatTimestamp(scene.endMs)}`} style={{ left: `${scene.startMs / timelineEnd * 100}%`, width: `${scene.durationMs / timelineEnd * 100}%` }} className={`absolute inset-y-0 overflow-hidden rounded-md border text-xs font-medium ${focusClass} ${selected?.sequence === scene.sequence ? "z-10 border-violet-400 bg-violet-500/25 text-violet-200" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/10"}`}><span aria-hidden="true">{scene.sequence + 1}</span></button>)}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-zinc-500"><span>{formatTimestamp(0)}</span><span>{formatTimestamp(timelineEnd)}</span></div>
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={`${cardClass} overflow-hidden`} aria-labelledby="scene-list-title">
          <h2 id="scene-list-title" className="border-b border-white/10 p-4 text-sm font-semibold">Scene intervals <span className="ml-2 font-normal text-zinc-500">{scenes.length}</span></h2>
          <div className="divide-y divide-white/[0.07]">{scenes.map((scene) => <button key={scene.sequence} type="button" aria-pressed={selected?.sequence === scene.sequence} onClick={() => setSelectedSequence(scene.sequence)} className={`block w-full p-4 text-left transition ${focusClass} ${selected?.sequence === scene.sequence ? "bg-violet-500/10 ring-1 ring-inset ring-violet-400/40" : "hover:bg-white/[0.03]"}`}>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Scene {scene.sequence + 1}</span><span className="flex items-center gap-1.5 font-mono text-xs text-zinc-400"><Clock3 size={12} aria-hidden="true" />{formatTimestamp(scene.durationMs)}</span></div>
            <p className="mt-2 font-mono text-xs leading-6 text-zinc-300">{formatTimestamp(scene.startMs)} → {formatTimestamp(scene.endMs)}</p>
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">{methodLabel} · {scene.boundaryScore === null ? "Timing boundary" : `Raw boundary score ${scene.boundaryScore.toFixed(3)}`}</p>
          </button>)}</div>
        </section>
        {selected && <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby="scene-inspector-title">
          <p className="text-[11px] uppercase tracking-widest text-violet-300">Selected interval</p><h2 id="scene-inspector-title" className="mt-2 text-lg font-semibold">Scene {selected.sequence + 1}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-xs"><div><dt className="text-zinc-500">Start → End</dt><dd className="mt-2 font-mono leading-6">{formatTimestamp(selected.startMs)} → {formatTimestamp(selected.endMs)}</dd></div><div><dt className="text-zinc-500">Duration</dt><dd className="mt-2 font-mono leading-6">{formatTimestamp(selected.durationMs)}</dd></div></dl>
          <div className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-xs leading-6 text-zinc-500">No scene preview is available. This inspector shows saved timing and overlapping source transcript text.</div>
          <h3 className="mt-5 text-sm font-medium">Related transcript segments <span className="text-zinc-500">({related.length})</span></h3>
          <p className="mt-2 text-xs leading-5 text-zinc-500">Read-only source. A segment can overlap multiple intervals.</p>
          {!related.length && <p className="mt-4 text-sm leading-6 text-zinc-400">No saved transcript segments overlap this interval.</p>}
          <div className="mt-4 space-y-3">{related.map((segment) => <article key={segment.sequence} className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="font-mono text-[11px] leading-5 text-zinc-500">Segment {segment.sequence + 1} · {formatTimestamp(segment.startMs)} → {formatTimestamp(segment.endMs)}</p><p lang="zh" className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{segment.text}</p></article>)}</div>
        </section>}
      </div>
    </>}
  </div>;
}
