import { log } from "@/lib/logger";
import "server-only";
import { jsonError } from "@/lib/project-api";
import { TranslationError } from "@/lib/translation/types";
import { boundedJson } from "@/lib/request-body";
export function subtitleEditError(error: unknown) {
  if (error instanceof TranslationError) return jsonError(error.code, error.message, error.status);
  log("error", "translation_review_api_diagnostic");
  return jsonError("TRANSLATION_EDIT_FAILED", "Unable to save subtitle review; no changes were applied", 500);
}
export async function editBody(request: Request): Promise<unknown> {
  try { return await boundedJson(request); }
  catch { throw new TranslationError("INVALID_TRANSLATION_EDIT"); }
}
