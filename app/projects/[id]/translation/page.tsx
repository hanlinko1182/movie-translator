import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getTranslationReview } from "@/lib/translation-qc/service";
import { TranslationError } from "@/lib/translation/types";
import TranslationReviewPanel from "@/components/translation/translation-review";

export default async function TranslationPage({ params, searchParams }: PageProps<"/projects/[id]/translation">) {
  const { id: slug } = await params; const query = await searchParams;
  let project;
  try { project = await prisma.project.findUnique({ where: { slug }, select: { name: true, movies: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, title: true } } } }); }
  catch { return <p role="alert" className="p-6 text-sm text-amber-200">Unable to load translation review. Please try again.</p>; }
  if (!project) notFound();
  const movie = query.movieId ? project.movies.find((movie) => movie.id === query.movieId) : project.movies[0];
  if (query.movieId && !movie) notFound();
  let review; let unavailable = "No movie uploaded for this project yet.";
  if (movie) {
    try { review = await getTranslationReview(movie.id); }
    catch (error) { unavailable = error instanceof TranslationError ? error.message : "Unable to load translation review. Please try again."; }
  }
  const path = `/projects/${encodeURIComponent(slug)}`;
  return <main className="min-w-0 flex-1">
    <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1600px]"><nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-200">Projects</Link><ChevronRight size={13} /><Link href={path} className="hover:text-zinc-200">{project.name}</Link><ChevronRight size={13} /><span className="text-zinc-300">Translation</span></nav><h1 className="mt-4 text-2xl font-semibold tracking-tight">Translation</h1><p className="mt-1 text-sm text-zinc-500">Edit Myanmar subtitles, review local QC findings, and approve current dialogue.</p></div></header>
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
      {!!project.movies.length && <nav aria-label="Project movies" className="flex flex-wrap gap-2">{project.movies.map((item) => <Link key={item.id} href={`${path}/translation?movieId=${encodeURIComponent(item.id)}`} aria-current={movie?.id === item.id ? "page" : undefined} className={`max-w-full break-words rounded-xl border border-white/10 px-3 py-2 text-sm ${movie?.id === item.id ? "bg-white/10 text-zinc-200" : "text-zinc-500 hover:text-zinc-200"}`}>{item.title}</Link>)}</nav>}
      {review ? <TranslationReviewPanel key={`${review.movieId}:${review.translationId}`} initialReview={review} /> : <section className="rounded-2xl border border-white/10 p-8 text-sm text-zinc-400"><p>{unavailable}</p><Link href={path} className="mt-4 inline-block text-zinc-200">Project overview</Link></section>}
    </div>
  </main>;
}
