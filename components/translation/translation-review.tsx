"use client";

import { controlClass, mediaFallbackClass } from "@/components/ui/styles";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Film, Languages, LoaderCircle, Pencil, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { cardClass, linkClass, StatusBadge } from "@/app/projects/[id]/overview-components";
import { durationLabel } from "@/app/projects/[id]/overview-model";
import { formatTimestamp } from "@/lib/format-timestamp";
import type { TranslationReview, ReviewRow, ReviewStatus } from "@/lib/translation-qc/types";
import SegmentEditor, { ReviewBadge, type Draft } from "./segment-editor";
import TranslationTools from "./translation-tools";
import { activeIssues, buttonClass, filters, matchesFilter, POLL_INTERVAL_MS, primaryClass, provenance, requestError, runningJob, SELECTION_LIMIT, workspaceStatus, type RowFilter, type TranslationJob, type WorkspaceSnapshot } from "./workspace-model";

type RefinementJob = { jobId: string; state: string } | null;
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(requestError(body.error?.code));
  return body.data as T;
}
function jobStatus(value: { state?: unknown; attemptsMade?: unknown } | null): TranslationJob {
  if (value === null) return null;
  if (!value || typeof value.state !== "string") throw new Error("Job status is unavailable. Refresh to try again.");
  return { state: value.state, attemptsMade: typeof value.attemptsMade === "number" ? value.attemptsMade : null };
}

export default function TranslationReviewPanel({ initialSnapshot, projectPath, projectSlug }: { initialSnapshot: WorkspaceSnapshot; projectPath: string; projectSlug: string }) {
  const router = useRouter();
  const [previousSnapshot, setPreviousSnapshot] = useState(initialSnapshot);
  const [review, setReview] = useState(initialSnapshot.review);
  const [job, setJob] = useState(initialSnapshot.job);
  const [selected, setSelected] = useState<number[]>([]);
  const [activeSequence, setActiveSequence] = useState<number | null>(initialSnapshot.review?.rows.find((row) => row.reviewStatus !== "APPROVED")?.sequence ?? initialSnapshot.review?.rows[0]?.sequence ?? null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RowFilter>("ALL");
  const [translationAcknowledged, setTranslationAcknowledged] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [mutating, setMutating] = useState(false);
  const actionLock = useRef(false);
  const [refinement, setRefinement] = useState<RefinementJob>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [rowFeedback, setRowFeedback] = useState<Record<number, string>>({});
  // Refresh current server evidence without discarding unsaved text or its original version token.
  if (previousSnapshot !== initialSnapshot) {
    setPreviousSnapshot(initialSnapshot); setReview(initialSnapshot.review); setJob(initialSnapshot.job); setPollError("");
    setSelected((current) => current.filter((sequence) => initialSnapshot.review?.rows.some((row) => row.sequence === sequence)));
    setActiveSequence((current) => initialSnapshot.review?.rows.some((row) => row.sequence === current) ? current : initialSnapshot.review?.rows[0]?.sequence ?? null);
  }
  const movie = initialSnapshot.movie;
  const baseApi = `/api/movies/${encodeURIComponent(movie.id)}`;
  const endpoint = `${baseApi}/translation`;
  const rows = review?.rows ?? [];
  const rowBySequence = new Map(rows.map((row) => [row.sequence, row]));
  const dirty = Object.entries(drafts).some(([sequence, draft]) => draft.text !== rowBySequence.get(Number(sequence))?.text);
  const selectedDirty = selected.some((sequence) => drafts[sequence] && drafts[sequence].text !== rowBySequence.get(sequence)?.text);
  const selectedManual = rows.some((row) => selected.includes(row.sequence) && row.origin === "MANUAL");
  const wholeMovie = selected.length > 1 && selected.length === rows.length;
  const translationRunning = runningJob(job);
  const refinementRunning = !!refinement && runningJob({ state: refinement.state, attemptsMade: null });
  const refinementJobId = refinement?.jobId;
  const busy = mutating || translationRunning || refinementRunning;
  const view = workspaceStatus(initialSnapshot, review, job);
  const activeRow = rowBySequence.get(activeSequence ?? -1) ?? null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if ((!translationRunning && !refinementRunning) || pollError) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const refining = refinementRunning && refinementJobId ? refinementJobId : null;
        const data = await request<{ state: string; attemptsMade?: number } | null>(refining ? `${endpoint}/refine?jobId=${encodeURIComponent(refining)}` : `${baseApi}/translate`, { signal: controller.signal });
        if (cancelled) return;
        const current = jobStatus(data);
        if (!refining) setJob(current);
        if (runningJob(current)) {
          if (refining) setRefinement({ jobId: refining, state: current!.state });
          timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
        else if (current?.state === "completed") {
          if (refining) {
            const latest = await request<TranslationReview>(`${endpoint}/qc`, { signal: controller.signal });
            if (cancelled) return;
            setReview(latest); setRefinement({ jobId: refining, state: "completed" }); setSelected([]); setAcknowledged(false); setMessage("Selected segments refined. Human review is still needed.");
          } else router.refresh();
        } else if (current?.state === "failed") {
          if (refining) setRefinement({ jobId: refining, state: "failed" });
          setError(refining ? "Refinement failed. Check the worker setup before retrying. Saved text remains available." : "Translation failed. Check the worker setup. Saved text remains available.");
        } else throw new Error("The retained job is unavailable. Refresh to check saved results.");
      } catch (failure) {
        if (!cancelled) { setPollError("Automatic status checks are paused. Refresh to check the current state."); setError(failure instanceof Error ? failure.message : "Status unavailable"); }
      }
    }
    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [translationRunning, refinementRunning, refinementJobId, baseApi, endpoint, pollError, router]);

  async function refresh() {
    if (actionLock.current) return;
    actionLock.current = true; setMutating(true); setError(""); setPollError("");
    try { if (review) setReview(await request<TranslationReview>(`${endpoint}/qc`)); router.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to refresh saved rows"); router.refresh(); }
    finally { actionLock.current = false; setMutating(false); }
  }
  async function mutate(row: ReviewRow, reviewStatus?: ReviewStatus) {
    const draft = drafts[row.sequence]; const changed = !!draft && draft.text !== row.text;
    if (actionLock.current || busy || (reviewStatus ? changed : !changed || !draft.text.trim() || draft.version !== row.version)) return;
    actionLock.current = true; setMutating(true); setSaving(row.sequence); setError(""); setMessage("");
    setRowFeedback((current) => ({ ...current, [row.sequence]: "Saving…" }));
    try {
      const body = reviewStatus ? { reviewStatus, version: row.version } : { text: draft.text, version: draft.version };
      setReview(await request<TranslationReview>(`${endpoint}/segments/${row.sequence}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setDrafts((current) => { const next = { ...current }; delete next[row.sequence]; return next; });
      setRowFeedback((current) => ({ ...current, [row.sequence]: reviewStatus ? "Review status saved" : "Saved · local QC refreshed" }));
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : "Save failed";
      setRowFeedback((current) => ({ ...current, [row.sequence]: `Error: ${detail}` })); setError(detail);
      // Preserve the draft and token so a stale write requires explicit comparison.
      try { setReview(await request<TranslationReview>(`${endpoint}/qc`)); } catch { /* Retain the last readable state. */ }
    } finally { setSaving(null); actionLock.current = false; setMutating(false); }
  }
  async function bulkReview(reviewStatus: ReviewStatus) {
    if (!review || actionLock.current || busy || !selected.length || selected.length > SELECTION_LIMIT || selectedDirty) return;
    actionLock.current = true; setMutating(true); setError(""); setMessage("");
    try {
      const versions = Object.fromEntries(rows.filter((row) => selected.includes(row.sequence)).map((row) => [row.sequence, row.version]));
      setReview(await request<TranslationReview>(`${endpoint}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequences: selected, reviewStatus, versions }) }));
      setMessage(`${selected.length} selected rows marked ${reviewStatus === "APPROVED" ? "Approved" : "Needs Review"}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Review failed");
      try { setReview(await request<TranslationReview>(`${endpoint}/qc`)); } catch { /* Retain last readable evidence. */ }
    } finally { actionLock.current = false; setMutating(false); }
  }
  async function scan() {
    if (actionLock.current || busy || !review) return;
    actionLock.current = true; setMutating(true); setError("");
    try { setReview(await request<TranslationReview>(`${endpoint}/qc`, { method: "POST" })); setMessage("Local QC completed. Findings are review signals, not proof of correctness."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "QC failed"); }
    finally { actionLock.current = false; setMutating(false); }
  }
  async function refine() {
    if (!review || actionLock.current || busy || dirty || !selected.length || selected.length > SELECTION_LIMIT || !acknowledged || selectedManual || wholeMovie) return;
    actionLock.current = true; setMutating(true); setError(""); setMessage("");
    try {
      const receipt = await request<NonNullable<RefinementJob>>(`${endpoint}/refine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequences: selected }) });
      if (!receipt || typeof receipt.jobId !== "string" || typeof receipt.state !== "string") throw new Error("Unable to read refinement status. Refresh saved results.");
      setRefinement(receipt); setAcknowledged(false);
      if (receipt.state === "completed") { setReview(await request<TranslationReview>(`${endpoint}/qc`)); setSelected([]); setMessage("The selected refinement is already complete. Human review is still needed."); }
      else if (receipt.state === "failed") setError("The retained refinement job failed. Check the worker setup before retrying.");
      else setMessage(`Refinement ${receipt.state}. Waiting for the configured worker.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Refinement failed"); }
    finally { actionLock.current = false; setMutating(false); }
  }
  async function startTranslation() {
    if (actionLock.current || busy || view.action !== "start" || !translationAcknowledged) return;
    actionLock.current = true; setMutating(true); setError(""); setMessage("");
    try {
      const receipt = await request<{ state: string }>(`${baseApi}/translate`, { method: "POST" });
      const current = jobStatus(receipt); setJob(current); setTranslationAcknowledged(false);
      setMessage(runningJob(current) ? "Translation requested. The configured worker will process the source transcript." : "The retained job has finished. Refreshing saved results.");
      if (!runningJob(current)) router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Translation could not start"); }
    finally { actionLock.current = false; setMutating(false); }
  }
  function selectEditor(sequence: number) {
    setActiveSequence(sequence);
    if (window.matchMedia("(max-width: 1279px)").matches) document.getElementById("segment-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("editor-heading")?.focus({ preventScroll: true });
  }
  function continueReview() {
    const row = rows.find((row) => row.reviewStatus !== "APPROVED" || activeIssues(row).length) ?? rows[0];
    if (row) setActiveSequence(row.sequence);
    document.getElementById("segment-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("editor-heading")?.focus({ preventScroll: true });
  }
  function toggle(sequence: number, checked: boolean) {
    setSelected((current) => checked ? current.includes(sequence) || current.length >= SELECTION_LIMIT ? current : [...current, sequence].sort((a, b) => a - b) : current.filter((item) => item !== sequence));
  }
  const sources = initialSnapshot.source?.rows ?? [];
  const targets = new Map((review?.rows ?? initialSnapshot.translation?.rows ?? []).map((row) => [row.sequence, row]));
  const visible = sources.filter((source) => {
    const target = targets.get(source.sequence); const row = rowBySequence.get(source.sequence);
    return `${row?.sourceText ?? source.text} ${drafts[source.sequence]?.text ?? target?.text ?? ""}`.toLowerCase().includes(search.toLowerCase()) && matchesFilter(row, filter);
  });

  const activeIndex = rows.findIndex((row) => row.sequence === activeSequence);
  const timingEnd = sources.reduce((end, row) => Math.max(end, row.endMs), Math.max(1, (movie.durationSeconds ?? 0) * 1000));
  function prepareRefinement(sequence?: number) {
    if (sequence !== undefined) { setSelected([sequence]); setAcknowledged(false); }
    document.getElementById("refinement-actions")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    document.getElementById("refinement-heading")?.focus({ preventScroll: true });
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">Translation</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Translate Chinese subtitles to Myanmar with AI and human review.</p></div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <section aria-label="Translation status" className={`${cardClass} min-w-0 px-3 py-2.5`}>
          <div className="flex flex-wrap items-center gap-3"><span role="status"><StatusBadge status={view.status} tone={view.tone} /></span><span className="text-xs tabular-nums text-zinc-300">{view.translated} / {view.sourceCount} segments</span></div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-label="Persisted source-aligned translations" aria-valuemin={0} aria-valuemax={view.sourceCount || 1} aria-valuenow={view.translated} aria-valuetext={`${view.translated} of ${view.sourceCount} source segments have saved translations`}><div className="h-full bg-violet-500" style={{ width: `${view.sourceCount ? view.translated / view.sourceCount * 100 : 0}%` }} /></div>
          <p className="mt-2 text-[11px] text-zinc-500">{review || !initialSnapshot.translation ? `${view.approved} approved` : "Approval unavailable"} · {view.issues === null ? "QC unavailable" : `${view.issues} unresolved QC`}</p>
        </section>
        {review && <button type="button" className={buttonClass} disabled={busy || dirty || !rows.some((row) => row.origin !== "MANUAL")} onClick={() => prepareRefinement()}><Sparkles size={15} aria-hidden="true" />Refine with AI</button>}
        {view.action === "transcript" ? <Link href={`${projectPath}/subtitles`} className={primaryClass}>{view.label}<ArrowRight size={16} aria-hidden="true" /></Link> : <button type="button" className={primaryClass} disabled={mutating || (view.action === "start" && !translationAcknowledged)} onClick={view.action === "start" ? () => void startTranslation() : view.action === "review" ? continueReview : () => void refresh()}>{mutating && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}{view.label}<ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
    </header>
    <p className="sr-only">{view.message}</p>
    {view.action === "start" && <div className={`${cardClass} p-3`}><p className="mb-2 text-xs text-violet-300">AI Action · OpenRouter · May incur usage cost</p><label className="flex items-start gap-2 text-xs leading-5 text-zinc-300"><input type="checkbox" checked={translationAcknowledged} disabled={busy} onChange={(event) => setTranslationAcknowledged(event.target.checked)} className="mt-1 accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-300" />I understand initial translation may make paid AI requests.</label></div>}
    {(translationRunning || refinementRunning) && !pollError && <p className="text-xs text-violet-300">Read-only job status checks every 5 seconds.</p>}
    {pollError && <p role="alert" className="text-xs text-amber-200">{pollError}</p>}
    {(message || error) && <div aria-live="polite" className="space-y-2">{message && <p className="text-xs leading-5 text-zinc-300">{message}</p>}{error && <p role="alert" className="text-xs leading-5 text-amber-200">{error}</p>}</div>}

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
      <div className="min-w-0 space-y-3">
        <section aria-label="Source media" className={`${cardClass} overflow-hidden`}>
          <div className={`${mediaFallbackClass} w-full bg-[#0b0e14]`}><span className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><Film size={28} className="text-zinc-500" aria-hidden="true" /></span><p className="text-sm text-zinc-300">Preview playback unavailable</p><p className="max-w-sm text-xs leading-5 text-zinc-500">Use the saved dialogue and timestamp strip below to review this movie.</p></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-3"><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-medium text-zinc-300">{movie.title}</h2><p className="mt-1 break-all text-[11px] text-zinc-500">{movie.filename ?? "No source filename"} · {durationLabel(movie.durationSeconds)}</p></div><Link href={`${projectPath}/subtitles`} className={linkClass}>Source transcript<ArrowRight size={13} aria-hidden="true" /></Link></div>
        </section>
        {!!sources.length && <section aria-label="Transcript timing strip" className={`${cardClass} p-3`}>
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-[11px] text-zinc-500"><span>Transcript timing · select a saved segment</span><span>{activeRow ? `Selected #${activeRow.sequence + 1} · ${formatTimestamp(activeRow.startMs)} → ${formatTimestamp(activeRow.endMs)}` : "Read-only source timings"}</span></div>
          <div className="relative h-7 rounded-md bg-white/[0.04]">{sources.map((source) => <button key={source.sequence} type="button" aria-label={`Timing segment ${source.sequence + 1}: ${formatTimestamp(source.startMs)} to ${formatTimestamp(source.endMs)}`} aria-pressed={activeSequence === source.sequence} disabled={!rowBySequence.has(source.sequence)} onClick={() => selectEditor(source.sequence)} className={`absolute inset-y-1 rounded-sm border border-[#111115] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-violet-200 disabled:cursor-default ${activeSequence === source.sequence ? "bg-violet-500 ring-1 ring-violet-300" : "bg-violet-400/25 hover:bg-violet-400/40"}`} style={{ left: `${source.startMs / timingEnd * 100}%`, width: `${(source.endMs - source.startMs) / timingEnd * 100}%` }} />)}</div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-zinc-500"><span>{formatTimestamp(0)}</span><span>{formatTimestamp(timingEnd)}</span></div>
        </section>}
        <section id="review" aria-labelledby="segments-heading" className={`${cardClass} scroll-mt-6 overflow-hidden`}>
          <h2 id="segments-heading" className="sr-only">Translation segments</h2>
          <div className="space-y-2 border-b border-white/10 p-2.5">
            <label className="relative block"><span className="sr-only">Search source or translation</span><Search size={14} aria-hidden="true" className="absolute left-3 top-3 text-zinc-500" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search segments…" className={`${controlClass} w-full pl-9 text-xs`} /></label>
            <div aria-label="Translation filters" className="flex flex-wrap gap-1">{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-8 rounded-md px-2 py-1.5 text-[11px] focus-visible:outline-2 focus-visible:outline-violet-300 ${filter === value ? "bg-violet-400/10 text-violet-300" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"}`}>{label} <span className="ml-1 tabular-nums text-zinc-500">{sources.filter((source) => matchesFilter(rowBySequence.get(source.sequence), value)).length}</span></button>)}</div>
            {review && !!selected.length && <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2"><span className="mr-auto text-[11px] text-zinc-500">{selected.length} / {SELECTION_LIMIT} selected · {visible.length} visible</span>{!!selected.length && <button type="button" disabled={busy} className={linkClass} onClick={() => setSelected([])}>Clear selection</button>}<button type="button" className={buttonClass} disabled={busy || !selected.length || selectedDirty} onClick={() => void bulkReview("APPROVED")}>Approve Selected</button><button type="button" className={buttonClass} disabled={busy || !selected.length || selectedDirty} onClick={() => void bulkReview("NEEDS_REVIEW")}>Mark Selected Needs Review</button></div>}
            {dirty && <p role="status" className="text-[11px] leading-5 text-amber-200">Unsaved drafts retained. Save or cancel changes before approving those rows.</p>}
          </div>
          {!sources.length ? <div className="p-6"><Languages size={24} className="text-zinc-500" aria-hidden="true" /><h3 className="mt-4 text-base font-semibold">No timed source dialogue</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Transcription is required before translation. Use Open Transcription above to prepare the source.</p></div> : !visible.length ? <div className="p-8 text-center"><p className="text-sm leading-6 text-zinc-400">No segments match this search or filter.</p><button type="button" className={`${linkClass} mt-3`} onClick={() => { setSearch(""); setFilter("ALL"); }}>Clear filters</button></div> : <table className="block w-full table-fixed sm:table">
            <colgroup className="hidden sm:table-column-group"><col className="w-[7%]" /><col className="w-[16%]" /><col className="w-[22%]" /><col className="w-[27%]" /><col className="w-[20%]" /><col className="w-[8%]" /></colgroup>
            <thead className="hidden sm:table-header-group"><tr className="text-left text-[11px] text-zinc-400">{["#", "Time", "Chinese (Source)", "Myanmar (Translation)", "Status", "Actions"].map((label) => <th key={label} scope="col" className="px-2 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody className="block sm:table-row-group">{visible.map((source) => {
              const row = rowBySequence.get(source.sequence); const target = targets.get(source.sequence); const draft = drafts[source.sequence];
              const rowDirty = !!draft && draft.text !== target?.text; const issues = row ? activeIssues(row) : [];
              return <tr key={source.sequence} aria-selected={activeSequence === source.sequence} className={`grid min-w-0 grid-cols-2 gap-2 border-t border-white/[0.06] p-3 text-xs sm:table-row sm:p-0 ${activeSequence === source.sequence ? "bg-violet-500/10 outline -outline-offset-1 outline-violet-500" : "hover:bg-white/[0.02]"}`}>
                <td className="flex items-center gap-2 sm:table-cell sm:px-2 sm:py-3 sm:align-top"><span className="tabular-nums text-zinc-400">{source.sequence + 1}</span>{row && <input type="checkbox" aria-label={`Select sequence ${row.sequence}`} checked={selected.includes(row.sequence)} disabled={busy || (!selected.includes(row.sequence) && selected.length >= SELECTION_LIMIT)} onChange={(event) => toggle(row.sequence, event.target.checked)} className="h-3.5 w-3.5 accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-300" />}</td>
                <td className="text-right font-mono text-[11px] leading-5 text-zinc-400 sm:px-2 sm:py-3 sm:text-left sm:align-top"><span>{formatTimestamp(source.startMs)}</span><span className="sm:block"> → {formatTimestamp(source.endMs)}</span></td>
                <td className="col-span-2 min-w-0 sm:px-2 sm:py-3 sm:align-top"><span className="mb-1 block text-[11px] text-zinc-500 sm:hidden">Chinese source</span><p lang={movie.sourceLanguage} className="line-clamp-2 whitespace-pre-wrap break-words leading-6 text-zinc-300 [overflow-wrap:anywhere]">{row?.sourceText ?? source.text}</p></td>
                <td className="col-span-2 min-w-0 sm:px-2 sm:py-3 sm:align-top"><span className="mb-1 block text-[11px] text-zinc-500 sm:hidden">Myanmar translation</span><p lang="my" className={`line-clamp-2 whitespace-pre-wrap break-words leading-7 [overflow-wrap:anywhere] ${target ? "text-zinc-200" : "text-zinc-500"}`}>{draft?.text ?? target?.text ?? "No saved translation."}</p>{rowDirty && <span className="text-[11px] text-amber-200">Unsaved draft</span>}</td>
                <td className="min-w-0 sm:px-2 sm:py-3 sm:align-top">{row && <><ReviewBadge status={row.reviewStatus} /><p className={`mt-1 text-[11px] ${row.origin === "REFINED" ? "text-violet-300" : "text-zinc-500"}`}>{provenance(row)}</p>{!!issues.length && <p className="mt-1 text-[11px] text-amber-200">{issues.length} QC findings</p>}</>}</td>
                <td className="text-right sm:px-2 sm:py-3 sm:align-top">{row && <button type="button" aria-label={`Edit segment ${row.sequence + 1}`} aria-pressed={activeSequence === row.sequence} className={`${buttonClass} px-2 ${activeSequence === row.sequence ? "border-violet-400/30 text-violet-300" : ""}`} onClick={() => selectEditor(row.sequence)}><Pencil size={14} aria-hidden="true" /></button>}</td>
              </tr>;
            })}</tbody>
          </table>}
        </section>
      </div>
      <aside aria-label="Selected segment and translation tools" className="min-w-0 space-y-3">
        <TranslationTools projectPath={projectPath} projectSlug={projectSlug} row={activeRow} sourceLanguage={movie.sourceLanguage} revision={review?.revision ?? 0} scanned={review?.qcScanned ?? false} />
        <SegmentEditor row={activeRow} draft={activeRow ? drafts[activeRow.sequence] : undefined} busy={busy} saving={saving === activeRow?.sequence} feedback={activeRow ? rowFeedback[activeRow.sequence] ?? "" : ""} sourceLanguage={movie.sourceLanguage} scanned={review?.qcScanned ?? false} refinementDisabled={busy || dirty} onRefine={() => { if (activeRow) prepareRefinement(activeRow.sequence); }}
          onDraft={(text) => { if (!activeRow) return; setDrafts((current) => ({ ...current, [activeRow.sequence]: { text, version: current[activeRow.sequence]?.version ?? activeRow.version } })); setRowFeedback((current) => ({ ...current, [activeRow.sequence]: "" })); }}
          onCancel={() => { if (activeRow) { setDrafts((current) => { const next = { ...current }; delete next[activeRow.sequence]; return next; }); setRowFeedback((current) => ({ ...current, [activeRow.sequence]: "Changes cancelled" })); } }}
          onKeep={() => { if (activeRow && drafts[activeRow.sequence]) setDrafts((current) => ({ ...current, [activeRow.sequence]: { ...current[activeRow.sequence], version: activeRow.version } })); }}
          onSave={() => { if (activeRow) void mutate(activeRow); }} onReview={(status) => { if (activeRow) void mutate(activeRow, status); }} />

        {activeRow && <section aria-label="Segment navigation" className={`${cardClass} p-3`}><div className="flex items-center justify-between gap-2"><button type="button" className={`${buttonClass} flex-1`} disabled={activeIndex <= 0} onClick={() => selectEditor(rows[activeIndex - 1].sequence)}><ChevronLeft size={14} aria-hidden="true" />Previous</button><button type="button" className={`${buttonClass} flex-1`} disabled={activeIndex < 0 || activeIndex >= rows.length - 1} onClick={() => selectEditor(rows[activeIndex + 1].sequence)}>Next<ChevronRight size={14} aria-hidden="true" /></button></div></section>}
        {review && <section id="refinement-actions" aria-labelledby="refinement-heading" className={`${cardClass} scroll-mt-6 p-4`}>
          <div className="flex items-center justify-between gap-2"><h2 id="refinement-heading" tabIndex={-1} className="rounded text-xs font-semibold focus-visible:outline-2 focus-visible:outline-violet-300">QC & selective refinement</h2><button type="button" onClick={() => void scan()} disabled={busy} className={linkClass}><ShieldCheck size={13} aria-hidden="true" />Run Local QC</button></div>
          <div className="mt-3 space-y-3 border-t border-white/10 pt-3"><p className="text-xs text-violet-300">AI Action · OpenRouter</p><p className="text-[11px] leading-5 text-zinc-500">GPT-6 Sol · May incur usage cost. Maximum {SELECTION_LIMIT} rows; human edits protected.</p><label className="flex items-start gap-2 text-xs leading-5 text-zinc-300"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} className="mt-1 accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-300" />I understand that refining selected rows makes a paid AI request.</label><button type="button" onClick={() => void refine()} disabled={busy || dirty || !selected.length || !acknowledged || selectedManual || wholeMovie} className={`${buttonClass} w-full border-violet-400/20 text-violet-300`}><Sparkles size={15} aria-hidden="true" />Refine Selected with GPT-6 Sol ({selected.length})</button>{activeRow && activeRow.origin !== "MANUAL" && <button type="button" className={`${linkClass} text-[11px]`} disabled={busy || dirty} onClick={() => prepareRefinement(activeRow.sequence)}>Select current segment for AI refinement</button>}{selectedManual && <p className="text-xs leading-5 text-amber-200">Selection includes human-edited rows. Remove them to enable refinement.</p>}{wholeMovie && <p className="text-xs leading-5 text-amber-200">Whole-movie refinement is disabled. Select a smaller subset.</p>}{dirty && <p className="text-xs leading-5 text-amber-200">Save or cancel all drafts before requesting refinement.</p>}{refinement && <p role="status" className="text-xs text-zinc-400">Refinement job · {refinement.state}</p>}</div>
        </section>}
        <details className={`${cardClass} p-4 text-xs text-zinc-500`}><summary className="cursor-pointer rounded text-xs font-medium text-zinc-300 focus-visible:outline-2 focus-visible:outline-violet-300">Saved translation details</summary><div className="mt-3 space-y-2"><p>{view.message}</p><button type="button" onClick={() => void refresh()} disabled={mutating} className={linkClass}><RefreshCw size={12} aria-hidden="true" />{mutating ? "Working…" : "Refresh"}</button><p>Translation job · {initialSnapshot.jobAvailable ? job?.state ?? "Not started" : "Status unavailable"}</p>{job?.attemptsMade != null && <p>Recorded attempts · {job.attemptsMade}</p>}{initialSnapshot.translation && <><p className="break-all">Provider · {initialSnapshot.translation.provider}</p><p className="break-all">Model · {initialSnapshot.translation.model}</p><p>Stored target rows · {review?.rows.length ?? initialSnapshot.translation.rows.length}</p><p>Individual rows may have different provenance.</p></>}{review && <p>Current translation revision · {review.revision}</p>}</div></details>
      </aside>
    </div>
  </div>;
}
