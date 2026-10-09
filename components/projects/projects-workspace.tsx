"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Film, FolderKanban, LayoutGrid, List, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import { cardClass, linkClass, StatusBadge } from "@/app/projects/[id]/overview-components";
import type { StageState } from "@/app/projects/[id]/overview-model";

export type ProjectWorkspaceItem = {
  id: string; name: string; href: string;
  movieTitle: string | null; filename: string | null; movieCount: number;
  movieStatus: string | null; uploaded: boolean; languages: string;
  status: string; stage: string; tone: StageState; detail: string;
  pending: number; approved: number; translated: number; sourceSegments: number;
  qcSegments: number; recapSaved: boolean; updatedAt: string; updatedLabel: string;
  action: { label: string; href: string };
};

const controlClass = "min-w-0 rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2.5 text-sm text-zinc-200 outline-none focus-visible:border-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400";
function statusLabel(value: string) { return value.charAt(0) + value.slice(1).toLowerCase(); }

export default function ProjectsWorkspace({ projects }: { projects: ProjectWorkspaceItem[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const statuses = [...new Set(projects.map((project) => project.status))].sort();
  const stages = [...new Set(projects.map((project) => project.stage))].sort();
  const query = search.trim().toLocaleLowerCase();
  const visible = projects.filter((project) =>
    (!status || project.status === status) && (!stage || project.stage === stage) &&
    (!query || [project.name, project.movieTitle, project.filename, project.languages].some((value) => value?.toLocaleLowerCase().includes(query)))
  );
  const filtered = !!(search || status || stage);
  function clearFilters() { setSearch(""); setStatus(""); setStage(""); }

  if (!projects.length) return <section className={`${cardClass} flex flex-col items-center p-8 text-center sm:p-16`}>
    <FolderKanban size={32} className="text-violet-300" aria-hidden="true" />
    <h2 className="mt-5 text-xl font-semibold">Start your first movie localization project.</h2>
    <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">Upload a source movie to begin transcription, translation and human review.</p>
    <Link href="/projects/new" className={`${linkClass} mt-6 rounded-lg border border-violet-400/25 bg-violet-400/10 px-4 py-3`}><Plus size={16} aria-hidden="true" />New Project</Link>
  </section>;

  return <>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400" aria-label="Saved project summary">
      <span className="inline-flex items-center gap-2"><FolderKanban size={15} className="text-violet-300" aria-hidden="true" />{projects.length} saved projects</span>
      <span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-amber-300" aria-hidden="true" />{projects.filter((project) => project.pending > 0).length} with unapproved subtitles</span>
      <span className="inline-flex items-center gap-2"><Sparkles size={15} className="text-indigo-300" aria-hidden="true" />{projects.filter((project) => project.recapSaved).length} with saved recaps</span>
    </div>
    <section aria-label="Project search and filters" className={`${cardClass} p-4`}>
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
        <div className="min-w-0 sm:col-span-2 xl:col-span-1">
          <label htmlFor="project-search" className="mb-2 block text-xs text-zinc-400">Search projects</label>
          <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" /><input id="project-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Project, movie or filename…" className={`${controlClass} w-full pl-9 placeholder:text-zinc-600`} /></div>
        </div>
        <div className="min-w-0"><label htmlFor="project-status" className="mb-2 block text-xs text-zinc-400">Saved project status</label><select id="project-status" value={status} onChange={(event) => setStatus(event.target.value)} className={`${controlClass} w-full`}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></div>
        <div className="min-w-0"><label htmlFor="project-stage" className="mb-2 block text-xs text-zinc-400">Workflow stage</label><select id="project-stage" value={stage} onChange={(event) => setStage(event.target.value)} className={`${controlClass} w-full`}><option value="">All stages</option>{stages.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className="inline-flex w-fit gap-1 rounded-lg border border-white/10 bg-[#0c0c10] p-1" role="group" aria-label="Project presentation">
          {([{ value: "grid", label: "Grid view", icon: LayoutGrid }, { value: "list", label: "List view", icon: List }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-label={label} aria-pressed={view === value} onClick={() => setView(value)} className={`rounded-md p-2 transition focus-visible:outline-2 focus-visible:outline-violet-300 ${view === value ? "bg-violet-400/15 text-violet-300" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"}`}><Icon size={18} aria-hidden="true" /></button>)}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <p role="status" aria-live="polite" className="text-xs text-zinc-400">Showing {visible.length} of {projects.length} projects · latest saved work first</p>
        {filtered && <button type="button" onClick={clearFilters} className={linkClass}>Clear filters</button>}
      </div>
    </section>
    <p className="text-xs leading-5 text-zinc-500">Workflow reflects each project’s newest movie. Statuses are persisted snapshots; check Overview for live jobs and media availability. A saved recap may need a freshness check.</p>
    <section aria-labelledby="all-projects-heading" className="min-w-0">
      <h2 id="all-projects-heading" className="mb-4 text-sm font-semibold">Your projects</h2>
      {visible.length ? <div className={view === "grid" ? "grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3" : "space-y-3"}>
        {visible.map((project) => <ProjectItem key={project.id} project={project} view={view} />)}
      </div> : <div className={`${cardClass} p-8 text-center`}><Search size={24} className="mx-auto text-zinc-500" aria-hidden="true" /><h3 className="mt-4 font-medium">No matching projects</h3><p className="mt-2 text-sm text-zinc-400">Try a different search or broaden your workflow filters.</p><button type="button" onClick={clearFilters} className={`${linkClass} mt-5`}>Clear filters</button></div>}
    </section>
  </>;
}

function ProjectItem({ project, view }: { project: ProjectWorkspaceItem; view: "grid" | "list" }) {
  const list = view === "list";
  return <article className={`${cardClass} flex flex-col gap-5 p-5 ${list ? "xl:flex-row xl:items-center" : ""}`}>
    <div className={`flex min-w-0 items-start gap-3 ${list ? "xl:flex-[1.2]" : ""}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#0c0c10] text-zinc-500"><Film size={22} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h3><Link href={project.href} className="block break-words text-sm font-semibold transition hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-300">{project.name}</Link></h3>
        <p className="mt-2 break-words text-xs leading-5 text-zinc-400">{project.movieTitle ? `Current movie: ${project.movieTitle}` : "No current movie"}</p>
        {project.filename && <p className="mt-1 break-all text-xs leading-5 text-zinc-500">{project.filename}</p>}
        <p className="mt-2 text-xs text-zinc-400">{project.languages}</p>
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">{project.movieCount > 1 ? `Newest of ${project.movieCount} movies · ` : ""}{project.movieStatus ? project.uploaded ? `Movie status: ${statusLabel(project.movieStatus)} (recorded)` : "Movie metadata only · no upload recorded" : "Upload a source movie to begin"}</p>
      </div>
    </div>
    <div className={`min-w-0 ${list ? "xl:flex-1" : "flex-1"}`}>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={project.stage} tone={project.tone} /><span className={`rounded-md border px-2 py-1 text-[11px] ${project.status === "FAILED" ? "border-rose-400/20 text-rose-300" : project.status === "PROCESSING" ? "border-violet-400/20 text-violet-300" : "border-white/10 text-zinc-400"}`}>Project: {statusLabel(project.status)}</span></div>
      <p className="mt-3 text-xs leading-5 text-zinc-400">{project.detail}</p>
      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-xs">
        <div><dt className="text-zinc-500">Source / translated</dt><dd className="mt-1 text-zinc-300">{project.sourceSegments} / {project.translated} segments</dd></div>
        <div><dt className="text-zinc-500">Human review</dt><dd className={`mt-1 ${project.pending ? "text-amber-200" : "text-zinc-300"}`}>{project.translated ? <>{project.pending} awaiting approval<span className="text-zinc-500"> · {project.approved} approved</span></> : "No translation yet"}</dd></div>
      </dl>
      {!!project.qcSegments && <p className="mt-3 text-xs text-amber-200">{project.qcSegments} {project.qcSegments === 1 ? "segment" : "segments"} with open QC findings</p>}
      <p className={`mt-3 inline-flex items-center gap-1.5 text-xs ${project.recapSaved ? "text-indigo-300" : "text-zinc-500"}`}>{project.recapSaved ? <CheckCircle2 size={13} aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}{project.recapSaved ? "Recap script saved" : "Recap not generated"}</p>
    </div>
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 ${list ? "xl:w-40 xl:shrink-0 xl:flex-col xl:items-start xl:border-t-0 xl:pt-0" : ""}`}>
      <div><p className="text-[10px] uppercase tracking-wider text-zinc-600">Updated</p><time dateTime={project.updatedAt} className="mt-1 block text-[11px] leading-5 text-zinc-400">{project.updatedLabel}</time></div>
      <Link href={project.action.href} className={`${linkClass} rounded-lg border border-violet-400/15 bg-violet-400/[0.05] px-3 py-2.5`}>{project.action.label}<ArrowUpRight size={14} className="shrink-0" aria-hidden="true" /></Link>
    </div>
  </article>;
}
