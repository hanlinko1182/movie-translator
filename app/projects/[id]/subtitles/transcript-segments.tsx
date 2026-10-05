"use client";

import { useState } from "react";
import { Check, Copy, Search } from "lucide-react";

import { formatTimestamp } from "@/lib/format-timestamp";

type Segment = {
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
};

export default function TranscriptSegments({
  segments,
  transcriptText,
  sourceLanguage,
}: {
  segments: Segment[];
  transcriptText: string;
  sourceLanguage: string;
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
    <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]" aria-labelledby="segments-title">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="segments-title" className="text-sm font-semibold text-zinc-100">Timed source dialogue</h2>
          <p className="mt-1 text-xs text-zinc-500">Read the original speech in timestamp order.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 sm:w-64">
            <span className="mb-1.5 block text-xs text-zinc-400">Search transcript</span>
            <span className="relative block">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find dialogue..."
                className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/20"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={copyTranscript}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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

      {visibleSegments.length > 0 ? (
        <ol className="divide-y divide-white/[0.07]">
          {visibleSegments.map((segment) => (
            <li key={segment.sequence} className="grid min-w-0 gap-3 px-4 py-5 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-6 sm:px-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:block">
                <span className="text-[11px] text-zinc-600">Segment {segment.sequence + 1}</span>
                <p className="whitespace-nowrap font-mono text-xs tabular-nums text-zinc-300 sm:mt-1">
                  {formatTimestamp(segment.startMs)} <span className="text-zinc-600">→</span> {formatTimestamp(segment.endMs)}
                </p>
              </div>
              <p lang={sourceLanguage} className="min-w-0 break-words text-sm leading-7 text-zinc-200 [overflow-wrap:anywhere]">
                {segment.text}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-zinc-500">No segments match your search.</p>
      )}
    </section>
  );
}
