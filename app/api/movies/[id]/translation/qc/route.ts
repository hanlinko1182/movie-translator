import { getTranslationReview, runTranslationQc } from "@/lib/translation-qc/service";
import { translationReviewError } from "@/lib/translation-qc/api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await getTranslationReview(id) }); }
  catch (error) { return translationReviewError(error); }
}
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  try { return Response.json({ data: await runTranslationQc(id) }); }
  catch (error) { return translationReviewError(error); }
}
