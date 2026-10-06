import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { subtitleFilename } from "@/lib/subtitle-export/filename";
import { summarizeSubtitleReview } from "@/lib/subtitle-export/service";
import SubtitleExportControls from "@/components/export/subtitle-export-controls";

export default async function ExportPage({ params }: PageProps<"/projects/[id]/export">) {
  const { id: slug } = await params;
  let project;
  try {
    project = await prisma.project.findUnique({ where: { slug }, select: {
      name: true,
      movies: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: {
        id: true, title: true, filename: true,
        translation: { select: { segments: { select: { reviewStatus: true } } } },
      } },
    } });
  } catch {
    return <p role="alert" className="p-6 text-sm text-amber-200">Unable to load subtitle export. Please try again.</p>;
  }
  if (!project) notFound();
  const movie = project.movies[0];
  const path = `/projects/${encodeURIComponent(slug)}`;
  const reviewPath = movie ? `${path}/translation?movieId=${encodeURIComponent(movie.id)}` : `${path}/translation`;
  const summary = summarizeSubtitleReview(movie?.translation?.segments ?? []);

  return <main className="min-w-0 flex-1">
    <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1550px]">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-200">Projects</Link><ChevronRight size={13} /><Link href={path} className="hover:text-zinc-200">{project.name}</Link><ChevronRight size={13} /><span className="text-zinc-300">Export</span></nav>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Export</h1><p className="mt-1 text-sm text-zinc-500">Download current Myanmar subtitles as SRT or ASS.</p>
    </div></header>
    <div className="mx-auto max-w-[1550px] space-y-5 p-4 sm:p-6 lg:p-8">
      <section className="min-w-0 space-y-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="review-summary-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><h2 id="review-summary-title" className="text-sm font-medium">Review summary</h2><p className="mt-2 break-words text-sm text-zinc-300">Project: {project.name}</p><p className="mt-1 break-words text-sm text-zinc-400">Movie: {movie?.title ?? "No movie uploaded"}</p></div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400"><FileText size={14} />{movie?.translation ? "Translation available" : "No translation available"}</span>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[
          ["Total segments", summary.total], ["Approved", summary.approved], ["Needs review", summary.needsReview], ["Unreviewed", summary.unreviewed],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-black/10 p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-2 text-xl font-semibold text-zinc-200">{value}</dd></div>)}</dl>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="text-xs leading-5 text-zinc-500">Review states are human decisions. Export does not change approval or translation.</p><Link href={reviewPath} className="inline-flex items-center gap-2 text-sm text-zinc-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Review translation <ArrowRight size={14} /></Link></div>
      </section>
      {movie?.translation ? <SubtitleExportControls movieId={movie.id} summary={summary} filenames={{ srt: subtitleFilename(movie.filename, movie.title, "srt"), ass: subtitleFilename(movie.filename, movie.title, "ass") }} /> : <section className="rounded-2xl border border-white/10 p-6 text-sm text-zinc-400"><p>{movie ? "This movie has no translation yet. Generate and review its translation before exporting subtitles." : "No movie uploaded for this project yet. Upload a movie before exporting subtitles."}</p><Link href={path} className="mt-4 inline-block text-zinc-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Project overview</Link></section>}
      {movie && <p className="text-xs leading-5 text-zinc-500">Export uses the newest movie in this project. Only subtitle files are generated; no video processing or export history is stored.</p>}
    </div>
  </main>;
}
