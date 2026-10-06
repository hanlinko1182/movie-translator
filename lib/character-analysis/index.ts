import "server-only";
import { modelConfig, openRouterConfig } from "@/lib/env";
import { OpenRouterCharacterProvider } from "./openrouter-provider";
import { CharacterAnalysisError } from "./types";
export function characterModel() {
  try { return modelConfig("CHARACTER_ANALYSIS_MODEL"); } catch { throw new CharacterAnalysisError("CHARACTER_ANALYSIS_NOT_CONFIGURED"); }
}
export function getCharacterProvider() {
  const model = characterModel();
  try { const { apiKey, baseUrl } = openRouterConfig(); return { model, provider: new OpenRouterCharacterProvider(model, apiKey, baseUrl) }; }
  catch { throw new CharacterAnalysisError("CHARACTER_ANALYSIS_NOT_CONFIGURED"); }
}
