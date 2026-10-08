import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Languages } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getTranslationReview } from "@/lib/translation-qc/service";
import { getMovieTranslationJob } from "@/lib/queue/translation-queue";
import TranslationReviewPanel from "@/components/translation/translation-review";
import type { WorkspaceSnapshot } from "@/components/translation/workspace-model";
import { cardClass, linkClass } from "../overview-components";
import { RefreshOverviewButton } from "../overview-action";

export default async function TranslationPage({ params, searchParams }: PageProps<"/projects/[id]/translation">) {
  const { id: slug } = await params; const query = await searchParams;
  const projectPath = `/projects/${encodeURIComponent(slug)}`;
  let project;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: {
      name: true,
      movies: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
        id: true, title: true, filename: true, durationSeconds: true, sourceLanguage: true,
      } },
    } });
  } catch {
    return <main className="p-4 sm:p-6 lg:p-8"><section className={`${cardClass} mx-auto max-w-7xl p-6`}><h1 className="text-xl font-semibold">Translation is unavailable</h1><p role="alert" className="mt-2 text-sm text-zinc-400">We couldn’t load this project right now. Please try again.</p><div className="mt-5 flex flex-wrap gap-5"><RefreshOverviewButton label="Try again" /><Link href={projectPath} className={linkClass}>Project overview</Link></div></section></main>;
  }
  if (!project) notFound();
  const movie = query.movieId ? project.movies.find((item) => item.id === query.movieId) : project.movies[0];
  if (query.movieId && !movie) notFound();
  let snapshot: WorkspaceSnapshot | null = null;
  if (movie) {
    // Read-only composition: never validate a provider or enqueue work during render.
    // Load dialogue only for the selected movie, not every long movie in the project.
    const [dialogue, review, job] = await Promise.allSettled([
      prisma.movie.findUnique({ where: { id: movie.id }, select: {
        transcript: { select: { id: true, segments: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true } } } },
        translation: { select: { sourceTranscriptId: true, provider: true, model: true, updatedAt: true, segments: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true } } } },
      } }), getTranslationReview(movie.id), getMovieTranslationJob(movie.id),
    ]);
    if (dialogue.status === "rejected") return <main className="p-4 sm:p-6 lg:p-8"><section className={`${cardClass} mx-auto max-w-7xl p-6`}><h1 className="text-xl font-semibold">Translation is unavailable</h1><p role="alert" className="mt-2 text-sm text-zinc-400">We couldn’t load saved dialogue right now. Please try again.</p><div className="mt-5 flex flex-wrap gap-5"><RefreshOverviewButton label="Try again" /><Link href={projectPath} className={linkClass}>Project overview</Link></div></section></main>;
    if (!dialogue.value) notFound();
    const { transcript, translation } = dialogue.value;
    snapshot = {
      movie: { id: movie.id, title: movie.title, filename: movie.filename, durationSeconds: movie.durationSeconds, sourceLanguage: movie.sourceLanguage },
      source: transcript ? { id: transcript.id, rows: transcript.segments } : null,
      translation: translation ? { sourceTranscriptId: translation.sourceTranscriptId, provider: translation.provider, model: translation.model, savedAt: translation.updatedAt.toISOString(), rows: translation.segments } : null,
      review: review.status === "fulfilled" ? review.value : null,
      reviewUnavailable: !!translation && review.status === "rejected",
      job: job.status === "fulfilled" && job.value ? { state: job.value.state, attemptsMade: job.value.attemptsMade } : null,
      jobAvailable: job.status === "fulfilled",
    };
  }
  return <main className="min-w-0 flex-1 p-4 sm:p-5 lg:p-6"><div className="mx-auto max-w-[1600px] space-y-4">
    <header>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className={linkClass}>Projects</Link><ChevronRight size={13} aria-hidden="true" /><Link href={projectPath} className={`${linkClass} min-w-0 break-words`}>{project.name}</Link><ChevronRight size={13} aria-hidden="true" /><span className="text-zinc-300">Translation</span></nav>
      {!snapshot && <><h1 className="mt-5 text-2xl font-semibold tracking-tight">Translation</h1><p className="mt-2 text-sm text-zinc-400">Translate Chinese subtitles to Myanmar with AI and human review.</p></>}
    </header>
    {project.movies.length > 1 && <nav aria-label="Project movies" className="flex flex-wrap gap-2">{project.movies.map((item) => <Link key={item.id} href={`${projectPath}/translation?movieId=${encodeURIComponent(item.id)}`} aria-current={movie?.id === item.id ? "page" : undefined} className={`max-w-full break-words rounded-lg border border-white/10 px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-violet-300 ${movie?.id === item.id ? "bg-violet-400/10 text-violet-300" : "text-zinc-500 hover:text-zinc-200"}`}>{item.title}</Link>)}</nav>}
    {snapshot ? <TranslationReviewPanel key={snapshot.movie.id} initialSnapshot={snapshot} projectPath={projectPath} projectSlug={slug} /> : <section className={`${cardClass} p-6 sm:p-8`}><Languages size={24} className="text-zinc-500" aria-hidden="true" /><h2 className="mt-4 text-lg font-medium">No movie uploaded</h2><p className="mt-2 text-sm text-zinc-400">Upload and transcribe a source movie before translating dialogue.</p><Link href={projectPath} className={`${linkClass} mt-5`}>Project overview</Link></section>}
  </div></main>;
}
