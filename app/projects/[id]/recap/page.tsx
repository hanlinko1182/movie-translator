import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { readMovieRecap } from "@/lib/recap/read-recap";
import { loadRecapSource } from "@/lib/recap/source";
import { RecapError } from "@/lib/recap/types";
import RecapControls from "./RecapControls";
export default async function RecapPage({ params }: PageProps<"/projects/[id]/recap">) {
  const { id: slug } = await params;
  let project; let initial; let reason: string | null = null; let sourceContext: string | null = null;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: { name: true, movies: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, title: true } } } });
    if (project?.movies[0]) {
      initial = await readMovieRecap(project.movies[0].id);
      try { sourceContext = (await loadRecapSource(project.movies[0].id)).characterContext; }
      catch (error) { if (!(error instanceof RecapError)) throw error; reason = error.message; }
    }
  } catch { return <p role="alert" className="p-6 text-sm text-amber-200">Unable to load recap. Please try again.</p>; }
  if (!project) notFound();
  const movie = project.movies[0]; const path = `/projects/${encodeURIComponent(slug)}`;
  return <main className="min-w-0 flex-1"><header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1550px]">
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-200">Projects</Link><ChevronRight size={13} /><Link href={path} className="hover:text-zinc-200">{project.name}</Link><ChevronRight size={13} /><span className="text-zinc-300">Recap</span></nav>
    <h1 className="mt-4 text-2xl font-semibold tracking-tight">Character-driven recap</h1><p className="mt-1 break-words text-sm text-zinc-500">{movie ? `${movie.title} · Myanmar narrative from source evidence` : "No movie uploaded"}</p>
  </div></header><div className="mx-auto max-w-[1550px] space-y-5 p-4 sm:p-6 lg:p-8">
    {movie && initial ? <RecapControls key={movie.id} movieId={movie.id} initial={initial} model={process.env.RECAP_MODEL?.trim() || null} canGenerate={!reason} unavailableReason={reason} sourceContext={sourceContext} /> : <section className="rounded-2xl border border-white/10 p-6 text-sm text-zinc-400"><p>No movie uploaded for this project yet. Prepare its transcript and scenes before generating a recap.</p><Link href={path} className="mt-4 inline-block text-zinc-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Project overview</Link></section>}
    {movie && <p className="text-xs leading-5 text-zinc-500">Recap uses the newest movie in this project. Review important claims against the referenced Chinese source.</p>}
  </div></main>;
}
