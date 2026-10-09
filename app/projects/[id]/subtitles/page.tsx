import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { pageClass, contentClass } from "@/components/ui/styles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getAudioStorageKey, localStorage } from "@/lib/storage";
import { getMovieMediaJob } from "@/lib/queue/media-queue";
import { getMovieTranscriptionJob } from "@/lib/queue/transcription-queue";
import { cardClass, linkClass } from "../overview-components";
import { RefreshOverviewButton } from "../overview-action";
import TranscriptionWorkspace from "./transcription-workspace";
import type { TranscriptionSnapshot } from "./transcription-model";

export default async function SourceTranscriptPage({ params }: PageProps<"/projects/[id]/subtitles">) {
  const { id: slug } = await params;
  const projectPath = `/projects/${encodeURIComponent(slug)}`;
  let project;
  try {
    project = await prisma.project.findUnique({
      where: { slug },
      select: {
        name: true,
        movies: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
          select: {
            id: true, title: true, filename: true, storageKey: true,
            durationSeconds: true, sourceLanguage: true, status: true, processingProgress: true,
            transcript: { select: {
              provider: true, model: true, language: true, durationMs: true,
              text: true, updatedAt: true,
              segments: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true } },
            } },
          },
        },
      },
    });
  } catch {
    return <WorkspaceUnavailable title="Transcription is unavailable" description="We couldn’t load this project right now. Please try again shortly." href={projectPath} />;
  }
  if (!project) notFound();
  const movie = project.movies[0];
  let snapshot: TranscriptionSnapshot | null = null;
  if (movie) {
    // Only inspect stored files and retained jobs. Never submit work during render.
    const results = await Promise.allSettled([
      movie.storageKey ? localStorage.exists(movie.storageKey) : Promise.resolve(false),
      readPreparedAudio(movie.id), getMovieMediaJob(movie.id), getMovieTranscriptionJob(movie.id),
    ] as const);
    snapshot = {
      movie: { id: movie.id, title: movie.title, filename: movie.filename, sourceLanguage: movie.sourceLanguage,
        durationSeconds: movie.durationSeconds, status: movie.status, processingProgress: movie.processingProgress, sourceRecorded: !!movie.storageKey },
      transcript: movie.transcript ? {
        provider: movie.transcript.provider, model: movie.transcript.model, language: movie.transcript.language,
        durationMs: movie.transcript.durationMs, text: movie.transcript.text,
        savedAt: movie.transcript.updatedAt.toISOString(), segments: movie.transcript.segments,
      } : null,
      sourceAvailable: results[0].status === "fulfilled" ? results[0].value : null,
      audioAvailable: results[1].status === "fulfilled" ? results[1].value : null,
      mediaJob: results[2].status === "fulfilled" ? publicJob(results[2].value) : null,
      transcriptionJob: results[3].status === "fulfilled" ? publicJob(results[3].value) : null,
      mediaStatusAvailable: results[2].status === "fulfilled",
      transcriptionStatusAvailable: results[3].status === "fulfilled",
    };
  }
  return <main className={pageClass}>
    <div className={contentClass}>
      <header>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Link href="/projects" className={linkClass}>Projects</Link><ChevronRight size={13} aria-hidden="true" />
          <Link href={projectPath} className={`${linkClass} min-w-0 break-words`}>{project.name}</Link><ChevronRight size={13} aria-hidden="true" /><span className="text-zinc-300">Transcription</span>
        </nav>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight">Transcription</h1><p className="mt-2 text-sm text-zinc-400">Generate and inspect the Chinese source transcript.</p></div>
          <RefreshOverviewButton label="Refresh" />
        </div>
      </header>
      {snapshot ? <TranscriptionWorkspace key={snapshot.movie.id} initialSnapshot={snapshot} projectPath={projectPath} /> :
        <section aria-labelledby="empty-title" className={`${cardClass} p-6 sm:p-8`}>
          <FileText size={24} className="text-zinc-500" aria-hidden="true" /><h2 id="empty-title" className="mt-4 text-lg font-medium">No movie uploaded</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Upload a source movie before preparing audio or generating a transcript.</p>
          <Link href={projectPath} className={`${linkClass} mt-5`}>Project overview</Link>
        </section>}
    </div>
  </main>;
}

async function readPreparedAudio(movieId: string) {
  const key = getAudioStorageKey(movieId);
  if (!await localStorage.exists(key)) return false;
  return (await localStorage.stat(key)).size > 0;
}
function publicJob(job: { state: string; attemptsMade: number } | null) {
  return job ? { state: job.state, attemptsMade: job.attemptsMade } : null;
}
