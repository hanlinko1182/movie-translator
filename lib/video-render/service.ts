import "server-only";
import { prisma } from "@/lib/prisma";
import { loadTranslationSnapshot } from "@/lib/translation-qc/service";
import { TranslationError } from "@/lib/translation/types";
import { parseRenderRequest, RenderError } from "./contracts";
import { buildRenderSnapshot } from "./snapshot";
import { fingerprintSourceMedia } from "./source-media";

// Snapshot and dispatch intent commit together; Redis is contacted by the caller afterward.
export async function createRenderJobSnapshot(value: unknown) {
  const input = parseRenderRequest(value);
  const captured = await prisma.$transaction(async (transaction) => {
    const movie = await transaction.movie.findUnique({ where: { id: input.movieId }, select: { projectId: true, storageKey: true } });
    if (!movie) throw new RenderError("MOVIE_NOT_FOUND");
    if (movie.projectId !== input.projectId) throw new RenderError("PROJECT_MOVIE_MISMATCH");
    try { return { translation: await loadTranslationSnapshot(input.movieId, transaction), storageKey: movie.storageKey }; }
    catch (error) {
      if (error instanceof TranslationError && ["REFINEMENT_ALIGNMENT_INVALID", "TRANSCRIPT_NOT_FOUND"].includes(error.code)) throw new RenderError("SUBTITLE_SNAPSHOT_INVALID");
      throw error;
    }
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
  // Never hold a database transaction open while reading a long movie file.
  const media = await fingerprintSourceMedia(captured.storageKey);
  const prepared = buildRenderSnapshot(input, captured.translation, media);
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${input.movieId} FOR UPDATE`;
    const current = await transaction.movie.findUnique({ where: { id: input.movieId }, select: { projectId: true, storageKey: true } });
    if (!current) throw new RenderError("MOVIE_NOT_FOUND");
    if (current.projectId !== input.projectId) throw new RenderError("PROJECT_MOVIE_MISMATCH");
    if (current.storageKey !== captured.storageKey) throw new RenderError("SOURCE_MEDIA_CHANGED");
    // Empty update reuses the FIRST immutable snapshot, regardless of job state.
    // Submitting a retained terminal or deferred job never restarts it.
    const job = await transaction.renderJob.upsert({
      where: { movieId_recipeHash: { movieId: input.movieId, recipeHash: prepared.recipeHash } }, update: {},
      create: { movieId: input.movieId, recipeHash: prepared.recipeHash, mode: input.mode, scope: input.scope,
        profileId: input.profileId, snapshot: prepared.snapshot },
    });
    if (job.state === "QUEUED" || job.state === "ACTIVE") {
      await transaction.renderDispatch.upsert({ where: { renderJobId: job.id }, update: {}, create: { renderJobId: job.id, generation: job.generation } });
    }
    return job;
  });
}
