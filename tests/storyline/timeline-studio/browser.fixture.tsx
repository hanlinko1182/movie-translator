// Test-exclusive transport. No app import or production adapter.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import AppShell from "@/components/layout/app-shell";
import type { SyntheticTimelineAdapter } from "@/components/storyline/timeline-version-session";
import type { SyntheticHighlightAdapter } from "@/components/storyline/highlight-version-session";
import type { StudioPreviewArtifact } from "@/components/storyline/local-script-model";
import { contentClass, controlClass, pageClass, secondaryButtonClass } from "@/components/ui/styles";
import { studioContext } from "../ui/navigation.fixture";
declare const __TIMELINE_BOOT__: { target: SyntheticTimelineAdapter["target"]; csrf: string; artifact: StudioPreviewArtifact; highlightTarget: SyntheticHighlightAdapter["target"] };
const boot = __TIMELINE_BOOT__, path = `/projects/${boot.target.input.scope.projectId}/recap`;
async function control(input: unknown) { return (await fetch("/test-control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })).json(); }
function Harness() {
  const [query, setQuery] = useState(location.search), [identity, setIdentity] = useState({ identityKey: "initial", csrf: boot.csrf });
  const [movie, setMovie] = useState(boot.target.input.scope.movieId), [changed, setChanged] = useState(false), [fault, setFault] = useState("none"), [message, setMessage] = useState("");
  const [production, setProduction] = useState(false), [target, setTarget] = useState(boot.target);
  const rpc = async (operation: string, input: unknown) => { const r = await fetch("/isolated-fixture", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-timeline-m702-csrf": identity.csrf }, body: JSON.stringify({ operation, input }) }); const data = await r.json(); if (data.error) throw data.error; return data.value; };
  const adapter = useMemo<SyntheticTimelineAdapter>(() => {
    const t = structuredClone(target); if (changed) t.source.currentness.narrationRevision++;
    return { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: identity.identityKey, target: t,
      prepareTimeline: v => rpc("prepareTimeline", v), saveVersion: v => rpc("saveVersion", v), readHead: v => rpc("readHead", v), readVersion: v => rpc("readVersion", v), listHistory: v => rpc("listHistory", v), readOperation: v => rpc("readOperation", v) };
    // Full session/target identity owns this test adapter; rpc has no other mutable closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, changed, target]);
  const highlights: SyntheticHighlightAdapter = { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: "independent-highlights", target: boot.highlightTarget,
    preparePlan: v => rpc("prepareHighlight", v), saveVersion: async () => { throw Error("Companion save disabled"); }, readHead: async () => { throw Error("disabled"); }, readVersion: async () => { throw Error("disabled"); }, listHistory: async () => { throw Error("disabled"); }, readOperation: async () => { throw Error("disabled"); } };
  const context = { ...studioContext, projectId: boot.target.input.scope.projectId, projectHref: `/projects/${boot.target.input.scope.projectId}`, movie: { ...studioContext.movie!, id: movie, sourceRecorded: false, title: "Synthetic Timeline Movie" } };
  return <PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams(query)}><AppShell><main className={pageClass}><div className={contentClass} onClickCapture={e => {
    const a = (e.target as HTMLElement).closest("a"); if (!a?.getAttribute("href")?.startsWith(path)) return; e.preventDefault(); const url = new URL(a.href); history.pushState(null, "", url); setQuery(url.search);
  }}>
    <section aria-label="Disposable test controls" className="space-y-3 rounded-lg border border-white/10 p-3 text-xs text-zinc-300">
      <p>Synthetic harness only · New owned PostgreSQL · No production routes</p>
      <label>Test session <select aria-label="Test session" className={controlClass} defaultValue="editor-a" onChange={async e => setIdentity(await control({ action: "session", name: e.target.value }))}>{["editor-a", "editor-b", "reader"].map(s => <option key={s}>{s}</option>)}</select></label>{" "}
      <label>Test fault <select aria-label="Test fault" className={controlClass} value={fault} onChange={async e => { const value = e.target.value; await control({ action: "fault", value }); setFault(value); }}>{["none", "ack", "readback", "not-found", "origin", "csrf", "stale"].map(s => <option key={s}>{s}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button className={secondaryButtonClass} onClick={async () => { await control({ action: "competitor" }); setMessage("Competitor saved"); }}>Save competing plan</button>
        <button className={secondaryButtonClass} onClick={() => setMovie(v => v === boot.target.input.scope.movieId ? "other-movie" : boot.target.input.scope.movieId)}>Switch movie</button>
        <button className={secondaryButtonClass} onClick={() => setChanged(v => !v)}>Switch source identity</button>
        <button className={secondaryButtonClass} onClick={async () => { const r = await control({ action: "m6-choice" }); setTarget(r.target); setMessage("Current M6 selected"); }}>Select current saved M6 plan</button>
        <button className={secondaryButtonClass} onClick={() => setProduction(v => !v)}>Toggle default unavailable</button></div><p role="status">{message}</p>
    </section>
    <RecapStudioShell context={context} recapPath={path} query={query} previewForTest={{ status: "READY", artifact: boot.artifact }} highlightsAdapterForTest={highlights} timelineAdapterForTest={production ? undefined : adapter}><p>Existing Saved Recap destination</p></RecapStudioShell>
  </div></main></AppShell></SearchParamsContext.Provider></PathnameContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
