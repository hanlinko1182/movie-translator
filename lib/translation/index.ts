import "server-only";

import { OpenRouterTranslationProvider } from "@/lib/translation/openrouter-provider";
import type { TranslationProvider } from "@/lib/translation/provider";
import { TranslationError } from "@/lib/translation/types";

import { modelConfig, openRouterConfig } from "@/lib/env";

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
  let model: string;
  try { model = modelConfig("TRANSLATION_MODEL"); } catch { throw new TranslationError("TRANSLATION_NOT_CONFIGURED"); }
  const { apiKey, baseUrl } = openRouterConfiguration();
  return { model, provider: new OpenRouterTranslationProvider(model, apiKey, baseUrl) };
}

function openRouterConfiguration() {
  try { return openRouterConfig(); } catch { throw new TranslationError("TRANSLATION_NOT_CONFIGURED"); }
}

export function getRefinementTranslationProvider(): { model: string; provider: TranslationProvider } {
  let model: string;
  try { model = modelConfig("TRANSLATION_REFINEMENT_MODEL"); } catch { throw new TranslationError("REFINEMENT_NOT_CONFIGURED"); }
  try {
    const { apiKey, baseUrl } = openRouterConfiguration();
    return { model, provider: new OpenRouterTranslationProvider(model, apiKey, baseUrl) };
  } catch {
    throw new TranslationError("REFINEMENT_NOT_CONFIGURED");
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
