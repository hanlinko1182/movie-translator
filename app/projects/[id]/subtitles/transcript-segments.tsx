"use client";

import { useState } from "react";
import { controlClass, secondaryButtonClass, linkClass } from "@/components/ui/styles";
import { Check, Copy, Search } from "lucide-react";

import { formatTimestamp } from "@/lib/format-timestamp";

import type { Segment } from "./transcription-model";

export default function TranscriptSegments({
  segments,
  transcriptText,
  sourceLanguage,
  selectedSequence,
  onSelect,
}: {
  segments: Segment[];
  transcriptText: string;
  sourceLanguage: string;
  selectedSequence: number | null;
  onSelect: (sequence: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const search = query.trim().toLocaleLowerCase();
  const visibleSegments = search
    ? segments.filter((segment) => segment.text.toLocaleLowerCase().includes(search))
    : segments;

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#111115]" aria-labelledby="segments-title">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] p-4 sm:p-5">
        <div>
          <h2 id="segments-title" className="text-sm font-semibold text-zinc-100">Source transcript</h2>
          <p className="mt-1 text-xs text-zinc-500">Read-only Chinese dialogue in timestamp order.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-xs text-zinc-400">Search transcript</span>
            <span className="relative block">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find dialogue..."
                className={`${controlClass} w-full pl-9`}
              />
            </span>
          </label>
          <button
            type="button"
            onClick={copyTranscript}
            className={secondaryButtonClass}
          >
            {copyStatus === "success" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            Copy transcript
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.07] px-4 py-3 text-xs text-zinc-500 sm:px-5" aria-live="polite">
        Showing {visibleSegments.length} of {segments.length} segments
        {copyStatus === "success" && <span className="ml-3 text-emerald-300">Transcript copied.</span>}
        {copyStatus === "error" && <span className="ml-3 text-rose-300">Could not copy transcript.</span>}
      </div>

      {!segments.length && transcriptText && <div className="border-b border-white/10 p-5"><p className="mb-3 text-xs text-amber-200">Saved transcript has no timed segments.</p><p lang={sourceLanguage} className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200 [overflow-wrap:anywhere]">{transcriptText}</p></div>}
      {visibleSegments.length > 0 ? (
        <ol className="divide-y divide-white/[0.07]">
          {visibleSegments.map((segment) => (
            <li key={segment.sequence} className={`min-w-0 space-y-3 px-4 py-5 sm:px-5 ${selectedSequence === segment.sequence ? "bg-violet-400/[0.06]" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:block">
                  <span className="text-[11px] text-zinc-500">#{segment.sequence + 1}</span>
                  <p className="break-words font-mono text-xs tabular-nums text-zinc-300 sm:mt-1">
                    {formatTimestamp(segment.startMs)} <span className="text-zinc-500">→</span> {formatTimestamp(segment.endMs)}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">{((segment.endMs - segment.startMs) / 1000).toFixed(2)} s</p>
                </div>
                <button type="button" onClick={() => onSelect(segment.sequence)} aria-pressed={selectedSequence === segment.sequence} aria-label={`Select segment ${segment.sequence + 1}`} className={`min-h-9 rounded-lg border px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${selectedSequence === segment.sequence ? "border-violet-400/25 bg-violet-400/10 text-violet-300" : "border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}>{selectedSequence === segment.sequence ? "Selected" : "Select"}</button>
              </div>
              <p lang={sourceLanguage} className="min-w-0 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200 [overflow-wrap:anywhere]">
                {segment.text}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-5 py-8 text-center"><p className="text-sm leading-6 text-zinc-400">{segments.length ? "No segments match your search." : "No timed segments are available."}</p>{segments.length > 0 && <button type="button" onClick={() => setQuery("")} className={`${linkClass} mt-3`}>Clear search</button>}</div>
      )}
    </section>
  );
}
