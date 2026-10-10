import { prisma } from "@/lib/prisma";
import { localStorage } from "@/lib/storage";
import { streamSourceVideo } from "@/lib/source-video/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; movieId: string }> }) {
  const { id, movieId } = await context.params;
  return streamSourceVideo(request, id, movieId, {
    storage: localStorage,
    findMovie: (projectId, movieId) => prisma.movie.findFirst({ where: { id: movieId, projectId }, select: { storageKey: true } }),
  });
}
export const HEAD = GET;
