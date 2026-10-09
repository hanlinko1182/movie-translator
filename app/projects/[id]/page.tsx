import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { pageClass, contentClass } from "@/components/ui/styles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Film } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { localStorage, getAudioStorageKey } from "@/lib/storage";
import { getMovieMediaJob } from "@/lib/queue/media-queue";
import { getMovieTranscriptionJob } from "@/lib/queue/transcription-queue";
import { getMovieTranslationJob } from "@/lib/queue/translation-queue";
import { getSceneDetectionJob } from "@/lib/queue/scene-queue";
import { getRecapJob } from "@/lib/queue/recap-queue";
import { readMovieRecap } from "@/lib/recap/read-recap";
import { readMovieCharacters } from "@/lib/character-analysis/read-analysis";
import { buildOverview, overviewSelect, languageName, dateLabel, durationLabel, type OverviewFacts } from "./overview-model";
import { cardClass, linkClass, StatusBadge, WorkflowPipeline, NextActionCard, MediaPreviewCard, ProjectOutputCard, RecentActivity } from "./overview-components";
import { RefreshOverviewButton } from "./overview-action";

export default async function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { id: projectSlug } = await params;
  let project;
  try { project = await prisma.project.findUnique({ where: { slug: projectSlug }, select: overviewSelect }); }
  catch { return <WorkspaceUnavailable title="Project is unavailable" description="We couldn’t load this project. Please try again shortly." href="/projects" label="Projects" />; }
  if (!project) notFound();
  const movie = project.movies[0];
  const facts: OverviewFacts = { sourceAvailable: null, audioAvailable: null, jobs: { media: null, transcription: null, translation: null, scenes: null, recap: null }, recapStale: null, charactersStale: null };
  if (movie) {
    // Existing read helpers only. Missing infrastructure cannot hide saved outputs.
    const reads = await Promise.allSettled([
      movie.storageKey ? localStorage.exists(movie.storageKey) : Promise.resolve(false),
      localStorage.exists(getAudioStorageKey(movie.id)),
      getMovieMediaJob(movie.id), getMovieTranscriptionJob(movie.id), getMovieTranslationJob(movie.id), getSceneDetectionJob(movie.id),
      movie.transcript?._count.segments && movie._count.scenes ? getRecapJob(movie.id) : Promise.resolve(null),
      movie.recap ? readMovieRecap(movie.id) : Promise.resolve({ recap: null }),
      movie.characterAnalysis ? readMovieCharacters(movie.id) : Promise.resolve({ analysis: null }),
    ] as const);
    facts.sourceAvailable = reads[0].status === "fulfilled" ? reads[0].value : null;
    facts.audioAvailable = reads[1].status === "fulfilled" ? reads[1].value : null;
    for (const [index, key] of (["media", "transcription", "translation", "scenes", "recap"] as const).entries()) {
      const result = reads[index + 2];
      facts.jobs[key] = result.status === "fulfilled" ? (result.value as { state: string } | null)?.state ?? null : undefined;
    }
    facts.recapStale = reads[7].status === "fulfilled" ? reads[7].value.recap?.stale ?? null : null;
    facts.charactersStale = reads[8].status === "fulfilled" ? reads[8].value.analysis?.stale ?? null : null;
  }
  const overview = buildOverview(project, facts);
  const base = `/projects/${encodeURIComponent(project.slug)}`;
  const workspace = [{ label: "Overview", href: base }, { label: "Transcription", href: overview.links.transcript }, { label: "Translation", href: overview.links.translation }, { label: "Review", href: overview.links.review }, { label: "Recap", href: overview.links.recap }, { label: "Export", href: overview.links.export }];
  return <main className={pageClass}>
    <div className={contentClass}>
      <header>
        <div className="mb-6 flex items-center justify-between gap-4"><Link href="/projects" className={`${linkClass} text-zinc-400`}><ArrowLeft size={15} aria-hidden="true" />Projects</Link><RefreshOverviewButton /></div>
        <div className="flex items-start gap-4 sm:gap-5"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#15151a] sm:h-20 sm:w-20"><Film size={26} className="text-zinc-500" aria-hidden="true" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-semibold tracking-tight">{project.name}</h1><StatusBadge status={overview.status} /></div><p className="mt-2 break-all text-sm text-zinc-400">{movie?.filename ?? "No source movie uploaded"}</p><p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500"><span>{languageName(movie?.sourceLanguage ?? project.sourceLanguage)} → {languageName(project.targetLanguage)}</span><span>{durationLabel(movie?.durationSeconds)}</span><span>Updated <time dateTime={overview.latest.toISOString()}>{dateLabel(overview.latest)}</time></span></p></div></div>
        <nav aria-label="Project workspace" className="mt-6 flex flex-wrap gap-1 border-b border-white/10 pb-3">{workspace.map((item, index) => <Link key={item.label} href={item.href} aria-current={index === 0 ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-violet-300 ${index === 0 ? "bg-violet-400/10 text-violet-300" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}>{item.label}</Link>)}</nav>
      </header>
      {project._count.movies > 1 && <p className="text-xs text-zinc-500">Showing the most recently uploaded movie · {project._count.movies} movies in this project.</p>}
      {overview.statusUnavailable && <p role="status" className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-zinc-400">Live processing status is temporarily unavailable. Saved outputs are shown below.</p>}
      <NextActionCard overview={overview} />
      <WorkflowPipeline stages={overview.stages} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-6"><MediaPreviewCard overview={overview} sourceLanguage={movie?.sourceLanguage ?? project.sourceLanguage} /><RecentActivity activities={overview.activities} /></div>
        <div className="min-w-0 space-y-6"><ProjectOutputCard outputs={overview.outputs} /><section aria-labelledby="advanced-heading" className={`${cardClass} p-5 md:p-6`}><h2 id="advanced-heading" className="text-sm font-semibold">Advanced tools</h2><p className="mt-2 text-xs leading-5 text-zinc-500">{overview.sceneCount} scenes · {movie?._count.characterEvidence ?? 0} character evidence items{movie?.characterAnalysis ? facts.charactersStale === true ? " · analysis needs checking" : facts.charactersStale === null ? " · analysis freshness unavailable" : " · current character analysis" : " · no character analysis"}</p><div className="mt-4 grid grid-cols-2 gap-3">{[{ label: "Scenes", href: overview.links.scenes }, { label: "Characters & evidence", href: overview.links.characters }, { label: "Glossary", href: `${base}/glossary` }, { label: "Translation Memory", href: `${base}/translation-memory` }].map((item) => <Link key={item.label} href={item.href} className={`${linkClass} rounded-lg border border-white/[0.07] p-3`}>{item.label}<ArrowUpRight size={13} className="shrink-0" aria-hidden="true" /></Link>)}</div></section></div>
      </div>
    </div>
  </main>;
}
