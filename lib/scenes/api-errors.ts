import { jsonError } from "@/lib/project-api";
import { MediaProcessingError } from "@/lib/media";
import { RedisConfigurationError } from "@/lib/queue/connection";
import { SceneDetectionError } from "./types";

export function sceneApiError(error: unknown, queue = false) {
  if (error instanceof SceneDetectionError || error instanceof MediaProcessingError) return jsonError(error.code, error.message, error.status);
  if (error instanceof RedisConfigurationError) return jsonError("SCENE_QUEUE_NOT_CONFIGURED", "Scene detection queue is not configured", 503);
  console.error("Scene request failed; check database and queue connectivity.");
  return jsonError(queue ? "SCENE_QUEUE_UNAVAILABLE" : "SCENES_UNAVAILABLE", "Unable to access scenes; please try again later", 503);
}
