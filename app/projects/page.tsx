import Link from "next/link";
import { connection } from "next/server";
import { CircleAlert, Plus } from "lucide-react";
import { readDashboard } from "@/app/dashboard-data";
import { dateLabel, languageName } from "./[id]/overview-model";
import { cardClass, linkClass } from "./[id]/overview-components";
import ProjectsWorkspace, { type ProjectWorkspaceItem } from "@/components/projects/projects-workspace";

export default async function ProjectsPage() {
  await connection();
  let projects: ProjectWorkspaceItem[] | undefined;
  try {
    const snapshot = await readDashboard();
    // Only presentation fields cross the client boundary; storage keys and
    // database relation objects stay on the server.
    projects = snapshot.projects.map((card) => ({
      id: card.project.id,
      name: card.project.name,
      href: card.base,
      movieTitle: card.movie?.title ?? null,
      filename: card.movie?.filename ?? null,
      movieCount: card.project._count.movies,
      movieStatus: card.movie?.status ?? null,
      uploaded: !!card.movie?.storageKey,
      languages: `${languageName(card.movie?.sourceLanguage ?? card.project.sourceLanguage)} → ${languageName(card.project.targetLanguage)}`,
      status: card.project.status,
      stage: card.stage,
      tone: card.tone,
      detail: card.detail,
      pending: card.pending,
      approved: card.review?.approved ?? 0,
      translated: card.review?.total ?? 0,
      sourceSegments: card.transcriptCount,
      qcSegments: card.movie?.translation?._count.segments ?? 0,
      recapSaved: !!card.movie?.recap,
      updatedAt: card.latest.toISOString(),
      updatedLabel: dateLabel(card.latest),
      action: card.action,
    }));
  } catch { /* Keep infrastructure errors and credentials out of the UI. */ }

  return <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Move your localization projects from source movie to reviewed subtitles and recap.</p>
        </div>
        <Link href="/projects/new" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300"><Plus size={16} aria-hidden="true" />New Project</Link>
      </header>
      {projects ? <ProjectsWorkspace projects={projects} /> : <section role="status" className={`${cardClass} p-8`}>
        <CircleAlert size={24} className="text-amber-300" aria-hidden="true" />
        <h2 className="mt-4 font-semibold">Projects are unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">We couldn’t load saved projects. Refresh the page to try again.</p>
        <Link href="/" className={`${linkClass} mt-5`}>Back to Dashboard</Link>
      </section>}
    </div>
  </main>;
}
