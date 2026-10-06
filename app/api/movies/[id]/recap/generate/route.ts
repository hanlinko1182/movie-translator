import { enqueueRecap, getRecapJob } from "@/lib/queue/recap-queue";
import { recapApiError } from "@/lib/recap/api-errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await enqueueRecap(id) }, { status: 202 }); }
  catch (error) { return recapApiError(error, true); }
}
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await getRecapJob(id, new URL(request.url).searchParams.get("jobId")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return recapApiError(error, true); }
}
