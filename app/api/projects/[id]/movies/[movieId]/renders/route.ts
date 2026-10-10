import { listRenderJobs, renderApiError, renderSubmissionBody, submitRenderJob } from "@/lib/video-render/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; movieId: string }> };
export async function POST(request: Request, context: Context) {
  const { id, movieId } = await context.params;
  try { return Response.json({ data: await submitRenderJob(id, movieId, await renderSubmissionBody(request)) }, { status: 202, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return renderApiError(error); }
}
export async function GET(_request: Request, context: Context) {
  const { id, movieId } = await context.params;
  try { return Response.json({ data: await listRenderJobs(id, movieId) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return renderApiError(error); }
}
