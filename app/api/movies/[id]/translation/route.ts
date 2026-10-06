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
        translation: {
          select: {
            id: true,
            movieId: true,
            sourceTranscriptId: true,
            provider: true,
            model: true,
            sourceLanguage: true,
            targetLanguage: true,
            segments: {
              orderBy: { sequence: "asc" },
              select: { sequence: true, startMs: true, endMs: true, text: true },
            },
          },
        },
      },
    });
    if (!movie) return jsonError("MOVIE_NOT_FOUND", "Movie not found", 404);
    if (!movie.translation) return jsonError("TRANSLATION_NOT_FOUND", "Translation not found", 404);
    return Response.json({ data: movie.translation });
  } catch {
    console.error("Translation request failed.");
    return jsonError("TRANSLATION_FETCH_FAILED", "Unable to fetch translation", 500);
  }
}
