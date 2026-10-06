import { enqueueCharacterAnalysis, getCharacterJob } from "@/lib/queue/character-queue";
import { characterApiError } from "@/lib/character-analysis/api-errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await enqueueCharacterAnalysis(id) }, { status: 202 }); }
  catch (error) { return characterApiError(error, true); }
}
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await getCharacterJob(id, new URL(request.url).searchParams.get("jobId")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return characterApiError(error, true); }
}
