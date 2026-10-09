import type { Prisma, TranslationReviewStatus } from "@/generated/prisma/client";

// Latest movie matches Overview. Counts keep long subtitle text out of this snapshot.
export const dashboardSelect = {
  id: true, name: true, slug: true, status: true,
  sourceLanguage: true, targetLanguage: true, createdAt: true, updatedAt: true,
  _count: { select: { movies: true } },
  movies: {
    take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      title: true, filename: true, storageKey: true, status: true,
      sourceLanguage: true, createdAt: true, updatedAt: true,
      transcript: { select: { id: true, updatedAt: true, _count: { select: { segments: true } } } },
      translation: { select: {
        id: true, sourceTranscriptId: true, updatedAt: true,
        _count: { select: { segments: { where: { qcIssues: { some: { resolvedAt: null } } } } } },
      } },
      _count: { select: { scenes: true } },
      characterAnalysis: { select: { updatedAt: true } },
      recap: { select: { updatedAt: true } },
    },
  },
} satisfies Prisma.ProjectSelect;

export type DashboardProject = Prisma.ProjectGetPayload<{ select: typeof dashboardSelect }>;
export type ReviewCount = { translationId: string; reviewStatus: TranslationReviewStatus; _count: { _all: number } };

export function buildDashboard(projects: DashboardProject[], counts: ReviewCount[]) {
  const reviews = new Map<string, { total: number; approved: number; needsReview: number; unreviewed: number }>();
  for (const row of counts) {
    const tally = reviews.get(row.translationId) ?? { total: 0, approved: 0, needsReview: 0, unreviewed: 0 };
    tally.total += row._count._all;
    if (row.reviewStatus === "APPROVED") tally.approved += row._count._all;
    if (row.reviewStatus === "NEEDS_REVIEW") tally.needsReview += row._count._all;
    if (row.reviewStatus === "UNREVIEWED") tally.unreviewed += row._count._all;
    reviews.set(row.translationId, tally);
  }
  const cards = projects.map((project) => {
    const movie = project.movies[0];
    const base = `/projects/${encodeURIComponent(project.slug)}`;
    const transcriptCount = movie?.transcript?._count.segments ?? 0;
    const translation = movie?.translation;
    const review = translation ? reviews.get(translation.id) : undefined;
    const total = review?.total ?? 0;
    const pending = (review?.needsReview ?? 0) + (review?.unreviewed ?? 0);
    const qcSegments = translation?._count.segments ?? 0;
    const sourceMismatch = !!total && (!movie?.transcript || translation?.sourceTranscriptId !== movie.transcript.id || total !== transcriptCount);
    const fullyApproved = total > 0 && pending === 0;
    const failed = project.status === "FAILED" || movie?.status === "FAILED";
    const mediaProcessing = movie?.status === "QUEUED" || movie?.status === "PROCESSING";
    let stage = "Awaiting upload";
    let action = { label: "Upload Movie", href: "/projects/new" };
    let detail = "No source movie upload recorded.";
    let tone: "Waiting" | "Failed" | "Needs Attention" | "Completed" | "Ready" = "Waiting";
    // Overview's saved-output priorities. Infrastructure-dependent actions go to
    // Overview rather than guessing file availability or current queue state.
    if (project.status === "ARCHIVED") {
      stage = "Archived"; detail = "Archived project · saved outputs remain accessible.";
      action = { label: "Open Overview", href: base };
    } else if (failed) {
      stage = "Failure recorded"; detail = "Check the Overview for processing details."; tone = "Failed";
      action = { label: "Check Overview", href: base };
    } else if (mediaProcessing) {
      stage = "Media processing recorded"; detail = "Open the Overview to check live processing status.";
      action = { label: "Open Overview", href: base };
    } else if (!movie?.storageKey) {
      // Metadata-only movies are not uploaded source files.
    } else if (!transcriptCount) {
      stage = "Prepare & transcribe"; detail = "Upload recorded · check audio and transcription prerequisites."; tone = "Ready";
      action = { label: "Open Overview", href: base };
    } else if (!total) {
      stage = "Ready for translation"; detail = `${transcriptCount} source segments saved.`; tone = "Ready";
      action = { label: "Open Translation", href: `${base}/translation` };
    } else if (sourceMismatch || pending || qcSegments) {
      stage = "Needs review"; tone = "Needs Attention";
      detail = sourceMismatch ? "Saved translation needs a source alignment check." : `${pending} segments awaiting approval · ${qcSegments} with open QC findings.`;
      action = { label: "Review Translation", href: `${base}/translation?view=review#review` };
    } else if (!movie._count.scenes) {
      stage = "Ready for scenes"; detail = "Saved subtitles approved · detect scenes before recap."; tone = "Ready";
      action = { label: "Open Scenes", href: `${base}/scenes` };
    } else if (!movie.recap) {
      stage = "Ready for recap"; detail = `${movie._count.scenes} scenes saved · no recap script yet.`; tone = "Ready";
      action = { label: "Open Recap", href: `${base}/recap` };
    } else {
      stage = "Recap saved"; detail = "Check recap freshness in its workspace. SRT / ASS export is available on demand."; tone = "Completed";
      action = { label: "Open Export", href: `${base}/export` };
    }
    const activities = [
      { label: "Project created", date: project.createdAt, href: base },
      ...(movie?.storageKey ? [{ label: "Movie upload recorded", date: movie.createdAt, href: base }] : []),
      ...(movie?.transcript ? [{ label: "Transcript saved", date: movie.transcript.updatedAt, href: `${base}/subtitles` }] : []),
      ...(translation ? [{ label: "Translation updated", date: translation.updatedAt, href: `${base}/translation` }] : []),
      ...(movie?.characterAnalysis ? [{ label: "Character analysis saved", date: movie.characterAnalysis.updatedAt, href: `${base}/characters` }] : []),
      ...(movie?.recap ? [{ label: "Recap saved", date: movie.recap.updatedAt, href: `${base}/recap` }] : []),
    ];
    const latest = new Date(Math.max(project.updatedAt.getTime(), movie?.updatedAt.getTime() ?? 0, ...activities.map((item) => item.date.getTime())));
    const attention = project.status === "ARCHIVED" ? [] : [
      ...(failed ? [{ message: "Processing failure recorded", href: base }] : []),
      ...(sourceMismatch ? [{ message: "Translation source alignment needs checking", href: `${base}/translation` }] : []),
      ...(pending ? [{ message: `${review?.needsReview ?? 0} needs review · ${review?.unreviewed ?? 0} unreviewed`, href: `${base}/translation?view=review#review` }] : []),
      ...(qcSegments ? [{ message: `${qcSegments} segments with open QC findings`, href: `${base}/translation?view=review#review` }] : []),
      ...(transcriptCount && !movie?._count.scenes ? [{ message: "Scene detection required before recap", href: `${base}/scenes` }] : []),
    ];
    return { project, movie, base, stage, tone, detail, action, latest, activities, attention, review, pending, fullyApproved, transcriptCount };
  }).sort((a, b) => b.latest.getTime() - a.latest.getTime() || a.project.id.localeCompare(b.project.id));
  return {
    totalProjects: cards.length,
    needsReview: cards.filter((card) => card.pending > 0).length,
    fullyApproved: cards.filter((card) => card.fullyApproved).length,
    savedRecaps: cards.filter((card) => card.movie?.recap).length,
    recent: cards.slice(0, 6),
    attention: cards.flatMap((card) => card.attention.map((item) => ({ ...item, project: card.project.name, key: `${card.project.id}-${item.message}` }))),
    activities: cards.flatMap((card) => card.activities.map((item) => ({ ...item, project: card.project.name, key: `${card.project.id}-${item.label}` })))
      .sort((a, b) => b.date.getTime() - a.date.getTime() || a.key.localeCompare(b.key)).slice(0, 6),
  };
}
