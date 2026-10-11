"use client";

import Link from "next/link";
import { useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import SourceVideoPreview from "@/components/media/source-video-preview";
import { badgeClass, badgeTones, cardClass, focusClass, linkClass } from "@/components/ui/styles";
import { recapExperienceHref, selectedStudioWorkspace, studioWorkspaces, type StudioWorkspace } from "./navigation";

type MovieContext = { id: string; title: string; filename: string | null; sourceRecorded: boolean };
export type RecapStudioContext = {
  projectId: string;
  projectName: string;
  movie: MovieContext | null;
  transcriptState: "MISSING" | "EMPTY" | "READY";
  transcriptSegmentCount: number;
  sceneCount: number;
  characterState: "CURRENT" | "ABSENT" | "STALE" | "UNAVAILABLE";
  projectHref: string;
};

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); };
}

const unavailable = {
  script: { title: "No Storyline script version", description: "Storyline script saving, version history and generation are not implemented yet." },
  "ai-review": { title: "No AI review receipt", description: "Storyline review and human source-verification receipts are not implemented yet. Subtitle approval does not approve Studio narration." },
  voice: { title: "No configured TTS", description: "No Studio Myanmar TTS integration or voice takes are available. No audio has been generated." },
  highlights: { title: "No highlight plan", description: "Highlight suggestions, clip editing and measured voice-first timelines are not implemented yet. The player shows only the original uploaded source." },
  export: { title: "No recap video output", description: "Storyline video rendering is not implemented yet. Existing subtitle and full-movie exports remain in the project Export workspace." },
} as const;

function ReadOnlyPanel({ title, children }: { title: string; children: ReactNode }) {
  return <section className={`${cardClass} p-5`}>
    <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
    <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-400">{children}</div>
  </section>;
}

export default function RecapStudioShell({ context, recapPath, query, children }: {
  context: RecapStudioContext;
  recapPath: string;
  query: string;
  children: ReactNode;
}) {
  const workspace = selectedStudioWorkspace(query);
  const prerequisitesReady = !!context.movie && context.transcriptState === "READY" && context.sceneCount > 0 && context.characterState === "CURRENT";
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const href = (next: StudioWorkspace | null) => recapExperienceHref(recapPath, query, context.movie?.id ?? null, next, hash);
  const navClass = (selected: boolean) => `inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium ${focusClass} ${selected ? "bg-violet-400/10 text-violet-200" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"}`;

  function moveTab(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); return; }
    const next = event.key === "Home" ? 0 : event.key === "End" ? studioWorkspaces.length - 1
      : event.key === "ArrowRight" ? (index + 1) % studioWorkspaces.length
        : event.key === "ArrowLeft" ? (index + studioWorkspaces.length - 1) % studioWorkspaces.length : null;
    if (next === null) return;
    event.preventDefault();
    // Manual activation: arrow keys move focus, Enter follows the real link.
    document.getElementById(`studio-tab-${studioWorkspaces[next].id}`)?.focus();
  }

  return <div className="min-w-0 space-y-5">
    <nav aria-label="Recap experience" className="flex min-w-0 flex-wrap gap-2 rounded-xl border border-white/10 bg-[#111115] p-2">
      <Link href={href(null)} prefetch={false} scroll={false} aria-current={!workspace ? "page" : undefined} className={navClass(!workspace)}>Saved Recap</Link>
      <Link href={href("script")} prefetch={false} scroll={false} aria-current={workspace ? "page" : undefined} className={navClass(!!workspace)}>Storyline Studio</Link>
    </nav>

    {!workspace ? children : <div className="min-w-0 space-y-5">
      <header className="min-w-0 border-b border-white/10 pb-5">
        <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-400">
          <Link href="/projects" className={linkClass}>Projects</Link><span aria-hidden="true">/</span>
          <Link href={context.projectHref} className={`${linkClass} min-w-0 break-words`}>{context.projectName}</Link><span aria-hidden="true">/</span>
          <span>Recap</span><span aria-hidden="true">/</span><span aria-current="page">Storyline Studio</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Storyline Studio</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Character psychology · Myanmar storyline highlights</p>
        <p className="mt-3 break-words text-sm text-zinc-200">{context.movie?.title ?? "No movie selected"}</p>
        {context.movie && <p className="mt-1 break-all text-xs leading-5 text-zinc-400">{context.movie.filename ?? "Original filename unavailable"} · Movie ID: {context.movie.id}</p>}
      </header>

      <div role="tablist" aria-label="Storyline Studio workspaces" className="flex min-w-0 flex-wrap gap-1 border-b border-white/10 pb-2">
        {studioWorkspaces.map(({ id, label }, index) => <Link key={id} id={`studio-tab-${id}`} role="tab" href={href(id)} prefetch={false} scroll={false}
          aria-selected={workspace === id} aria-controls="studio-context-panel" tabIndex={workspace === id ? 0 : -1}
          onKeyDown={(event) => moveTab(event, index)} className={navClass(workspace === id)}>{label}</Link>)}
      </div>

      <div id="studio-context-panel" role="tabpanel" aria-labelledby={`studio-tab-${workspace}`} tabIndex={0} className={`min-w-0 space-y-5 ${focusClass}`}>
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <div className="min-w-0 space-y-5">
            <ReadOnlyPanel title={unavailable[workspace].title}>
              <span className={`${badgeClass} ${badgeTones.neutral}`}>Unavailable · Read-only shell</span>
              <p>{unavailable[workspace].description}</p>
              <p>No Studio generation, review, voice or rendering starts from navigation.</p>
            </ReadOnlyPanel>
            {workspace === "script" && <ReadOnlyPanel title="No persisted source snapshot">
              <p>Source preparation contracts exist, but Studio snapshot persistence is not implemented. This page does not prepare or approve a snapshot.</p>
              <p>Duration planning is unavailable until verified story events and an approved duration policy exist.</p>
            </ReadOnlyPanel>}
            {workspace === "ai-review" && <ReadOnlyPanel title="Source and translation policy">
              <p>Chinese transcript is primary dialogue evidence. ALL_CURRENT admits valid, current and aligned Myanmar translations regardless of subtitle approval.</p>
              <p>Unapproved translations remain provisional context. Human edits, subtitle approval and QC results do not independently verify story or psychology claims.</p>
              <p>No claim evidence or translation admission has been verified for a Studio snapshot.</p>
            </ReadOnlyPanel>}
            {workspace === "highlights" && <ReadOnlyPanel title="Original source video">
              <SourceVideoPreview projectId={context.projectId} movie={context.movie} className="w-full rounded-lg" />
              <p>Read-only source playback. No clip plan, generated narration or recap preview is available.</p>
            </ReadOnlyPanel>}
          </div>
          <ReadOnlyPanel title="Selected source context">
            <span className={`${badgeClass} ${prerequisitesReady ? badgeTones.neutral : badgeTones.amber}`}>{prerequisitesReady ? "Read-only context" : "Studio prerequisites incomplete"}</span>
            <dl className="space-y-3 text-xs leading-5">
              <div><dt className="text-zinc-400">Transcript</dt><dd className="text-zinc-200">{context.transcriptState === "READY" ? `${context.transcriptSegmentCount} saved segments` : context.transcriptState === "EMPTY" ? "No usable transcript segments" : "No transcript available"}</dd></div>
              <div><dt className="text-zinc-400">Scenes</dt><dd className="text-zinc-200">{context.sceneCount ? `${context.sceneCount} saved intervals` : "No scene intervals available"}</dd></div>
              <div><dt className="text-zinc-400">Character analysis</dt><dd className="text-zinc-200">{context.characterState === "CURRENT" ? "Current · advisory" : context.characterState === "STALE" ? "Stale · needs attention" : context.characterState === "UNAVAILABLE" ? "Currentness unavailable" : "Not available"}</dd></div>
              <div><dt className="text-zinc-400">Studio source snapshot</dt><dd className="text-zinc-200">No persisted source snapshot</dd></div>
            </dl>
            <p>Saved source context is not an approved Studio script or evidence-verification receipt.</p>
            {!context.movie && <Link href={context.projectHref} className={linkClass}>Open Project Overview</Link>}
          </ReadOnlyPanel>
        </div>
      </div>
    </div>}
  </div>;
}
