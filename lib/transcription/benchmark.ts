import "server-only";

import { OPENROUTER_TRANSCRIPTION_MODELS } from "@/lib/transcription/openrouter-provider";
import { transcribeMovieAudio } from "@/lib/transcription/transcribe-movie";
import { TranscriptionError } from "@/lib/transcription/types";

const BENCHMARK_MAX_AUDIO_BYTES = 5_000_000;

export async function benchmarkMovieTranscription(movieId: string) {
  const results = [];

  // Sequential calls make runtime and cost easier to attribute per model.
  for (const model of OPENROUTER_TRANSCRIPTION_MODELS) {
    const startedAt = performance.now();
    try {
      const transcription = await transcribeMovieAudio(movieId, {
        model,
        maxInputBytes: BENCHMARK_MAX_AUDIO_BYTES,
      });
      results.push({
        provider: transcription.provider,
        model: transcription.model,
        status: "success" as const,
        runtimeMs: Math.round(performance.now() - startedAt),
        timestampAvailable: true,
        text: transcription.text,
        language: transcription.language,
        durationMs: transcription.durationMs,
        segmentCount: transcription.segments.length,
        usage: transcription.usage,
      });
    } catch (error) {
      if (!(error instanceof TranscriptionError)) throw error;
      results.push({
        provider: "openrouter",
        model,
        status: "error" as const,
        runtimeMs: Math.round(performance.now() - startedAt),
        timestampAvailable: error.code === "TRANSCRIPTION_TIMESTAMP_UNAVAILABLE"
          ? false
          : null,
        errorCode: error.code,
      });
    }
  }

  return { movieId, results };
}
