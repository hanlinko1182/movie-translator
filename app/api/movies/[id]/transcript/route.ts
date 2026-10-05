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
        transcript: {
          select: {
            id: true,
            movieId: true,
            provider: true,
            model: true,
            language: true,
            durationMs: true,
            text: true,
            segments: {
              orderBy: { sequence: "asc" },
              select: {
                sequence: true,
                startMs: true,
                endMs: true,
                text: true,
                confidence: true,
              },
            },
          },
        },
      },
    });

    if (!movie) return jsonError("MOVIE_NOT_FOUND", "Movie not found", 404);
    if (!movie.transcript) {
      return jsonError("TRANSCRIPT_NOT_FOUND", "Transcript not found", 404);
    }
    return Response.json({ data: movie.transcript });
  } catch {
    console.error("Transcript request failed.");
    return jsonError("TRANSCRIPT_FETCH_FAILED", "Unable to fetch transcript", 500);
  }
}
