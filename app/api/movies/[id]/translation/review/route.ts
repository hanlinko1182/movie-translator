import { reviewTranslationSegments, parseBulkReview } from "@/lib/translation-review/service";
import { editBody, subtitleEditError } from "@/lib/translation-review/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await reviewTranslationSegments(id, parseBulkReview(await editBody(request))) }); }
  catch (error) { return subtitleEditError(error); }
}
