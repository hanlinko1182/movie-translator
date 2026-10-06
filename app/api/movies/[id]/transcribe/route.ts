import { log } from "@/lib/logger";
import { jsonError } from "@/lib/project-api";
import { RedisConfigurationError } from "@/lib/queue/connection";
import {
  enqueueMovieTranscription,
  getMovieTranscriptionJob,
} from "@/lib/queue/transcription-queue";
import { TranscriptionError } from "@/lib/transcription";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return Response.json(
      { data: await enqueueMovieTranscription(id) },
      { status: 202 },
    );
  } catch (error) {
    return queueErrorResponse(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    return Response.json({ data: await getMovieTranscriptionJob(id) });
  } catch (error) {
    return queueErrorResponse(error);
  }
}

function queueErrorResponse(error: unknown) {
  if (error instanceof TranscriptionError) {
    return jsonError(error.code, error.message, error.status);
  }
  if (error instanceof RedisConfigurationError) {
    log("error", "runtime_configuration_invalid");
    return jsonError(
      "TRANSCRIPTION_QUEUE_NOT_CONFIGURED",
      "Transcription processing is not configured",
      503,
    );
  }
  log("error", "transcribe_route_diagnostic");
  return jsonError(
    "TRANSCRIPTION_QUEUE_UNAVAILABLE",
    "Unable to access the transcription queue; try again later",
    503,
  );
}
