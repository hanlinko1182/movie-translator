import "server-only";

import { OpenRouterTranslationProvider } from "@/lib/translation/openrouter-provider";
import type { TranslationProvider } from "@/lib/translation/provider";
import { TranslationError } from "@/lib/translation/types";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function getTranslationBenchmarkProviders(): {
  primary: { model: string; provider: TranslationProvider };
  compare: { model: string; provider: TranslationProvider };
} {
  const primaryModel = process.env.TRANSLATION_MODEL_PRIMARY?.trim();
  const compareModel = process.env.TRANSLATION_MODEL_COMPARE?.trim();
  if (!primaryModel || !compareModel || primaryModel === compareModel) {
    throw new TranslationError("TRANSLATION_NOT_CONFIGURED");
  }

  const { apiKey, baseUrl } = openRouterConfiguration();
  return {
    primary: {
      model: primaryModel,
      provider: new OpenRouterTranslationProvider(primaryModel, apiKey, baseUrl),
    },
    compare: {
      model: compareModel,
      provider: new OpenRouterTranslationProvider(compareModel, apiKey, baseUrl),
    },
  };
}

export function getProductionTranslationProvider(): { model: string; provider: TranslationProvider } {
  const model = process.env.TRANSLATION_MODEL?.trim();
  if (!model) throw new TranslationError("TRANSLATION_NOT_CONFIGURED");
  const { apiKey, baseUrl } = openRouterConfiguration();
  return { model, provider: new OpenRouterTranslationProvider(model, apiKey, baseUrl) };
}

function openRouterConfiguration() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new TranslationError("TRANSLATION_NOT_CONFIGURED");
  const baseUrl = normalizeOpenRouterBaseUrl(
    process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
  );
  return { apiKey, baseUrl };
}

function normalizeOpenRouterBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.hostname !== "openrouter.ai" ||
      url.pathname.replace(/\/+$/, "") !== "/api/v1"
    ) throw new Error("Invalid OpenRouter base URL");
    return `${url.origin}/api/v1`;
  } catch {
    throw new TranslationError("TRANSLATION_NOT_CONFIGURED");
  }
}

export { TranslationError } from "@/lib/translation/types";
export type {
  TranslationRequest,
  TranslationResult,
  TranslationSegment,
  TranslatedSegment,
  TranslationUsage,
} from "@/lib/translation/types";
