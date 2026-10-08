"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cardClass, linkClass } from "@/app/projects/[id]/overview-components";
import type { TerminologyEntry } from "@/lib/terminology-types";
import type { ReviewRow } from "@/lib/translation-qc/types";
import { normalizeMemorySource, normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";
import { QcIssueList } from "./segment-editor";

type ToolTab = "qc" | "glossary" | "translation-memory";
type Entry = TerminologyEntry & { origin?: string };
export default function TranslationTools({ projectPath, projectSlug, row, sourceLanguage, revision, scanned }: {
  projectPath: string; projectSlug: string; row: ReviewRow | null; sourceLanguage: string; revision: number; scanned: boolean;
}) {
  const [tab, setTab] = useState<ToolTab>("qc");
  const [result, setResult] = useState<{ key: string; entries: Entry[]; error: boolean } | null>(null);
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
  const entries = result?.key === key ? result.entries.filter((entry) => row && normalizeTerminologyLanguage(entry.sourceLanguage) === normalizeTerminologyLanguage(sourceLanguage) && entry.targetLanguage === "my" && (tab === "glossary" ? row.sourceText.includes(entry.sourceText) : normalizeMemorySource(row.sourceText) === normalizeMemorySource(entry.sourceText))) : [];
  return <section aria-labelledby="tools-heading" className={`${cardClass} p-5`}>
    <h2 id="tools-heading" className="text-sm font-semibold">Translation tools</h2>
    <div role="tablist" aria-label="Translation tools" className="mt-4 flex flex-wrap gap-2">
      {([["qc", "QC Issues"], ["glossary", "Glossary"], ["translation-memory", "Translation Memory"]] as const).map(([id, label]) => <button key={id} id={`tool-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)} onKeyDown={(event) => {
        const tabs: ToolTab[] = ["qc", "glossary", "translation-memory"];
        const next = event.key === "ArrowRight" ? tabs[(tabs.indexOf(id) + 1) % 3] : event.key === "ArrowLeft" ? tabs[(tabs.indexOf(id) + 2) % 3] : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[2] : null;
        if (next) { event.preventDefault(); setTab(next); document.getElementById(`tool-${next}`)?.focus(); }
      }} tabIndex={tab === id ? 0 : -1} className={`min-h-9 rounded-lg px-2.5 py-2 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-violet-300 ${tab === id ? "bg-violet-400/10 text-violet-300" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"}`}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tool-${tab}`} className="mt-5 min-w-0 space-y-4">
      {tab === "qc" ? row ? <QcIssueList row={row} scanned={scanned} /> : <p className="text-xs leading-5 text-zinc-500">Select a saved translation row to inspect its findings.</p> : <>
        <p className="text-xs leading-5 text-zinc-500">{tab === "glossary" ? "Project terms present in the selected source dialogue." : "Current exact-source match in this project. A memory entry does not mean the row was translated from memory."}</p>
        {!row ? <p className="text-xs text-zinc-400">Select a saved translation row.</p> : result?.key !== key ? <p role="status" className="text-xs text-zinc-400">Loading project entries…</p> : result.error ? <p role="alert" className="text-xs text-amber-200">Project entries could not be loaded. Open the management page to try again.</p> : entries.length ? <ul className="max-h-96 space-y-3 overflow-y-auto">{entries.map((entry) => <li key={entry.id} className="rounded-lg border border-white/10 p-3"><p lang={sourceLanguage} className="break-words text-xs leading-6 text-zinc-300 [overflow-wrap:anywhere]">{entry.sourceText}</p><p lang="my" className="mt-2 whitespace-pre-wrap break-words text-xs leading-7 text-zinc-400 [overflow-wrap:anywhere]">{entry.targetText}</p>{entry.category && <p className="mt-2 text-[10px] text-zinc-500">{entry.category}</p>}{entry.origin && <p className="mt-2 text-[10px] text-zinc-500">{entry.origin === "MANUAL" ? "Manual memory · protected from automatic capture" : "Automatic memory"}</p>}</li>)}</ul> : <p className="text-xs text-zinc-400">No matching project entries for this segment.</p>}
        <Link href={`${projectPath}/${tab}`} className={linkClass}>Manage {tab === "glossary" ? "Glossary" : "Translation Memory"}<ArrowUpRight size={13} aria-hidden="true" /></Link>
      </>}
    </div>
  </section>;
}
