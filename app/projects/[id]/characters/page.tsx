import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { readMovieCharacters } from "@/lib/character-analysis/read-analysis";
import CharacterWorkspace from "@/components/characters/character-workspace";

export default async function CharactersPage({ params }: PageProps<"/projects/[id]/characters">) {
  const { id: slug } = await params;
  let project;
  let initial;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: { name: true, movies: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, title: true, transcript: { select: { id: true, _count: { select: { segments: true } } } }, _count: { select: { scenes: true } } } } } });
    if (project?.movies[0]) initial = await readMovieCharacters(project.movies[0].id);
  } catch { return <p role="alert" className="p-6 text-sm text-amber-200">Unable to load characters. Please try again.</p>; }
  if (!project) notFound();
  const movie = project.movies[0];
  const path = `/projects/${encodeURIComponent(slug)}`;
  const reason = movie && (!movie.transcript ? "A source transcript is required before analysis." : !movie.transcript._count.segments ? "The source transcript has no usable segments." : !movie._count.scenes ? "Detect scenes before analyzing characters." : null);
  return <main className="min-w-0 flex-1">
    <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1550px]">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-200">Projects</Link><ChevronRight size={13} /><Link href={path} className="hover:text-zinc-200">{project.name}</Link><ChevronRight size={13} /><span className="text-zinc-300">Characters</span></nav>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Characters</h1><p className="mt-1 break-words text-sm text-zinc-500">{movie ? `${movie.title} · Text-based character evidence and relationships` : "No movie uploaded"}</p>
    </div></header>
    <div className="mx-auto max-w-[1550px] space-y-5 p-4 sm:p-6 lg:p-8">
      {movie && initial ? <CharacterWorkspace key={movie.id} movieId={movie.id} initial={initial} model={process.env.CHARACTER_ANALYSIS_MODEL?.trim() || null} canAnalyze={!reason} unavailableReason={reason || null} /> : <section className="rounded-2xl border border-white/10 p-6 text-sm text-zinc-400"><p>No movie uploaded for this project yet. Upload a movie and prepare its transcript and scenes before analyzing characters.</p><Link href={path} className="mt-4 inline-block text-zinc-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Project overview</Link></section>}
      {movie && <p className="text-xs leading-5 text-zinc-500">Characters uses the newest movie in this project. Candidate identities belong to the project; evidence shown here belongs to this movie’s current analysis.</p>}
    </div>
  </main>;
}
