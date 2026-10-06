import { hasOnlyKeys, readJsonObject, jsonError } from "@/lib/project-api";
import { enqueueTranslationRefinement, getTranslationRefinementJob } from "@/lib/queue/refinement-queue";
import { translationReviewError } from "@/lib/translation-qc/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const body = await readJsonObject(request);
    if (!body || !hasOnlyKeys(body, ["sequences"])) return jsonError("REFINEMENT_SEQUENCES_INVALID", "Provide only a sequences array", 400);
    return Response.json({ data: await enqueueTranslationRefinement(id, body.sequences) }, { status: 202 });
  } catch (error) { return translationReviewError(error, true); }
}
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return jsonError("REFINEMENT_JOB_ID_REQUIRED", "Provide the returned jobId", 400);
  try { return Response.json({ data: await getTranslationRefinementJob(id, jobId) }); }
  catch (error) { return translationReviewError(error, true); }
}
