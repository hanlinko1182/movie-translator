import { renderOperation } from "@/lib/video-render/operations";
import { renderApiError } from "@/lib/video-render/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; movieId: string; renderId: string }> };
export async function POST(request: Request, context: Context) {
  const { id, movieId, renderId } = await context.params;
  try { return Response.json({ data: await renderOperation(request, id, movieId, renderId, "cancel") }, { status: 202, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return renderApiError(error); }
}
