import "server-only";

import { prisma } from "@/lib/prisma";
import { getProductionTranslationProvider } from "@/lib/translation";
import { assertTranslationResultAligned } from "@/lib/translation/persist-translation";
import {
  TranslationError,
  type TranslationRequest,
  type TranslationResult,
  type TranslationSegment,
  type TranslationUsage,
} from "@/lib/translation/types";

const MAX_BATCH_SEGMENTS = 24;
const MAX_BATCH_SOURCE_CHARACTERS = 4_000;
const CONTEXT_SEGMENTS_PER_SIDE = 2;
const CONTEXT_CHARACTERS_PER_SIDE = 800;
const MAX_DATABASE_INTEGER = 2_147_483_647;

export async function loadMovieTranslationSource(movieId: string) {
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
  if (movie.transcript.segments.length === 0) throw new TranslationError("TRANSCRIPT_EMPTY");
  if (!movie.sourceLanguage.trim()) throw new TranslationError("TRANSLATION_SOURCE_INVALID");
  validateSourceSegments(movie.transcript.segments);
  return {
    movieId: movie.id,
    sourceTranscriptId: movie.transcript.id,
    sourceLanguage: movie.sourceLanguage,
    segments: movie.transcript.segments,
  };
}

export async function assertMovieTranslationReady(movieId: string) {
  await loadMovieTranslationSource(movieId);
  getProductionTranslationProvider();
}

export async function translateMovieTranscript(movieId: string) {
  const source = await loadMovieTranslationSource(movieId);
  const { model, provider } = getProductionTranslationProvider();
  const batches = buildTranslationBatches(source.segments, source.sourceLanguage);
  const results: TranslationResult[] = [];

  // Bound each provider request, and keep batch order deterministic.
  for (const batch of batches) {
    const result = await provider.translate(batch);
    assertTranslationResultAligned(result, batch.segments, source.sourceLanguage, model);
    results.push(result);
  }

  const usage = mergeUsage(results);
  const result: TranslationResult = {
    provider: results[0].provider,
    model,
    sourceLanguage: source.sourceLanguage,
    targetLanguage: "my",
    segments: results.flatMap((batch) => batch.segments),
    runtimeMs: results.reduce((total, batch) => total + batch.runtimeMs, 0),
    ...(usage ? { usage } : {}),
  };
  assertTranslationResultAligned(result, source.segments, source.sourceLanguage, model);
  return { source, result, batchCount: batches.length };
}

export function buildTranslationBatches(
  source: TranslationSegment[],
  sourceLanguage: string,
): TranslationRequest[] {
  validateSourceSegments(source);
  const batches: TranslationRequest[] = [];
  for (let start = 0; start < source.length;) {
    let end = start;
    let characters = 0;
    while (end < source.length && end - start < MAX_BATCH_SEGMENTS) {
      const nextLength = source[end].text.length;
      if (end > start && characters + nextLength > MAX_BATCH_SOURCE_CHARACTERS) break;
      characters += nextLength;
      end++;
    }
    batches.push({
      sourceLanguage,
      targetLanguage: "my",
      segments: source.slice(start, end),
      contextBefore: nearbyContext(source, start - 1, -1),
      contextAfter: nearbyContext(source, end, 1),
    });
    start = end;
  }
  return batches;
}

function nearbyContext(source: TranslationSegment[], position: number, direction: -1 | 1) {
  const chosen: TranslationSegment[] = [];
  let characters = 0;
  for (
    let index = position;
    index >= 0 && index < source.length && chosen.length < CONTEXT_SEGMENTS_PER_SIDE;
    index += direction
  ) {
    const segment = source[index];
    if (characters + segment.text.length > CONTEXT_CHARACTERS_PER_SIDE) break;
    chosen.push(segment);
    characters += segment.text.length;
  }
  return direction === -1 ? chosen.reverse() : chosen;
}

function validateSourceSegments(segments: TranslationSegment[]) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new TranslationError("TRANSLATION_SOURCE_INVALID");
  }
  let previousSequence = -1;
  let previousStartMs = -1;
  for (const segment of segments) {
    if (
      !segment ||
      !Number.isSafeInteger(segment.sequence) || segment.sequence <= previousSequence ||
      !validMilliseconds(segment.startMs) || !validMilliseconds(segment.endMs) ||
      segment.startMs < previousStartMs || segment.endMs < segment.startMs ||
      typeof segment.text !== "string" || !segment.text.trim() ||
      segment.text.length > MAX_BATCH_SOURCE_CHARACTERS
    ) throw new TranslationError("TRANSLATION_SOURCE_INVALID");
    previousSequence = segment.sequence;
    previousStartMs = segment.startMs;
  }
}

function validMilliseconds(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 &&
    (value as number) <= MAX_DATABASE_INTEGER;
}

function mergeUsage(results: TranslationResult[]): TranslationUsage | undefined {
  const usage: TranslationUsage = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens", "costUsd"] as const) {
    const values = results.map((result) => result.usage?.[key]);
    if (values.every((value): value is number => value !== undefined)) {
      usage[key] = values.reduce((total, value) => total + value, 0);
    }
  }
  return Object.keys(usage).length ? usage : undefined;
}
