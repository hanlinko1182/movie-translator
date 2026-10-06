import { log } from "@/lib/logger";
import { jsonError } from "@/lib/project-api";
import { RedisConfigurationError } from "@/lib/queue/connection";
import { RecapError } from "./types";
export function recapApiError(error: unknown, queue = false) {
  if (error instanceof RecapError) return jsonError(error.code, error.message, error.status);
  if (error instanceof RedisConfigurationError) return jsonError("RECAP_QUEUE_NOT_CONFIGURED", "Recap queue is not configured", 503);
  log("error", "api_errors_diagnostic");
  return jsonError(queue ? "RECAP_QUEUE_UNAVAILABLE" : "RECAP_UNAVAILABLE", "Unable to access recap; please try again later", 503);
}
