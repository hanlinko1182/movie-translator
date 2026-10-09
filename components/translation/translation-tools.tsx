"use client";

import { controlClass } from "@/components/ui/styles";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { cardClass, linkClass } from "@/app/projects/[id]/overview-components";
import { categoryLabel, type TerminologyEntry } from "@/lib/terminology-types";
import type { ReviewRow } from "@/lib/translation-qc/types";
import { normalizeMemorySource, normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";
import { QcIssueList } from "./segment-editor";

type ToolTab = "qc" | "glossary" | "translation-memory";
type Entry = TerminologyEntry & { origin?: string };
export default function TranslationTools({ projectPath, projectSlug, row, sourceLanguage, revision, scanned }: {
  projectPath: string; projectSlug: string; row: ReviewRow | null; sourceLanguage: string; revision: number; scanned: boolean;
}) {
  const [tab, setTab] = useState<ToolTab>("glossary");
  const [result, setResult] = useState<{ key: string; entries: Entry[]; error: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const key = `${projectSlug}:${tab}:${revision}`;
  useEffect(() => {
    if (tab === "qc") return;
    const controller = new AbortController(); let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/${tab}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.data)) throw new Error("Entries unavailable");
        if (!cancelled) setResult({ key, entries: body.data, error: false });
      } catch { if (!cancelled) setResult({ key, entries: [], error: true }); }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [projectSlug, tab, key]);
  const entries = result?.key === key ? result.entries.filter((entry) => normalizeTerminologyLanguage(entry.sourceLanguage) === normalizeTerminologyLanguage(sourceLanguage) && entry.targetLanguage === "my" && `${entry.sourceText} ${entry.targetText}`.toLowerCase().includes(search.toLowerCase())) : [];
  const relevant = (entry: Entry) => !!row && (tab === "glossary" ? row.sourceText.includes(entry.sourceText) : normalizeMemorySource(row.sourceText) === normalizeMemorySource(entry.sourceText));
  return <section aria-labelledby="tools-heading" className={`${cardClass} overflow-hidden`}>
    <h2 id="tools-heading" className="sr-only">Translation tools</h2>
    <div role="tablist" aria-label="Translation tools" className="flex border-b border-white/10">
      {([["glossary", "Glossary"], ["translation-memory", "Translation Memory"], ["qc", "QC Issues"]] as const).map(([id, label]) => <button key={id} id={`tool-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => { setTab(id); setSearch(""); }} onKeyDown={(event) => {
        const tabs: ToolTab[] = ["glossary", "translation-memory", "qc"];
        const next = event.key === "ArrowRight" ? tabs[(tabs.indexOf(id) + 1) % 3] : event.key === "ArrowLeft" ? tabs[(tabs.indexOf(id) + 2) % 3] : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[2] : null;
        if (next) { event.preventDefault(); setTab(next); setSearch(""); document.getElementById(`tool-${next}`)?.focus(); }
      }} tabIndex={tab === id ? 0 : -1} className={`min-h-11 min-w-0 flex-1 border-b-2 px-2 py-2 text-[11px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-300 ${tab === id ? "border-violet-500 bg-violet-400/5 text-violet-300" : "border-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-300"}`}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tool-${tab}`} className="min-h-64 min-w-0 space-y-3 p-3">
      {tab === "qc" ? row ? <QcIssueList row={row} scanned={scanned} /> : <p className="text-xs leading-5 text-zinc-500">Select a saved translation row to inspect its findings.</p> : <>
        <label className="relative block"><span className="sr-only">Search {tab === "glossary" ? "glossary" : "translation memory"}</span><Search size={13} aria-hidden="true" className="absolute left-2.5 top-3 text-zinc-500" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "glossary" ? "Search glossary…" : "Search translation memory…"} className={`${controlClass} w-full pl-8 text-xs`} /></label>
        {result?.key !== key ? <p role="status" className="text-xs text-zinc-400">Loading project entries…</p> : result.error ? <p role="alert" className="text-xs text-amber-200">Project entries could not be loaded. Open the management page to try again.</p> : entries.length ? <div className="max-h-64 overflow-y-auto"><table className="w-full table-fixed text-left text-[11px]"><colgroup><col className="w-[32%]" /><col className="w-[44%]" /><col className="w-[24%]" /></colgroup><thead className="bg-white/[0.03] text-zinc-300"><tr><th scope="col" className="p-2 font-medium">Chinese</th><th scope="col" className="p-2 font-medium">Myanmar</th><th scope="col" className="p-2 font-medium">{tab === "glossary" ? "Type" : "Origin"}</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className={`border-b border-white/[0.06] ${relevant(entry) ? "bg-violet-400/[0.04]" : ""}`}><td lang={sourceLanguage} className="break-words p-2 align-top leading-6 text-zinc-300 [overflow-wrap:anywhere]">{entry.sourceText}{relevant(entry) && <span className="block text-[11px] text-violet-300">Selected source match</span>}</td><td lang="my" className="whitespace-pre-wrap break-words p-2 align-top leading-7 text-zinc-300 [overflow-wrap:anywhere]">{entry.targetText}</td><td className="break-words p-2 align-top leading-5 text-zinc-500">{entry.category ? categoryLabel(entry.category) : entry.origin === "MANUAL" ? "Manual · protected" : entry.origin ? "Automatic" : "Not recorded"}</td></tr>)}</tbody></table></div> : <p className="text-xs leading-5 text-zinc-500">No project entries match this language pair or search.</p>}
        <p className="text-[11px] leading-5 text-zinc-500">{tab === "glossary" ? "Real project terminology. Add or edit on the Glossary page." : "Real project memory. Exact matches do not imply the row used memory."}</p>
        <Link href={`${projectPath}/${tab}`} className={linkClass}>Manage {tab === "glossary" ? "Glossary" : "Translation Memory"}<ArrowUpRight size={13} aria-hidden="true" /></Link>
      </>}
    </div>
  </section>;
}
