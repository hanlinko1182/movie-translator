import { selectMovie, withMovieSelection } from "@/lib/source-video/selection";
import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { pageClass, contentClass } from "@/components/ui/styles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Languages } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getTranslationReview } from "@/lib/translation-qc/service";
import { getMovieTranslationJob } from "@/lib/queue/translation-queue";
import TranslationReviewPanel from "@/components/translation/translation-review";
import ReviewWorkspace from "@/components/translation/review-workspace";
import type { WorkspaceSnapshot } from "@/components/translation/workspace-model";
import { cardClass, linkClass } from "../overview-components";

export default async function TranslationPage({ params, searchParams }: PageProps<"/projects/[id]/translation">) {
  const { id: slug } = await params; const query = await searchParams;
  const reviewView = query.view === "review";
  const projectPath = `/projects/${encodeURIComponent(slug)}`;
  let project;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: {
      id: true, name: true,
      movies: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
        id: true, title: true, filename: true, storageKey: true, durationSeconds: true, sourceLanguage: true,
      } },
    } });
  } catch {
    return <WorkspaceUnavailable title="Translation is unavailable" description="We couldn’t load this project right now. Please try again." href={projectPath} />;
  }
  if (!project) notFound();
  const movie = selectMovie(project.movies, query.movieId);
  if (query.movieId !== undefined && !movie) notFound();
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
    if (dialogue.status === "rejected") return <WorkspaceUnavailable title="Translation is unavailable" description="We couldn’t load saved dialogue right now. Please try again." href={projectPath} />;
    if (!dialogue.value) notFound();
    const { transcript, translation } = dialogue.value;
    snapshot = {
      movie: { id: movie.id, title: movie.title, filename: movie.filename, durationSeconds: movie.durationSeconds, sourceLanguage: movie.sourceLanguage, sourceRecorded: !!movie.storageKey },
      source: transcript ? { id: transcript.id, rows: transcript.segments } : null,
      translation: translation ? { sourceTranscriptId: translation.sourceTranscriptId, provider: translation.provider, model: translation.model, savedAt: translation.updatedAt.toISOString(), rows: translation.segments } : null,
      review: review.status === "fulfilled" ? review.value : null,
      reviewUnavailable: !!translation && review.status === "rejected",
      job: job.status === "fulfilled" && job.value ? { state: job.value.state, attemptsMade: job.value.attemptsMade } : null,
      jobAvailable: job.status === "fulfilled",
    };
  }
  return <main className={pageClass}><div className={contentClass}>
    <header>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className={linkClass}>Projects</Link><ChevronRight size={13} aria-hidden="true" /><Link href={withMovieSelection(projectPath, movie?.id)} className={`${linkClass} min-w-0 break-words`}>{project.name}</Link><ChevronRight size={13} aria-hidden="true" /><span className="text-zinc-300">{reviewView ? "Review" : "Translation"}</span></nav>
      {(!snapshot || reviewView) && <><h1 className="mt-4 text-2xl font-semibold tracking-tight">{reviewView ? "Review" : "Translation"}</h1><p className="mt-2 text-sm leading-6 text-zinc-400">{reviewView ? "Verify the Myanmar subtitles and approve them for export." : "Translate Chinese subtitles to Myanmar with AI and human review."}</p></>}
    </header>
    {project.movies.length > 1 && <nav aria-label="Project movies" className="flex flex-wrap gap-2">{project.movies.map((item) => <Link key={item.id} href={`${projectPath}/translation?movieId=${encodeURIComponent(item.id)}${reviewView ? "&view=review" : ""}`} aria-current={movie?.id === item.id ? "page" : undefined} className={`max-w-full break-words rounded-lg border border-white/10 px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-violet-300 ${movie?.id === item.id ? "bg-violet-400/10 text-violet-300" : "text-zinc-500 hover:text-zinc-200"}`}>{item.title}</Link>)}</nav>}
    {reviewView ? <ReviewWorkspace projectId={project.id} key={snapshot?.movie.id ?? "empty"} initialSnapshot={snapshot} projectPath={projectPath} exportTargetMovie={movie ? { id: movie.id, title: movie.title } : null} /> : snapshot ? <TranslationReviewPanel projectId={project.id} key={snapshot.movie.id} initialSnapshot={snapshot} projectPath={projectPath} projectSlug={slug} /> : <section className={`${cardClass} p-6 sm:p-8`}><Languages size={24} className="text-zinc-500" aria-hidden="true" /><h2 className="mt-4 text-lg font-medium">No movie uploaded</h2><p className="mt-2 text-sm text-zinc-400">Upload and transcribe a source movie before translating dialogue.</p><Link href={withMovieSelection(projectPath, movie?.id)} className={`${linkClass} mt-5`}>Project overview</Link></section>}
  </div></main>;
}
