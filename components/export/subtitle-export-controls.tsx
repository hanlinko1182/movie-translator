"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, BadgeCheck, ChevronRight, Circle, Clock3, Download, FileText, Film, Info, LoaderCircle } from "lucide-react";
import type { SubtitleExportMode, SubtitleFormat, SubtitleReviewSummary } from "@/lib/subtitle-export/types";

type PreviewSegment = {
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
  reviewStatus: string;
  sourceText: string | null;
};
type Props = {
  projectName: string;
  projectHref: string;
  reviewHref: string;
  movie: { id: string; title: string; filename: string | null; durationSeconds: number | null; sourceLanguage: string; status: string; createdAt: string } | null;
  translation: { provider: string; model: string; revision: number; updatedAt: string; sourceLanguage: string; targetLanguage: string } | null;
  summary: SubtitleReviewSummary;
  filenames: Record<SubtitleFormat, string>;
  previews: { all: PreviewSegment | null; approved: PreviewSegment | null };
};

const panelClass = "min-w-0 rounded-xl border border-white/[0.08] bg-[#101720]";
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300";
const formatOptions: { id: SubtitleFormat; label: string; extension: string; detail: string; icon: typeof FileText }[] = [
  { id: "srt", label: "SubRip Subtitle", extension: ".srt", detail: "Plain subtitle text · millisecond timing", icon: FileText },
  { id: "ass", label: "Advanced SubStation Alpha", extension: ".ass", detail: "Subtitle text · centisecond timing", icon: FileText },
];

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function durationLabel(seconds: number | null) {
  if (seconds === null) return "Duration unavailable";
  return `${formatTime(seconds * 1000)} runtime`;
}

function languageLabel(language: string) {
  return language === "zh" ? "Chinese" : language === "my" ? "Myanmar" : language.toUpperCase();
}

function SegmentCount({ value, label }: { value: number; label: string }) {
  return <div className="min-w-0 rounded-lg border border-white/[0.06] bg-black/10 p-3">
    <dt className="text-[11px] text-zinc-500">{label}</dt>
    <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{value.toLocaleString("en-US")}</dd>
  </div>;
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "violet" }) {
  const styles = tone === "green" ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : tone === "amber" ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200" : tone === "violet" ? "border-violet-300/20 bg-violet-300/[0.08] text-violet-200" : "border-white/10 bg-white/[0.04] text-zinc-300";
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${styles}`}>{children}</span>;
}

export default function SubtitleExportControls({ projectName, projectHref, reviewHref, movie, translation, summary, filenames, previews }: Props) {
  const [format, setFormat] = useState<SubtitleFormat>("srt");
  const [mode, setMode] = useState<SubtitleExportMode>("ALL_CURRENT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const count = mode === "APPROVED_ONLY" ? summary.approved : summary.total;
  const hasNonApproved = summary.approved < summary.total;
  const canDownload = !!movie && !!translation && count > 0;
  const modeParam = mode === "APPROVED_ONLY" ? "approved" : "all";
  const activePreview = mode === "APPROVED_ONLY" ? previews.approved : previews.all;
  const translationAvailable = !!movie && !!translation && summary.total > 0;

  async function download(requestedFormat: SubtitleFormat = format) {
    if (!movie || !translation) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/movies/${encodeURIComponent(movie.id)}/export/subtitles?format=${requestedFormat}&mode=${modeParam}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message ?? "Unable to export subtitles");
      }
      const filenameParameter = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = filenameParameter ? decodeURIComponent(filenameParameter) : filenames[requestedFormat];
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage(`${filename} prepared for download.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Download failed; please try again");
    } finally {
      setBusy(false);
    }
  }

  return <div className="min-w-0 space-y-4 sm:space-y-5">
    <header className="flex min-w-0 flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Link href="/projects" className={`rounded hover:text-zinc-200 ${focusClass}`}>Projects</Link><ChevronRight size={13} aria-hidden="true" />
          <Link href={projectHref} className={`max-w-full truncate rounded hover:text-zinc-200 ${focusClass}`}>{projectName}</Link><ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page" className="text-zinc-300">Export</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Export</h1>
        <p className="mt-1 text-sm leading-6 text-zinc-400">Download current Myanmar subtitles for this project.</p>
      </div>
      <button type="button" onClick={() => void download()} disabled={busy || !canDownload} className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 ${focusClass}`}>
        {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
        {busy ? "Preparing…" : `Download ${format.toUpperCase()}`}
      </button>
    </header>

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-12">
      <section className={`${panelClass} overflow-hidden xl:col-span-5`} aria-labelledby="export-source-heading">
        <div className="relative flex min-h-[225px] flex-col items-center justify-center overflow-hidden border-b border-white/[0.07] bg-[#0b111a] px-5 py-7 text-center sm:min-h-[270px]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-950/20 via-transparent to-slate-800/20" />
          <span className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400"><Film size={22} aria-hidden="true" /></span>
          <p className="relative text-sm font-medium text-zinc-200">Preview unavailable</p>
          <p className="relative mt-1 max-w-sm text-xs leading-5 text-zinc-500">Source video playback and video rendering are not available in this workspace. Subtitle files are exported separately.</p>
          <StatusPill tone={translationAvailable ? "green" : "amber"}>
            {translationAvailable ? <BadgeCheck size={12} aria-hidden="true" /> : <Circle size={9} aria-hidden="true" />}
            {translationAvailable ? "Subtitle files available" : !movie ? "No movie uploaded" : !translation ? "Translation required" : "No subtitle rows"}
          </StatusPill>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Current project movie</p><h2 id="export-source-heading" className="mt-1 break-words text-base font-semibold text-zinc-100">{movie?.title ?? "No movie uploaded"}</h2></div>
            {movie && <StatusPill>{movie.status.toLowerCase().replaceAll("_", " ")}</StatusPill>}
          </div>
          <p className="mt-2 break-all text-xs text-zinc-500">{movie?.filename ?? "Upload a movie from Project Overview to begin."}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-3 text-xs">
            <div><dt className="text-zinc-500">Runtime</dt><dd className="mt-1 text-zinc-300">{durationLabel(movie?.durationSeconds ?? null)}</dd></div>
            <div><dt className="text-zinc-500">Languages</dt><dd className="mt-1 break-words text-zinc-300">{translation ? `${languageLabel(translation.sourceLanguage)} → ${languageLabel(translation.targetLanguage)}` : movie ? `${languageLabel(movie.sourceLanguage)} → Myanmar` : "Unavailable"}</dd></div>
            <div className="col-span-2"><dt className="text-zinc-500">Subtitle source</dt><dd className="mt-1 text-zinc-300">{translation ? "Latest saved translation" : "No saved translation"}</dd></div>
          </dl>
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-5 xl:col-span-3`} aria-labelledby="export-type-heading">
        <div className="mb-4"><h2 id="export-type-heading" className="text-sm font-semibold text-zinc-100">Export Type</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Choose a subtitle file format.</p></div>
        <div className="grid gap-3">
          {formatOptions.map((option) => {
            const Icon = option.icon;
            const selected = format === option.id;
            return <button key={option.id} type="button" aria-pressed={selected} onClick={() => { setFormat(option.id); setError(""); setMessage(""); }} className={`min-w-0 rounded-lg border p-3 text-left transition ${focusClass} ${selected ? "border-violet-400/70 bg-violet-500/[0.12] shadow-[0_0_0_1px_rgba(139,92,246,0.12)]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"}`}>
              <div className="flex items-start justify-between gap-2"><Icon size={19} className={selected ? "text-violet-300" : "text-zinc-400"} aria-hidden="true" /><span className={`rounded-md px-2 py-0.5 font-mono text-[10px] ${selected ? "bg-violet-400/15 text-violet-200" : "bg-white/[0.05] text-zinc-400"}`}>{option.extension}</span></div>
              <p className="mt-3 break-words text-xs font-semibold leading-5 text-zinc-100">{option.label}</p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-500">{option.detail}</p>
            </button>;
          })}
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-5 xl:col-span-4`} aria-labelledby="export-queue-heading">
        <div className="flex items-start justify-between gap-3"><div><h2 id="export-queue-heading" className="text-sm font-semibold text-zinc-100">Export Queue</h2><p className="mt-1 text-xs text-zinc-500">Current project · on-demand files</p></div><StatusPill>Not implemented</StatusPill></div>
        <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/10 p-4">
          <div className="flex items-center gap-2 text-zinc-300"><Clock3 size={15} aria-hidden="true" /><p className="text-xs font-medium">Queue tracking is not implemented</p></div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">SRT and ASS files are generated on request. Video-render jobs and their status are not available.</p>
        </div>
        <div className="mt-3 space-y-2">
          {["Translated Video", "Recap Video"].map((label) => <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><Film size={14} className="shrink-0 text-zinc-500" aria-hidden="true" /><span className="break-words text-xs text-zinc-300">{label}</span></div><span className="shrink-0 text-[10px] text-zinc-500">Not generated · Not implemented yet</span></div>)}
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-5 xl:col-span-8`} aria-labelledby="export-settings-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="export-settings-heading" className="text-sm font-semibold text-zinc-100">Export Settings</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Choose which saved translation rows to include.</p></div>
          {translation && <StatusPill tone="green">Revision {translation.revision}</StatusPill>}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-medium text-zinc-400">Subtitle Source</p>
            <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3"><p className="text-xs font-medium text-zinc-200">Myanmar Translation</p><p className="mt-1 break-words text-[10px] text-zinc-500">{translation ? `${languageLabel(translation.sourceLanguage)} → ${languageLabel(translation.targetLanguage)} · saved revision ${translation.revision}` : "A saved project translation is required"}</p></div>
          </div>
          <fieldset className="min-w-0">
            <legend className="mb-2 text-[11px] font-medium text-zinc-400">Review Scope</legend>
            <div className="grid grid-cols-2 rounded-lg border border-white/[0.08] bg-black/15 p-1">
              {([{ id: "ALL_CURRENT", label: "All Current", value: summary.total }, { id: "APPROVED_ONLY", label: "Approved Only", value: summary.approved }] as const).map((option) => <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => { setMode(option.id); setError(""); setMessage(""); }} className={`min-h-9 min-w-0 rounded-md px-2 text-[11px] font-medium transition ${focusClass} ${mode === option.id ? "bg-violet-500/20 text-violet-200" : "text-zinc-400 hover:text-zinc-200"}`}><span className="block truncate">{option.label}</span><span className="mt-0.5 block text-[10px] tabular-nums opacity-75">{option.value.toLocaleString("en-US")} rows</span></button>)}
            </div>
          </fieldset>
        </div>
        {hasNonApproved && <p role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.045] p-3 text-xs leading-5 text-amber-100/80"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{mode === "APPROVED_ONLY" ? "Approved Only omits unreviewed and needs-review rows while preserving their original time gaps." : "All Current includes rows that have not been approved by a human."}</p>}
        {mode === "APPROVED_ONLY" && !summary.approved && <p className="mt-3 text-xs leading-5 text-zinc-400">No approved subtitles yet. Approve rows in Translation before downloading this scope.</p>}
        {!summary.total && <p className="mt-3 text-xs leading-5 text-zinc-400">No current translated segments are available to export.</p>}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SegmentCount value={summary.total} label="All current" />
          <SegmentCount value={summary.approved} label="Approved" />
          <SegmentCount value={summary.needsReview} label="Needs review" />
          <SegmentCount value={summary.unreviewed} label="Unreviewed" />
        </dl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3"><p className="text-[11px] leading-5 text-zinc-500">Review states are human decisions. Export does not change translation or approval.</p><Link href={reviewHref} className={`inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:text-violet-200 ${focusClass}`}>Review subtitles<ArrowRight size={13} aria-hidden="true" /></Link></div>
      </section>

      <section className={`${panelClass} p-4 sm:p-5 xl:col-span-4`} aria-labelledby="output-files-heading">
        <div className="flex items-start justify-between gap-3"><div><h2 id="output-files-heading" className="text-sm font-semibold text-zinc-100">Output Files</h2><p className="mt-1 text-xs text-zinc-500">{translationAvailable ? "Subtitle downloads generated from saved text on request." : "No subtitle downloads available yet."}</p></div><FileText size={17} className="text-zinc-500" aria-hidden="true" /></div>
        <ul className="mt-3 divide-y divide-white/[0.07]">
          {(["srt", "ass"] as const).map((fileFormat) => <li key={fileFormat} className="flex min-w-0 items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-black/10 text-zinc-400"><FileText size={17} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="break-words text-xs font-medium text-zinc-200">Subtitle File ({fileFormat.toUpperCase()})</p><p className="mt-1 break-words text-[10px] text-zinc-500">{canDownload ? `${count.toLocaleString("en-US")} segments · ${mode === "APPROVED_ONLY" ? "Approved Only" : "All Current"}` : translation ? "No rows in the selected scope" : "Translation unavailable"}</p>{translationAvailable && <p className="mt-1 break-all font-mono text-[9px] text-zinc-600">{filenames[fileFormat]}</p>}</div>
            <button type="button" onClick={() => void download(fileFormat)} disabled={busy || !canDownload} aria-label={`Download ${fileFormat.toUpperCase()} subtitles`} className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 ${focusClass}`}><Download size={13} aria-hidden="true" />Download</button>
          </li>)}
          {["Translated Video", "Recap Video"].map((label) => <li key={label} className="flex min-w-0 items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-black/10 text-zinc-600"><Film size={17} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-medium text-zinc-300">{label}</p><p className="mt-1 text-[10px] leading-4 text-zinc-500">Not generated · Not implemented yet</p></div>
            <span className="shrink-0 rounded-lg border border-white/[0.07] px-2.5 py-2 text-[10px] text-zinc-600">Unavailable</span>
          </li>)}
        </ul>
      </section>

      <section className={`${panelClass} p-4 sm:p-5 xl:col-span-8`} aria-labelledby="subtitle-preview-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="subtitle-preview-heading" className="text-sm font-semibold text-zinc-100">Preview &amp; Check</h2><p className="mt-1 text-xs leading-5 text-zinc-500">A saved subtitle sample and its original timing. No video playback is available.</p></div><StatusPill>{format.toUpperCase()} · {mode === "APPROVED_ONLY" ? "Approved Only" : "All Current"}</StatusPill></div>
        {activePreview ? <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-white/[0.07] bg-black/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-zinc-500">Segment {activePreview.sequence + 1} · {formatTime(activePreview.startMs)} → {formatTime(activePreview.endMs)}</p><StatusPill tone={activePreview.reviewStatus === "APPROVED" ? "green" : activePreview.reviewStatus === "NEEDS_REVIEW" ? "amber" : "neutral"}>{activePreview.reviewStatus === "APPROVED" ? "Approved" : activePreview.reviewStatus === "NEEDS_REVIEW" ? "Needs review" : "Unreviewed"}</StatusPill></div>
            {activePreview.sourceText ? <p lang="zh" className="mt-3 break-words text-sm leading-6 text-zinc-200">{activePreview.sourceText}</p> : <p className="mt-3 text-xs text-zinc-600">Chinese source text unavailable.</p>}
            <p lang="my" className="mt-2 break-words text-sm leading-7 text-zinc-200">{activePreview.text}</p>
          </div>
          <div className="flex min-w-0 flex-col justify-center rounded-lg border border-white/[0.07] bg-gradient-to-br from-[#0b111a] to-[#131126] p-4 text-center"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Saved Myanmar subtitle</p><p lang="my" className="mt-3 break-words text-lg leading-8 text-zinc-100">{activePreview.text}</p><p className="mt-3 font-mono text-[10px] text-zinc-500">{formatTime(activePreview.startMs)} – {formatTime(activePreview.endMs)}</p></div>
        </div> : <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/10 p-5 text-center"><Info size={18} className="mx-auto text-zinc-500" aria-hidden="true" /><p className="mt-2 text-xs leading-5 text-zinc-400">{!translation ? "A saved translation is required before subtitle preview is available." : mode === "APPROVED_ONLY" ? "No approved subtitle segment is available to preview." : "No saved subtitle segment is available to preview."}</p></div>}
        <p className="mt-3 text-[10px] leading-5 text-zinc-500">{translation ? `${translation.provider} · ${translation.model} · revision ${translation.revision} · updated ${translation.updatedAt.slice(0, 10)}` : "Translation metadata unavailable"} · UTF-8 Myanmar text.</p>
      </section>

      <section className="min-w-0 rounded-xl border border-violet-400/15 bg-[linear-gradient(135deg,rgba(91,33,182,0.14),rgba(16,23,32,0.95)_52%)] p-4 sm:p-5 xl:col-span-4" aria-labelledby="export-tips-heading">
        <div className="flex items-center gap-2"><Info size={16} className="text-violet-300" aria-hidden="true" /><h2 id="export-tips-heading" className="text-sm font-semibold text-violet-200">Export Tips</h2></div>
        <ul className="mt-3 space-y-2 text-[11px] leading-5 text-zinc-300">
          <li className="flex gap-2"><span className="text-violet-300">•</span><span>All Current includes every saved translation segment.</span></li>
          <li className="flex gap-2"><span className="text-violet-300">•</span><span>Approved Only includes human-approved rows and preserves original timing gaps.</span></li>
          <li className="flex gap-2"><span className="text-violet-300">•</span><span>SRT and ASS downloads use the current saved Myanmar text.</span></li>
          <li className="flex gap-2"><span className="text-violet-300">•</span><span>Video rendering, burn-in, blur processing, and recap video generation are not implemented.</span></li>
        </ul>
      </section>
    </div>

    <div aria-live="polite" className="min-h-5">{message && <p role="status" className="break-words text-sm text-emerald-200">{message}</p>}{error && <p role="alert" className="break-words text-sm text-amber-200">{error}</p>}</div>
  </div>;
}
