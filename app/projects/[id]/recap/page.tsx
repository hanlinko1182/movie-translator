import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readMovieRecap } from "@/lib/recap/read-recap";
import { loadRecapSource } from "@/lib/recap/source";
import { RecapError } from "@/lib/recap/types";
import { readMovieCharacters } from "@/lib/character-analysis/read-analysis";
import { getRecapJob } from "@/lib/queue/recap-queue";
import RecapControls from "./RecapControls";

export default async function RecapPage({ params }: PageProps<"/projects/[id]/recap">) {
  const { id: slug } = await params;
  let project;
  try {
    project = await prisma.project.findUnique({
      where: { slug },
      select: {
        name: true,
        movies: {
          take: 1,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            title: true,
            filename: true,
            durationSeconds: true,
            transcript: { select: { id: true, _count: { select: { segments: true } } } },
            scenes: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, detectionMethod: true, boundaryScore: true } },
            characterAnalysis: { select: { id: true } },
            recap: { select: { id: true } },
          },
        },
      },
    });
  } catch {
    return <p role="alert" className="p-6 text-sm text-amber-200">Unable to load recap. Please try again.</p>;
  }
  if (!project) notFound();

  const movie = project.movies[0] ?? null;
  const base = `/projects/${encodeURIComponent(slug)}`;
  const transcriptionHref = `${base}/subtitles`;
  const scenesHref = `${base}/scenes`;
  const exportHref = `${base}/export`;
  let initial = { recap: null } as Awaited<ReturnType<typeof readMovieRecap>>;
  let sourceContext: "CURRENT" | "ABSENT" | "STALE" | null = null;
  let sourceReason: string | null = null;
  let characterState: "CURRENT" | "ABSENT" | "STALE" | "UNAVAILABLE" = movie?.characterAnalysis ? "UNAVAILABLE" : "ABSENT";
  let initialJob: Awaited<ReturnType<typeof getRecapJob>> = null;
  let jobUnavailable = false;

  if (movie) {
    const [recapResult, characterResult] = await Promise.allSettled([
      readMovieRecap(movie.id),
      readMovieCharacters(movie.id),
    ]);
    if (recapResult.status === "fulfilled") initial = recapResult.value;
    if (characterResult.status === "fulfilled") {
      const analysis = characterResult.value.analysis;
      characterState = !analysis ? "ABSENT" : analysis.stale ? "STALE" : "CURRENT";
    }

    const hasTranscript = !!movie.transcript;
    const hasTranscriptSegments = (movie.transcript?._count.segments ?? 0) > 0;
    const hasScenes = movie.scenes.length > 0;
    if (hasTranscript && hasTranscriptSegments && hasScenes) {
      const [sourceResult, jobResult] = await Promise.allSettled([
        loadRecapSource(movie.id),
        getRecapJob(movie.id),
      ]);
      if (sourceResult.status === "fulfilled") sourceContext = sourceResult.value.characterContext;
      else if (sourceResult.reason instanceof RecapError) sourceReason = sourceResult.reason.message;
      else sourceReason = "Recap prerequisites could not be verified. Try again shortly.";
      if (jobResult.status === "fulfilled") initialJob = jobResult.value;
      else jobUnavailable = true;
    } else if (!hasTranscript) sourceReason = "Transcription is required before generating a recap.";
    else if (!hasTranscriptSegments) sourceReason = "The transcript has no usable timed segments.";
    else sourceReason = "Scene detection is required before generating a recap.";
  }

  const hasTranscript = !!movie?.transcript;
  const hasTranscriptSegments = (movie?.transcript?._count.segments ?? 0) > 0;
  const model = process.env.RECAP_MODEL?.trim() || null;

  return <main className="min-w-0 flex-1">
    <div className="mx-auto max-w-[1550px] p-4 sm:p-6 lg:p-8">
      <RecapControls
        projectName={project.name}
        movie={movie ? { id: movie.id, title: movie.title, filename: movie.filename, durationSeconds: movie.durationSeconds } : null}
        initial={initial}
        initialJob={initialJob}
        scenes={movie?.scenes ?? []}
        transcriptState={!movie ? "MISSING" : !hasTranscript ? "MISSING" : hasTranscriptSegments ? "READY" : "EMPTY"}
        characterState={characterState}
        sourceContext={sourceContext}
        sourceReason={sourceReason}
        jobUnavailable={jobUnavailable}
        model={model}
        transcriptionHref={transcriptionHref}
        scenesHref={scenesHref}
        exportHref={exportHref}
        projectHref={base}
      />
    </div>
  </main>;
}
