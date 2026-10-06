import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { publicSceneRows } from "@/lib/scenes/read-scenes";
import SceneWorkspace from "@/components/scenes/scene-workspace";

export default async function ScenesPage({ params }: PageProps<"/projects/[id]/scenes">) {
  const { id: slug } = await params;
  let project;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: {
      name: true, movies: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
        id: true, title: true, storageKey: true, scenes: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, detectionMethod: true, boundaryScore: true } },
      } },
    } });
  } catch {
    return <p role="alert" className="p-6 text-sm text-amber-200">Unable to load scenes. Please try again.</p>;
  }
  if (!project) notFound();
  const movie = project.movies[0];
  const path = `/projects/${encodeURIComponent(slug)}`;
  return <main className="min-w-0 flex-1">
    <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1550px]">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-200">Projects</Link><ChevronRight size={13} /><Link href={path} className="hover:text-zinc-200">{project.name}</Link><ChevronRight size={13} /><span className="text-zinc-300">Scenes</span></nav>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Scenes</h1><p className="mt-1 break-words text-sm text-zinc-500">{movie ? `${movie.title} · Local heuristic intervals` : "No movie uploaded"}</p>
    </div></header>
    <div className="mx-auto max-w-[1550px] space-y-5 p-4 sm:p-6 lg:p-8">
      {movie ? <SceneWorkspace key={movie.id} movieId={movie.id} canDetect={!!movie.storageKey} initialScenes={publicSceneRows(movie.scenes)} /> : <section className="rounded-2xl border border-white/10 p-6 text-sm text-zinc-400"><p>No movie uploaded for this project yet. Upload a movie before detecting scenes.</p><Link href={path} className="mt-4 inline-block text-zinc-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Project overview</Link></section>}
      {movie && <p className="text-xs leading-5 text-zinc-500">Scenes use the newest movie in this project. Selecting another movie and semantic analysis can be added in a later phase.</p>}
    </div>
  </main>;
}
