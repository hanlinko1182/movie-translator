// Isolated synthetic harness. No Next server, database, provider or API route.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import AppShell from "@/components/layout/app-shell";
import RecapControls from "@/app/projects/[id]/recap/RecapControls";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import type { StudioPreviewArtifact, StudioPreviewState } from "@/components/storyline/local-script-model";
import { contentClass, controlClass, pageClass, secondaryButtonClass } from "@/components/ui/styles";
import { completedRecapProps, studioContext } from "./navigation.fixture";

declare const __M9_FIXTURE__: StudioPreviewArtifact;
const original = __M9_FIXTURE__;
const before = JSON.stringify(original);
const path = `/projects/${original.source.payload.projectId}/recap`;
function deepFreeze(value: unknown) {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
}
deepFreeze(original);

function Harness() {
  const [query, setQuery] = useState(location.search);
  const [movie, setMovie] = useState(original.source.payload.movieId);
  const [probe, setProbe] = useState("ready");
  const [revision, setRevision] = useState(0);
  const artifact = useMemo(() => {
    const a = structuredClone(original);
    if (revision) {
      const contextHash = String(revision).padStart(64, "0");
      a.source.sourceContextHash = contextHash;
      Object.assign(a.draft.payload.source, { contextHash, expectedStudioRevision: revision + 3 });
      Object.assign(a.candidate.payload.source, { contextHash });
    }
    if (probe === "draft") Object.assign(a.draft, { draftHash: "9".repeat(64), payload: { ...a.draft.payload, id: "another-original-artifact" } });
    if (probe === "candidate") {
      Object.assign(a.candidate, { candidateHash: "8".repeat(64) });
      Object.assign(a.draft.payload.analysis, { candidateHash: a.candidate.candidateHash, candidateId: "another-candidate" });
    }
    if (probe === "stale") a.currentness = "STALE";
    if (probe === "missing") {
      Object.assign(a.source.payload, { characters: [], transcript: { ...a.source.payload.transcript, segments: [] } });
      Object.assign(a.candidate.payload, { findings: a.candidate.payload.findings.filter(row => row.id !== "competing-interpretation") });
    }
    return a;
  }, [probe, revision]);
  const state: StudioPreviewState = probe === "loading" ? { status: "LOADING" } : probe === "empty" ? { status: "EMPTY" }
    : probe === "error" ? { status: "ERROR" } : probe === "unavailable" ? { status: "UNAVAILABLE" } : { status: "READY", artifact };
  const context = { ...studioContext, projectId: original.source.payload.projectId, projectHref: `/projects/${original.source.payload.projectId}`,
    movie: { ...studioContext.movie!, id: movie, title: "Synthetic selected movie" } };
  return <PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams(query)}>
    <AppShell><main className={pageClass}><div className={contentClass} onClickCapture={event => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor || !anchor.getAttribute("href")?.startsWith(path)) return;
      event.preventDefault();
      const url = new URL(anchor.href); history.pushState(null, "", url); setQuery(url.search);
    }}>
      <section aria-label="Synthetic test harness" className="flex flex-wrap items-center gap-3 border border-white/10 p-3">
        <p className="text-xs text-amber-200">Synthetic test harness · identity probes are not persisted artifacts</p>
        <button type="button" className={secondaryButtonClass} onClick={() => setMovie(id => id === original.source.payload.movieId ? "other-movie" : original.source.payload.movieId)}>Switch selected movie</button>
        <button type="button" className={secondaryButtonClass} onClick={() => setRevision(value => value + 1)}>Change source revision</button>
        <label className="text-xs text-zinc-400">Fixture state <select aria-label="Fixture state" className={controlClass} value={probe} onChange={event => setProbe(event.target.value)}>
          {["ready", "draft", "candidate", "stale", "missing", "loading", "empty", "error", "unavailable"].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <output className="text-xs text-zinc-400">{JSON.stringify(original) === before ? "Original fixture unchanged" : "ORIGINAL MUTATED"}</output>
      </section>
      <RecapStudioShell context={context} recapPath={path} query={query} previewForTest={state}>
        <RecapControls {...completedRecapProps} projectId={context.projectId} projectHref={context.projectHref} movie={{ ...context.movie, durationSeconds: 24 }} />
      </RecapStudioShell>
    </div></main></AppShell>
  </SearchParamsContext.Provider></PathnameContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
