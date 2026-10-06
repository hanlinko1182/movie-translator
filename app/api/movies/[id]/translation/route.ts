import { log } from "@/lib/logger";
import { translationSegmentVersion } from "@/lib/translation-qc/service";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/project-api";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const movie = await prisma.movie.findUnique({
      where: { id },
      select: {
        id: true,
        transcript: { select: { segments: { select: { sequence: true, startMs: true, endMs: true, text: true } } } },
        translation: {
          select: {
            id: true,
            movieId: true,
            revision: true,
            sourceTranscriptId: true,
            provider: true,
            model: true,
            sourceLanguage: true,
            targetLanguage: true,
            segments: {
              orderBy: { sequence: "asc" },
              select: { sequence: true, startMs: true, endMs: true, text: true, provider: true, model: true, origin: true, id: true, reviewStatus: true, revision: true, editedAt: true, reviewedAt: true, qcIssues: { select: { id: true, category: true, severity: true, message: true, source: true, resolvedAt: true, resolution: true }, orderBy: { createdAt: "asc" } } },
            },
          },
        },
      },
    });
    if (!movie) return jsonError("MOVIE_NOT_FOUND", "Movie not found", 404);
    if (!movie.translation) return jsonError("TRANSLATION_NOT_FOUND", "Translation not found", 404);
    const sourceBySequence = new Map(movie.transcript?.segments.map((segment) => [segment.sequence, segment]) ?? []);
    return Response.json({ data: { ...movie.translation, segments: movie.translation.segments.map((segment) => ({ ...segment, version: translationSegmentVersion(movie.translation!, segment, sourceBySequence.get(segment.sequence)) })) } });
  } catch {
    log("error", "translation_route_diagnostic");
    return jsonError("TRANSLATION_FETCH_FAILED", "Unable to fetch translation", 500);
  }
}
