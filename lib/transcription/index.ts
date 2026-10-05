import "server-only";

import {
  OPENROUTER_TRANSCRIPTION_MODELS,
  OpenRouterTranscriptionProvider,
  type OpenRouterTranscriptionModel,
} from "@/lib/transcription/openrouter-provider";
import type { TranscriptionProvider } from "@/lib/transcription/provider";
import { TranscriptionError } from "@/lib/transcription/types";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function getTranscriptionProvider(modelOverride?: string): TranscriptionProvider {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new TranscriptionError("TRANSCRIPTION_NOT_CONFIGURED");
  }

  const model = modelOverride?.trim() || process.env.TRANSCRIPTION_MODEL?.trim();
  if (!model) {
    throw new TranscriptionError("TRANSCRIPTION_NOT_CONFIGURED");
  }
  if (!isSupportedModel(model)) {
    throw new TranscriptionError("TRANSCRIPTION_MODEL_UNSUPPORTED");
  }

  const baseUrl = normalizeOpenRouterBaseUrl(
    process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
  );
  return new OpenRouterTranscriptionProvider(model, apiKey, baseUrl);
}

function isSupportedModel(model: string): model is OpenRouterTranscriptionModel {
  return OPENROUTER_TRANSCRIPTION_MODELS.some((candidate) => candidate === model);
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
    ) {
      throw new Error("Invalid OpenRouter base URL");
    }
    return `${url.origin}/api/v1`;
  } catch {
    throw new TranscriptionError("TRANSCRIPTION_NOT_CONFIGURED");
  }
}

export { TranscriptionError } from "@/lib/transcription/types";
export type {
  TranscriptSegment,
  TranscriptionInput,
  TranscriptionResult,
  TranscriptionUsage,
} from "@/lib/transcription/types";
