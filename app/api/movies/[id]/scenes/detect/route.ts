import { enqueueSceneDetection, getSceneDetectionJob } from "@/lib/queue/scene-queue";
import { sceneApiError } from "@/lib/scenes/api-errors";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await enqueueSceneDetection(id) }, { status: 202 }); }
  catch (error) { return sceneApiError(error, true); }
}
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await getSceneDetectionJob(id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return sceneApiError(error, true); }
}
