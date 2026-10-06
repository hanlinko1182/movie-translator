import "server-only";
import { jsonError } from "@/lib/project-api";
import { TranslationError } from "@/lib/translation/types";
export function subtitleEditError(error: unknown) {
  if (error instanceof TranslationError) return jsonError(error.code, error.message, error.status);
  console.error("Subtitle review update failed.");
  return jsonError("TRANSLATION_EDIT_FAILED", "Unable to save subtitle review; no changes were applied", 500);
}
export async function editBody(request: Request): Promise<unknown> {
  try { return await request.json(); }
  catch { throw new TranslationError("INVALID_TRANSLATION_EDIT"); }
}
