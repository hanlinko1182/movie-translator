"use client";

import { controlClass, mediaFallbackClass } from "@/components/ui/styles";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, CircleAlert, Film, Flag, Pencil, Search } from "lucide-react";
import type { ReviewRow, ReviewStatus, TranslationReview } from "@/lib/translation-qc/types";
import { formatTimestamp } from "@/lib/format-timestamp";
import { cardClass, linkClass } from "@/app/projects/[id]/overview-components";
import { durationLabel } from "@/app/projects/[id]/overview-model";
import { ReviewBadge } from "./segment-editor";
import { activeIssues, buttonClass, primaryClass, provenance, requestError, SELECTION_LIMIT, type WorkspaceSnapshot } from "./workspace-model";

type Filter = "ALL" | "NEEDS_REVIEW" | "UNREVIEWED" | "APPROVED" | "QC" | "MANUAL" | "REFINED";
const filterItems: [Filter, string][] = [["ALL", "All"], ["NEEDS_REVIEW", "Needs Review"], ["UNREVIEWED", "Unreviewed"], ["APPROVED", "Approved"], ["QC", "QC Issues"], ["MANUAL", "Manual Edits"], ["REFINED", "Refined"]];

export default function ReviewWorkspace({ initialSnapshot, projectPath, exportTargetMovie }: { initialSnapshot: WorkspaceSnapshot | null; projectPath: string; exportTargetMovie: { id: string; title: string } | null }) {
  const router = useRouter();
  const initialRows = initialSnapshot?.review?.rows ?? [];
  const initialFilter: Filter = initialRows.some((row) => row.reviewStatus === "NEEDS_REVIEW") ? "NEEDS_REVIEW" : initialRows.some((row) => row.reviewStatus === "UNREVIEWED") ? "UNREVIEWED" : "ALL";
  const [review, setReview] = useState<TranslationReview | null>(initialSnapshot?.review ?? null);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState("");
  const [activeSequence, setActiveSequence] = useState<number | null>(initialRows.find((row) => row.reviewStatus === "NEEDS_REVIEW")?.sequence ?? initialRows.find((row) => row.reviewStatus === "UNREVIEWED")?.sequence ?? initialRows[0]?.sequence ?? null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const snapshot = initialSnapshot;
  const rows = review?.rows ?? [];
  const activeRow = rows.find((row) => row.sequence === activeSequence) ?? null;
  const needsReview = rows.filter((row) => row.reviewStatus === "NEEDS_REVIEW").length;
  const unreviewed = rows.filter((row) => row.reviewStatus === "UNREVIEWED").length;
  const approved = rows.filter((row) => row.reviewStatus === "APPROVED").length;
  const issueCount = rows.reduce((count, row) => count + activeIssues(row).length, 0);
  const translated = !!snapshot?.translation;
  const hasTranscript = !!snapshot?.source?.rows.length;
  const fullyApproved = rows.length > 0 && approved === rows.length;
  const totalNeedingApproval = needsReview + unreviewed;
  const movie = snapshot?.movie;
  const exportMatchesMovie = !!movie && exportTargetMovie?.id === movie.id;
  const movieQuery = movie ? `?movieId=${encodeURIComponent(movie.id)}` : "";
  const exportHref = `${projectPath}/export`;
  const nextReviewRow = rows.find((row) => row.reviewStatus === "NEEDS_REVIEW") ?? rows.find((row) => row.reviewStatus === "UNREVIEWED") ?? null;
  const nextNeedsReview = rows.find((row) => row.reviewStatus === "NEEDS_REVIEW" && row.sequence > (activeSequence ?? -1)) ?? rows.find((row) => row.reviewStatus === "NEEDS_REVIEW") ?? null;

  const visibleRows = rows.filter((row) => {
    const matches = `${row.sourceText} ${row.text}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    const state = filter === "ALL" || filter === "QC" ? true : filter === "MANUAL" ? row.origin === "MANUAL" : filter === "REFINED" ? row.origin === "REFINED" : row.reviewStatus === filter;
    return matches && state && (filter !== "QC" || activeIssues(row).length > 0);
  });
  const filterCount = (value: Filter) => rows.filter((row) => value === "ALL" ? true : value === "QC" ? activeIssues(row).length > 0 : value === "MANUAL" ? row.origin === "MANUAL" : value === "REFINED" ? row.origin === "REFINED" : row.reviewStatus === value).length;

  function selectRow(sequence: number) {
    setActiveSequence(sequence);
    if (window.matchMedia("(max-width: 1279px)").matches) document.getElementById("review-inspector")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("review-inspector-heading")?.focus({ preventScroll: true });
  }

  async function updateReview(row: ReviewRow, reviewStatus: ReviewStatus) {
    if (actionLock.current || busy || row.reviewStatus === reviewStatus) return;
    actionLock.current = true; setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch(`/api/movies/${encodeURIComponent(snapshot!.movie.id)}/translation/segments/${row.sequence}`, {
        method: "PATCH", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus, version: row.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(requestError(body.error?.code));
      setReview(body.data as TranslationReview);
      setFeedback(reviewStatus === "APPROVED" ? `Segment ${row.sequence + 1} approved.` : `Segment ${row.sequence + 1} marked Needs Review.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Review update failed. Refresh and try again.");
      try {
        const response = await fetch(`/api/movies/${encodeURIComponent(snapshot!.movie.id)}/translation/qc`, { cache: "no-store" });
        const body = await response.json();
        if (response.ok) setReview(body.data as TranslationReview);
      } catch { /* Keep the last readable review snapshot. */ }
    } finally { actionLock.current = false; setBusy(false); }
  }

  async function updateSelected(reviewStatus: ReviewStatus) {
    if (!review || actionLock.current || busy || !selected.length || selected.length > SELECTION_LIMIT) return;
    actionLock.current = true; setBusy(true); setError(""); setFeedback("");
    try {
      const versions = Object.fromEntries(rows.filter((row) => selected.includes(row.sequence)).map((row) => [row.sequence, row.version]));
      const response = await fetch(`/api/movies/${encodeURIComponent(snapshot!.movie.id)}/translation/review`, {
        method: "PATCH", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequences: selected, reviewStatus, versions }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(requestError(body.error?.code));
      setReview(body.data as TranslationReview);
      setFeedback(`${selected.length} selected segments marked ${reviewStatus === "APPROVED" ? "Approved" : "Needs Review"}.`);
      setSelected([]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Bulk review failed. Refresh and try again.");
      try {
        const response = await fetch(`/api/movies/${encodeURIComponent(snapshot!.movie.id)}/translation/qc`, { cache: "no-store" });
        const body = await response.json();
        if (response.ok) setReview(body.data as TranslationReview);
      } catch { /* Keep the last readable review snapshot. */ }
    } finally { actionLock.current = false; setBusy(false); }
  }

  function toggle(sequence: number, checked: boolean) {
    setSelected((current) => checked
      ? current.includes(sequence) || current.length >= SELECTION_LIMIT ? current : [...current, sequence].sort((a, b) => a - b)
      : current.filter((item) => item !== sequence));
  }

  const primary = !snapshot || !hasTranscript || !translated
    ? { label: !hasTranscript ? "Open Transcription" : "Open Translation", href: !hasTranscript ? `${projectPath}/subtitles` : `${projectPath}/translation${movieQuery}` as string }
    : snapshot.reviewUnavailable || !review
      ? { label: "Refresh Review", href: null }
      : !rows.length
        ? { label: "Open Translation", href: `${projectPath}/translation${movieQuery}` as string }
        : fullyApproved
          ? { label: exportMatchesMovie ? "Continue to Export" : "Open Project Export", href: exportHref }
          : { label: "Review Next Item", href: null };

  function handlePrimary() {
    if (primary.label === "Refresh Review") { router.refresh(); return; }
    if (!primary.href && nextReviewRow) selectRow(nextReviewRow.sequence);
  }

  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <p className="max-w-xl text-sm text-zinc-400">{primary.label === "Review Next Item" ? "Review saved Myanmar dialogue and confirm each segment before approved-only export." : !hasTranscript ? "Transcription is required before review." : !translated ? "Generate the Myanmar translation before reviewing subtitle segments." : fullyApproved ? "All current subtitle segments are approved." : "Review the next translated subtitle segment."}</p>
      <div className="flex flex-wrap items-center gap-2">
        {!!rows.length && <div aria-label="Review status summary" className={`${cardClass} grid grid-cols-3 gap-2 px-3 py-2 text-center`}><div><p className="text-[11px] text-zinc-500">Approved</p><p className="text-xs font-semibold text-emerald-300">{approved}<span className="font-normal text-zinc-500"> / {rows.length}</span></p></div><div><p className="text-[11px] text-zinc-500">Needs Review</p><p className="text-xs font-semibold text-amber-200">{needsReview}</p></div><div><p className="text-[11px] text-zinc-500">Unreviewed</p><p className="text-xs font-semibold text-zinc-300">{unreviewed}</p></div></div>}
        {primary.href ? <Link href={primary.href} className={primaryClass}>{primary.label}<ArrowRight size={15} aria-hidden="true" /></Link> : <button type="button" className={primaryClass} onClick={handlePrimary}>{primary.label}<ArrowRight size={15} aria-hidden="true" /></button>}
      </div>
    </header>

    {!snapshot ? <section className={`${cardClass} p-5`}><h2 className="text-sm font-semibold">No movie uploaded</h2><p className="mt-2 text-sm text-zinc-400">Transcription is required before review.</p><Link href={`${projectPath}/subtitles`} className={`${linkClass} mt-4`}>Open Transcription<ArrowRight size={13} aria-hidden="true" /></Link></section> : <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
      <div className="min-w-0 space-y-3">
        <section aria-label="Source media" className={`${cardClass} overflow-hidden`}>
          <div className={`${mediaFallbackClass} w-full bg-[#0b0e14]`}><Film size={28} className="text-zinc-500" aria-hidden="true" /><p className="text-sm text-zinc-300">Preview playback unavailable</p><p className="max-w-sm text-xs leading-5 text-zinc-500">Review saved subtitle dialogue and timestamps below.</p></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-3"><div className="min-w-0"><h2 className="break-words text-sm font-medium text-zinc-300">{snapshot.movie.title}</h2><p className="mt-1 break-all text-[11px] text-zinc-500">{snapshot.movie.filename ?? "No source filename"} · {durationLabel(snapshot.movie.durationSeconds)}</p></div>{translated && <Link href={`${projectPath}/translation${movieQuery}`} className={linkClass}>Open in Translation<Pencil size={12} aria-hidden="true" /></Link>}</div>
        </section>

        {translated && <section aria-labelledby="readiness-heading" className={`${cardClass} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="readiness-heading" className="text-sm font-semibold">Review progress</h2><p className="mt-1 text-xs text-zinc-400">{approved} / {rows.length} translated segments explicitly approved</p></div><span role="status" className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${fullyApproved && exportMatchesMovie ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>{fullyApproved ? exportMatchesMovie ? "Ready for approved-only export" : "Review complete · export targets another movie" : "Needs Attention"}</span></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-label="Human subtitle approval progress" aria-valuemin={0} aria-valuemax={Math.max(rows.length, 1)} aria-valuenow={approved} aria-valuetext={`${approved} of ${rows.length} translated subtitle segments approved by a human`}><div className="h-full bg-emerald-500" style={{ width: `${rows.length ? approved / rows.length * 100 : 0}%` }} /></div>
          <p className="mt-2 text-[11px] leading-5 text-zinc-500">{totalNeedingApproval ? `${totalNeedingApproval} segments still require explicit review.` : "Every current translated segment has explicit human approval."} {issueCount ? `${issueCount} unresolved QC findings remain visible for inspection; QC does not change approval automatically.` : "No unresolved QC findings."}</p>
        </section>}

        {translated ? <section id="review" aria-labelledby="review-table-heading" className={`${cardClass} scroll-mt-4 overflow-hidden`}>
          <h2 id="review-table-heading" className="sr-only">Subtitle review segments</h2>
          <div className="space-y-2 border-b border-white/10 p-2.5">
            <label className="relative block"><span className="sr-only">Search Chinese or Myanmar subtitles</span><Search size={14} aria-hidden="true" className="absolute left-3 top-3 text-zinc-500" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subtitles…" className={`${controlClass} w-full pl-9 text-xs`} /></label>
            <div aria-label="Review filters" className="flex flex-wrap gap-1">{filterItems.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-8 rounded-md px-2 py-1.5 text-[11px] focus-visible:outline-2 focus-visible:outline-violet-300 ${filter === value ? "bg-violet-400/10 text-violet-300" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"}`}>{label}<span className="ml-1 tabular-nums text-zinc-500">{filterCount(value)}</span></button>)}</div>
            {!!selected.length && <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2"><span className="mr-auto text-[11px] text-zinc-500">{selected.length} / {SELECTION_LIMIT} selected</span><button type="button" className={linkClass} disabled={busy} onClick={() => setSelected([])}>Clear selection</button><button type="button" className={buttonClass} disabled={busy || !selected.length || selected.length > SELECTION_LIMIT} onClick={() => void updateSelected("APPROVED")}>Approve Selected</button><button type="button" className={buttonClass} disabled={busy || !selected.length || selected.length > SELECTION_LIMIT} onClick={() => void updateSelected("NEEDS_REVIEW")}>Mark Selected Needs Review</button></div>}
            {selected.length === SELECTION_LIMIT && <p role="status" className="text-[11px] text-amber-200">Bulk review is limited to {SELECTION_LIMIT} rows per request.</p>}
          </div>
          {!visibleRows.length ? <div className="p-8 text-center"><p className="text-sm leading-6 text-zinc-400">No segments match this search or filter.</p><button type="button" className={`${linkClass} mt-3`} onClick={() => { setSearch(""); setFilter("ALL"); }}>Clear filters</button></div> : <table className="block w-full table-fixed sm:table">
            <colgroup className="hidden sm:table-column-group"><col className="w-[6%]" /><col className="w-[14%]" /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[8%]" /></colgroup>
            <thead className="hidden sm:table-header-group"><tr className="text-left text-[11px] text-zinc-400">{["#", "Time", "Chinese Source", "Myanmar Translation", "Review Status", "QC", "Actions"].map((label) => <th key={label} scope="col" className="px-2 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody className="block sm:table-row-group">{visibleRows.map((row) => {
              const issues = activeIssues(row);
              return <tr key={row.id} aria-selected={activeSequence === row.sequence} className={`grid min-w-0 grid-cols-2 gap-2 border-t border-white/[0.06] p-3 text-xs sm:table-row sm:p-0 ${activeSequence === row.sequence ? "bg-violet-500/10 outline -outline-offset-1 outline-violet-500" : "hover:bg-white/[0.02]"}`}>
                <td className="flex items-center gap-2 sm:table-cell sm:px-2 sm:py-3 sm:align-top"><span className="tabular-nums text-zinc-400">{row.sequence + 1}</span><input type="checkbox" aria-label={`Select segment ${row.sequence + 1}`} checked={selected.includes(row.sequence)} disabled={busy || (!selected.includes(row.sequence) && selected.length >= SELECTION_LIMIT)} onChange={(event) => toggle(row.sequence, event.target.checked)} className="h-3.5 w-3.5 accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-300" /></td>
                <td className="text-right font-mono text-[11px] leading-5 text-zinc-400 sm:px-2 sm:py-3 sm:text-left sm:align-top"><span>{formatTimestamp(row.startMs)}</span><span className="sm:block"> → {formatTimestamp(row.endMs)}</span></td>
                <td className="col-span-2 min-w-0 sm:px-2 sm:py-3 sm:align-top"><span className="mb-1 block text-[11px] text-zinc-500 sm:hidden">Chinese source</span><p lang={review?.sourceLanguage} className="line-clamp-2 whitespace-pre-wrap break-words leading-6 text-zinc-300 [overflow-wrap:anywhere]">{row.sourceText}</p></td>
                <td className="col-span-2 min-w-0 sm:px-2 sm:py-3 sm:align-top"><span className="mb-1 block text-[11px] text-zinc-500 sm:hidden">Myanmar translation</span><p lang="my" className="line-clamp-2 whitespace-pre-wrap break-words leading-7 text-zinc-200 [overflow-wrap:anywhere]">{row.text}</p><p className={`mt-1 text-[11px] ${row.origin === "REFINED" ? "text-violet-300" : "text-zinc-500"}`}>{provenance(row)}</p></td>
                <td className="min-w-0 sm:px-2 sm:py-3 sm:align-top"><span className="mb-1 block text-[11px] text-zinc-500 sm:hidden">Review status</span><ReviewBadge status={row.reviewStatus} /></td>
                <td className="sm:px-2 sm:py-3 sm:align-top">{issues.length ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-200"><CircleAlert size={12} aria-hidden="true" />{issues.length}</span> : <span className="text-[11px] text-zinc-500">—</span>}</td>
                <td className="text-right sm:px-2 sm:py-3 sm:align-top"><button type="button" aria-label={`Inspect segment ${row.sequence + 1}`} aria-pressed={activeSequence === row.sequence} className={`${buttonClass} px-2`} onClick={() => selectRow(row.sequence)}><Pencil size={13} aria-hidden="true" /><span className="sm:sr-only">Inspect</span></button></td>
              </tr>;
            })}</tbody>
          </table>}
        </section> : <section className={`${cardClass} p-5 sm:p-6`}><h2 className="text-sm font-semibold">{!hasTranscript ? "Transcription is required before review." : "Generate the Myanmar translation before review."}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{!hasTranscript ? "Prepare timed Chinese dialogue before you review translated subtitle segments." : "Review uses persisted translation and human review states. It does not start translation or AI jobs."}</p><Link href={!hasTranscript ? `${projectPath}/subtitles` : `${projectPath}/translation${movieQuery}`} className={`${linkClass} mt-4`}>{!hasTranscript ? "Open Transcription" : "Open Translation"}<ArrowRight size={13} aria-hidden="true" /></Link></section>}
      </div>

      <aside className="min-w-0 space-y-3">
        <section id="review-inspector" aria-labelledby="review-inspector-heading" className={`${cardClass} scroll-mt-4 p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="review-inspector-heading" tabIndex={-1} className="rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-violet-300">Selected segment</h2>{activeRow && <ReviewBadge status={activeRow.reviewStatus} />}</div>
          {!translated ? <p className="mt-3 text-xs leading-5 text-zinc-500">A saved translation is required before a subtitle segment can be reviewed.</p> : !activeRow ? <p className="mt-3 text-xs leading-5 text-zinc-500">Select a translated row to inspect its source, target, and QC findings.</p> : <div className="mt-3 space-y-3">
            <p className="text-[11px] text-zinc-500">Segment #{activeRow.sequence + 1} · {formatTimestamp(activeRow.startMs)} → {formatTimestamp(activeRow.endMs)}</p>
            <div><h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Chinese source · read only</h3><p lang={review?.sourceLanguage} className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-zinc-300 [overflow-wrap:anywhere]">{activeRow.sourceText}</p></div>
            <div><h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Myanmar translation</h3><p lang="my" className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200 [overflow-wrap:anywhere]">{activeRow.text}</p></div>
            <p className="text-[11px] text-zinc-500">Origin · {provenance(activeRow)}</p>
            <div className="border-t border-white/10 pt-3"><h3 className="text-xs font-medium text-zinc-300">QC findings</h3>{activeRow.issues.some((issue) => !issue.resolvedAt) ? <ul className="mt-2 space-y-2">{activeRow.issues.filter((issue) => !issue.resolvedAt).map((issue) => <li key={issue.id} className="rounded-lg border border-amber-400/15 bg-amber-400/[0.03] p-2.5 text-[11px] leading-5"><p className="font-medium text-amber-200">{issue.severity} · {issue.category.replaceAll("_", " ")}</p><p className="mt-1 break-words text-zinc-400">{issue.message}</p></li>)}</ul> : <p className="mt-2 text-[11px] text-zinc-500">No unresolved QC findings. QC and approval are separate human decisions.</p>}</div>
            <Link href={`${projectPath}/translation${movieQuery}`} className={`${linkClass} w-full justify-center rounded-lg border border-white/10 px-3 py-2.5`}>Edit in Translation<Pencil size={12} aria-hidden="true" /></Link>
            <div className="grid grid-cols-2 gap-2"><button type="button" className={`${buttonClass} text-emerald-300`} disabled={busy || activeRow.reviewStatus === "APPROVED"} onClick={() => void updateReview(activeRow, "APPROVED")}><Check size={14} aria-hidden="true" />Approve</button><button type="button" className={buttonClass} disabled={busy || activeRow.reviewStatus === "NEEDS_REVIEW"} onClick={() => void updateReview(activeRow, "NEEDS_REVIEW")}><Flag size={13} aria-hidden="true" />Mark Needs Review</button></div>
          </div>}
        </section>

        {translated && <section aria-labelledby="export-readiness-heading" className={`${cardClass} p-4`}><h2 id="export-readiness-heading" className="text-sm font-semibold">Export readiness</h2>{exportMatchesMovie ? <p className="mt-2 text-xs leading-5 text-zinc-400">Subtitle files are technically available from the current saved translation. Approved-only export contains explicitly approved rows.</p> : <p className="mt-2 text-xs leading-5 text-amber-200">The project Export page uses its newest movie ({exportTargetMovie?.title ?? "not available"}), while this review is for {snapshot.movie.title}.</p>}<p className={`mt-2 text-xs leading-5 ${fullyApproved && exportMatchesMovie ? "text-emerald-300" : "text-amber-200"}`}>{fullyApproved ? exportMatchesMovie ? "All current segments are approved." : "Human review is complete for this movie; project export targets a different movie." : `${totalNeedingApproval} segments still need human review.`}</p>{issueCount > 0 && <p className="mt-2 text-[11px] leading-5 text-amber-200">{issueCount} unresolved QC findings remain for human inspection.</p>}<Link href={exportHref} className={`${buttonClass} mt-3 w-full`}>{exportMatchesMovie ? "Open Export" : "Open Project Export"}<ArrowRight size={13} aria-hidden="true" /></Link></section>}

        {activeRow && <section aria-label="Review navigation" className={`${cardClass} p-3`}><div className="grid grid-cols-2 gap-2"><button type="button" className={buttonClass} disabled={rows.findIndex((row) => row.sequence === activeRow.sequence) <= 0} onClick={() => selectRow(rows[rows.findIndex((row) => row.sequence === activeRow.sequence) - 1].sequence)}><ChevronLeft size={14} aria-hidden="true" />Previous</button><button type="button" className={buttonClass} disabled={rows.findIndex((row) => row.sequence === activeRow.sequence) >= rows.length - 1} onClick={() => selectRow(rows[rows.findIndex((row) => row.sequence === activeRow.sequence) + 1].sequence)}>Next<ChevronRight size={14} aria-hidden="true" /></button></div><button type="button" className={`${buttonClass} mt-2 w-full`} disabled={!nextNeedsReview} onClick={() => nextNeedsReview && selectRow(nextNeedsReview.sequence)}>Next Needs Review</button></section>}
      </aside>
    </div>}

    <div aria-live="polite" className="space-y-2">{feedback && <p role="status" className="text-xs text-zinc-300">{feedback}</p>}{error && <p role="alert" className="text-xs leading-5 text-amber-200">{error}</p>}{snapshot?.reviewUnavailable && <p role="alert" className="text-xs leading-5 text-amber-200">Saved translation review data is unavailable. Refresh the page or open Translation to inspect its current state.</p>}</div>
  </div>;
}
