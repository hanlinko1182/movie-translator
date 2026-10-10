import { readRenderJob, renderApiError } from "@/lib/video-render/api";
import { jsonError } from "@/lib/project-api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; movieId: string; renderId: string }> };
export async function GET(_request: Request, context: Context) {
  const { id, movieId, renderId } = await context.params;
  try {
    const job = await readRenderJob(id, movieId, renderId);
    return job ? Response.json({ data: job }, { headers: { "Cache-Control": "private, no-store" } }) : jsonError("RENDER_NOT_FOUND", "Render job not found", 404);
  } catch (error) { return renderApiError(error); }
}
