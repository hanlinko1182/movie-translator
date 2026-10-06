import { log } from "@/lib/logger";
import { jsonError } from "@/lib/project-api";
import { RedisConfigurationError } from "@/lib/queue/connection";
import { CharacterAnalysisError } from "./types";
export function characterApiError(error: unknown, queue = false) {
  if (error instanceof CharacterAnalysisError) return jsonError(error.code, error.message, error.status);
  if (error instanceof RedisConfigurationError) return jsonError("CHARACTER_QUEUE_NOT_CONFIGURED", "Character analysis queue is not configured", 503);
  log("error", "api_errors_diagnostic");
  return jsonError(queue ? "CHARACTER_QUEUE_UNAVAILABLE" : "CHARACTERS_UNAVAILABLE", "Unable to access character analysis; please try again later", 503);
}
