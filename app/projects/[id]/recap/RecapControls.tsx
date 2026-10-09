"use client";

import { badgeClass, badgeTones, cardClass, focusClass, primaryButtonClass, secondaryButtonClass, linkClass } from "@/components/ui/styles";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Clapperboard, Film, LoaderCircle, RefreshCw } from "lucide-react";
import type { RecapRead } from "@/lib/recap/read-recap";
import type { RecapJobStatus } from "@/lib/queue/recap-queue";

type Scene = { sequence: number; startMs: number; endMs: number; detectionMethod: string; boundaryScore: number | null };
type Props = {
  projectName: string;
  movie: { id: string; title: string; filename: string | null; durationSeconds: number | null } | null;
  initial: RecapRead;
  initialJob: RecapJobStatus;
  scenes: Scene[];
  transcriptState: "MISSING" | "EMPTY" | "READY";
  characterState: "CURRENT" | "ABSENT" | "STALE" | "UNAVAILABLE";
  sourceContext: "CURRENT" | "ABSENT" | "STALE" | null;
  sourceReason: string | null;
  jobUnavailable: boolean;
  model: string | null;
  transcriptionHref: string;
  scenesHref: string;
  exportHref: string;
  projectHref: string;
};

const panel = `${cardClass} p-5`;
const focus = focusClass;
const activeJobStates = new Set(["waiting", "active", "delayed", "paused", "waiting-children"]);
function isActiveJob(job: RecapJobStatus) { return !!job && activeJobStates.has(job.state); }
function timestamp(ms: number) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1_000) % 60;
  return hours ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
function duration(seconds: number | null) {
  if (seconds === null) return "Duration unavailable";
  return `${timestamp(seconds * 1000)} runtime`;
}
function sceneRange(startSequence: number, endSequence: number, scenes: Scene[]) {
  const start = scenes.find((scene) => scene.sequence === startSequence);
  const end = scenes.find((scene) => scene.sequence === endSequence);
  return start && end ? `${timestamp(start.startMs)} – ${timestamp(end.endMs)}` : "Scene interval unavailable";
}
function confidenceStyle(confidence: string) {
  if (confidence === "HIGH") return "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200";
  if (confidence === "MEDIUM") return "border-amber-300/15 bg-amber-300/[0.06] text-amber-200";
  return "border-zinc-400/15 bg-zinc-400/[0.06] text-zinc-300";
}
async function request<T>(url: string, method = "GET"): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Recap request failed");
  return body.data;
}
type Evidence = NonNullable<RecapRead["recap"]>["sections"][number]["evidence"][number];
type EvidenceLink = Evidence & { linkedTo: string; type: string };

function Confidence({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium tracking-wide ${confidenceStyle(value)}`}>{value} support</span>;
}

function EvidenceAnchor({ row, compact = false }: { row: Evidence; compact?: boolean }) {
  return <details className="min-w-0 rounded-lg border border-white/[0.07] bg-black/10 p-3">
    <summary className={`cursor-pointer break-words text-xs leading-5 text-zinc-300 ${focus}`}>
      Scene {row.sceneSequence + 1} · Segment {row.segment.sequence + 1} · {timestamp(row.segment.startMs)} · Evidence note
    </summary>
    <div className="mt-3 space-y-2 border-l border-zinc-700 pl-3 text-xs leading-5 text-zinc-400">
      <p lang="my" className="break-words text-zinc-300">{row.note}</p>
      <p className="font-mono text-zinc-500">{row.scene ? `${timestamp(row.scene.startMs)}–${timestamp(row.scene.endMs)}` : "Scene interval unavailable"} · {timestamp(row.segment.startMs)}–{timestamp(row.segment.endMs)}</p>
      {!compact && <p lang="zh" className="break-words text-zinc-300">{row.segment.excerpt.slice(0, 180)}{row.segment.excerpt.length > 180 || row.segment.truncated ? "…" : ""}</p>}
    </div>
  </details>;
}

function StatusChip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "violet" | "red" }) {
  const toneClass = badgeTones[tone];
  return <span className={`${badgeClass} ${toneClass}`}>{children}</span>;
}

export default function RecapControls(props: Props) {
  const [data, setData] = useState(props.initial);
  const [job, setJob] = useState<RecapJobStatus>(props.initialJob);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(props.initial.recap?.sections[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<"script" | "characters" | "relationships" | "evidence" | "scenes">("script");
  const movieId = props.movie?.id ?? null;
  const base = movieId ? `/api/movies/${encodeURIComponent(movieId)}/recap` : null;
  const recap = data.recap;
  const active = isActiveJob(job);
  const currentJobId = job?.jobId ?? null;
  const shouldPollJob = isActiveJob(job);
  const readyTranscript = props.transcriptState === "READY";
  const readyScenes = props.scenes.length > 0;
  const sourceReady = !!movieId && readyTranscript && readyScenes && !props.sourceReason;
  const canGenerate = sourceReady && !!props.model;
  const contextTabIds = ["script", "characters", "relationships", "evidence", "scenes"] as const;

  function moveContextTab(event: React.KeyboardEvent<HTMLButtonElement>, current: typeof contextTabIds[number]) {
    const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const next = contextTabIds[(contextTabIds.indexOf(current) + offset + contextTabIds.length) % contextTabIds.length];
    setActiveTab(next);
    document.getElementById(`recap-tab-${next}`)?.focus();
  }

  useEffect(() => {
    if (!base || !shouldPollJob) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await request<RecapJobStatus>(`${base}/generate${currentJobId ? `?jobId=${encodeURIComponent(currentJobId)}` : ""}`);
        if (cancelled) return;
        setJob(status);
        if (status?.state === "completed") {
          const current = await request<RecapRead>(base!);
          if (!cancelled) setData(current);
        } else if (isActiveJob(status)) timer = setTimeout(poll, 2000);
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Unable to refresh recap status");
      }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [base, currentJobId, shouldPollJob]);

  const selectedSection = recap?.sections.find((section) => section.id === selectedSectionId) ?? recap?.sections[0] ?? null;
  const evidenceRows = useMemo<EvidenceLink[]>(() => {
    if (!recap) return [];
    const rows: EvidenceLink[] = [];
    for (const section of recap.sections) for (const evidence of section.evidence) rows.push({ ...evidence, linkedTo: section.heading, type: "Section" });
    for (const insight of recap.characterInsights) for (const evidence of insight.evidence) rows.push({ ...evidence, linkedTo: insight.displayName, type: "Character" });
    for (const insight of recap.relationshipInsights) for (const evidence of insight.evidence) rows.push({ ...evidence, linkedTo: `${insight.nameA} ↔ ${insight.nameB}`, type: "Relationship" });
    return rows.sort((a, b) => a.sceneSequence - b.sceneSequence || a.segment.sequence - b.segment.sequence || a.id.localeCompare(b.id));
  }, [recap]);

  async function refreshStatus() {
    if (!base || !job?.jobId || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const status = await request<RecapJobStatus>(`${base}/generate?jobId=${encodeURIComponent(job.jobId)}`);
      setJob(status);
      if (status?.state === "completed") {
        const current = await request<RecapRead>(base);
        setData(current);
        setSelectedSectionId(current.recap?.sections[0]?.id ?? null);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh recap status");
    } finally {
      setRefreshing(false);
    }
  }

  async function generate() {
    if (!base || !acknowledged || !canGenerate || submitting || active) return;
    setSubmitting(true);
    setError("");
    try {
      const queued = await request<{ jobId: string }>(`${base}/generate`, "POST");
      const status = await request<RecapJobStatus>(`${base}/generate?jobId=${encodeURIComponent(queued.jobId)}`);
      setJob(status);
      setAcknowledged(false);
      const current = await request<RecapRead>(base);
      setData(current);
      setSelectedSectionId(current.recap?.sections[0]?.id ?? null);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Unable to queue recap generation");
    } finally {
      setSubmitting(false);
    }
  }

  const stale = !!recap?.stale;
  const stateLabel = !props.movie ? "Not available" : !readyTranscript ? "Transcript required" : !readyScenes ? "Scenes required" : active ? "Generating" : job?.state === "failed" ? "Failed" : stale ? "Stale" : recap ? "Completed" : !props.model ? "Not configured" : "Ready";
  const stateTone = stateLabel === "Generating" ? "violet" : stateLabel === "Failed" ? "red" : stateLabel === "Stale" ? "amber" : stateLabel === "Completed" || stateLabel === "Ready" ? "green" : "neutral";
  const actionIsGenerate = readyTranscript && readyScenes && !!props.movie && (!recap || stale) && !active && job?.state !== "failed";
  const actionIsRefresh = !!job && (active || job.state === "failed");

  return <div className="space-y-5">
    <header className="flex min-w-0 flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Link href="/projects" className={linkClass}>Projects</Link><ChevronRight size={13} aria-hidden="true" />
          <Link href={props.projectHref} className={`${linkClass} min-w-0 break-words`}>{props.projectName}</Link><ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page" className="text-zinc-300">Recap</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Recap</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Create a Myanmar recap from transcript and scene evidence.</p>
      </div>
      <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:min-w-[220px] sm:items-end">
        <StatusChip tone={stateTone}>{active && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}{stateLabel}</StatusChip>
        {actionIsGenerate ? <>
          <label className="flex max-w-[300px] items-start gap-2 text-left text-xs leading-5 text-zinc-400 sm:justify-end">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={!canGenerate || submitting || active} className={`mt-1 shrink-0 accent-violet-400 ${focus}`} />
            <span>AI Action · OpenRouter. I understand this may incur usage cost.</span>
          </label>
          <button type="button" onClick={() => void generate()} disabled={!acknowledged || !canGenerate || submitting || active} className={primaryButtonClass}>
            {submitting ? <><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />Queueing…</> : <><Clapperboard size={15} aria-hidden="true" />{stale ? "Regenerate Recap" : "Generate Recap"}</>}
          </button>
        </> : actionIsRefresh ? <button type="button" onClick={() => void refreshStatus()} disabled={refreshing} className={secondaryButtonClass}>
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh Status"}
        </button> : !props.movie ? <Link href={props.projectHref} className={primaryButtonClass}>Open Project</Link>
          : !readyTranscript ? <Link href={props.transcriptionHref} className={primaryButtonClass}>Open Transcription</Link>
            : !readyScenes ? <Link href={props.scenesHref} className={primaryButtonClass}>Detect Scenes</Link>
              : recap && !stale ? <Link href={props.exportHref} className={primaryButtonClass}>Open Export<ChevronRight size={15} aria-hidden="true" /></Link>
                : <button type="button" disabled className={secondaryButtonClass}>{job?.state === "failed" ? "Generation failed" : "Recap unavailable"}</button>}
      </div>
    </header>

    {stale && <section className="flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4" role="status"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-200" aria-hidden="true" /><div><h2 className="text-sm font-medium text-amber-100">This recap is stale</h2><p className="mt-1 text-xs leading-5 text-amber-100/75">Source transcript, scenes, or character context changed after this recap was generated. The saved recap remains available for review; regenerate only when you choose.</p></div></section>}
    {props.sourceReason && !active && <section className="flex gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-4 text-sm text-amber-100" role="status"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><p className="leading-6">{!readyTranscript ? "Transcription is required before generating a recap." : !readyScenes ? "Scene detection is required to build the recap." : props.sourceReason}</p></section>}
    {job?.state === "failed" && <section className="rounded-xl border border-rose-300/15 bg-rose-300/[0.04] p-4" role="alert"><p className="text-sm font-medium text-rose-200">Recap generation could not be completed.</p><p className="mt-1 text-xs leading-5 text-zinc-400">{job.error ?? "The saved generation job failed. Check worker configuration and source data."}</p></section>}
    {props.jobUnavailable && <p role="status" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-zinc-400">Live generation status is unavailable. Saved recap data is still shown.</p>}
    {error && <p role="alert" className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-200">{error}</p>}

    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.95fr)]">
      <div className="min-w-0 space-y-4">
        <section className={panel} aria-labelledby="recap-source-heading">
          <div className="relative flex min-h-[230px] min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-white/[0.07] bg-[#0b111a] p-5 sm:min-h-64">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-950/20 via-transparent to-slate-800/20" />
            <div className="relative flex items-start justify-between gap-3"><StatusChip>{props.movie ? "Movie source" : "No movie"}</StatusChip><StatusChip>{duration(props.movie?.durationSeconds ?? null)}</StatusChip></div>
            <div className="relative flex flex-1 flex-col items-center justify-center py-5 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400"><Film size={22} aria-hidden="true" /></div>
              <p className="text-sm font-medium text-zinc-200">Preview unavailable</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">This workspace has no playable video preview. Scene ranges and transcript evidence are shown below.</p>
            </div>
            <div className="relative min-w-0 border-t border-white/[0.08] pt-3">
              <h2 id="recap-source-heading" className="break-words text-sm font-semibold text-zinc-100">{props.movie?.title ?? "No movie uploaded"}</h2>
              <p className="mt-1 break-all text-xs text-zinc-500">{props.movie?.filename ?? "Upload a movie from Project Overview to begin."}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Prerequisite label="Transcript" value={props.transcriptState === "READY" ? "Completed" : props.transcriptState === "EMPTY" ? "Needs attention" : "Not ready"} tone={props.transcriptState === "READY" ? "green" : props.transcriptState === "EMPTY" ? "amber" : "neutral"} />
            <Prerequisite label="Scenes" value={readyScenes ? `${props.scenes.length} detected` : "Not detected"} tone={readyScenes ? "green" : "neutral"} />
            <Prerequisite label="Character Analysis" value={characterStateLabel(props.characterState)} tone={props.characterState === "CURRENT" ? "green" : props.characterState === "STALE" ? "amber" : "neutral"} note="Optional · advisory" />
            <Prerequisite label="Recap" value={recap ? stale ? "Stale" : "Completed" : active ? "Generating" : job?.state === "failed" ? "Failed" : "Not generated"} tone={recap && !stale ? "green" : job?.state === "failed" ? "red" : stale ? "amber" : active ? "violet" : "neutral"} />
          </div>
        </section>

        <section className={panel} aria-labelledby="scene-chapters-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="scene-chapters-heading" className="text-sm font-semibold text-zinc-100">Scenes &amp; Chapters</h2><p className="mt-1 text-xs text-zinc-500">Saved scene intervals · no generated titles or thumbnails</p></div><Link href={props.scenesHref} className={`rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] ${focus}`}>{readyScenes ? "Open Scenes" : "Detect Scenes"}</Link></div>
          {!readyScenes ? <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/10 p-4 text-xs leading-5 text-zinc-400">{readyTranscript ? "Scene detection is required to build the recap." : "Scene intervals will appear after transcript preparation and scene detection."}</p> : <div className="mt-4 grid max-h-[245px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {props.scenes.map((scene) => <div key={scene.sequence} className="min-w-0 rounded-lg border border-white/[0.07] bg-black/15 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Scene {String(scene.sequence + 1).padStart(2, "0")}</p><p className="mt-1 break-words font-mono text-xs text-zinc-200">{timestamp(scene.startMs)}–{timestamp(scene.endMs)}</p><p className="mt-1 break-words text-[11px] leading-4 text-zinc-500">{scene.detectionMethod.replaceAll("_", " ")}</p></div>)}
          </div>}
        </section>

        <section className={panel} aria-labelledby="recap-summary-heading">
          <div><h2 id="recap-summary-heading" className="text-sm font-semibold text-zinc-100">Recap Summary</h2><p className="mt-1 text-xs text-zinc-500">Saved Myanmar narrative · read-only</p></div>
          {recap ? <>
            <h3 lang="my" className="mt-4 break-words text-base font-medium leading-7 text-zinc-200">{recap.title}</h3>
            <p lang="my" className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{recap.summary}</p>
            <details className="mt-4 border-t border-white/[0.07] pt-3 text-xs text-zinc-500"><summary className={`cursor-pointer ${focus}`}>Generation details</summary><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1"><span>{recap.provider} · {recap.model}</span><span>{recap.strategy === "SINGLE_STAGE" ? "One-stage" : "Hierarchical"}</span><span>{(recap.runtimeMs / 1000).toFixed(2)}s · {recap.modelCalls} model requests</span>{recap.usage && <span>{recap.usage.totalTokens ?? "Token usage not reported"} tokens · {recap.usage.costUsd === undefined ? "cost not reported" : `$${recap.usage.costUsd.toFixed(6)}`}</span>}<span>Updated {new Date(recap.updatedAt).toLocaleString()}</span></div><p className="mt-2">Character context at generation: {recap.characterContext === "CURRENT" ? "current advisory analysis" : recap.characterContext === "STALE" ? "stale analysis ignored" : "no analysis; plot-focused"}.</p></details>
          </> : <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/10 p-4 text-sm leading-6 text-zinc-400">{!readyTranscript ? "Transcription is required before generating a recap." : !readyScenes ? "Scene detection is required to build the recap." : props.sourceReason || "Generate a Myanmar recap from the current transcript and scene evidence."}</p>}
          {props.sourceContext && <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs leading-5 text-zinc-500">{props.sourceContext === "CURRENT" ? "Current character analysis may inform the recap as advisory evidence." : props.sourceContext === "STALE" ? "Stale character analysis is ignored; character context is limited." : "No character analysis is present. A plot-focused recap can still be generated without fabricated characters."}</p>}
        </section>
      </div>

      <aside className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#101720]" aria-label="Recap script and evidence">
        <div role="tablist" aria-label="Recap views" className="grid grid-cols-2 gap-1 border-b border-white/[0.08] bg-black/15 p-2 sm:grid-cols-3 xl:grid-cols-5">
          {([{ id: "script", label: "Recap Script" }, { id: "characters", label: "Characters" }, { id: "relationships", label: "Relationships" }, { id: "evidence", label: "Evidence" }, { id: "scenes", label: "Scene List" }] as const).map((tab) => <button key={tab.id} id={`recap-tab-${tab.id}`} type="button" role="tab" tabIndex={activeTab === tab.id ? 0 : -1} aria-selected={activeTab === tab.id} aria-controls="recap-context-panel" onKeyDown={(event) => moveContextTab(event, tab.id)} onClick={() => setActiveTab(tab.id)} className={`min-h-10 rounded-md px-2 text-xs transition last:col-span-2 sm:last:col-span-1 ${focus} ${activeTab === tab.id ? "border-b-2 border-violet-400 bg-violet-500/[0.12] text-violet-200" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"}`}>{tab.label}</button>)}
        </div>
        <div id="recap-context-panel" role="tabpanel" aria-labelledby={`recap-tab-${activeTab}`} className="min-w-0 p-4 sm:p-5">
          {activeTab === "script" && <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-200/80">Read-only Myanmar script</p><h2 className="mt-1 text-lg font-semibold text-zinc-100">Movie Recap</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Character-driven summary grounded in saved scene and transcript evidence.</p></div>{recap && <StatusChip tone={stale ? "amber" : "green"}>{stale ? "Stale source" : "Current"}</StatusChip>}</div>
            {!recap && <EmptyContext text={!readyTranscript ? "Transcription is required before generating a recap." : !readyScenes ? "Scene detection is required to build the recap." : props.sourceReason || "Generate a Myanmar recap from the current transcript and scene evidence."} />}
            {recap && !recap.sections.length && <EmptyContext text="No recap sections were saved for this result." />}
            {recap?.sections.map((section) => <article key={section.id} className={`min-w-0 overflow-hidden rounded-lg border transition ${selectedSection?.id === section.id ? "border-violet-400/55 bg-violet-500/[0.09] shadow-[inset_0_0_0_1px_rgba(139,92,246,0.1)]" : "border-white/[0.07] bg-white/[0.02]"}`}>
              <button type="button" aria-current={selectedSection?.id === section.id ? "true" : undefined} aria-label={`Show recap section ${section.sequence + 1}: ${section.heading}`} onClick={() => setSelectedSectionId(section.id)} className={`flex w-full min-w-0 items-start gap-3 p-3 text-left ${focus}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${selectedSection?.id === section.id ? "bg-violet-500 text-white" : "bg-white/[0.07] text-zinc-300"}`}>{section.sequence + 1}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500"><span>{sceneRange(section.sceneStartSequence, section.sceneEndSequence, props.scenes)}</span><span>Scenes {section.sceneStartSequence + 1}–{section.sceneEndSequence + 1}</span></span><span lang="my" className="mt-1 block break-words text-sm font-medium leading-7 text-zinc-100">{section.heading}</span><span className="mt-2 flex flex-wrap items-center gap-2"><Confidence value={section.confidence} /><span className="text-[11px] text-zinc-500">{section.evidence.length} evidence anchors</span></span></span>
              </button>
              {selectedSection?.id === section.id && <div className="border-t border-violet-300/15 px-4 pb-4 pt-3"><p lang="my" className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{section.summary}</p><div className="mt-4 border-t border-white/[0.07] pt-3"><h3 className="text-xs font-medium text-zinc-300">Supporting evidence</h3>{section.evidence.length ? <div className="mt-2 space-y-2">{section.evidence.map((row) => <EvidenceAnchor key={row.id} row={row} compact />)}</div> : <p className="mt-2 text-xs text-zinc-500">No evidence anchors saved for this section.</p>}</div></div>}
            </article>)}
            {recap && <p className="text-[11px] leading-5 text-zinc-500">Confidence labels describe support strength, not accuracy or truth probability. Review claims against the linked Chinese source.</p>}
          </div>}

          {activeTab === "characters" && <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
            <div><h2 className="text-base font-semibold text-zinc-100">Characters</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Recap insights from persisted analysis · advisory, not verified identity.</p><p className="mt-2 text-xs text-zinc-500">Character analysis: <span className={props.characterState === "STALE" ? "text-amber-200" : props.characterState === "CURRENT" ? "text-emerald-200" : "text-zinc-300"}>{characterStateLabel(props.characterState)}</span></p></div>
            {!recap?.characterInsights.length && <EmptyContext text={recap ? "No supported character-specific insights were saved." : "Character insights appear after a recap is generated."} />}
            {recap?.characterInsights.map((insight) => <article key={insight.id} className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="break-words text-sm font-medium text-zinc-200">{insight.displayName}</h3>{insight.uncertain && <StatusChip tone="amber">Uncertain identity</StatusChip>}</div><p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500"><span>Inferred observation</span><Confidence value={insight.confidence} /><span>{insight.evidence.length} anchors</span></p><p lang="my" className="mt-2 break-words text-xs leading-6 text-zinc-300">{insight.observation}</p>{insight.evidence[0] && <div className="mt-3"><EvidenceAnchor row={insight.evidence[0]} compact /></div>}</article>)}
          </div>}

          {activeTab === "relationships" && <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
            <div><h2 className="text-base font-semibold text-zinc-100">Relationships</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Suggested relationship interpretations from saved recap evidence.</p></div>
            {!recap?.relationshipInsights.length && <EmptyContext text={recap ? "No supported relationship interpretations were saved." : "Relationship context appears after a recap is generated."} />}
            {recap?.relationshipInsights.map((insight) => <article key={insight.id} className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><h3 className="break-words text-sm font-medium text-zinc-200">{insight.nameA} <span className="text-zinc-500">↔</span> {insight.nameB}</h3>{(insight.uncertainA || insight.uncertainB) && <p className="mt-1 text-[11px] text-amber-200">One or more parties have uncertain identity.</p>}<p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500"><span>Suggested dynamic</span><Confidence value={insight.confidence} /><span>{insight.evidence.length} anchors</span></p><p lang="my" className="mt-2 break-words text-xs leading-6 text-zinc-300">{insight.observation}</p>{insight.evidence[0] && <div className="mt-3"><EvidenceAnchor row={insight.evidence[0]} compact /></div>}</article>)}
          </div>}

          {activeTab === "evidence" && <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
            <div><h2 className="text-base font-semibold text-zinc-100">Evidence</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Real scene and transcript anchors linked to saved recap claims.</p></div>
            {!evidenceRows.length && <EmptyContext text={recap ? "No evidence anchors were saved." : "Evidence anchors appear after a recap is generated."} />}
            {evidenceRows.map((row) => <article key={`${row.type}-${row.id}`} className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><StatusChip>{row.type}</StatusChip><span className="max-w-full break-words text-[11px] text-zinc-500">Supports {row.linkedTo}</span></div><EvidenceAnchor row={row} compact /></article>)}
          </div>}

          {activeTab === "scenes" && <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
            <div><h2 className="text-base font-semibold text-zinc-100">Scene List</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Saved intervals only. Scene names and visual previews are unavailable.</p></div>
            {!props.scenes.length && <EmptyContext text="No scene intervals are saved. Detect scenes before generating a recap." />}
            {props.scenes.map((scene) => <article key={scene.sequence} className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div className="min-w-0"><p className="text-xs font-medium text-zinc-200">Scene {String(scene.sequence + 1).padStart(2, "0")}</p><p className="mt-1 break-words font-mono text-[11px] text-zinc-400">{timestamp(scene.startMs)}–{timestamp(scene.endMs)}</p><p className="mt-1 break-words text-[11px] text-zinc-500">{scene.detectionMethod.replaceAll("_", " ")}</p></div>{recap?.sections.some((section) => scene.sequence >= section.sceneStartSequence && scene.sequence <= section.sceneEndSequence) && <StatusChip tone="violet">In recap</StatusChip>}</article>)}
          </div>}
        </div>
      </aside>
    </div>
    <p className="text-xs leading-5 text-zinc-500">Recap uses the newest movie in this project. Review important claims against the referenced Chinese source. Confidence labels describe support strength, not accuracy or truth probability.</p>
  </div>;
}

function characterStateLabel(state: Props["characterState"]) {
  return state === "CURRENT" ? "Current" : state === "STALE" ? "Stale" : state === "ABSENT" ? "Not run" : "Unavailable";
}

function Prerequisite({ label, value, tone, note }: { label: string; value: string; tone: "neutral" | "green" | "amber" | "violet" | "red"; note?: string }) {
  const toneClass = tone === "green" ? "text-emerald-200" : tone === "amber" ? "text-amber-200" : tone === "violet" ? "text-violet-300" : tone === "red" ? "text-rose-300" : "text-zinc-400";
  return <div className="min-w-0 rounded-lg border border-white/[0.06] bg-black/10 p-2.5 sm:p-3"><p className="break-words text-[11px] text-zinc-500">{label}{note && <span className="ml-1 text-zinc-500">· {note}</span>}</p><p className={`mt-1 break-words text-xs font-medium ${toneClass}`}>{value}</p></div>;
}

function EmptyContext({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-white/10 bg-black/10 p-4 text-xs leading-5 text-zinc-500">{text}</p>;
}
