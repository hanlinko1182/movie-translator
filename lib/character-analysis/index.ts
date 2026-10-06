import "server-only";
import { OpenRouterCharacterProvider } from "./openrouter-provider";
import { CharacterAnalysisError } from "./types";
export function characterModel() {
  const model = process.env.CHARACTER_ANALYSIS_MODEL?.trim();
  if (!model || model.length > 160) throw new CharacterAnalysisError("CHARACTER_ANALYSIS_NOT_CONFIGURED");
  return model;
}
export function getCharacterProvider() {
  const model = characterModel();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new CharacterAnalysisError("CHARACTER_ANALYSIS_NOT_CONFIGURED");
  let url: URL;
  try {
    url = new URL(process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1");
    if (url.protocol !== "https:" || url.hostname !== "openrouter.ai" || url.port || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "") !== "/api/v1") throw new Error();
  } catch { throw new CharacterAnalysisError("CHARACTER_ANALYSIS_NOT_CONFIGURED"); }
  return { model, provider: new OpenRouterCharacterProvider(model, apiKey, `${url.origin}/api/v1`) };
}
