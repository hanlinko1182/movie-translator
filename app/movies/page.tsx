import { primaryButtonClass } from "@/components/ui/styles";
import { pageClass, contentClass } from "@/components/ui/styles";
import Link from "next/link";
import { connection } from "next/server";
import { CircleAlert, Upload } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { dateLabel, languageName } from "@/app/projects/[id]/overview-model";
import { cardClass, linkClass } from "@/app/projects/[id]/overview-components";
import MovieLibrary, { type LibraryMovie } from "@/components/movies/movie-library";

export default async function MoviesPage() {
  await connection();
  let movies: LibraryMovie[] | undefined;
  try {
    // Read metadata and relation counts in bulk. No file, queue, worker or
    // provider calls; storage keys never cross the client boundary.
    const records = await prisma.movie.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, title: true, originalTitle: true, filename: true, storageKey: true,
        durationSeconds: true, fileSizeBytes: true, sourceLanguage: true, status: true,
        createdAt: true, updatedAt: true,
        transcript: { select: { _count: { select: { segments: true } } } },
        translation: { select: { _count: { select: { segments: true } } } },
        recap: { select: { id: true } },
        _count: { select: { scenes: true } },
        project: { select: {
          name: true, slug: true,
          movies: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } },
        } },
      },
    });
    movies = records.map((movie) => ({
      id: movie.id, title: movie.title, originalTitle: movie.originalTitle,
      filename: movie.filename, sourceLanguage: movie.sourceLanguage,
      languageLabel: languageName(movie.sourceLanguage), status: movie.status,
      durationSeconds: movie.durationSeconds,
      durationLabel: durationLabel(movie.durationSeconds),
      fileSizeBytes: movie.fileSizeBytes?.toString() ?? null,
      fileSizeLabel: fileSizeLabel(movie.fileSizeBytes),
      uploadRecorded: !!movie.storageKey,
      createdAt: movie.createdAt.toISOString(), createdLabel: dateLabel(movie.createdAt),
      updatedAt: movie.updatedAt.toISOString(), updatedLabel: dateLabel(movie.updatedAt),
      transcriptCount: movie.transcript?._count.segments ?? null,
      translationCount: movie.translation?._count.segments ?? null,
      scenes: movie._count.scenes, recapSaved: !!movie.recap,
      projectName: movie.project.name,
      projectHref: `/projects/${encodeURIComponent(movie.project.slug)}`,
      isNewestMovie: movie.project.movies[0]?.id === movie.id,
    }));
  } catch { /* Show unavailable state without leaking database errors. */ }

  return <main className={pageClass}>
    <div className={contentClass}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Media library</p><h1 className="text-2xl font-semibold tracking-tight">Movies</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Browse source media, inspect saved metadata and open related workspaces.</p></div>
        <Link href="/projects/new" className={primaryButtonClass}><Upload size={16} aria-hidden="true" />Upload Movie</Link>
      </header>
      {movies ? <MovieLibrary movies={movies} /> : <section role="status" className={`${cardClass} p-8`}><CircleAlert size={24} className="text-amber-300" aria-hidden="true" /><h2 className="mt-4 font-semibold">Movies are unavailable</h2><p className="mt-2 text-sm leading-6 text-zinc-400">We couldn’t load saved movies. Refresh the page to try again.</p><Link href="/projects" className={`${linkClass} mt-5`}>View projects</Link></section>}
    </div>
  </main>;
}

function durationLabel(seconds: number | null) {
  if (seconds === null) return "Duration not recorded";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours ? `${hours}:` : ""}${hours ? String(minutes).padStart(2, "0") : minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
function fileSizeLabel(bytes: bigint | null) {
  if (bytes === null) return "Size not recorded";
  if (bytes < BigInt(1024)) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let amount = Number(bytes) / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index++; }
  return `${amount.toFixed(1)} ${units[index]}`;
}
