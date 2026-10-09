import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight, CheckCircle2, CircleAlert, Clock3, Film, FolderKanban, Plus, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { readDashboard } from "./dashboard-data";
import type { buildDashboard } from "./dashboard-model";
import { dateLabel, languageName } from "./projects/[id]/overview-model";
import { cardClass, linkClass, StatusBadge } from "./projects/[id]/overview-components";

type Dashboard = ReturnType<typeof buildDashboard>;
const primaryClass = "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300";

export default async function Home() {
  // Fresh on request; never bake workflow data into the production build.
  await connection();
  let dashboard;
  try { dashboard = await readDashboard(); }
  catch { /* Show unavailable state without exposing database errors. */ }

  return <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Manage your movie localization and recap workflow.</p>
        </div>
        <Link href="/projects/new" className={primaryClass}><Plus size={16} aria-hidden="true" />New Project</Link>
      </header>
      {!dashboard ? <section className={`${cardClass} p-8`} role="status">
        <CircleAlert size={24} className="text-amber-300" aria-hidden="true" />
        <h2 className="mt-4 font-semibold">Dashboard is unavailable</h2>
        <p className="mt-2 text-sm text-zinc-400">We couldn’t load saved projects. Refresh the page to try again.</p>
        <Link href="/projects" className={`${linkClass} mt-5`}>View projects<ArrowUpRight size={14} aria-hidden="true" /></Link>
      </section> : !dashboard.totalProjects ? <section className={`${cardClass} flex flex-col items-center p-8 text-center sm:p-16`}>
        <Film size={32} className="text-violet-300" aria-hidden="true" />
        <h2 className="mt-5 text-xl font-semibold">Start your first movie localization project.</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">Upload a source movie, then work through transcription, translation and human review.</p>
        <Link href="/projects/new" className={`${primaryClass} mt-6`}><Plus size={16} aria-hidden="true" />New Project</Link>
      </section> : <DashboardContent dashboard={dashboard} />}
    </div>
  </main>;
}

function DashboardContent({ dashboard }: { dashboard: Dashboard }) {
  return <>
    <section aria-labelledby="upload-heading" className={`${cardClass} flex flex-col justify-between gap-5 border-violet-400/20 p-5 sm:flex-row sm:items-center sm:p-6`}>
      <div className="flex items-start gap-4">
        <span className="rounded-xl border border-violet-400/20 bg-violet-400/10 p-3 text-violet-300"><Upload size={23} aria-hidden="true" /></span>
        <div><h2 id="upload-heading" className="text-base font-semibold">Start a new translation</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Bring a source movie into your localization workspace.</p></div>
      </div>
      <Link href="/projects/new" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300"><Upload size={16} aria-hidden="true" />Upload Movie</Link>
    </section>
    <section aria-label="Saved workflow summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Total Projects", value: dashboard.totalProjects, detail: "All saved projects", icon: FolderKanban, color: "text-violet-300" },
        { label: "Needs Review", value: dashboard.needsReview, detail: "Projects with unapproved segments", icon: CircleAlert, color: "text-amber-300" },
        { label: "Fully Approved", value: dashboard.fullyApproved, detail: "All saved segments human approved", icon: ShieldCheck, color: "text-emerald-300" },
        { label: "Saved Recaps", value: dashboard.savedRecaps, detail: "Saved scripts · freshness checked in workspace", icon: Sparkles, color: "text-indigo-300" },
      ].map(({ label, value, detail, icon: Icon, color }) => <div key={label} className={`${cardClass} p-5`}>
        <div className="flex items-center justify-between gap-2"><h2 className="text-xs font-medium text-zinc-400">{label}</h2><Icon size={17} className={color} aria-hidden="true" /></div>
        <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p><p className="mt-2 text-[11px] leading-5 text-zinc-500">{detail}</p>
      </div>)}
    </section>
    <p className="text-xs leading-5 text-zinc-500">Summary uses each project’s latest movie. Saved states only; check a project’s Overview for live jobs and media availability. Approval counts do not certify export readiness.</p>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section aria-labelledby="projects-heading" className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 id="projects-heading" className="text-base font-semibold">Recent projects</h2><p className="mt-1 text-xs text-zinc-500">Latest saved work · showing {dashboard.recent.length} of {dashboard.totalProjects}</p></div>
          <Link href="/projects" className={`${linkClass} shrink-0`}>View all<ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">{dashboard.recent.map((card) => <ProjectCard key={card.project.id} card={card} />)}</div>
      </section>
      <div className="min-w-0 space-y-6">
        <Attention dashboard={dashboard} />
        <section aria-labelledby="activity-heading" className={`${cardClass} p-5`}>
          <h2 id="activity-heading" className="text-sm font-semibold">Recent activity</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Latest saved timestamps, not a full audit log.</p>
          <ul className="mt-5 space-y-5">{dashboard.activities.map((item) => <li key={item.key} className="flex items-start gap-3">
            <Clock3 size={14} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" />
            <div className="min-w-0"><p className="text-xs font-medium text-zinc-300">{item.label}</p><Link href={item.href} className={`${linkClass} mt-1 break-all leading-5`}>{item.project}</Link><time dateTime={item.date.toISOString()} className="mt-1 block text-[11px] text-zinc-500">{dateLabel(item.date)}</time></div>
          </li>)}</ul>
        </section>
      </div>
    </div>
  </>;
}

function ProjectCard({ card }: { card: Dashboard["recent"][number] }) {
  return <article className={`${cardClass} p-5`}>
    <div className="flex items-start gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#0c0c10] text-zinc-500"><Film size={23} aria-hidden="true" /></div>
      <div className="min-w-0 flex-1">
        <Link href={card.base} className="block break-words text-sm font-semibold transition hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-300">{card.project.name}</Link>
        {card.movie && card.movie.title !== card.project.name && <p className="mt-1 break-words text-xs text-zinc-400">{card.movie.title}</p>}
        <p className="mt-1 break-all text-xs leading-5 text-zinc-500">{card.movie?.filename ?? "No source filename"}</p>
        <p className="mt-2 text-xs text-zinc-400">{languageName(card.movie?.sourceLanguage ?? card.project.sourceLanguage)} → {languageName(card.project.targetLanguage)}</p>
      </div>
    </div>
    <div className="mt-4"><StatusBadge status={card.stage} tone={card.tone} /><p className="mt-3 text-xs leading-5 text-zinc-400">{card.detail}</p></div>
    {!!card.review?.total && <p className="mt-2 text-xs leading-5 text-zinc-500">{card.review.total} translated · {card.review.approved} approved · {card.transcriptCount} source segments</p>}
    {!!card.transcriptCount && <p className="mt-2 text-xs leading-5 text-zinc-500">{card.movie?._count.scenes ?? 0} scenes saved{card.movie?.recap ? " · recap script saved" : " · no recap script"}</p>}
    {card.project._count.movies > 1 && <p className="mt-2 text-xs text-zinc-500">Latest of {card.project._count.movies} movies</p>}
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.06] pt-4">
      <time dateTime={card.latest.toISOString()} className="text-[11px] leading-5 text-zinc-500">Updated {dateLabel(card.latest)}</time>
      <Link href={card.action.href} className={linkClass}>{card.action.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>
    </div>
  </article>;
}

function Attention({ dashboard }: { dashboard: Dashboard }) {
  return <section aria-labelledby="attention-heading" className={`${cardClass} p-5`}>
    <div className="flex items-center gap-2"><CircleAlert size={17} className="text-amber-300" aria-hidden="true" /><h2 id="attention-heading" className="text-sm font-semibold">Needs attention</h2>{!!dashboard.attention.length && <span className="ml-auto rounded-md bg-amber-400/10 px-2 py-1 text-xs tabular-nums text-amber-200">{dashboard.attention.length}</span>}</div>
    {dashboard.attention.length ? <>
      <ul className="mt-3 divide-y divide-white/[0.06]">{dashboard.attention.slice(0, 6).map((item) => <li key={item.key} className="py-4">
        <p className="break-words text-xs font-medium text-zinc-200">{item.project}</p><p className="mt-1 text-xs leading-5 text-zinc-400">{item.message}</p>
        <Link href={item.href} className={`${linkClass} mt-2`}>Open workspace<ArrowUpRight size={13} aria-hidden="true" /></Link>
      </li>)}</ul>
      {dashboard.attention.length > 6 && <p className="mt-2 text-xs text-zinc-500">Showing 6 of {dashboard.attention.length} saved attention items.</p>}
    </> : <div className="mt-5 flex gap-3 text-sm text-zinc-400"><CheckCircle2 size={18} className="shrink-0 text-emerald-300" aria-hidden="true" /><p>No attention items in saved workflow data.</p></div>}
  </section>;
}
