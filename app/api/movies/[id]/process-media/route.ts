import { log } from "@/lib/logger";
import { enqueueMovieMedia, getMovieMediaJob, MediaQueueError } from "@/lib/queue/media-queue";
import { RedisConfigurationError } from "@/lib/queue/connection";
import { jsonError } from "@/lib/project-api";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return Response.json({ data: await enqueueMovieMedia(id) }, { status: 202 });
  } catch (error) {
    return queueErrorResponse(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return Response.json({ data: await getMovieMediaJob(id) });
  } catch (error) {
    return queueErrorResponse(error);
  }
}

function queueErrorResponse(error: unknown) {
  if (error instanceof MediaQueueError) return jsonError(error.code, error.message, error.status);
  if (error instanceof RedisConfigurationError) {
    log("error", "runtime_configuration_invalid");
    return jsonError("MEDIA_QUEUE_NOT_CONFIGURED", "Media processing is not configured", 503);
  }
  log("error", "process_media_route_diagnostic");
  return jsonError("MEDIA_QUEUE_UNAVAILABLE", "Unable to access the media queue; try again later", 503);
}
