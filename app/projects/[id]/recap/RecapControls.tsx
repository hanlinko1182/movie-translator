"use client";
import { useEffect, useState } from "react";
import type { RecapRead } from "@/lib/recap/read-recap";
import type { RecapJobStatus } from "@/lib/queue/recap-queue";

const panel = "rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
function timestamp(ms: number) { return `${Math.floor(ms / 60000).toString().padStart(2, "0")}:${Math.floor(ms / 1000 % 60).toString().padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`; }
async function request<T>(url: string, method = "GET"): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Recap request failed");
  return body.data;
}
type Evidence = NonNullable<RecapRead["recap"]>["sections"][number]["evidence"][number];
function EvidenceDetails({ evidence }: { evidence: Evidence[] }) {
  return <div className="mt-4 space-y-2">{evidence.map((row) => <details key={row.id} className="min-w-0 rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-zinc-400">
    <summary className={`cursor-pointer rounded leading-5 ${focus}`}>Scene #{row.sceneSequence + 1} · Transcript Segment #{row.segment.sequence + 1} · {timestamp(row.segment.startMs)} · View evidence</summary>
    <div className="mt-3 space-y-2 border-l border-zinc-700 pl-3">
      <p lang="my" className="break-words leading-6 text-zinc-300">{row.note}</p>
      <p className="font-mono">Scene {row.scene ? `${timestamp(row.scene.startMs)} – ${timestamp(row.scene.endMs)}` : "interval no longer available"}</p>
      <p className="font-mono">Segment {timestamp(row.segment.startMs)} – {timestamp(row.segment.endMs)}</p>
      <p lang="zh" className="whitespace-pre-wrap break-words leading-6 text-zinc-200">{row.segment.excerpt}{row.segment.truncated ? "…" : ""}</p>
      <p className="text-zinc-500">Read-only source excerpt. References establish subtitle context, not verified speaker identity.</p>
    </div>
  </details>)}</div>;
}
export default function RecapControls({ movieId, initial, model, canGenerate, unavailableReason, sourceContext }: { movieId: string; initial: RecapRead; model: string | null; canGenerate: boolean; unavailableReason: string | null; sourceContext: string | null }) {
  const [data, setData] = useState(initial);
  const [job, setJob] = useState<RecapJobStatus>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/movies/${encodeURIComponent(movieId)}/recap`;
  const busy = submitting || !!job && !["completed", "failed", "unknown"].includes(job.state);
  useEffect(() => {
    if (!canGenerate) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await request<RecapJobStatus>(`${base}/generate${job?.jobId ? `?jobId=${encodeURIComponent(job.jobId)}` : ""}`);
        if (cancelled) return;
        setJob(status);
        if (status?.state === "completed") { const current = await request<RecapRead>(base); if (!cancelled) setData(current); }
        else if (status && status.state !== "failed" && status.state !== "unknown") timer = setTimeout(poll, 1500);
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "Unable to read recap status"); }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [base, canGenerate, job?.jobId]);
  async function generate() {
    if (!acknowledged || busy) return;
    setSubmitting(true); setError("");
    try {
      const queued = await request<{ jobId: string }>(`${base}/generate`, "POST");
      setJob(await request<RecapJobStatus>(`${base}/generate?jobId=${encodeURIComponent(queued.jobId)}`));
      setAcknowledged(false);
      setData(await request<RecapRead>(base));
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to queue recap"); }
    finally { setSubmitting(false); }
  }
  const recap = data.recap;
  return <div className="space-y-5">
    <section className={panel} aria-labelledby="recap-policy"><h2 id="recap-policy" className="font-medium">Evidence → inference → recap claim</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Myanmar recap from Chinese transcript and scene evidence. Character analysis is advisory: names, speaker roles, motivations and relationships are not verified identities or objective facts. There is no reliable speaker diarization or face/voice recognition.</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">HIGH: explicit textual support. MEDIUM: contextual interpretation. LOW: weak or ambiguous evidence. Confidence is not an accuracy percentage or truth probability.</p>
      {sourceContext && <p className="mt-3 text-xs text-zinc-400">{sourceContext === "CURRENT" ? "Current character evidence is available as advisory context." : sourceContext === "STALE" ? "Stale character analysis will be ignored. Character-specific context is limited." : "No character analysis yet. A plot-focused recap can still be generated; no characters will be fabricated."}</p>}
      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        <p className="break-words text-xs text-zinc-400">Paid AI action · OpenRouter · {model ?? "Model not configured"}. Long movies use multiple bounded requests. Cost depends on usage. Unchanged source reuses its retained completed job.</p>
        {unavailableReason && <p className="text-sm text-amber-200">{unavailableReason}</p>}
        <label className="flex items-start gap-3 text-sm text-zinc-300"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy || !canGenerate || !model} className={`mt-1 accent-zinc-300 ${focus}`} /><span>I understand recap generation may incur an AI charge.</span></label>
        <button type="button" className={`rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 ${focus}`} disabled={!acknowledged || busy || !canGenerate || !model} onClick={() => void generate()}>{busy ? "Generating recap…" : recap ? "Re-generate recap" : "Generate recap"}</button>
        <p role="status" aria-live="polite" className="text-xs text-zinc-400">{job ? `Job ${job.state} · ${job.attemptsMade} attempts completed${job.state === "completed" ? " · Repeated requests reuse this source job" : ""}` : "Generation runs only after an explicit request."}</p>
        {job?.state === "failed" && <p role="alert" className="text-sm text-amber-200">{job.error}</p>}
        {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
      </div>
    </section>
    {recap ? <>
      <section className={panel} aria-label="Recap provenance"><p className="break-words text-sm text-zinc-300">{recap.provider} · {recap.model} · {recap.strategy === "SINGLE_STAGE" ? "One-stage recap" : "Hierarchical recap"} · {(recap.runtimeMs / 1000).toFixed(2)}s model runtime · {recap.modelCalls} model requests</p>
        <p className="mt-2 text-xs text-zinc-500">Myanmar · {recap.sections.length} sections · {recap.characterInsights.length} character insights · {recap.relationshipInsights.length} relationship insights · Updated {recap.updatedAt}</p>
        <p className="mt-2 text-xs text-zinc-500">Character context at generation: {recap.characterContext === "CURRENT" ? "Current analysis used as advisory evidence" : recap.characterContext === "STALE" ? "Stale analysis ignored; limited character context" : "No character analysis; plot-focused recap"}</p>
        {recap.usage && <p className="mt-2 text-xs text-zinc-500">Tokens: {recap.usage.totalTokens ?? "not reported"} · Cost: {recap.usage.costUsd === undefined ? "not reported" : `$${recap.usage.costUsd.toFixed(6)}`}</p>}
        {recap.stale ? <p role="status" className="mt-3 text-sm text-amber-200">Source changed since generation. This recap is stale; review it or request a recap for the current source.</p> : <p className="mt-3 text-xs text-zinc-400">Source snapshot is current. Semantic correctness still requires human review.</p>}
      </section>
      <section className={panel} aria-labelledby="recap-title"><h2 lang="my" id="recap-title" className="break-words text-lg font-semibold leading-8">{recap.title}</h2><p lang="my" className="mt-4 whitespace-pre-wrap break-words text-sm leading-8 text-zinc-300">{recap.summary}</p></section>
      <section aria-labelledby="recap-sections"><h2 id="recap-sections" className="mb-3 font-medium">Scene-based recap sections</h2><div className="space-y-4">{recap.sections.map((section) => <article className={panel} key={section.id}><p className="text-xs text-zinc-500">Section {section.sequence + 1} · Scenes #{section.sceneStartSequence + 1}–#{section.sceneEndSequence + 1} · {section.confidence} evidence confidence</p><h3 lang="my" className="mt-3 break-words font-medium leading-7">{section.heading}</h3><p lang="my" className="mt-3 whitespace-pre-wrap break-words text-sm leading-8 text-zinc-300">{section.summary}</p><EvidenceDetails evidence={section.evidence} /></article>)}</div></section>
      <section aria-labelledby="recap-character-insights"><h2 id="recap-character-insights" className="mb-3 font-medium">Character insights</h2>{!recap.characterInsights.length && <p className="text-sm text-zinc-400">No supported character-specific insights recorded.</p>}<div className="grid min-w-0 gap-4 xl:grid-cols-2">{recap.characterInsights.map((insight) => <article key={insight.id} className={`${panel} min-w-0`}><h3 className="break-words font-medium">{insight.displayName}</h3><p className="mt-2 text-xs text-zinc-500">Inferred from dialogue evidence · {insight.confidence} confidence{insight.uncertain ? " · Uncertain identity" : ""}</p><p lang="my" className="mt-3 break-words text-sm leading-8 text-zinc-300">{insight.observation}</p><EvidenceDetails evidence={insight.evidence} /></article>)}</div></section>
      <section aria-labelledby="recap-relationship-insights"><h2 id="recap-relationship-insights" className="mb-3 font-medium">Suggested relationship dynamics</h2>{!recap.relationshipInsights.length && <p className="text-sm text-zinc-400">No supported relationship-specific insights recorded.</p>}<div className="grid min-w-0 gap-4 xl:grid-cols-2">{recap.relationshipInsights.map((insight) => <article key={insight.id} className={`${panel} min-w-0`}><h3 className="break-words font-medium">{insight.nameA} ↔ {insight.nameB}</h3><p className="mt-2 text-xs text-zinc-500">Suggested relationship dynamic · {insight.confidence} confidence{insight.uncertainA || insight.uncertainB ? " · Uncertain parties" : ""}</p><p lang="my" className="mt-3 break-words text-sm leading-8 text-zinc-300">{insight.observation}</p><EvidenceDetails evidence={insight.evidence} /></article>)}</div></section>
    </> : <section className={panel}><p className="text-sm text-zinc-400">No recap yet. No mock story or character claims have been fabricated.</p></section>}
  </div>;
}
