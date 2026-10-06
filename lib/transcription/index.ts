import "server-only";

import {
  OPENROUTER_TRANSCRIPTION_MODELS,
  OpenRouterTranscriptionProvider,
  type OpenRouterTranscriptionModel,
} from "@/lib/transcription/openrouter-provider";
import type { TranscriptionProvider } from "@/lib/transcription/provider";
import { TranscriptionError } from "@/lib/transcription/types";

import { openRouterConfig } from "@/lib/env";

export function getTranscriptionProvider(modelOverride?: string): TranscriptionProvider {
  let config: ReturnType<typeof openRouterConfig>;
  try { config = openRouterConfig(); } catch { throw new TranscriptionError("TRANSCRIPTION_NOT_CONFIGURED"); }

  const model = modelOverride?.trim() || process.env.TRANSCRIPTION_MODEL?.trim();
  if (!model) {
    throw new TranscriptionError("TRANSCRIPTION_NOT_CONFIGURED");
  }
  if (!isSupportedModel(model)) {
    throw new TranscriptionError("TRANSCRIPTION_MODEL_UNSUPPORTED");
  }

  return new OpenRouterTranscriptionProvider(model, config.apiKey, config.baseUrl);
}

function isSupportedModel(model: string): model is OpenRouterTranscriptionModel {
  return OPENROUTER_TRANSCRIPTION_MODELS.some((candidate) => candidate === model);
}

export { TranscriptionError } from "@/lib/transcription/types";
export type {
  TranscriptSegment,
  TranscriptionInput,
  TranscriptionResult,
  TranscriptionUsage,
} from "@/lib/transcription/types";
