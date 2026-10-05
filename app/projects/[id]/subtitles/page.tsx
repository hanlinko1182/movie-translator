import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FileText, Film } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { formatTimestamp } from "@/lib/format-timestamp";
import TranscriptSegments from "./transcript-segments";

export default async function SourceTranscriptPage({
  params,
}: PageProps<"/projects/[id]/subtitles">) {
  const { id: projectSlug } = await params;
  const projectPath = `/projects/${projectSlug}`;
  let project;

  try {
    project = await prisma.project.findUnique({
      where: { slug: projectSlug },
      select: {
        name: true,
        sourceLanguage: true,
        movies: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            title: true,
            status: true,
            sourceLanguage: true,
            transcript: {
              select: {
                provider: true,
                model: true,
                language: true,
                durationMs: true,
                text: true,
                segments: {
                  orderBy: { sequence: "asc" },
                  select: {
                    sequence: true,
                    startMs: true,
                    endMs: true,
                    text: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  } catch {
    console.error("Source transcript page could not load project data.");
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <h1 className="text-lg font-medium">Transcript is unavailable</h1>
          <p className="mt-2 text-sm text-zinc-400">We couldn’t load this project right now. Please try again shortly.</p>
          <Link href={projectPath} className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
            <ArrowLeft size={16} aria-hidden="true" /> Project overview
          </Link>
        </div>
      </main>
    );
  }

  if (!project) notFound();

  const movie = project.movies[0];
  const transcript = movie?.transcript;

  return (
    <main className="min-w-0 flex-1">
      <header className="border-b border-white/10 px-4 py-5 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Link href="/projects" className="hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">Projects</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <Link href={projectPath} className="max-w-full truncate hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">{project.name}</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span className="text-zinc-300">Source Transcript</span>
          </nav>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Source Transcript</h1>
              <p className="mt-2 text-sm text-zinc-400">Review the original dialogue and its timed segments.</p>
            </div>
            <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">Read-only review</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-10">
        {!movie ? (
          <EmptyState
            icon="movie"
            title="No movie uploaded"
            description="No movie has been uploaded for this project yet. Add a movie before reviewing its source transcript."
            projectPath={projectPath}
          />
        ) : !transcript ? (
          <EmptyState
            icon="transcript"
            title="Transcript not available yet"
            description="Transcription has not completed for this movie. Its source dialogue will appear here after the transcription worker finishes."
            projectPath={projectPath}
            movieTitle={movie.title}
            movieStatus={formatStatus(movie.status)}
          />
        ) : (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="transcript-details-title">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] pb-5">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{project.name}</p>
                  <h2 id="transcript-details-title" className="mt-2 break-words text-xl font-semibold text-zinc-100">{movie.title}</h2>
                  <p className="mt-1 text-xs text-zinc-500">Latest movie added to this project</p>
                </div>
                <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300">Source Transcript</span>
              </div>
              <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Source language" value={formatLanguage(movie.sourceLanguage || project.sourceLanguage)} />
                <Detail label="Transcript language" value={transcript.language ? formatLanguage(transcript.language) : "Not specified"} />
                <Detail label="Provider" value={formatProvider(transcript.provider)} />
                <Detail label="Model" value={transcript.model} />
                <Detail label="Duration" value={transcript.durationMs === null ? "Not available" : formatTimestamp(transcript.durationMs)} />
                <Detail label="Segments" value={String(transcript.segments.length)} />
              </dl>
            </section>

            <TranscriptSegments
              segments={transcript.segments}
              transcriptText={transcript.text}
              sourceLanguage={movie.sourceLanguage}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-zinc-200 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  projectPath,
  movieTitle,
  movieStatus,
}: {
  icon: "movie" | "transcript";
  title: string;
  description: string;
  projectPath: string;
  movieTitle?: string;
  movieStatus?: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8" aria-labelledby="empty-title">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
        {icon === "movie" ? <Film size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}
      </div>
      <h2 id="empty-title" className="mt-5 text-lg font-medium text-zinc-100">{title}</h2>
      {movieTitle && <p className="mt-2 break-words text-sm text-zinc-300">Movie: {movieTitle}</p>}
      {movieStatus && <p className="mt-1 text-sm text-zinc-400">Movie status: {movieStatus}</p>}
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>
      <Link href={projectPath} className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
        <ArrowLeft size={16} aria-hidden="true" /> Project overview
      </Link>
    </section>
  );
}

function formatLanguage(value: string) {
  switch (value.toLowerCase()) {
    case "cmn": return "Chinese (Mandarin)";
    case "zh":
    case "chinese": return "Chinese";
    case "my":
    case "myanmar": return "Myanmar";
    default: return value;
  }
}

function formatProvider(value: string) {
  return value.toLowerCase() === "openrouter" ? "OpenRouter" : value;
}

function formatStatus(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
