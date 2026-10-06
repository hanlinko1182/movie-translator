import "server-only";
import { jsonError } from "@/lib/project-api";
import { TranslationError } from "@/lib/translation/types";
import { RedisConfigurationError } from "@/lib/queue/connection";
export function translationReviewError(error: unknown, queue = false) {
  if (error instanceof TranslationError) return jsonError(error.code, error.message, error.status);
  if (queue) {
    console.error("Refinement queue unavailable.");
    return jsonError(error instanceof RedisConfigurationError ? "REFINEMENT_QUEUE_NOT_CONFIGURED" : "REFINEMENT_QUEUE_UNAVAILABLE", "Refinement queue unavailable; check Redis and database connectivity", 503);
  }
  console.error("Translation QC request failed.");
  return jsonError("TRANSLATION_QC_FAILED", "Unable to inspect translation quality", 500);
}
