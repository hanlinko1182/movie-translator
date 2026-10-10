import { downloadRender } from "@/lib/video-render/download";
import { renderApiError } from "@/lib/video-render/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; movieId: string; renderId: string }> };
export async function GET(_request: Request, context: Context) {
  const { id, movieId, renderId } = await context.params;
  try { return await downloadRender(id, movieId, renderId); }
  catch (error) {
    const response = renderApiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
}
