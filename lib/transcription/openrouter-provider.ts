import { log } from "@/lib/logger";
import "server-only";

import { openAsBlob } from "node:fs";

import { OpenRouter } from "@openrouter/sdk";
import {
  BadRequestResponseError,
  OpenRouterError,
} from "@openrouter/sdk/models/errors";

import type { TranscriptionProvider } from "@/lib/transcription/provider";
import {
  TranscriptionError,
  type TranscriptSegment,
  type TranscriptionInput,
  type TranscriptionResult,
  type TranscriptionUsage,
} from "@/lib/transcription/types";

export const OPENROUTER_TRANSCRIPTION_MODELS = [
  "qwen/qwen3-asr-1.7b",
  "openai/whisper-large-v3",
] as const;

export type OpenRouterTranscriptionModel = typeof OPENROUTER_TRANSCRIPTION_MODELS[number];

export class OpenRouterTranscriptionProvider implements TranscriptionProvider {
  private readonly client: OpenRouter;

  constructor(
    private readonly model: OpenRouterTranscriptionModel,
    apiKey: string,
    baseUrl: string,
  ) {
    this.client = new OpenRouter({
      apiKey,
      serverURL: baseUrl,
      retryConfig: { strategy: "none" },
      timeoutMs: 65_000,
      // Prevent OPENROUTER_DEBUG from emitting authorization headers.
      debugLogger: {
        group: () => undefined,
        groupEnd: () => undefined,
        log: () => undefined,
      },
    });
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    try {
      const response = await this.client.stt.createTranscriptionMultipart({
        requestBody: {
          file: {
            fileName: "audio.wav",
            content: await openAsBlob(input.audioPath, { type: "audio/wav" }),
          },
          model: this.model,
          language: input.language,
          responseFormat: "verbose_json",
          timestampGranularities: ["segment"],
        },
      });

      return normalizeOpenRouterTranscriptionResponse(response, this.model);
    } catch (error) {
      if (error instanceof TranscriptionError) throw error;
      if (error instanceof BadRequestResponseError) {
        logProviderFailure(error);
        throw new TranscriptionError("TRANSCRIPTION_TIMESTAMP_UNAVAILABLE");
      }
      logProviderFailure(error);
      throw new TranscriptionError("TRANSCRIPTION_PROVIDER_ERROR");
    }
  }
}

export function normalizeOpenRouterTranscriptionResponse(
  value: unknown,
  model: string,
): TranscriptionResult {
  if (!isRecord(value) || !Array.isArray(value.segments)) {
    throw new TranscriptionError("TRANSCRIPTION_TIMESTAMP_UNAVAILABLE");
  }

  const segments: TranscriptSegment[] = [];
  let previousStartMs = -1;
  for (const rawSegment of value.segments) {
    if (!isRecord(rawSegment)) invalidResponse();
    const text = typeof rawSegment.text === "string" ? rawSegment.text.trim() : "";
    const startMs = secondsToMilliseconds(rawSegment.start);
    const endMs = secondsToMilliseconds(rawSegment.end);
    const confidence = optionalConfidence(rawSegment.confidence);
    if (!text || endMs < startMs || startMs < previousStartMs) invalidResponse();
    segments.push({
      startMs,
      endMs,
      text,
      ...(confidence === undefined ? {} : { confidence }),
    });
    previousStartMs = startMs;
  }

  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text || segments.length === 0) invalidResponse();

  const language = typeof value.language === "string" && value.language.trim()
    ? value.language.trim()
    : undefined;
  const durationMs = value.duration === undefined
    ? undefined
    : secondsToMilliseconds(value.duration);
  const usage = normalizeUsage(value.usage);

  return {
    provider: "openrouter",
    model,
    text,
    ...(language ? { language } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(usage ? { usage } : {}),
    segments,
  };
}

function normalizeUsage(value: unknown): TranscriptionUsage | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) invalidResponse();

  const usage: TranscriptionUsage = {};
  assignOptionalNumber(usage, "audioSeconds", value.seconds);
  assignOptionalInteger(usage, "inputTokens", value.inputTokens);
  assignOptionalInteger(usage, "outputTokens", value.outputTokens);
  assignOptionalInteger(usage, "totalTokens", value.totalTokens);
  assignOptionalNumber(usage, "costUsd", value.cost);
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function assignOptionalNumber(
  target: TranscriptionUsage,
  key: "audioSeconds" | "costUsd",
  value: unknown,
) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalidResponse();
  target[key] = value;
}

function assignOptionalInteger(
  target: TranscriptionUsage,
  key: "inputTokens" | "outputTokens" | "totalTokens",
  value: unknown,
) {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalidResponse();
  target[key] = value as number;
}

function optionalConfidence(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    invalidResponse();
  }
  return value;
}

function secondsToMilliseconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalidResponse();
  const milliseconds = Math.round(value * 1000);
  if (!Number.isSafeInteger(milliseconds)) invalidResponse();
  return milliseconds;
}

function invalidResponse(): never {
  throw new TranscriptionError("TRANSCRIPTION_INVALID_RESPONSE");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logProviderFailure(error: unknown) {
  if (error instanceof OpenRouterError) {
    log("error", "transcription_provider_failed", { status: error.statusCode });
    return;
  }
  log("error", "transcription_transport_failed");
}
