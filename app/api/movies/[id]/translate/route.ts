import { jsonError } from "@/lib/project-api";
import { RedisConfigurationError } from "@/lib/queue/connection";
import { enqueueMovieTranslation, getMovieTranslationJob } from "@/lib/queue/translation-queue";
import { TranslationError } from "@/lib/translation/types";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return Response.json({ data: await enqueueMovieTranslation(id) }, { status: 202 });
  } catch (error) {
    return queueErrorResponse(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return Response.json({ data: await getMovieTranslationJob(id) });
  } catch (error) {
    return queueErrorResponse(error);
  }
}

function queueErrorResponse(error: unknown) {
  if (error instanceof TranslationError) {
    return jsonError(error.code, error.message, error.status);
  }
  if (error instanceof RedisConfigurationError) {
    console.error(error.message);
    return jsonError("TRANSLATION_QUEUE_NOT_CONFIGURED", "Translation processing is not configured", 503);
  }
  console.error("Translation queue request failed; check database and Redis connectivity.");
  return jsonError("TRANSLATION_QUEUE_UNAVAILABLE", "Unable to access the translation queue; try again later", 503);
}
