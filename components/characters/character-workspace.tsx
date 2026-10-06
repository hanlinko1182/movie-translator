"use client";

import { useEffect, useState } from "react";
import type { CharacterRead } from "@/lib/character-analysis/read-analysis";
import type { CharacterJobStatus } from "@/lib/queue/character-queue";

const panel = "rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
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
    <p className="text-xs text-zinc-500">{row.type?.replaceAll("_", " ")} · {row.confidence} interpretation confidence</p>
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

export default function CharacterWorkspace({ movieId, initial, model, canAnalyze, unavailableReason }: { movieId: string; initial: CharacterRead; model: string | null; canAnalyze: boolean; unavailableReason: string | null }) {
  const [data, setData] = useState(initial);
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
  return <div className="space-y-5">
    <section className={panel} aria-labelledby="analysis-heading">
      <h2 id="analysis-heading" className="font-medium">Evidence → inference → confidence</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Analysis uses scene intervals and subtitle text only. There is no reliable speaker diarization: a candidate is not a confirmed speaker or identity. Generic speakers stay scoped to their scene. No face or voice identification is performed.</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">HIGH: strong explicit textual evidence. MEDIUM: contextual inference. LOW: ambiguous evidence. These labels describe interpretation confidence, not accuracy or truth probability.</p>
      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        <p className="break-words text-xs text-zinc-400">Paid AI action · OpenRouter · {model ?? "Model not configured"}. Cost depends on text length and provider usage. Unchanged source reuses its retained completed job.</p>
        {unavailableReason && <p className="text-sm text-amber-200">{unavailableReason}</p>}
        <label className="flex items-start gap-3 text-sm text-zinc-300"><input type="checkbox" className={`mt-1 accent-zinc-300 ${focus}`} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy || !canAnalyze || !model} /><span>I understand character analysis may incur an AI charge.</span></label>
        <button type="button" className={`rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 ${focus}`} disabled={!acknowledged || busy || !canAnalyze || !model} onClick={() => void analyze()}>{busy ? "Analysis in progress…" : data.analysis ? "Re-run character analysis" : "Analyze characters"}</button>
        <p role="status" aria-live="polite" className="text-xs text-zinc-400">{job ? `Job ${job.state} · ${job.attemptsMade} attempts completed${job.state === "completed" ? " · Current source job reused on repeated requests" : ""}` : "Analysis runs only after an explicit request."}</p>
        {job?.state === "failed" && <p role="alert" className="text-sm text-amber-200">{job.error}</p>}
        {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
      </div>
    </section>
    {data.analysis ? <section className={panel} aria-label="Analysis provenance">
      <p className="break-words text-sm text-zinc-300">{data.analysis.provider} · {data.analysis.model} · {data.analysis.sceneCount} scenes · {(data.analysis.runtimeMs / 1000).toFixed(2)}s model runtime · {data.analysis.modelCalls} model requests</p>
      <p className="mt-2 text-xs text-zinc-500">{data.characters.length} character candidates · {data.relationships.length} suggested relationships · Updated {data.analysis.updatedAt}</p>
      {data.analysis.usage && <p className="mt-2 text-xs text-zinc-500">Tokens: {data.analysis.usage.totalTokens ?? "not reported"} · Cost: {data.analysis.usage.costUsd === undefined ? "not reported" : `$${data.analysis.usage.costUsd.toFixed(6)}`}</p>}
      {data.analysis.stale && <p role="status" className="mt-3 text-sm text-amber-200">Source changed since this analysis. These observations may be stale; request analysis for the current source.</p>}
    </section> : <section className={panel}><p className="text-sm text-zinc-400">No character analysis yet. No candidates or relationships have been fabricated.</p></section>}
    <section aria-labelledby="candidates-heading"><h2 id="candidates-heading" className="mb-3 font-medium">Character candidates</h2>
      {!!data.analysis && !data.characters.length && <p className="text-sm text-zinc-400">No supported candidates were returned for this text.</p>}
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">{data.characters.map((character) => <article key={character.id} className={`${panel} min-w-0`}>
        <h3 className="break-words font-semibold">{character.name}</h3>
        <p className="mt-1 text-xs text-zinc-500">{character.uncertain ? "Uncertain identity · Scene-scoped placeholder" : "Text-supported name candidate"} · {character.evidence.length} evidence anchors</p>
        {!!character.aliases.length && <p className="mt-2 break-words text-xs text-zinc-400">Aliases: {character.aliases.join(" · ")}</p>}
        <div className="mt-4 space-y-3">{character.evidence.map((row) => <EvidenceDetails key={row.id} row={row} />)}</div>
      </article>)}</div>
    </section>
    <section aria-labelledby="relationships-heading"><h2 id="relationships-heading" className="mb-3 font-medium">Suggested relationships</h2><p className="mb-3 text-xs leading-5 text-zinc-500">Inferred from dialogue evidence. Connections are interpretations and should be reviewed against the source.</p>
      {!data.relationships.length && <p className="text-sm text-zinc-400">No supported relationships recorded.</p>}
      <div className="grid gap-4 xl:grid-cols-2">{data.relationships.map((relationship) => <article className={`${panel} min-w-0`} key={relationship.id}>
        <h3 className="break-words font-medium">{relationship.characterA.name} ↔ {relationship.characterB.name}</h3>
        <p className="mt-2 text-xs text-zinc-500">Suggested {relationship.type.toLowerCase()} · {relationship.confidence} interpretation confidence</p>
        <p className="mt-3 break-words text-sm leading-6 text-zinc-300">{relationship.summary}</p>
        <div className="mt-4 space-y-3">{relationship.evidence.map((row) => <EvidenceDetails row={row} key={row.id} />)}</div>
      </article>)}</div>
    </section>
  </div>;
}
