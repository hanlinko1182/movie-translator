// Explicit client composition for the isolated disposable HTTP test server only.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import AppShell from "@/components/layout/app-shell";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import type { StudioPreviewArtifact } from "@/components/storyline/local-script-model";
import type { SyntheticScriptVersionAdapter } from "@/components/storyline/script-version-session";
import { contentClass, controlClass, pageClass, secondaryButtonClass } from "@/components/ui/styles";
import { studioContext } from "../ui/navigation.fixture";

declare const __SAVE_BOOT__: { artifact: StudioPreviewArtifact; target: SyntheticScriptVersionAdapter["target"]; csrf: string };
const boot = __SAVE_BOOT__, path = `/projects/${boot.target.scope.projectId}/recap`;
async function rpc(operation: string, input: unknown, csrf: string) {
  const response = await fetch("/test-rpc", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-story-r4-csrf": csrf }, body: JSON.stringify({ operation, input }) });
  const data = await response.json(); if (data.error) throw data.error; return data.value;
}
async function control(input: unknown) { const response = await fetch("/test-control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); return response.json(); }
function Harness() {
  const [query, setQuery] = useState(location.search), [identity, setIdentity] = useState({ identityKey: "initial", csrf: boot.csrf });
  const [movie, setMovie] = useState(boot.target.scope.movieId), [revision, setRevision] = useState(0);
  const [fault, setFault] = useState("none"), [feedback, setFeedback] = useState("");
  const adapter = useMemo<SyntheticScriptVersionAdapter>(() => ({ mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: identity.identityKey, target: boot.target,
    readOriginal: input => rpc("readOriginal", input, identity.csrf), saveVersion: input => rpc("saveVersion", input, identity.csrf),
    readVersion: input => rpc("readVersion", input, identity.csrf), listVersions: input => rpc("listVersions", input, identity.csrf),
  }), [identity]);
  const artifact = useMemo(() => {
    if (!revision) return boot.artifact;
    const a = structuredClone(boot.artifact); Object.assign(a.source, { sourceContextHash: "9".repeat(64) });
    Object.assign(a.draft.payload.source, { contextHash: a.source.sourceContextHash }); Object.assign(a.candidate.payload.source, { contextHash: a.source.sourceContextHash }); return a;
  }, [revision]);
  const context = { ...studioContext, projectId: boot.target.scope.projectId, projectHref: `/projects/${boot.target.scope.projectId}`,
    movie: { ...studioContext.movie!, id: movie, title: "Synthetic disposable movie" } };
  return <PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams(query)}><AppShell><main className={pageClass}><div className={contentClass} onClickCapture={event => {
    const anchor = (event.target as HTMLElement).closest("a"); if (!anchor?.getAttribute("href")?.startsWith(path)) return;
    event.preventDefault(); const url = new URL(anchor.href); history.pushState(null, "", url); setQuery(url.search);
  }}>
    <section aria-label="Disposable test controls" className="space-y-3 border border-white/10 p-3">
      <p className="text-xs text-amber-200">Synthetic harness only · Newly owned disposable PostgreSQL · No production routes</p>
      <label className="text-xs text-zinc-400">Test session <select aria-label="Test session" className={controlClass} defaultValue="editor-a" onChange={async e => setIdentity(await control({ action: "session", name: e.target.value }))}>{["editor-a", "editor-b", "reader"].map(s => <option key={s}>{s}</option>)}</select></label>{" "}
      <label className="text-xs text-zinc-400">Test fault <select aria-label="Test fault" className={controlClass} value={fault} onChange={async e => { const value = e.target.value; await control({ action: "fault", value }); setFault(value); }}>{["none", "rollback", "origin", "stale", "lost-response"].map(s => <option key={s}>{s}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button className={secondaryButtonClass} onClick={async () => { await control({ action: "competing-save" }); setFeedback("Competing version saved"); }}>Save competing version</button>
        <button className={secondaryButtonClass} onClick={() => setMovie(v => v === boot.target.scope.movieId ? "other-movie" : boot.target.scope.movieId)}>Switch selected movie</button>
        <button className={secondaryButtonClass} onClick={() => setRevision(v => v + 1)}>Change artifact identity</button></div>
      <p role="status" className="text-xs text-zinc-400">{feedback}</p>
    </section>
    <RecapStudioShell context={context} recapPath={path} query={query} previewForTest={{ status: "READY", artifact }} versionAdapterForTest={adapter}><p>Existing Saved Recap destination</p></RecapStudioShell>
  </div></main></AppShell></SearchParamsContext.Provider></PathnameContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
