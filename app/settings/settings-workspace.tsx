"use client";

import { useState, type ReactNode } from "react";
import { Captions, ChevronRight, Cpu, Download, Film, Info, RefreshCw, Server, Settings2 } from "lucide-react";

const icons = [Settings2, Cpu, Captions, Film, Download, Server];
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300";

export default function SettingsWorkspace({ panels }: { panels: { id: string; label: string; description: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState(panels[0].id);
  const active = panels.find((panel) => panel.id === selected)!;
  return <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-6">
    <aside className="min-w-0 rounded-xl border border-white/10 bg-[#111115] p-2 xl:sticky xl:top-6 xl:p-3">
      <p className="hidden px-3 pb-3 pt-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 xl:block">Preferences & system</p>
      <nav aria-label="Settings categories" className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-1">
        {panels.map((panel, index) => {
          const Icon = icons[index];
          const isActive = panel.id === selected;
          return <button key={panel.id} type="button" aria-current={isActive ? "page" : undefined} aria-controls={`settings-${panel.id}`} onClick={() => setSelected(panel.id)} className={`flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-3 text-left text-sm transition ${focusClass} ${isActive ? "border-violet-500/25 bg-violet-500/15 font-medium text-violet-200" : "border-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}><Icon size={16} aria-hidden="true" className="shrink-0" /><span>{panel.label}</span><ChevronRight size={14} className="ml-auto hidden shrink-0 xl:block" aria-hidden="true" /></button>;
        })}
      </nav>
      <div className="mt-5 hidden border-t border-white/10 px-3 pb-2 pt-4 xl:block"><Info size={15} className="mb-2 text-zinc-500" aria-hidden="true" /><p className="text-xs leading-5 text-zinc-500">Configuration is read only here. Project actions live in their workspaces.</p></div>
    </aside>
    <section id={`settings-${active.id}`} aria-labelledby="settings-panel-title" className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-5"><div><h2 id="settings-panel-title" className="text-lg font-semibold tracking-tight">{active.label}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-zinc-400">{active.description}</p></div><span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400">Read only</span></header>
      {active.content}
    </section>
  </div>;
}

type CheckStatus = "Ready" | "Unavailable";
const components = [["database", "Database"], ["redis", "Redis"], ["storage", "Storage"], ["ffmpeg", "FFmpeg"], ["ffprobe", "FFprobe"]] as const;

export function RuntimeReadiness() {
  const [states, setStates] = useState<Record<string, CheckStatus>>({});
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string>();
  const [message, setMessage] = useState("Run a check to see current availability. No background polling.");
  async function refresh() {
    if (busy) return;
    setBusy(true);
    setStates({});
    setCheckedAt(undefined);
    setMessage("Checking the web service and runtime dependencies…");
    // Existing endpoints only: no provider or job APIs and no automatic polling.
    const results = await Promise.allSettled(["/api/health", "/api/ready"].map(async (url) => {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok && !(url === "/api/ready" && response.status === 503)) throw new Error("CHECK_UNAVAILABLE");
      return await response.json() as unknown;
    }));
    const web = results[0].status === "fulfilled" ? results[0].value : null;
    const readiness = results[1].status === "fulfilled" ? results[1].value : null;
    const values: Record<string, CheckStatus> = { web: isRecord(web) && web.status === "ok" ? "Ready" : "Unavailable" };
    // Render only known names and statuses, never raw responses or API errors.
    const checks = isRecord(readiness) && isRecord(readiness.checks) ? readiness.checks : {};
    for (const [key] of components) values[key] = checks[key] === "ok" ? "Ready" : "Unavailable";
    setStates(values);
    setCheckedAt(new Date().toLocaleTimeString());
    setMessage(Object.values(values).every((value) => value === "Ready") ? "All checked services are ready." : "Some checks are unavailable. This does not verify AI providers or worker processes.");
    setBusy(false);
  }
  return <section aria-labelledby="runtime-check-title" className="min-w-0 rounded-xl border border-white/10 bg-[#111115]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><h3 id="runtime-check-title" className="text-sm font-semibold">Runtime readiness</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Existing health checks · on demand</p></div><button type="button" disabled={busy} onClick={refresh} className={`inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50 ${focusClass}`}><RefreshCw size={14} aria-hidden="true" className={busy ? "animate-spin" : ""} />{busy ? "Checking…" : "Refresh status"}</button></div>
    <dl className="grid grid-cols-1 gap-px bg-white/5 sm:grid-cols-2 lg:grid-cols-3">{[["web", "Web"], ...components].map(([key, label]) => {
      const status = states[key] ?? "Not checked";
      return <div key={key} className="min-w-0 bg-[#111115] px-5 py-4"><dt className="text-xs text-zinc-400">{label}</dt><dd className={`mt-2 flex items-center gap-2 text-sm font-medium ${status === "Ready" ? "text-emerald-300" : status === "Unavailable" ? "text-amber-300" : "text-zinc-500"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status === "Ready" ? "bg-emerald-400" : status === "Unavailable" ? "bg-amber-400" : "bg-zinc-600"}`} />{busy ? "Checking…" : status}</dd></div>;
    })}</dl>
    <p role="status" className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-zinc-400">{message}{checkedAt && <span className="mt-1 block text-zinc-500">Checked at {checkedAt}. Results are a snapshot.</span>}</p>
  </section>;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
