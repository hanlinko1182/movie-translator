import "server-only";

import { prisma } from "@/lib/prisma";
import { getTranslationBenchmarkProviders } from "@/lib/translation";
import {
  TranslationError,
  type TranslationRequest,
  type TranslationResult,
} from "@/lib/translation/types";

type ModelBenchmark = {
  label: "GPT-6 Sol" | "GPT-6 Luna";
  model: string;
  provider: string;
  status: "success" | "error";
  runtimeMs: number;
  sourceSegmentCount: number;
  translatedSegmentCount: number;
  sourceLanguage: string;
  targetLanguage: "my";
  result?: TranslationResult;
  warnings?: string[];
  errorCode?: string;
};

export async function benchmarkMovieTranslation(movieId: string) {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: {
      id: true,
      sourceLanguage: true,
      transcript: {
        select: {
          id: true,
          segments: {
            orderBy: { sequence: "asc" },
            select: { sequence: true, startMs: true, endMs: true, text: true },
          },
        },
      },
    },
  });
  if (!movie) throw new TranslationError("MOVIE_NOT_FOUND");
  if (!movie.transcript) throw new TranslationError("TRANSCRIPT_NOT_FOUND");

  const input: TranslationRequest = {
    sourceLanguage: movie.sourceLanguage,
    targetLanguage: "my",
    segments: movie.transcript.segments,
  };
  const providers = getTranslationBenchmarkProviders();
  const results: ModelBenchmark[] = [];

  // One contextual request per model, sequentially, using the same persisted source.
  for (const candidate of [
    { label: "GPT-6 Sol" as const, ...providers.primary },
    { label: "GPT-6 Luna" as const, ...providers.compare },
  ]) {
    const startedAt = performance.now();
    try {
      const result = await candidate.provider.translate(input);
      results.push({
        label: candidate.label,
        model: candidate.model,
        provider: result.provider,
        status: "success",
        runtimeMs: result.runtimeMs,
        sourceSegmentCount: input.segments.length,
        translatedSegmentCount: result.segments.length,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        result,
        warnings: collectWarnings(result),
      });
    } catch (error) {
      if (!(error instanceof TranslationError)) throw error;
      results.push({
        label: candidate.label,
        model: candidate.model,
        provider: "openrouter",
        status: "error",
        runtimeMs: Math.round(performance.now() - startedAt),
        sourceSegmentCount: input.segments.length,
        translatedSegmentCount: 0,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        errorCode: error.code,
      });
    }
  }

  return { movieId: movie.id, transcriptId: movie.transcript.id, source: input, results };
}

function collectWarnings(result: TranslationResult) {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const segment of result.segments) {
    if (!/[\u1000-\u109F\uAA60-\uAA7F]/u.test(segment.text)) {
      warnings.push(`Segment ${segment.sequence}: no Myanmar script detected`);
    }
    if (/```|^#{1,6}\s|^\*\s/m.test(segment.text)) {
      warnings.push(`Segment ${segment.sequence}: possible Markdown`);
    }
    if (seen.has(segment.text)) {
      warnings.push(`Segment ${segment.sequence}: translation repeated from an earlier segment`);
    }
    seen.add(segment.text);
  }
  return warnings;
}
