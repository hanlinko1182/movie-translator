import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicSceneRows } from "@/lib/scenes/read-scenes";
import SceneWorkspace from "@/components/scenes/scene-workspace";
import AdvancedWorkspaceHeader from "@/components/ui/advanced-workspace-header";
import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { cardClass, contentClass, linkClass, pageClass } from "@/components/ui/styles";

export default async function ScenesPage({ params }: PageProps<"/projects/[id]/scenes">) {
  const { id: slug } = await params;
  let project;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: {
      name: true, movies: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
        id: true, title: true, storageKey: true, durationSeconds: true,
        transcript: { select: { segments: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true } } } },
        scenes: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, detectionMethod: true, boundaryScore: true } },
      } },
    } });
  } catch {
    return <WorkspaceUnavailable title="Scenes unavailable" description="Unable to load saved scene intervals. Please try again." href={`/projects/${encodeURIComponent(slug)}`} />;
  }
  if (!project) notFound();
  const movie = project.movies[0];
  const path = `/projects/${encodeURIComponent(slug)}`;
  return <main className={pageClass}><div className={contentClass}>
    <AdvancedWorkspaceHeader projectName={project.name} projectSlug={slug} title="Scenes" description="Inspect detected scene intervals and source timing." context={movie?.title} />
      {movie ? <SceneWorkspace key={movie.id} movieId={movie.id} canDetect={!!movie.storageKey} initialScenes={publicSceneRows(movie.scenes)} durationSeconds={movie.durationSeconds} transcriptSegments={movie.transcript?.segments ?? []} overviewPath={path} /> : <section className={`${cardClass} p-6 text-sm leading-6 text-zinc-400`}><p>No movie uploaded for this project yet. Upload a movie before detecting scenes.</p><Link href={path} className={`${linkClass} mt-4`}>Project overview</Link></section>}
      {movie && <p className="text-xs leading-5 text-zinc-500">Scenes use the newest movie in this project. Selecting another movie and semantic analysis can be added in a later phase.</p>}
    </div></main>;
}
