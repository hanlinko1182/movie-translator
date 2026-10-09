import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { pageClass, contentClass } from "@/components/ui/styles";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { subtitleFilename } from "@/lib/subtitle-export/filename";
import { summarizeSubtitleReview } from "@/lib/subtitle-export/service";
import SubtitleExportControls from "@/components/export/subtitle-export-controls";

const previewSelect = {
  sequence: true,
  startMs: true,
  endMs: true,
  text: true,
  reviewStatus: true,
} as const;

export default async function ExportPage({ params }: PageProps<"/projects/[id]/export">) {
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
            sourceLanguage: true,
            status: true,
            createdAt: true,
            translation: {
              select: {
                id: true,
                sourceTranscriptId: true,
                provider: true,
                model: true,
                revision: true,
                updatedAt: true,
                sourceLanguage: true,
                targetLanguage: true,
                segments: { select: { reviewStatus: true } },
              },
            },
          },
        },
      },
    });
  } catch {
    return <WorkspaceUnavailable title="Export is unavailable" description="We couldn’t load subtitle export right now. Please try again." href={`/projects/${encodeURIComponent(slug)}`} />;
  }
  if (!project) notFound();

  const movie = project.movies[0] ?? null;
  const translation = movie?.translation ?? null;
  const summary = summarizeSubtitleReview(translation?.segments ?? []);
  const projectPath = `/projects/${encodeURIComponent(slug)}`;
  let previews: { all: PreviewSegment | null; approved: PreviewSegment | null } = { all: null, approved: null };

  if (movie && translation) {
    try {
      const [allSegment, approvedSegment] = await Promise.all([
        prisma.translatedSegment.findFirst({ where: { translationId: translation.id }, orderBy: { sequence: "asc" }, select: previewSelect }),
        prisma.translatedSegment.findFirst({ where: { translationId: translation.id, reviewStatus: "APPROVED" }, orderBy: { sequence: "asc" }, select: previewSelect }),
      ]);
      const candidates = [allSegment, approvedSegment].filter((segment): segment is NonNullable<typeof segment> => segment !== null);
      const sequences = [...new Set(candidates.map((segment) => segment.sequence))];
      const sourceSegments = sequences.length ? await prisma.transcriptSegment.findMany({
        where: { transcriptId: translation.sourceTranscriptId, sequence: { in: sequences } },
        select: { sequence: true, text: true },
      }) : [];
      const sourceBySequence = new Map(sourceSegments.map((segment) => [segment.sequence, segment.text]));
      const toPreview = (segment: typeof allSegment): PreviewSegment | null => segment ? {
        ...segment,
        sourceText: sourceBySequence.get(segment.sequence) ?? null,
      } : null;
      previews = { all: toPreview(allSegment), approved: toPreview(approvedSegment) };
    } catch {
      // A preview is optional; the download actions continue to use the export API.
    }
  }

  const reviewPath = movie ? `${projectPath}/translation?movieId=${encodeURIComponent(movie.id)}&view=review#review` : `${projectPath}/translation?view=review#review`;
  const movieProps = movie ? {
    id: movie.id,
    title: movie.title,
    filename: movie.filename,
    durationSeconds: movie.durationSeconds,
    sourceLanguage: movie.sourceLanguage,
    status: movie.status,
    createdAt: movie.createdAt.toISOString(),
  } : null;
  const translationProps = translation ? {
    provider: translation.provider,
    model: translation.model,
    revision: translation.revision,
    updatedAt: translation.updatedAt.toISOString(),
    sourceLanguage: translation.sourceLanguage,
    targetLanguage: translation.targetLanguage,
  } : null;

  return <main className={pageClass}>
    <div className={contentClass}>
      <SubtitleExportControls
        projectName={project.name}
        projectHref={projectPath}
        reviewHref={reviewPath}
        movie={movieProps}
        translation={translationProps}
        summary={summary}
        filenames={{ srt: subtitleFilename(movie?.filename ?? null, movie?.title ?? project.name, "srt"), ass: subtitleFilename(movie?.filename ?? null, movie?.title ?? project.name, "ass") }}
        previews={previews}
      />
    </div>
  </main>;
}

type PreviewSegment = {
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
  reviewStatus: string;
  sourceText: string | null;
};
