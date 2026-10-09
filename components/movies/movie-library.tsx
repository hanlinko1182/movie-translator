"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Circle, Clock3, Film, Search, Upload } from "lucide-react";
import type { MovieStatus } from "@/generated/prisma/client";
import { cardClass, linkClass } from "@/app/projects/[id]/overview-components";

export type LibraryMovie = {
  id: string; title: string; originalTitle: string | null; filename: string | null;
  sourceLanguage: string; languageLabel: string; status: MovieStatus;
  durationSeconds: number | null; durationLabel: string; fileSizeBytes: string | null; fileSizeLabel: string;
  uploadRecorded: boolean; createdAt: string; createdLabel: string; updatedAt: string; updatedLabel: string;
  transcriptCount: number | null; translationCount: number | null; scenes: number; recapSaved: boolean;
  projectName: string; projectHref: string; isNewestMovie: boolean;
};
const controlClass = "min-w-0 rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2.5 text-sm text-zinc-200 outline-none focus-visible:border-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400";
const statusTones: Record<MovieStatus, string> = {
  UPLOADED: "border-white/10 bg-white/[0.03] text-zinc-300",
  QUEUED: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  PROCESSING: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  READY: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  FAILED: "border-rose-400/20 bg-rose-400/10 text-rose-300",
};
const statusLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase();

export default function MovieLibrary({ movies }: { movies: LibraryMovie[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [language, setLanguage] = useState("");
  const [availability, setAvailability] = useState("");
  const [sort, setSort] = useState("added");
  const [selectedId, setSelectedId] = useState(movies[0]?.id ?? null);
  const detailsRef = useRef<HTMLElement>(null);
  const libraryRef = useRef<HTMLElement>(null);
  const query = search.trim().toLocaleLowerCase();
  const statuses = [...new Set(movies.map((movie) => movie.status))].sort();
  const languages = [...new Map(movies.map((movie) => [movie.sourceLanguage, movie.languageLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const visible = movies.filter((movie) =>
    (!query || [movie.title, movie.originalTitle, movie.filename, movie.projectName].some((text) => text?.toLocaleLowerCase().includes(query))) &&
    (!status || movie.status === status) && (!language || movie.sourceLanguage === language) &&
    (!availability || (availability === "uploaded" && movie.uploadRecorded) || (availability === "metadata" && !movie.uploadRecorded) ||
      (availability === "transcript" && (movie.transcriptCount ?? 0) > 0) || (availability === "translation" && (movie.translationCount ?? 0) > 0))
  ).sort((a, b) => {
    const order = sort === "title" ? a.title.localeCompare(b.title) : sort === "duration" ?
      a.durationSeconds === null ? b.durationSeconds === null ? 0 : 1 : b.durationSeconds === null ? -1 : b.durationSeconds - a.durationSeconds :
      sort === "status" ? a.status.localeCompare(b.status) : b.createdAt.localeCompare(a.createdAt);
    return order || a.id.localeCompare(b.id);
  });
  // Never show an unrelated hidden selection after a search/filter change.
  const selected = visible.find((movie) => movie.id === selectedId) ?? visible[0] ?? null;
  const filtered = !!(search || status || language || availability);
  function clearFilters() { setSearch(""); setStatus(""); setLanguage(""); setAvailability(""); }
  function inspect(movie: LibraryMovie) {
    setSelectedId(movie.id);
    detailsRef.current?.focus({ preventScroll: true });
    detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (!movies.length) return <section className={`${cardClass} p-8 text-center sm:p-16`}><Film size={32} className="mx-auto text-violet-300" aria-hidden="true" /><h2 className="mt-5 text-xl font-semibold">Your movie library is empty</h2><p className="mt-3 text-sm leading-6 text-zinc-400">Upload a movie through the existing project creation flow to begin.</p><Link href="/projects/new" className={`${linkClass} mt-6`}><Upload size={16} aria-hidden="true" />Upload Movie</Link></section>;

  return <>
    <section aria-label="Movie search and filters" className={`${cardClass} p-4`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 sm:col-span-2 xl:col-span-4"><label htmlFor="movie-search" className="mb-2 block text-xs text-zinc-400">Search movies</label><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" /><input id="movie-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, filename or project…" className={`${controlClass} w-full pl-9 placeholder:text-zinc-600`} /></div></div>
        <div className="min-w-0"><label htmlFor="movie-status" className="mb-2 block text-xs text-zinc-400">Recorded movie status</label><select id="movie-status" value={status} onChange={(event) => setStatus(event.target.value)} className={`${controlClass} w-full`}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></div>
        <div className="min-w-0"><label htmlFor="movie-language" className="mb-2 block text-xs text-zinc-400">Source language</label><select id="movie-language" value={language} onChange={(event) => setLanguage(event.target.value)} className={`${controlClass} w-full`}><option value="">All languages</option>{languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="min-w-0"><label htmlFor="movie-availability" className="mb-2 block text-xs text-zinc-400">Media & saved outputs</label><select id="movie-availability" value={availability} onChange={(event) => setAvailability(event.target.value)} className={`${controlClass} w-full`}><option value="">All movies</option><option value="uploaded">Upload recorded</option><option value="metadata">Metadata only</option><option value="transcript">With transcript segments</option><option value="translation">With translated segments</option></select></div>
        <div className="min-w-0"><label htmlFor="movie-sort" className="mb-2 block text-xs text-zinc-400">Sort by</label><select id="movie-sort" value={sort} onChange={(event) => setSort(event.target.value)} className={`${controlClass} w-full`}><option value="added">Recently added</option><option value="title">Title A–Z</option><option value="duration">Longest duration</option><option value="status">Recorded status</option></select></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3"><p role="status" aria-live="polite" className="text-xs text-zinc-400">Showing {visible.length} of {movies.length} movies</p>{filtered && <button type="button" onClick={clearFilters} className={linkClass}>Clear filters</button>}</div>
    </section>
    <p className="text-xs leading-5 text-zinc-500">Media metadata and saved outputs only. Recorded status does not confirm an active job or file availability. Playback and thumbnails are not available.</p>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section ref={libraryRef} tabIndex={-1} aria-labelledby="library-heading" className="min-w-0 scroll-mt-6 rounded-xl focus-visible:outline-2 focus-visible:outline-violet-300">
        <h2 id="library-heading" className="mb-4 text-sm font-semibold">Movie library</h2>
        {visible.length ? <div className="grid items-stretch gap-4 sm:grid-cols-2">
          {visible.map((movie) => <article key={movie.id} aria-labelledby={`movie-title-${movie.id}`} className={`${cardClass} flex flex-col overflow-hidden transition ${selected?.id === movie.id ? "border-violet-400/50" : "hover:border-white/20"}`}>
            <div className="relative flex aspect-video items-center justify-center border-b border-white/[0.06] bg-[#0c0c10]"><Film size={34} strokeWidth={1.25} className="text-zinc-600" aria-hidden="true" /><span className="absolute left-3 top-3"><MovieStatusBadge status={movie.status} /></span><span className="absolute bottom-3 left-3 text-[10px] text-zinc-500">No thumbnail</span>{movie.durationSeconds !== null && <span className="absolute bottom-3 right-3 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] tabular-nums text-zinc-300">{movie.durationLabel}</span>}</div>
            <div className="flex flex-1 flex-col p-4">
              <h3 id={`movie-title-${movie.id}`} className="break-words text-sm font-semibold">{movie.title}</h3>
              {movie.originalTitle && <p lang={movie.sourceLanguage} className="mt-1 break-words text-xs text-zinc-400">{movie.originalTitle}</p>}
              <p className="mt-2 break-all text-xs leading-5 text-zinc-500">{movie.filename ?? "Filename not recorded"}</p>
              <Link href={movie.projectHref} className={`${linkClass} mt-3 w-fit max-w-full break-all leading-5`}>Project · {movie.projectName}</Link>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{movie.languageLabel} · {movie.fileSizeLabel}</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">{movie.uploadRecorded ? "Source upload recorded" : "Metadata only · no upload recorded"}</p>
              <div className="mt-3 flex flex-wrap gap-2"><OutputBadge label="Transcript" count={movie.transcriptCount} /><OutputBadge label="Translation" count={movie.translationCount} /></div>
              <div className="mt-auto pt-4"><p className="mb-3 flex items-start gap-1.5 text-[10px] leading-5 text-zinc-500"><Clock3 size={12} className="mt-1 shrink-0" aria-hidden="true" />Updated <time dateTime={movie.updatedAt}>{movie.updatedLabel}</time></p><button type="button" aria-label={`View details for ${movie.title}`} aria-pressed={selected?.id === movie.id} aria-controls="movie-details" onClick={() => inspect(movie)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-zinc-200 transition hover:border-violet-400/30 hover:bg-violet-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300">{selected?.id === movie.id ? "Selected movie" : "View media details"}<ArrowUpRight size={13} aria-hidden="true" /></button></div>
            </div>
          </article>)}
        </div> : <div className={`${cardClass} p-8 text-center`}><Search size={24} className="mx-auto text-zinc-500" aria-hidden="true" /><h3 className="mt-4 font-medium">No matching movies</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Try another title or broaden your media filters.</p><button type="button" onClick={clearFilters} className={`${linkClass} mt-5`}>Clear filters</button></div>}
      </section>
      {selected && <aside id="movie-details" ref={detailsRef} tabIndex={-1} aria-labelledby="details-heading" className={`${cardClass} scroll-mt-6 p-5 focus-visible:outline-2 focus-visible:outline-violet-300 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto`}>
        <div className="mb-4 flex items-center justify-between gap-3"><h2 id="details-heading" className="text-sm font-semibold">Selected movie</h2><MovieStatusBadge status={selected.status} /></div>
        <h3 aria-live="polite" className="break-words text-lg font-semibold tracking-tight">{selected.title}</h3>
        <p className="mt-2 break-all text-xs leading-5 text-zinc-400">{selected.filename ?? "Filename not recorded"}</p>
        <Link href={selected.projectHref} className={`${linkClass} mt-3 max-w-full break-all leading-5`}>{selected.projectName}<ArrowUpRight size={13} className="shrink-0" aria-hidden="true" /></Link>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-5 text-xs">
          <Metadata label="Source language" value={selected.languageLabel} />
          <Metadata label="Duration" value={selected.durationLabel} />
          <Metadata label="Recorded file size" value={selected.fileSizeBytes === null ? "Not recorded" : `${selected.fileSizeLabel} (${selected.fileSizeBytes} bytes)`} />
          <Metadata label="Source media" value={selected.uploadRecorded ? "Upload recorded" : "Metadata only"} />
          {selected.originalTitle && <Metadata label="Original title" value={selected.originalTitle} />}
          <div className="col-span-2"><dt className="text-zinc-500">Added</dt><dd className="mt-1 leading-5 text-zinc-300"><time dateTime={selected.createdAt}>{selected.createdLabel}</time></dd></div>
          <div className="col-span-2"><dt className="text-zinc-500">Movie record updated</dt><dd className="mt-1 leading-5 text-zinc-300"><time dateTime={selected.updatedAt}>{selected.updatedLabel}</time></dd></div>
        </dl>
        <section aria-labelledby="availability-heading" className="mt-5 border-t border-white/[0.06] pt-5"><h3 id="availability-heading" className="text-xs font-semibold">Saved output availability</h3><ul className="mt-3 space-y-3 text-xs text-zinc-400"><li>Transcript · {outputLabel(selected.transcriptCount)}</li><li>Translation · {outputLabel(selected.translationCount)}</li><li>Scenes · {selected.scenes} saved</li><li>Recap · {selected.recapSaved ? "Script saved · check freshness in Recap" : "Not generated"}</li></ul><p className="mt-3 text-[11px] leading-5 text-zinc-500">Saved translation does not imply human approval or export readiness.</p></section>
        <section aria-labelledby="workspaces-heading" className="mt-5 border-t border-white/[0.06] pt-5"><h3 id="workspaces-heading" className="text-xs font-semibold">Related workspaces</h3>
          {!selected.isNewestMovie && <p className="mt-2 text-[11px] leading-5 text-amber-200">Translation and Review open this movie. Other project workspaces open the project’s newest movie.</p>}
          <nav aria-label="Selected movie workspaces" className="mt-3 grid grid-cols-2 gap-2">{workspaceLinks(selected).map((link) => <Link key={link.label} href={link.href} className={`${linkClass} flex-wrap rounded-lg border border-white/[0.07] p-3`}><span>{link.label}{link.newest && !selected.isNewestMovie && <span className="mt-1 block text-[10px] font-normal text-zinc-500">Newest movie</span>}</span><ArrowUpRight size={12} className="shrink-0" aria-hidden="true" /></Link>)}</nav>
        </section>
        <button type="button" onClick={() => {libraryRef.current?.focus({preventScroll:true});libraryRef.current?.scrollIntoView({behavior:"smooth",block:"start"});}} className={`${linkClass} mt-5 xl:hidden`}><ArrowLeft size={14} aria-hidden="true" />Back to library</button>
      </aside>}
    </div>
  </>;
}

function MovieStatusBadge({ status }: { status: MovieStatus }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTones[status]}`}>{statusLabel(status)}</span>;
}
function outputLabel(count: number | null) { return count === null ? "Not generated" : count === 0 ? "Saved · no segments" : `${count} saved segments`; }
function OutputBadge({ label, count }: { label: string; count: number | null }) {
  const saved = count !== null && count > 0;
  const Icon = saved ? Check : Circle;
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${saved ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300" : "border-white/[0.07] text-zinc-500"}`}><Icon size={11} aria-hidden="true" />{label} · {count === null ? "none" : count === 0 ? "empty" : count}</span>;
}
function Metadata({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-zinc-500">{label}</dt><dd className="mt-1 break-words leading-5 text-zinc-300">{value}</dd></div>; }
function workspaceLinks(movie: LibraryMovie) {
  const translation = `${movie.projectHref}/translation?movieId=${encodeURIComponent(movie.id)}`;
  return [
    { label: "Overview", href: movie.projectHref, newest: true },
    { label: "Transcription", href: `${movie.projectHref}/subtitles`, newest: true },
    { label: "Translation", href: translation, newest: false },
    { label: "Review", href: `${translation}&view=review#review`, newest: false },
    { label: "Recap", href: `${movie.projectHref}/recap`, newest: true },
    { label: "Export", href: `${movie.projectHref}/export`, newest: true },
  ];
}
