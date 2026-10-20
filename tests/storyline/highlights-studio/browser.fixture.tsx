// Exclusively compiled by browser.test.mjs; no production transport/default.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import AppShell from "@/components/layout/app-shell";
import { HighlightPlanReview } from "@/components/storyline/highlights-workspace";
import type { SyntheticHighlightAdapter } from "@/components/storyline/highlight-version-session";
import type { StudioPreviewArtifact } from "@/components/storyline/local-script-model";
import type { HighlightPlan } from "@/lib/storyline/highlights/contracts";
import { contentClass, controlClass, pageClass, secondaryButtonClass } from "@/components/ui/styles";
import { studioContext } from "../ui/navigation.fixture";
declare const __HIGHLIGHT_BOOT__: { target: SyntheticHighlightAdapter["target"]; csrf: string; artifact: StudioPreviewArtifact; sample: HighlightPlan };
const boot = __HIGHLIGHT_BOOT__, path = `/projects/${boot.target.scope.projectId}/recap`;
async function control(input: unknown) { return (await fetch("/test-control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })).json(); }
function Harness() {
  const [query, setQuery] = useState(location.search), [identity, setIdentity] = useState({ identityKey: "initial", csrf: boot.csrf });
  const [movie, setMovie] = useState(boot.target.scope.movieId), [changed, setChanged] = useState(false), [fault, setFault] = useState("none"), [message, setMessage] = useState("");
  const [production, setProduction] = useState(false);
  const adapter = useMemo<SyntheticHighlightAdapter>(() => {
    const rpc = async (operation: string, input: unknown) => { const r = await fetch("/test-rpc", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-highlight-m602-csrf": identity.csrf }, body: JSON.stringify({ operation, input }) }); const data = await r.json(); if (data.error) throw data.error; return data.value; };
    const target = structuredClone(boot.target); if (changed) target.source.currentness.narrationRevision++;
    return { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: identity.identityKey, target,
      preparePlan: v => rpc("preparePlan", v), saveVersion: v => rpc("saveVersion", v), readHead: v => rpc("readHead", v), readVersion: v => rpc("readVersion", v), listHistory: v => rpc("listHistory", v), readOperation: v => rpc("readOperation", v) };
  }, [identity, changed]);
  const context = { ...studioContext, projectId: boot.target.scope.projectId, projectHref: `/projects/${boot.target.scope.projectId}`, movie: { ...studioContext.movie!, id: movie, sourceRecorded: false, title: "Synthetic Highlights Movie" } };
  return <PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams(query)}><AppShell><main className={pageClass}><div className={contentClass} onClickCapture={e => {
    const a = (e.target as HTMLElement).closest("a"); if (!a?.getAttribute("href")?.startsWith(path)) return; e.preventDefault(); const url = new URL(a.href); history.pushState(null, "", url); setQuery(url.search);
  }}>
    <section aria-label="Disposable test controls" className="space-y-3 rounded-lg border border-white/10 p-3 text-xs text-zinc-300">
      <p>Synthetic harness only · New owned PostgreSQL · No production routes</p>
      <label>Test session <select aria-label="Test session" className={controlClass} defaultValue="editor-a" onChange={async e => setIdentity(await control({ action: "session", name: e.target.value }))}>{["editor-a", "editor-b", "reader"].map(s => <option key={s}>{s}</option>)}</select></label>{" "}
      <label>Test fault <select aria-label="Test fault" className={controlClass} value={fault} onChange={async e => { const value = e.target.value; await control({ action: "fault", value }); setFault(value); }}>{["none", "ack", "readback", "not-found", "origin", "csrf", "stale"].map(s => <option key={s}>{s}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button className={secondaryButtonClass} onClick={async () => { await control({ action: "competitor" }); setMessage("Competitor saved"); }}>Save competing plan</button>
        <button className={secondaryButtonClass} onClick={() => setMovie(v => v === boot.target.scope.movieId ? "other-movie" : boot.target.scope.movieId)}>Switch movie</button>
        <button className={secondaryButtonClass} onClick={() => setChanged(v => !v)}>Switch source identity</button>
        <button className={secondaryButtonClass} onClick={() => setProduction(v => !v)}>Toggle default unavailable</button></div><p role="status">{message}</p>
    </section>
    <RecapStudioShell context={context} recapPath={path} query={query} previewForTest={{ status: "READY", artifact: boot.artifact }} highlightsAdapterForTest={production ? undefined : adapter}><p>Existing Saved Recap destination</p></RecapStudioShell>
    <details><summary>Supplemental synthetic presentation fixture (not the saved workspace)</summary><HighlightPlanReview value={boot.sample} /></details>
  </div></main></AppShell></SearchParamsContext.Provider></PathnameContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
