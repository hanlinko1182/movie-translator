import "server-only";

import { prisma } from "@/lib/prisma";
import {
  TranslationError,
  type TranslationResult,
  type TranslationSegment,
} from "@/lib/translation/types";

const MAX_DATABASE_INTEGER = 2_147_483_647;

export type PersistedTranslationSummary = {
  movieId: string;
  translationId: string;
  sourceTranscriptId: string;
  provider: string;
  model: string;
  segmentCount: number;
  runtimeMs: number;
  usage?: TranslationResult["usage"];
};

export function assertTranslationResultAligned(
  result: TranslationResult,
  source: TranslationSegment[],
  sourceLanguage: string,
  model: string,
) {
  if (
    !result ||
    typeof result.provider !== "string" || !result.provider.trim() ||
    typeof result.model !== "string" || !result.model.trim() || result.model !== model ||
    typeof result.sourceLanguage !== "string" || !result.sourceLanguage.trim() ||
    result.sourceLanguage !== sourceLanguage ||
    result.targetLanguage !== "my" ||
    !Number.isSafeInteger(result.runtimeMs) || result.runtimeMs < 0 ||
    !Array.isArray(source) || source.length === 0 ||
    !Array.isArray(result.segments) || result.segments.length !== source.length
  ) invalidResponse();

  let previousSequence = -1;
  let previousStartMs = -1;
  for (let index = 0; index < source.length; index++) {
    const original = source[index];
    const translated = result.segments[index];
    if (
      !original || !translated ||
      !Number.isSafeInteger(original.sequence) || original.sequence <= previousSequence ||
      !validMilliseconds(original.startMs) || !validMilliseconds(original.endMs) ||
      original.startMs < previousStartMs || original.endMs < original.startMs ||
      typeof original.text !== "string" || !original.text.trim() ||
      translated.sequence !== original.sequence ||
      translated.startMs !== original.startMs ||
      translated.endMs !== original.endMs ||
      typeof translated.text !== "string" || !translated.text.trim() ||
      translated.text !== translated.text.trim()
    ) invalidResponse();
    previousSequence = original.sequence;
    previousStartMs = original.startMs;
  }
}

export async function persistTranslationResult(
  movieId: string,
  sourceTranscriptId: string,
  source: TranslationSegment[],
  result: TranslationResult,
): Promise<PersistedTranslationSummary> {
  if (!movieId || !sourceTranscriptId || !result) invalidResponse();
  assertTranslationResultAligned(result, source, result.sourceLanguage, result.model);

  return prisma.$transaction(async (transaction) => {
    // Serialize translation replacement with transcription replacement for this movie.
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${movieId} FOR UPDATE`;
    const movie = await transaction.movie.findUnique({
      where: { id: movieId },
      select: {
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
    if (
      movie.transcript.id !== sourceTranscriptId ||
      movie.sourceLanguage !== result.sourceLanguage ||
      movie.transcript.segments.length !== source.length ||
      movie.transcript.segments.some((segment, index) =>
        segment.sequence !== source[index].sequence ||
        segment.startMs !== source[index].startMs ||
        segment.endMs !== source[index].endMs ||
        segment.text !== source[index].text)
    ) throw new TranslationError("TRANSLATION_SOURCE_CHANGED");

    const data = {
      sourceTranscriptId,
      provider: result.provider.trim(),
      model: result.model,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
    };
    const translation = await transaction.translation.upsert({
      where: { movieId },
      create: { movieId, ...data },
      update: data,
      select: { id: true },
    });
    await transaction.translatedSegment.deleteMany({ where: { translationId: translation.id } });
    await transaction.translatedSegment.createMany({
      data: result.segments.map((segment) => ({
        translationId: translation.id,
        sequence: segment.sequence,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      })),
    });

    return {
      movieId,
      translationId: translation.id,
      sourceTranscriptId,
      provider: data.provider,
      model: data.model,
      segmentCount: result.segments.length,
      runtimeMs: result.runtimeMs,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  }, { timeout: 60_000 });
}

function validMilliseconds(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 &&
    (value as number) <= MAX_DATABASE_INTEGER;
}

function invalidResponse(): never {
  throw new TranslationError("TRANSLATION_INVALID_RESPONSE");
}
