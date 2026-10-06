import "server-only";
import { OpenRouterRecapProvider } from "./openrouter-provider";
import { RecapError } from "./types";
export function recapModel() {
  const model = process.env.RECAP_MODEL?.trim();
  if (!model || model.length > 160) throw new RecapError("RECAP_NOT_CONFIGURED");
  return model;
}
export function getRecapProvider() {
  const model = recapModel();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new RecapError("RECAP_NOT_CONFIGURED");
  let url: URL;
  try {
    url = new URL(process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1");
    if (url.protocol !== "https:" || url.hostname !== "openrouter.ai" || url.port || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "") !== "/api/v1") throw new Error();
  } catch { throw new RecapError("RECAP_NOT_CONFIGURED"); }
  return { model, provider: new OpenRouterRecapProvider(model, apiKey, `${url.origin}/api/v1`) };
}
