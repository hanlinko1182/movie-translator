"use client";
import { useEffect, useState } from "react";
import { Film, ScanLine } from "lucide-react";
import { formatTimestamp } from "@/lib/format-timestamp";
import type { SceneJobStatus, SceneRow } from "@/lib/scenes/types";

export default function SceneWorkspace({ movieId, initialScenes, canDetect }: { movieId: string; initialScenes: SceneRow[]; canDetect: boolean }) {
  const [scenes, setScenes] = useState(initialScenes);
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

  return <div className="min-w-0 space-y-5">
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="detect-scenes-title">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 id="detect-scenes-title" className="text-sm font-medium">Local scene detection</h2><p className="mt-2 max-w-3xl text-xs leading-6 text-zinc-400">Scene boundaries are estimated from visual cuts and transcript timing. Visual cuts indicate shot changes, not semantic or narrative scene boundaries. No AI request is made.</p></div><button type="button" onClick={() => void detect()} disabled={!canDetect || busy || running} className="inline-flex max-w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-40"><ScanLine size={16} />{busy ? "Queueing…" : "Detect scenes"}</button></div>
      <p className="text-xs leading-5 text-zinc-500">Runs on the local CPU in the scene worker. Repeated requests reuse a retained completed job. Transcript timing is optional; no thumbnails, titles or story summaries are generated.</p>
      {!canDetect && <p className="text-sm text-zinc-400">Upload a source movie file before detecting scenes.</p>}
      <div aria-live="polite" className="space-y-2"><p role="status" className="text-sm text-zinc-300">Detection: {state}{job && ` · attempts ${job.attemptsMade}`}</p>{job?.result && <p className="text-xs text-zinc-400">{job.result.sceneCount} intervals · {job.result.visualCandidateCount} visual cut candidates · {job.result.transcriptGapCandidateCount} transcript gap candidates</p>}{error && <p role="alert" className="break-words text-sm text-amber-200">{error}</p>}</div>
      {error && !watching && <button type="button" onClick={() => { setError(""); setWatching(true); }} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 focus-visible:outline-2 focus-visible:outline-white">Refresh detection status</button>}
    </section>
    <section className="min-w-0 space-y-3" aria-labelledby="scene-list-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="scene-list-title" className="text-sm font-medium">Scene intervals</h2><span className="text-xs text-zinc-400">{scenes.length} persisted {scenes.length === 1 ? "interval" : "intervals"}</span></div>
      {!scenes.length && <p className="rounded-2xl border border-white/10 p-6 text-sm leading-6 text-zinc-400">No scenes detected yet. Start detection explicitly and run the scene worker to process the job.</p>}
      {scenes.map((scene) => <article key={scene.sequence} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="flex items-center gap-2 text-sm font-medium"><Film size={16} className="text-zinc-500" />Scene {scene.sequence + 1}</h3>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div><dt className="text-xs text-zinc-500">Start</dt><dd className="mt-1 break-words font-mono text-sm text-zinc-200">{formatTimestamp(scene.startMs)}</dd></div>
          <div><dt className="text-xs text-zinc-500">End</dt><dd className="mt-1 break-words font-mono text-sm text-zinc-200">{formatTimestamp(scene.endMs)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Duration</dt><dd className="mt-1 break-words font-mono text-sm text-zinc-200">{formatTimestamp(scene.durationMs)}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-zinc-500">Detection method</dt><dd className="mt-1 text-xs leading-5 text-zinc-300">Visual / transcript heuristic</dd></div>
          <div><dt className="text-xs text-zinc-500">Start boundary evidence</dt><dd className="mt-1 text-xs leading-5 text-zinc-300">{scene.boundaryScore === null ? "Timing boundary" : `Raw visual score ${scene.boundaryScore.toFixed(3)}`}</dd></div>
        </dl>
      </article>)}
    </section>
  </div>;
}
