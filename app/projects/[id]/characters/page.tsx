import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readMovieCharacters } from "@/lib/character-analysis/read-analysis";
import CharacterWorkspace from "@/components/characters/character-workspace";
import AdvancedWorkspaceHeader from "@/components/ui/advanced-workspace-header";
import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { cardClass, contentClass, linkClass, pageClass } from "@/components/ui/styles";

export default async function CharactersPage({ params }: PageProps<"/projects/[id]/characters">) {
  const { id: slug } = await params;
  let project;
  let initial;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: { name: true, movies: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, title: true, transcript: { select: { id: true, _count: { select: { segments: true } } } }, _count: { select: { scenes: true } } } } } });
    if (project?.movies[0]) initial = await readMovieCharacters(project.movies[0].id);
  } catch { return <WorkspaceUnavailable title="Character analysis unavailable" description="Unable to load saved candidates and evidence. Please try again." href={`/projects/${encodeURIComponent(slug)}`} />; }
  if (!project) notFound();
  const movie = project.movies[0];
  const path = `/projects/${encodeURIComponent(slug)}`;
  const reason = movie && (!movie.transcript ? "A source transcript is required before analysis." : !movie.transcript._count.segments ? "The source transcript has no usable segments." : !movie._count.scenes ? "Detect scenes before analyzing characters." : null);
  return <main className={pageClass}><div className={contentClass}>
    <AdvancedWorkspaceHeader projectName={project.name} projectSlug={slug} title="Characters & Evidence" description="Review character candidates, relationships, and supporting transcript evidence." context={movie?.title} />
      {movie && initial ? <CharacterWorkspace key={movie.id} movieId={movie.id} initial={initial} model={process.env.CHARACTER_ANALYSIS_MODEL?.trim() || null} canAnalyze={!reason} unavailableReason={reason || null} overviewPath={path} /> : <section className={`${cardClass} p-6 text-sm leading-6 text-zinc-400`}><p>No movie uploaded for this project yet. Upload a movie and prepare its transcript and scenes before analyzing characters.</p><Link href={path} className={`${linkClass} mt-4`}>Project overview</Link></section>}
      {movie && <p className="text-xs leading-5 text-zinc-500">Characters uses the newest movie in this project. Candidate identities belong to the project; evidence shown here belongs to this movie’s current analysis.</p>}
    </div></main>;
}
