import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/project-api";
import { boundedJson } from "@/lib/request-body";
import { log } from "@/lib/logger";
import { SubtitleExportError } from "@/lib/subtitle-export/types";
import { TranslationError } from "@/lib/translation/types";
import { BURN_IN_PROFILE, parseRenderRequest, RenderError } from "./contracts";
import { parseRenderReference, parseRenderSubmission } from "./job-contract";
import { createRenderJobSnapshot } from "./service";
import { publishRenderSubmission } from "./dispatch";

const select = {
  id: true, movieId: true, mode: true, scope: true, profileId: true, state: true, generation: true, attempts: true,
  errorCode: true, phase: true, progressPercent: true, cancelRequestedAt: true, createdAt: true, updatedAt: true, startedAt: true, completedAt: true, failedAt: true, cancelledAt: true,
  dispatch: { select: { deferredAt: true } },
} satisfies Prisma.RenderJobSelect;
type SelectedJob = Prisma.RenderJobGetPayload<{ select: typeof select }>;
function metadata(job: SelectedJob) {
  const { dispatch, scope, ...safe } = job;
  return { ...safe, exportMode: scope,
    execution: dispatch?.deferredAt ? "DEFERRED" : job.state === "QUEUED" ? "AWAITING_WORKER" : job.state,
    executionAvailable: true,
    ...(dispatch?.deferredAt ? { deferredAt: dispatch.deferredAt, reason: "RENDER_EXECUTION_UNAVAILABLE" } : {}),
  };
}
export async function assertRenderScope(projectId: string, movieId: string) {
  // Reuse the foundation identity validator without accepting settings from GET.
  parseRenderRequest({ projectId, movieId, mode: "BURN_IN", scope: "ALL_CURRENT", profileId: BURN_IN_PROFILE.id });
  if (!await prisma.movie.findFirst({ where: { id: movieId, projectId }, select: { id: true } })) throw new RenderError("MOVIE_NOT_FOUND");
}
export async function listRenderJobs(projectId: string, movieId: string) {
  await assertRenderScope(projectId, movieId);
  const rows = await prisma.renderJob.findMany({ where: { movieId, movie: { projectId } }, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
  return { items: rows.map(metadata), limit: 50 };
}
export async function readRenderJob(projectId: string, movieId: string, renderId: string) {
  await assertRenderScope(projectId, movieId);
  parseRenderReference({ renderJobId: renderId, generation: 0 });
  const job = await prisma.renderJob.findFirst({ where: { id: renderId, movieId, movie: { projectId } }, select });
  if (!job) return null;
  return metadata(job);
}
export async function submitRenderJob(projectId: string, movieId: string, body: unknown, publish = publishRenderSubmission) {
  const input = parseRenderSubmission(projectId, movieId, body);
  const job = await createRenderJobSnapshot(input);
  // The database transaction (snapshot + durable dispatch intent) has committed.
  // A missing Redis receipt never rolls back or loses the durable job.
  if (job.state === "QUEUED") await publish(job.id);
  const current = await readRenderJob(projectId, movieId, job.id);
  if (!current) throw new RenderError("MOVIE_NOT_FOUND");
  return current;
}
export async function renderSubmissionBody(request: Request) {
  try { return await boundedJson(request, 2048); }
  catch { throw new RenderError("INVALID_RENDER_REQUEST"); }
}
export function renderApiError(error: unknown) {
  if (error instanceof RenderError && error.code === "INVALID_RENDER_REQUEST") return jsonError(error.code, "Provide only mode, exportMode and profileId in the render request", 400);
  if (error instanceof RenderError || error instanceof SubtitleExportError || error instanceof TranslationError) return jsonError(error.code, error.message, error.status);
  log("error", "render_api_unavailable");
  return jsonError("RENDER_UNAVAILABLE", "Unable to access video render jobs", 503);
}
