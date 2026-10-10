import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicSceneRows } from "@/lib/scenes/read-scenes";
import SceneWorkspace from "@/components/scenes/scene-workspace";
import AdvancedWorkspaceHeader from "@/components/ui/advanced-workspace-header";
import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { cardClass, contentClass, linkClass, pageClass } from "@/components/ui/styles";

export default async function ScenesPage({ params, searchParams }: PageProps<"/projects/[id]/scenes">) {
  const { id: slug } = await params;
  const query = await searchParams;
  if (query.movieId !== undefined && (typeof query.movieId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(query.movieId))) notFound();
  let project;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: {
      id: true, name: true, movies: { where: query.movieId ? { id: query.movieId } : undefined, take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
        id: true, title: true, storageKey: true, durationSeconds: true,
        transcript: { select: { segments: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true } } } },
        scenes: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, detectionMethod: true, boundaryScore: true } },
      } },
    } });
  } catch {
    return <WorkspaceUnavailable title="Scenes unavailable" description="Unable to load saved scene intervals. Please try again." href={`/projects/${encodeURIComponent(slug)}`} />;
  }
  if (!project) notFound();
  if (query.movieId && !project.movies.length) notFound();
  const movie = project.movies[0];
  const path = `/projects/${encodeURIComponent(slug)}`;
  return <main className={pageClass}><div className={contentClass}>
    <AdvancedWorkspaceHeader movieId={movie?.id} projectName={project.name} projectSlug={slug} title="Scenes" description="Inspect detected scene intervals and source timing." context={movie?.title} />
      {movie ? <SceneWorkspace projectId={project.id} key={movie.id} movieId={movie.id} canDetect={!!movie.storageKey} initialScenes={publicSceneRows(movie.scenes)} durationSeconds={movie.durationSeconds} transcriptSegments={movie.transcript?.segments ?? []} overviewPath={path} /> : <section className={`${cardClass} p-6 text-sm leading-6 text-zinc-400`}><p>No movie uploaded for this project yet. Upload a movie before detecting scenes.</p><Link href={path} className={`${linkClass} mt-4`}>Project overview</Link></section>}
      {movie && <p className="text-xs leading-5 text-zinc-500">Showing saved intervals for the selected movie. Source timings are read-only.</p>}
    </div></main>;
}
