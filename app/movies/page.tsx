import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Film,
  HardDrive,
  MoreHorizontal,
  Search,
  Settings2,
  Upload,
} from "lucide-react";

import { MovieStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { MovieRecord } from "@/lib/movie-api";

// These processing and activity details are demo UI; the Movie model does not
// yet persist pipeline steps or activity events.
const demoProcessingLog = [
  { time: "20:14", text: "Upload completed" },
  { time: "20:16", text: "Audio extraction completed" },
  { time: "20:31", text: "Transcription completed" },
  { time: "20:36", text: "Scene analysis completed" },
  { time: "20:41", text: "Translation started" },
];

const demoPipeline = [
  { label: "Upload", state: "Completed" },
  { label: "Audio Extraction", state: "Completed" },
  { label: "Transcription", state: "Completed" },
  { label: "Scene Analysis", state: "Completed" },
  { label: "Character Analysis", state: "Completed" },
  { label: "Translation", state: "68%" },
  { label: "Quality Check", state: "Pending" },
  { label: "Export", state: "Not Started" },
];

export default async function MoviesPage() {
  let movies: MovieRecord[];

  try {
    movies = await prisma.movie.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        originalTitle: true,
        filename: true,
        storageKey: true,
        durationSeconds: true,
        fileSizeBytes: true,
        sourceLanguage: true,
        status: true,
        processingProgress: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  } catch {
    return <MoviesPageContent movies={null} />;
  }

  return <MoviesPageContent movies={movies} />;
}

function MoviesPageContent({ movies }: { movies: MovieRecord[] | null }) {
  if (movies === null) {
    return (
      <section className="min-w-0 flex-1">
        <PageHeader />
        <div className="mx-auto max-w-[1700px] p-4 sm:p-6 lg:p-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <h2 className="font-medium">Movies are unavailable</h2>
            <p className="mt-2 text-sm text-zinc-500">
              We couldn’t load movies right now. Please try again shortly.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const selectedMovie = movies[0];
  const movieFileSize = movies.reduce(
    (total, movie) => total + (movie.fileSizeBytes ?? BigInt(0)),
    BigInt(0),
  );
  const hasRecordedFileSize = movies.some((movie) => movie.fileSizeBytes !== null);
  const queuedOrFailed = movies.filter(
    (movie) => movie.status === MovieStatus.QUEUED || movie.status === MovieStatus.FAILED,
  );

  return (
    <section className="min-w-0 flex-1">
      <PageHeader />

      <div className="mx-auto max-w-[1700px] space-y-5 p-4 sm:p-6 lg:p-8">
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
          aria-label="Movie library summary"
        >
          <SummaryCard title="Total Movies" value={String(movies.length)} />
          <SummaryCard
            title="Processing"
            value={String(countStatus(movies, MovieStatus.PROCESSING))}
          />
          <SummaryCard
            title="Ready"
            value={String(countStatus(movies, MovieStatus.READY))}
          />
          <SummaryCard
            title="Failed"
            value={String(countStatus(movies, MovieStatus.FAILED))}
            warning
          />
          <SummaryCard
            title="Movie File Sizes"
            value={hasRecordedFileSize ? formatFileSize(movieFileSize) : "Not recorded"}
          />
        </section>

        <section
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4"
          aria-label="Movie search and filters"
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="relative block w-full xl:max-w-sm">
              <span className="sr-only">Search movies</span>
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                type="search"
                placeholder="Search movies..."
                className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Status"
                options={[
                  "All Status",
                  "Uploaded",
                  "Queued",
                  "Processing",
                  "Ready",
                  "Failed",
                ]}
              />
              <FilterSelect
                label="Language"
                options={["All Languages", ...new Set(movies.map((movie) => languageName(movie.sourceLanguage)))]}
              />
              <FilterSelect
                label="Sort"
                options={["Recently Added", "Name", "Duration", "Status"]}
              />
              <div className="flex rounded-lg border border-white/10 p-0.5">
                <button
                  type="button"
                  aria-pressed="true"
                  className="rounded-md bg-white/[0.08] px-2.5 py-1.5 text-[10px] text-zinc-200"
                >
                  Grid
                </button>
                <button
                  type="button"
                  aria-pressed="false"
                  className="rounded-md px-2.5 py-1.5 text-[10px] text-zinc-500"
                >
                  List
                </button>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="library-title">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 id="library-title" className="font-medium">
                Movie Library
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                {movies.length} {movies.length === 1 ? "movie" : "movies"} from PostgreSQL
              </p>
            </div>
            <button
              type="button"
              disabled
              className="hidden cursor-not-allowed items-center gap-1 text-[10px] text-zinc-600 sm:flex"
            >
              Recently Added <ChevronDown size={12} />
            </button>
          </div>

          {movies.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {movies.map((movie, index) => (
                <MovieCard key={movie.id} movie={movie} index={index} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <Film className="mx-auto text-zinc-500" size={24} />
              <h3 className="mt-3 font-medium">No movies yet</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Movie metadata will appear here after it is added to a project.
              </p>
              <Link
                href="/projects"
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.08]"
              >
                View Projects <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </section>

        {selectedMovie && (
          <section className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
            <div className="space-y-5">
              <SelectedMovie movie={selectedMovie} />
              <DemoPipeline />
              <DemoActivityLog />
            </div>

            <aside className="space-y-5">
              <StorageOverview
                total={movieFileSize}
                hasRecordedSize={hasRecordedFileSize}
              />
              <UploadPlaceholder />
              <ProcessingStates movies={queuedOrFailed} />
            </aside>
          </section>
        )}
      </div>
    </section>
  );
}

function PageHeader() {
  return (
    <header className="flex flex-col justify-between gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:px-6 lg:px-10">
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-300">
            Dashboard
          </Link>
          <ChevronRight size={13} />
          <span className="text-zinc-300">Movies</span>
        </div>
        <h1 className="mt-1 text-xl font-semibold">Movies</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage movie metadata and monitor processing status.
        </p>
      </div>
      <button
        type="button"
        disabled
        title="Movie upload is not available yet"
        className="inline-flex w-fit cursor-not-allowed items-center gap-2 rounded-xl bg-white/50 px-4 py-2.5 text-sm font-medium text-black/60"
      >
        <Upload size={15} /> Upload Movie
      </button>
    </header>
  );
}

function SummaryCard({
  title,
  value,
  warning = false,
}: {
  title: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-[10px] text-zinc-500">{title}</p>
      <p
        className={`mt-2 text-xl font-semibold tracking-tight ${
          warning ? "text-amber-300" : "text-zinc-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterSelect({ label, options }: { label: string; options: string[] }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        defaultValue={options[0]}
        className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-white/20"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function MovieCard({ movie, index }: { movie: MovieRecord; index: number }) {
  const duration = formatDuration(movie.durationSeconds);
  const fileSize = movie.fileSizeBytes !== null
    ? formatFileSize(movie.fileSizeBytes)
    : "File size not recorded";

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-white/[0.16]">
      <div
        className={`relative aspect-video overflow-hidden bg-gradient-to-br ${posterColors[index % posterColors.length]}`}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Film size={38} strokeWidth={1} className="text-white/20" />
        </div>
        <div className="absolute left-3 top-3">
          <StatusBadge status={movie.status} />
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {movie.originalTitle && (
              <p lang={movie.sourceLanguage} className="truncate text-xs text-white/60">
                {movie.originalTitle}
              </p>
            )}
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {movie.title}
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[9px] text-zinc-300">
            {duration}
          </span>
        </div>
        {movie.status === MovieStatus.PROCESSING && (
          <div className="absolute inset-x-3 bottom-1 h-0.5 bg-white/20">
            <div
              className="h-full bg-white"
              style={{ width: `${movie.processingProgress}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
          <span>{languageName(movie.sourceLanguage)}</span>
          <span>{fileSize}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] text-zinc-600">Project</p>
            <Link
              href={`/projects/${movie.project.slug}`}
              className="truncate text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              {movie.project.name}
            </Link>
          </div>
          <span className="shrink-0 text-[9px] text-zinc-600">
            {movie.createdAt.toLocaleDateString()}
          </span>
        </div>

        {movie.status === MovieStatus.PROCESSING && (
          <div className="mt-3">
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span>Processing progress</span>
              <span>{movie.processingProgress}%</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-zinc-300"
                style={{ width: `${movie.processingProgress}%` }}
              />
            </div>
          </div>
        )}

        {movie.status === MovieStatus.QUEUED && (
          <p className="mt-3 text-[10px] text-zinc-600">Queued for processing</p>
        )}
        {movie.status === MovieStatus.FAILED && (
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-rose-300/80">
            <AlertCircle size={12} /> Processing failed
          </p>
        )}

        <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <Link
            href={`/projects/${movie.project.slug}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[10px] font-medium text-black hover:bg-zinc-200"
          >
            Open Project <ArrowRight size={12} />
          </Link>
          <button
            type="button"
            aria-label={`More actions for ${movie.title}`}
            className="rounded-lg border border-white/10 p-2 text-zinc-500"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function SelectedMovie({ movie }: { movie: MovieRecord }) {
  const details = [
    ["Filename", movie.filename ?? "Not recorded"],
    ["Duration", formatDuration(movie.durationSeconds)],
    [
      "File Size",
      movie.fileSizeBytes !== null ? formatFileSize(movie.fileSizeBytes) : "Not recorded",
    ],
    ["Original Title", movie.originalTitle ?? "Not recorded"],
    ["Source Language", languageName(movie.sourceLanguage)],
    ["Processing Progress", `${movie.processingProgress}%`],
  ];

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"
      aria-labelledby="movie-details-title"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Most Recent Movie · {formatStatus(movie.status)}
          </p>
          <h2 id="movie-details-title" className="mt-1 text-lg font-semibold">
            {movie.title}
            {movie.originalTitle && (
              <span lang={movie.sourceLanguage} className="ml-1 text-sm font-normal text-zinc-500">
                {movie.originalTitle}
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Associated project · {movie.project.name}
          </p>
        </div>
        <Link
          href={`/projects/${movie.project.slug}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black hover:bg-zinc-200"
        >
          Open Project <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-5">
        <h3 className="mb-3 text-xs font-medium text-zinc-300">Movie Metadata</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {details.map(([label, value]) => (
            <DetailField key={label} label={label} value={value} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoActivityLog() {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
      aria-labelledby="processing-log-title"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 id="processing-log-title" className="text-sm font-medium">
            Processing Log · Demo
          </h2>
          <p className="mt-1 text-[10px] text-zinc-500">
            Activity events are not stored yet.
          </p>
        </div>
        <Clock3 size={15} className="text-zinc-500" />
      </div>
      <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {demoProcessingLog.map((entry) => (
          <div key={entry.time} className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-zinc-600">{entry.time}</span>
            <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
            <span className="text-[11px] text-zinc-400">{entry.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DemoPipeline() {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
      aria-labelledby="pipeline-title"
    >
      <div className="mb-4">
        <h2 id="pipeline-title" className="text-sm font-medium">
          Processing Pipeline · Demo
        </h2>
        <p className="mt-1 text-[10px] text-zinc-500">
          Pipeline steps are not connected to movie status yet.
        </p>
      </div>
      <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
        {demoPipeline.map((step, index) => (
          <PipelineRow
            key={step.label}
            label={step.label}
            state={step.state}
            active={index === 5}
          />
        ))}
      </div>
    </section>
  );
}

function StorageOverview({
  total,
  hasRecordedSize,
}: {
  total: bigint;
  hasRecordedSize: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
      aria-labelledby="storage-title"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 id="storage-title" className="text-sm font-medium">
            Storage Overview
          </h2>
          <p className="mt-1 text-[10px] text-zinc-500">
            Recorded movie file sizes
          </p>
        </div>
        <HardDrive size={15} className="text-zinc-500" />
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
        <p className="text-[10px] text-zinc-500">Movies</p>
        <p className="mt-1 text-sm font-medium text-zinc-300">
          {hasRecordedSize ? formatFileSize(total) : "Not recorded"}
        </p>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-zinc-600">
        Extracted audio and generated file storage are not modeled yet.
      </p>
    </section>
  );
}

function UploadPlaceholder() {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
      aria-labelledby="upload-area-title"
    >
      <div className="flex flex-col items-center rounded-xl border border-dashed border-white/15 bg-white/[0.015] px-4 py-7 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
          <Upload size={17} />
        </span>
        <h2 id="upload-area-title" className="mt-3 text-sm font-medium">
          Movie upload is not available yet
        </h2>
        <p className="mt-2 text-[11px] text-zinc-600">
          This page currently displays metadata only.
        </p>
      </div>
    </section>
  );
}

function ProcessingStates({ movies }: { movies: MovieRecord[] }) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
      aria-labelledby="processing-state-title"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="processing-state-title" className="text-sm font-medium">
          Queued &amp; Failed
        </h2>
        <Settings2 size={14} className="text-zinc-500" />
      </div>
      {movies.length ? (
        <div className="space-y-3">
          {movies.map((movie) => (
            <div
              key={movie.id}
              className="rounded-xl border border-white/10 bg-black/10 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-zinc-300">{movie.title}</span>
                <StatusBadge status={movie.status} />
              </div>
              <p className="mt-2 text-[10px] text-zinc-500">
                Project · {movie.project.name}
              </p>
              {movie.status === MovieStatus.FAILED && (
                <p className="mt-1 text-[10px] text-zinc-600">
                  No failure details are recorded.
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">No queued or failed movies.</p>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: MovieStatus }) {
  const styles: Record<MovieStatus, string> = {
    UPLOADED: "border-white/15 bg-zinc-950/60 text-zinc-300",
    QUEUED: "border-white/15 bg-zinc-950/60 text-zinc-300",
    PROCESSING: "border-sky-500/20 bg-sky-950/60 text-sky-300",
    READY: "border-emerald-500/20 bg-emerald-950/60 text-emerald-300",
    FAILED: "border-rose-500/20 bg-rose-950/60 text-rose-300",
  };

  return (
    <span className={`shrink-0 rounded-md border px-2 py-1 text-[9px] ${styles[status]}`}>
      {formatStatus(status)}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-[10px] text-zinc-300">{value}</p>
    </div>
  );
}

function PipelineRow({
  label,
  state,
  active = false,
}: {
  label: string;
  state: string;
  active?: boolean;
}) {
  const completed = state === "Completed";
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            completed
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : active
                ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
                : "border-white/10 text-zinc-700"
          }`}
        >
          {completed ? (
            <Check size={10} />
          ) : active ? (
            <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
          ) : null}
        </span>
        <span className={`truncate text-[10px] ${active ? "text-zinc-200" : "text-zinc-500"}`}>
          {label}
        </span>
      </div>
      <span
        className={`shrink-0 text-[9px] ${
          completed ? "text-emerald-400/80" : active ? "text-sky-300" : "text-zinc-700"
        }`}
      >
        {state}
      </span>
    </div>
  );
}

function countStatus(movies: MovieRecord[], status: MovieStatus) {
  return movies.filter((movie) => movie.status === status).length;
}

function formatStatus(status: MovieStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function languageName(code: string) {
  const languages: Record<string, string> = {
    zh: "Chinese",
    my: "Myanmar",
  };
  return languages[code.toLowerCase()] ?? code;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Not recorded";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatFileSize(bytes: bigint) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

const posterColors = [
  "from-indigo-950 via-slate-800 to-zinc-950",
  "from-blue-950 via-slate-700 to-black",
  "from-rose-950 via-zinc-800 to-black",
  "from-amber-950 via-stone-800 to-black",
  "from-cyan-950 via-slate-800 to-black",
  "from-emerald-950 via-zinc-800 to-black",
];
