import "server-only";
import { modelConfig, openRouterConfig } from "@/lib/env";
import { OpenRouterRecapProvider } from "./openrouter-provider";
import { RecapError } from "./types";
export function recapModel() {
  try { return modelConfig("RECAP_MODEL"); } catch { throw new RecapError("RECAP_NOT_CONFIGURED"); }
}
export function getRecapProvider() {
  const model = recapModel();
  try { const { apiKey, baseUrl } = openRouterConfig(); return { model, provider: new OpenRouterRecapProvider(model, apiKey, baseUrl) }; }
  catch { throw new RecapError("RECAP_NOT_CONFIGURED"); }
}
