"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Sparkles, LoaderCircle, Quote, Network, Info, ShieldQuestion } from "lucide-react";
import { badgeClass, badgeTones, cardClass, focusClass, linkClass, primaryButtonClass } from "@/components/ui/styles";
import type { CharacterRead } from "@/lib/character-analysis/read-analysis";
import type { CharacterJobStatus } from "@/lib/queue/character-queue";

const panel = `${cardClass} p-4 sm:p-5`;
const focus = focusClass;
function timestamp(ms: number) { return `${Math.floor(ms / 60000).toString().padStart(2, "0")}:${Math.floor(ms / 1000 % 60).toString().padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`; }
async function read<T>(url: string, method = "GET"): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Character analysis request failed");
  return body.data;
}
type EvidenceRow = CharacterRead["characters"][number]["evidence"][number];
function EvidenceDetails({ row }: { row: Omit<EvidenceRow, "type"> & { type?: string } }) {
  return <article className="min-w-0 rounded-xl border border-white/10 bg-black/10 p-4">
    <div className="flex flex-wrap items-center gap-2"><span className={`${badgeClass} ${badgeTones.neutral}`}>{row.type?.replaceAll("_", " ") ?? "Relationship evidence"}</span><span className={`${badgeClass} ${badgeTones[row.confidence === "LOW" ? "amber" : "neutral"]}`}>{row.confidence} interpretation confidence</span></div>
    <p className="mt-2 break-words text-sm text-zinc-200">{row.inference}</p>
    <p className="mt-3 break-words text-xs leading-5 text-zinc-400"><span className="text-zinc-300">Evidence rationale: </span>{row.evidence}</p>
    <details className="mt-3 text-xs text-zinc-400"><summary className={`cursor-pointer rounded py-1 ${focus}`}>Scene #{row.sceneSequence + 1} · Segment #{row.segment.sequence + 1} · View source evidence</summary>
      <div className="mt-3 space-y-2 border-l border-zinc-700 pl-3">
        <p className="font-mono">Scene {row.scene ? `${timestamp(row.scene.startMs)} – ${timestamp(row.scene.endMs)}` : "interval no longer available"}</p>
        <p className="font-mono">Segment {timestamp(row.segment.startMs)} – {timestamp(row.segment.endMs)}</p>
        <p lang="zh" className="whitespace-pre-wrap break-words leading-6 text-zinc-200">{row.segment.text}</p>
        <p className="text-zinc-500">Source transcript is read-only. Segment may overlap more than one scene.</p>
      </div>
    </details>
  </article>;
}

export default function CharacterWorkspace({ movieId, initial, model, canAnalyze, unavailableReason, overviewPath }: { movieId: string; initial: CharacterRead; model: string | null; canAnalyze: boolean; unavailableReason: string | null; overviewPath: string }) {
  const [data, setData] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.characters[0]?.id ?? "");
  const [view, setView] = useState("Characters");
  const [job, setJob] = useState<CharacterJobStatus>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/movies/${encodeURIComponent(movieId)}/characters`;
  const busy = submitting || !!job && !["completed", "failed", "unknown"].includes(job.state);
  useEffect(() => {
    if (!canAnalyze) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await read<CharacterJobStatus>(`${base}/analyze${job?.jobId ? `?jobId=${encodeURIComponent(job.jobId)}` : ""}`);
        if (cancelled) return;
        setJob(status);
        if (status?.state === "completed") {
          const current = await read<CharacterRead>(base);
          if (!cancelled) setData(current);
        } else if (status && status.state !== "failed" && status.state !== "unknown") timer = setTimeout(poll, 1500);
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "Unable to read analysis status"); }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [base, canAnalyze, job?.jobId]);

  async function analyze() {
    if (!acknowledged || busy) return;
    setSubmitting(true); setError("");
    try {
      const queued = await read<{ jobId: string }>(`${base}/analyze`, "POST");
      setJob(await read<CharacterJobStatus>(`${base}/analyze?jobId=${encodeURIComponent(queued.jobId)}`));
      setAcknowledged(false);
      // Completed jobs are reused; refresh data without issuing another paid request.
      setData(await read<CharacterRead>(base));
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to queue analysis"); }
    finally { setSubmitting(false); }
  }
  const selected = data.characters.find((character) => character.id === selectedId) ?? data.characters[0];
  const evidenceCount = data.characters.reduce((count, character) => count + character.evidence.length, 0) + data.relationships.reduce((count, relationship) => count + relationship.evidence.length, 0);
  const views = [{ label: "Characters", icon: Users }, { label: "Relationships", icon: Network }, { label: "Evidence", icon: Quote }, { label: "Analysis Info", icon: Info }];
  return <div className="min-w-0 space-y-5">
    <section className={panel} aria-labelledby="analysis-heading">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 max-w-2xl">
        <h2 id="analysis-heading" className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-violet-300" aria-hidden="true" />AI Action · OpenRouter</h2>
        <p className="mt-2 break-words text-xs leading-6 text-zinc-400">May incur usage cost · {model ?? "Model not configured"}. Unchanged source reuses its retained completed job.</p>
      </div>{canAnalyze && model && <button type="button" className={primaryButtonClass} disabled={!acknowledged || busy} onClick={() => void analyze()}>{busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}{busy ? "Analysis in progress…" : data.analysis ? "Re-run character analysis" : "Analyze Characters"}</button>}</div>
      {canAnalyze && model && <label className="mt-3 flex items-start gap-3 text-xs leading-6 text-zinc-300"><input type="checkbox" className={`mt-1.5 accent-violet-500 ${focus}`} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} /><span>I understand character analysis may incur an AI charge.</span></label>}
      {unavailableReason && <div className="mt-3 text-sm leading-6 text-amber-200"><p>{unavailableReason}</p><Link href={unavailableReason.startsWith("Detect") ? `${overviewPath}/scenes` : `${overviewPath}/subtitles`} className={`${linkClass} mt-2`}>{unavailableReason.startsWith("Detect") ? "Open Scenes" : "Open Transcription"}</Link></div>}
      <p role="status" aria-live="polite" className="mt-3 text-xs leading-6 text-zinc-500">{job ? `Job ${job.state} · ${job.attemptsMade} attempts completed${job.state === "completed" ? " · Current source job reused on repeated requests" : ""}` : "Analysis runs only after an explicit request."}</p>
      {job?.state === "failed" && <p role="alert" className="mt-2 text-sm leading-6 text-rose-300">{job.error}</p>}
      {error && <p role="alert" className="mt-2 break-words text-sm leading-6 text-rose-300">{error}</p>}
    </section>
    {data.analysis?.stale && <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-200">Source changed since this analysis. Observations and source anchors may be stale; request analysis for the current source.</p>}
    <div className="grid grid-cols-3 gap-2 sm:gap-3">{[{ label: "Character candidates", count: data.characters.length }, { label: "Suggested relationships", count: data.relationships.length }, { label: "Evidence anchors", count: evidenceCount }].map((item) => <div className={`${cardClass} p-3 sm:p-4`} key={item.label}><p className="min-h-10 text-[11px] leading-5 text-zinc-500 sm:min-h-0 sm:text-xs">{item.label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{item.count}</p></div>)}</div>
    <section className={`${cardClass} overflow-hidden`}>
      <nav aria-label="Analysis views" className="grid grid-cols-2 border-b border-white/10 sm:flex sm:flex-wrap">{views.map(({ label, icon: Icon }) => <button key={label} type="button" aria-pressed={view === label} onClick={() => setView(label)} className={`flex min-h-12 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition ${focus} ${view === label ? "border-violet-500 bg-violet-500/10 text-violet-200" : "border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"}`}><Icon size={14} aria-hidden="true" />{label}</button>)}</nav>
      {!data.analysis ? <div className="p-6 sm:p-8"><Users size={24} aria-hidden="true" className="text-zinc-500" /><h2 className="mt-4 text-base font-semibold">Character analysis has not been generated yet.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Scene intervals and source transcript text support character candidates and relationships. {canAnalyze && model ? "Acknowledge the usage cost above to enable Analyze Characters." : "Prepare the prerequisites above before requesting analysis."}</p></div> : <>
        {view === "Characters" && <div className="grid items-start xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside aria-label="Character candidates" className="min-w-0 border-b border-white/10 p-3 xl:border-b-0 xl:border-r">
            <h2 className="px-2 py-2 text-xs font-medium text-zinc-500">Candidates · {data.characters.length}</h2>
            {!data.characters.length && <p className="p-2 text-sm leading-6 text-zinc-400">No supported candidates were returned for this text.</p>}
            <div className="space-y-2">{data.characters.map((character) => <button key={character.id} type="button" aria-pressed={selected?.id === character.id} onClick={() => setSelectedId(character.id)} className={`w-full min-w-0 rounded-lg border p-3 text-left transition ${focus} ${selected?.id === character.id ? "border-violet-400/40 bg-violet-500/10" : "border-transparent hover:bg-white/[0.03]"}`}>
              <span className="block break-words text-sm font-medium">{character.name}</span><span className={`mt-2 block text-xs leading-5 ${character.uncertain ? "text-amber-200" : "text-zinc-400"}`}>{character.uncertain ? "Uncertain · scene-scoped placeholder" : "Text-supported name candidate"}</span>
              <span className="mt-2 block text-[11px] leading-5 text-zinc-500">{character.evidence.length} evidence anchors · {Array.from(new Set(character.evidence.map((row) => row.confidence))).join(" / ")} support</span>
              {!!character.aliases.length && <span className="mt-2 block break-words text-xs leading-5 text-zinc-400">Aliases: {character.aliases.join(" · ")}</span>}
            </button>)}</div>
          </aside>
          {selected && <section className="min-w-0 p-4 sm:p-5" aria-label="Selected character details"><div className="flex flex-wrap items-center gap-3"><h2 className="break-words text-lg font-semibold">{selected.name}</h2><span className={`${badgeClass} ${badgeTones[selected.uncertain ? "amber" : "neutral"]}`}>{selected.uncertain ? "Uncertain identity" : "Name candidate"}</span></div>
            <p className="mt-2 text-xs leading-6 text-zinc-500">{selected.uncertain ? "Placeholder scoped to source evidence; identity and speaker assignment are not confirmed." : "A name supported by source text; identity and speaker assignment are not verified."}</p>
            {!!selected.aliases.length && <p className="mt-3 break-words text-sm leading-6 text-zinc-400">Aliases: {selected.aliases.join(" · ")}</p>}
            <h3 className="mt-5 text-sm font-medium">Observations & supporting evidence</h3><div className="mt-3 space-y-3">{selected.evidence.map((row) => <EvidenceDetails key={row.id} row={row} />)}</div>
          </section>}
        </div>}
        {view === "Relationships" && <section className="space-y-4 p-4 sm:p-5" aria-label="Suggested relationships"><p className="text-xs leading-6 text-zinc-500">Connections are interpretations of dialogue. UNKNOWN means the source does not establish a relationship.</p>
          {!data.relationships.length && <p className="text-sm leading-6 text-zinc-400">No supported relationships recorded.</p>}
          {data.relationships.map((relationship) => <article key={relationship.id} className="rounded-lg border border-white/10 p-4"><h2 className="break-words text-sm font-semibold">{relationship.characterA.name} ↔ {relationship.characterB.name}</h2><div className="mt-3 flex flex-wrap gap-2"><span className={`${badgeClass} ${badgeTones[relationship.type === "UNKNOWN" ? "amber" : "neutral"]}`}>{relationship.type === "UNKNOWN" ? "UNKNOWN · relationship not established" : `Suggested ${relationship.type.toLowerCase()}`}</span><span className={`${badgeClass} ${badgeTones.neutral}`}>{relationship.confidence} interpretation confidence · {relationship.evidence.length} anchors</span></div><p className="mt-3 break-words text-sm leading-6 text-zinc-300">{relationship.summary}</p><div className="mt-4 space-y-3">{relationship.evidence.map((row) => <EvidenceDetails row={row} key={row.id} />)}</div></article>)}
        </section>}
        {view === "Evidence" && <section className="space-y-5 p-4 sm:p-5" aria-label="All analysis evidence"><p className="text-xs leading-6 text-zinc-500">Evidence → inference → confidence. Expand an anchor to inspect its read-only Chinese source and timing.</p>
          {!evidenceCount && <p className="text-sm text-zinc-400">No evidence anchors recorded.</p>}
          {data.characters.map((character) => <div key={character.id}><h2 className="mb-3 break-words text-sm font-medium">{character.name} · character evidence</h2><div className="space-y-3">{character.evidence.map((row) => <EvidenceDetails row={row} key={row.id} />)}</div></div>)}
          {data.relationships.map((relationship) => <div key={relationship.id}><h2 className="mb-3 break-words text-sm font-medium">{relationship.characterA.name} ↔ {relationship.characterB.name} · relationship evidence</h2><div className="space-y-3">{relationship.evidence.map((row) => <EvidenceDetails row={row} key={row.id} />)}</div></div>)}
        </section>}
        {view === "Analysis Info" && <section className="space-y-5 p-4 sm:p-5" aria-label="Analysis provenance"><div className="flex items-center gap-2 text-sm font-medium"><ShieldQuestion size={16} aria-hidden="true" className="text-amber-200" />Interpretations, not verified identities</div>
          <p className="text-sm leading-7 text-zinc-400">Analysis uses scene intervals and subtitle text only. There is no reliable speaker diarization. Generic speakers stay scoped to their scene. No face or voice identification is performed.</p>
          <p className="text-xs leading-6 text-zinc-500">HIGH: strong explicit textual evidence. MEDIUM: contextual inference. LOW: ambiguous evidence. These labels describe interpretation confidence, not accuracy or truth probability.</p>
          <dl className="grid gap-4 text-xs sm:grid-cols-2">{[{ label: "Provider / model", value: `${data.analysis.provider} / ${data.analysis.model}` }, { label: "Analyzed scenes", value: String(data.analysis.sceneCount) }, { label: "Model runtime", value: `${(data.analysis.runtimeMs / 1000).toFixed(2)}s` }, { label: "Model requests", value: String(data.analysis.modelCalls) }, { label: "Updated", value: data.analysis.updatedAt }, { label: "Source freshness", value: data.analysis.stale ? "Stale · source changed" : "Current source" }, { label: "Total tokens", value: String(data.analysis.usage?.totalTokens ?? "Not reported") }, { label: "Reported cost", value: data.analysis.usage?.costUsd === undefined ? "Not reported" : `$${data.analysis.usage.costUsd.toFixed(6)}` }].map((item) => <div key={item.label} className="rounded-lg border border-white/10 p-3"><dt className="text-zinc-500">{item.label}</dt><dd className="mt-2 break-words leading-6 text-zinc-200">{item.value}</dd></div>)}</dl>
          <div><h3 className="text-xs text-zinc-500">Source hash</h3><p className="mt-2 break-all font-mono text-xs leading-6 text-zinc-400">{data.analysis.sourceHash}</p></div>
        </section>}
      </>}
    </section>
  </div>;
}
