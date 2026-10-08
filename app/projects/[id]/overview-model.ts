import type { Prisma } from "@/generated/prisma/client";
import { normalizeExportSegments } from "@/lib/subtitle-export/segments";

export const overviewSelect = {
  name: true, slug: true, sourceLanguage: true, targetLanguage: true,
  status: true, createdAt: true, updatedAt: true,
  _count: { select: { movies: true } },
  movies: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
    select: {
      id: true, title: true, filename: true, storageKey: true, durationSeconds: true,
      sourceLanguage: true, status: true, processingProgress: true, createdAt: true, updatedAt: true,
      transcript: { select: { id: true, updatedAt: true, _count: { select: { segments: true } }, segments: { select: { sequence: true, startMs: true, endMs: true } } } },
      translation: { select: {
        sourceTranscriptId: true, updatedAt: true, qcScannedAt: true,
        segments: { orderBy: { sequence: "asc" }, select: {
          sequence: true, startMs: true, endMs: true, text: true, reviewStatus: true,
          editedAt: true, reviewedAt: true,
          qcIssues: { where: { resolvedAt: null }, select: { severity: true } },
        } },
      } },
      _count: { select: { scenes: true, characterEvidence: true } },
      characterAnalysis: { select: { updatedAt: true } },
      recap: { select: { updatedAt: true } },
    },
  },
} satisfies Prisma.ProjectSelect;

export type OverviewProject = Prisma.ProjectGetPayload<{ select: typeof overviewSelect }>;
export type StageState = "Completed" | "Processing" | "Needs Attention" | "Ready" | "Waiting" | "Failed";
export type JobState = string | null | undefined; // undefined means the status read failed.
export type OverviewFacts = {
  sourceAvailable: boolean | null;
  audioAvailable: boolean | null;
  jobs: { media: JobState; transcription: JobState; translation: JobState; scenes: JobState; recap: JobState };
  recapStale: boolean | null;
  charactersStale: boolean | null;
};
export type OverviewAction = {
  label: string; href?: string; endpoint?: string; kind?: "local" | "ai";
};
export type WorkflowStage = {
  name: string; state: StageState; detail: string; href: string; linkLabel: string; progress?: number;
};

export function languageName(code: string) {
  return ({ zh: "Chinese", cmn: "Chinese (Mandarin)", my: "Myanmar", en: "English" } as Record<string, string>)[code] ?? code;
}
export function durationLabel(seconds: number | null | undefined) {
  if (seconds == null) return "Duration unavailable";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
export function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}
const running = (state: JobState) => !!state && ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(state);
function jobStage(state: JobState, fallback: StageState): StageState {
  return running(state) ? "Processing" : state === "failed" ? "Failed" : fallback;
}

// Presentation only: no queue submissions, provider calls or database writes.
export function buildOverview(project: OverviewProject, facts: OverviewFacts) {
  const movie = project.movies[0];
  const base = `/projects/${encodeURIComponent(project.slug)}`;
  const links = { transcript: `${base}/subtitles`, translation: `${base}/translation`, review: `${base}/translation?view=review#review`, recap: `${base}/recap`, export: `${base}/export`, scenes: `${base}/scenes`, characters: `${base}/characters` };
  const transcriptCount = movie?.transcript?._count.segments ?? 0;
  const translation = movie?.translation;
  const rows = translation?.segments ?? [];
  const approved = rows.filter((row) => row.reviewStatus === "APPROVED").length;
  const remaining = rows.length - approved;
  const findings = rows.reduce((total, row) => total + row.qcIssues.length, 0);
  const warnings = rows.reduce((total, row) => total + row.qcIssues.filter((issue) => issue.severity === "WARNING").length, 0);
  const sourceMatches = !!translation && !!movie?.transcript && translation.sourceTranscriptId === movie.transcript.id;
  const sourceBySequence = new Map(movie?.transcript?.segments.map((row) => [row.sequence, row]));
  const aligned = sourceMatches && rows.length === transcriptCount && rows.length > 0 && rows.every((row) => {
    const source = sourceBySequence.get(row.sequence);
    return source?.startMs === row.startMs && source.endMs === row.endMs;
  });
  const reviewComplete = aligned && remaining === 0;
  let exportAvailable = false;
  try { normalizeExportSegments(rows); exportAvailable = rows.length > 0; } catch { /* The export workspace explains invalid or missing segments. */ }
  const hasSource = !!movie?.storageKey && facts.sourceAvailable === true;
  const uploaded = !!movie?.storageKey;
  const recapCurrent = !!movie?.recap && facts.recapStale === false;
  const sceneCount = movie?._count.scenes ?? 0;
  const mediaRunning = running(facts.jobs.media) || movie?.status === "QUEUED" || movie?.status === "PROCESSING";
  const mediaFailed = facts.jobs.media === "failed" || movie?.status === "FAILED";

  const stages: WorkflowStage[] = [
    { name: "Upload", state: uploaded ? facts.sourceAvailable === false ? "Needs Attention" : "Completed" : "Waiting", detail: uploaded ? facts.sourceAvailable === false ? "Source file unavailable" : "Movie upload recorded" : "No source movie uploaded", href: uploaded ? "/movies" : "/projects/new", linkLabel: uploaded ? "View movies" : "Upload a movie" },
    { name: "Transcription", state: mediaRunning ? "Processing" : mediaFailed ? "Failed" : jobStage(facts.jobs.transcription, transcriptCount ? "Completed" : facts.audioAvailable ? "Ready" : "Waiting"), detail: mediaRunning ? "Preparing source audio" : mediaFailed ? "Audio preparation needs attention" : transcriptCount ? `${transcriptCount} transcript segments` : facts.audioAvailable ? "Audio is prepared" : "Prepare audio before transcription", href: links.transcript, linkLabel: transcriptCount ? "View transcript" : "Open transcription", ...(mediaRunning ? { progress: Math.max(0, Math.min(100, movie?.processingProgress ?? 0)) } : {}) },
    { name: "Translation", state: jobStage(facts.jobs.translation, rows.length ? !aligned || findings ? "Needs Attention" : "Completed" : transcriptCount ? "Ready" : "Waiting"), detail: rows.length ? `${rows.length} segments · ${translation?.qcScannedAt ? `${findings} QC findings${warnings ? ` · ${warnings} warnings` : ""}` : "QC not run"}${!aligned ? " · source alignment needs review" : ""}` : transcriptCount ? "Source transcript is ready" : "Requires a source transcript", href: links.translation, linkLabel: "Open translation" },
    { name: "Review", state: reviewComplete ? "Completed" : rows.length ? "Needs Attention" : "Waiting", detail: rows.length ? `${approved}/${rows.length} approved${findings ? ` · ${findings} QC findings` : ""}` : "Human approval of translated text", href: links.review, linkLabel: "Review subtitles" },
    { name: "Recap", state: jobStage(facts.jobs.recap, !sceneCount && running(facts.jobs.scenes) ? "Processing" : !sceneCount && facts.jobs.scenes === "failed" ? "Needs Attention" : movie?.recap ? recapCurrent ? "Completed" : "Needs Attention" : transcriptCount && sceneCount ? "Ready" : "Waiting"), detail: !sceneCount && running(facts.jobs.scenes) ? "Scene detection in progress" : movie?.recap ? recapCurrent ? "Myanmar recap script saved" : facts.recapStale === true ? "Source changed · review saved recap" : "Saved recap · freshness unavailable" : !transcriptCount ? "Requires a transcript and scenes" : !sceneCount ? facts.jobs.scenes === "failed" ? "Scene detection needs attention" : "Requires scene detection" : `${sceneCount} scenes available`, href: links.recap, linkLabel: "Open recap" },
    { name: "Export", state: exportAvailable ? "Ready" : rows.length ? "Needs Attention" : "Waiting", detail: exportAvailable ? "SRT and ASS available on demand" : "Requires valid translated subtitles", href: links.export, linkLabel: "Open export" },
  ];
  let next: { title: string; description: string; action: OverviewAction };
  const failed = stages.find((stage) => stage.state === "Failed");
  const processing = stages.find((stage) => stage.state === "Processing");
  if (failed) next = { title: `${failed.name} needs attention`, description: "Processing did not finish. Check the workspace and worker configuration before trying again. Saved outputs remain available.", action: { label: failed.linkLabel, href: failed.href } };
  else if (processing) next = { title: processing.name === "Recap" && !sceneCount && running(facts.jobs.scenes) ? "Scene detection is in progress" : `${processing.name} is in progress`, description: "Processing is queued or running. Open the workspace to inspect saved results, or refresh this overview for the latest status.", action: { label: processing.name === "Recap" && !sceneCount && running(facts.jobs.scenes) ? "Open scenes" : processing.linkLabel, href: processing.name === "Recap" && !sceneCount && running(facts.jobs.scenes) ? links.scenes : processing.href } };
  else if (!uploaded) next = { title: "Start with a source movie", description: "This project has no uploaded source file. Create a project with a movie upload to begin the workflow.", action: { label: "Upload a movie", href: "/projects/new" } };
  else if (!transcriptCount && !hasSource && !facts.audioAvailable) next = { title: "Check source media", description: facts.sourceAvailable === false ? "The uploaded file is unavailable. Check the media storage before processing this movie." : "Source availability could not be checked. Check your media setup before processing.", action: { label: "View movies", href: "/movies" } };
  else if (!transcriptCount && facts.audioAvailable === false && hasSource) next = { title: "Prepare the movie audio", description: "Extract source audio before transcription. This runs locally with the existing media worker.", action: { label: "Prepare audio", endpoint: `/api/movies/${movie.id}/process-media`, kind: "local" } };
  else if (!transcriptCount && facts.audioAvailable) next = { title: "Turn the dialogue into a transcript", description: "The source audio is ready. Generate Chinese transcript segments before translation or recap work.", action: { label: "Start transcription", endpoint: `/api/movies/${movie.id}/transcribe`, kind: "ai" } };
  else if (!transcriptCount) next = { title: "Check transcription prerequisites", description: "Audio availability could not be confirmed. Open transcription and check your media setup.", action: { label: "Open transcription", href: links.transcript } };
  else if (rows.length && !aligned) next = { title: "Check translation alignment", description: "The saved translation does not fully match the current source transcript. Inspect it before approving or exporting.", action: { label: "Open translation", href: links.translation } };
  else if (!rows.length) next = { title: "Translate the source dialogue", description: `The transcript has ${transcriptCount} segments. Generate the ${languageName(project.targetLanguage)} translation next.`, action: { label: "Translate movie", endpoint: `/api/movies/${movie.id}/translate`, kind: "ai" } };
  else if (!reviewComplete || findings) next = { title: remaining ? `${remaining} subtitles need human review` : "Review the remaining QC findings", description: `${approved} approved · ${findings} open QC findings. Human edits and approval determine the current subtitle text.`, action: { label: "Review translation", href: links.review } };
  else if (!sceneCount) next = { title: "Prepare scenes for a recap", description: "Subtitles are reviewed. Detect scenes before generating a recap from transcript and scene evidence.", action: { label: "Open scenes", href: links.scenes } };
  else if (!recapCurrent) next = { title: movie?.recap ? "Review the saved recap" : "Create a Myanmar recap", description: movie?.recap ? "Check the saved recap against its current source evidence." : "The transcript and scenes are ready. The recap workspace lets you generate a script with an explicit AI action.", action: { label: "Open recap", href: links.recap } };
  else next = { title: "Your subtitle files are ready", description: "Download current subtitles as SRT or ASS. Video rendering and AI narration are not available yet.", action: { label: "Open export", href: links.export } };

  const status = failed || project.status === "FAILED" ? "Failed" : processing || project.status === "PROCESSING" ? "Processing" : rows.length && (!reviewComplete || findings) || movie?.recap && !recapCurrent ? "Needs Review" : reviewComplete ? "Ready" : uploaded ? "Uploaded" : project.status === "ARCHIVED" ? "Archived" : "Draft";
  const activities = [
    { label: "Project created", date: project.createdAt },
    ...(uploaded ? [{ label: "Movie upload recorded", date: movie.createdAt }] : []),
    ...(movie?.transcript ? [{ label: "Transcript saved", date: movie.transcript.updatedAt }] : []),
    ...(translation ? [{ label: "Translation updated", date: translation.updatedAt }] : []),
    ...rows.flatMap((row) => [ ...(row.editedAt ? [{ label: `Subtitle ${row.sequence + 1} edited`, date: row.editedAt }] : []), ...(row.reviewedAt ? [{ label: `Subtitle ${row.sequence + 1} review updated`, date: row.reviewedAt }] : []) ]),
    ...(movie?.characterAnalysis ? [{ label: "Character analysis saved", date: movie.characterAnalysis.updatedAt }] : []),
    ...(movie?.recap ? [{ label: "Recap saved", date: movie.recap.updatedAt }] : []),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  const latest = new Date(Math.max(project.updatedAt.getTime(), movie?.updatedAt.getTime() ?? 0, ...activities.map((item) => item.date.getTime())));
  const outputs = [
    { label: "Transcript", detail: transcriptCount ? `${transcriptCount} source segments` : "Not generated yet", available: !!transcriptCount, href: links.transcript },
    { label: `${languageName(project.targetLanguage)} translation`, detail: rows.length ? !aligned ? "Alignment needs review" : reviewComplete ? "Human reviewed" : "Needs review" : "Not generated yet", available: !!rows.length, href: links.translation },
    ...["SRT", "ASS"].map((label) => ({ label, detail: exportAvailable ? "Available on demand" : "Not available yet", available: exportAvailable, href: links.export })),
    { label: "Myanmar recap", detail: movie?.recap ? recapCurrent ? "Script available" : "Saved · needs checking" : "Not generated yet", available: !!movie?.recap, href: links.recap },
    { label: "Translated video", detail: "Not generated yet", available: false, href: null },
    { label: "Recap video", detail: "Not generated yet", available: false, href: null },
  ];
  return { movie, links, stages, next, status, activities, latest, outputs, sceneCount, findings, approved, facts, statusUnavailable: Object.values(facts.jobs).some((state) => state === undefined) };
}
