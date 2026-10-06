import { editTranslationSegment, parseSegmentEdit } from "@/lib/translation-review/service";
import { editBody, subtitleEditError } from "@/lib/translation-review/api";
import { TranslationError } from "@/lib/translation/types";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; sequence: string }> };
export async function PATCH(request: Request, context: Context) {
  const { id, sequence } = await context.params;
  try {
    if (!/^(0|[1-9]\d*)$/.test(sequence) || Number(sequence) > 2_147_483_647) throw new TranslationError("SEGMENT_NOT_FOUND");
    return Response.json({ data: await editTranslationSegment(id, Number(sequence), parseSegmentEdit(await editBody(request))) });
  } catch (error) { return subtitleEditError(error); }
}
