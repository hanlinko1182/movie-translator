"use client";
import { useEffect, useState } from "react";
import { Search, ShieldCheck, Sparkles } from "lucide-react";
import { formatTimestamp } from "@/lib/format-timestamp";
import type { TranslationReview } from "@/lib/translation-qc/types";

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40";
export default function TranslationReviewPanel({ initialReview }: { initialReview: TranslationReview }) {
  const [review, setReview] = useState(initialReview);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const endpoint = `/api/movies/${encodeURIComponent(review.movieId)}/translation`;
  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options); const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Translation review request failed");
    return body.data;
  }
  async function scan() {
    setBusy(true); setError("");
    try { setReview(await request(`${endpoint}/qc`, { method: "POST" })); setMessage("Local QC completed. Findings are review signals, not proof of correctness."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "QC failed"); }
    finally { setBusy(false); }
  }
  async function refine() {
    setBusy(true); setError(""); setMessage("");
    try {
      const job = await request(`${endpoint}/refine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequences: selected }) });
      setJobId(job.jobId); setMessage(`Refinement ${job.state}. Waiting for the refinement worker.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Refinement failed"); setBusy(false); }
  }
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`${endpoint}/refine?jobId=${encodeURIComponent(jobId!)}`);
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Refinement job unavailable");
        if (cancelled) return;
        if (body.data.state === "completed") {
          const latest = await fetch(`${endpoint}/qc`); const payload = await latest.json();
          if (!latest.ok) throw new Error(payload.error?.message ?? "Unable to refresh translation");
          if (cancelled) return;
          setReview(payload.data); setSelected([]); setAcknowledged(false); setMessage("Selected segments refined. Human review is still needed."); setJobId(null); setBusy(false); return;
        }
        if (body.data.state === "failed") throw new Error("Refinement job failed. Review configuration or worker logs before retrying.");
        setMessage(`Refinement ${body.data.state}.`); timer = setTimeout(() => void poll(), 2_000);
      } catch (failure) { if (!cancelled) { setError(failure instanceof Error ? failure.message : "Status unavailable"); setBusy(false); setJobId(null); } }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [jobId, endpoint]);
  const rows = review.rows.filter((row) => `${row.sourceText} ${row.text}`.toLowerCase().includes(search.toLowerCase()) && (filter === "ALL" || row.issues.some((issue) => !issue.resolvedAt)));
  return <div className="space-y-5">
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-zinc-200">{review.rows.length} segments · {review.qcScanned ? `${review.summary.flaggedSegments} need review · ${review.summary.issueCount} findings` : "Local QC not run yet"}</p><p className="mt-1 text-xs text-zinc-500">Heuristics can miss problems or flag intentional dialogue. No automatic quality approval.</p></div><button type="button" onClick={() => void scan()} disabled={busy} className={buttonClass}><ShieldCheck size={16} />Run QC</button></div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4"><label className="flex items-start gap-2 text-xs leading-5 text-zinc-400"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} className="mt-1 accent-zinc-200" />I understand that refining selected rows makes a paid AI request.</label><button type="button" onClick={() => void refine()} disabled={busy || !selected.length || !acknowledged} className={buttonClass}><Sparkles size={16} />Refine selected with GPT-6 Sol ({selected.length})</button></div>
      <p className="text-xs text-zinc-500">Select up to 24 rows. Whole-movie refinement is disabled. GPT-6 Luna remains the normal translation model.</p>
    </section>
    <div aria-live="polite">{message && <p className="text-sm text-zinc-300">{message}</p>}{error && <p role="alert" className="text-sm text-amber-200">{error}</p>}</div>
    <div className="flex flex-wrap gap-3"><label className="relative min-w-0 flex-1"><span className="sr-only">Search source or translation</span><Search size={15} className="absolute left-3 top-3 text-zinc-500" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dialogue..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm focus:outline-white" /></label><label><span className="sr-only">QC filter</span><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/10 bg-[#111114] px-3 py-2.5 text-sm"><option value="ALL">All rows</option><option value="FLAGGED">Needs review</option></select></label></div>
    {!rows.length && <p className="p-6 text-sm text-zinc-500">No rows match this search.</p>}
    {rows.map((row) => {
      const activeIssues = row.issues.filter((issue) => !issue.resolvedAt);
      const status = activeIssues.length ? "Needs review" : row.origin === "REFINED" ? "Refined" : review.qcScanned ? "No local findings" : "Not checked";
      const provenance = row.origin === "TRANSLATION_MEMORY" ? "Translation Memory" : row.origin === "REFINED" ? `${row.model ?? "Model"} refined` : row.model ?? "Unknown legacy origin";
      return <article key={row.id} className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-3 text-xs text-zinc-400"><input type="checkbox" aria-label={`Select sequence ${row.sequence}`} checked={selected.includes(row.sequence)} disabled={busy || (!selected.includes(row.sequence) && selected.length >= 24)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.sequence].sort((a, b) => a - b) : current.filter((sequence) => sequence !== row.sequence))} className="accent-zinc-200" /><span>Sequence {row.sequence} · {formatTimestamp(row.startMs)} → {formatTimestamp(row.endMs)}</span></label><span className={`rounded-lg border border-white/10 px-2 py-1 text-xs ${activeIssues.length ? "text-amber-200" : "text-zinc-400"}`}>{status}</span></div>
        <div className="grid gap-5 lg:grid-cols-2"><div><p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-600">Source</p><p lang={review.sourceLanguage} className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200">{row.sourceText}</p></div><div><p className="mb-2 break-words text-[11px] text-zinc-500">{provenance}</p><p lang={review.targetLanguage} className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{row.text}</p></div></div>
        {!!activeIssues.length && <ul className="space-y-2 border-t border-white/10 pt-3 text-xs leading-5 text-amber-100/80">{activeIssues.map((issue) => <li key={issue.id}><span className="font-medium">{issue.category.replaceAll("_", " ")} · {issue.severity}</span><p>{issue.message}</p></li>)}</ul>}
        {row.issues.some((issue) => issue.resolvedAt) && <details className="text-xs text-zinc-500"><summary className="cursor-pointer">Previous findings</summary>{row.issues.filter((issue) => issue.resolvedAt).map((issue) => <p key={issue.id} className="mt-2 break-words">{issue.category}: {issue.resolution}</p>)}</details>}
      </article>;
    })}
  </div>;
}
