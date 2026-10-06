import { readMovieScenes } from "@/lib/scenes/read-scenes";
import { sceneApiError } from "@/lib/scenes/api-errors";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return Response.json({ data: await readMovieScenes(id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return sceneApiError(error); }
}
