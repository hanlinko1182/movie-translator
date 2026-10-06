import "server-only";

import { prisma } from "@/lib/prisma";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { captureTranslationMemory } from "@/lib/translation-memory/service";
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
  translationMemoryHits: number;
  modelTranslatedSegments: number;
  modelCalls?: number;
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

  if (result.translationMemoryHits !== undefined || result.modelTranslatedSegments !== undefined || result.modelCalls !== undefined) {
    if (
      !Number.isSafeInteger(result.translationMemoryHits) || result.translationMemoryHits! < 0 ||
      !Number.isSafeInteger(result.modelTranslatedSegments) || result.modelTranslatedSegments! < 0 ||
      result.translationMemoryHits! + result.modelTranslatedSegments! !== source.length ||
      !Number.isSafeInteger(result.modelCalls) || result.modelCalls! < 0 ||
      result.modelCalls! > result.modelTranslatedSegments!
    ) invalidResponse();
  }

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
        projectId: true,
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

    const previous = await transaction.translation.findUnique({ where: { movieId }, include: { segments: true } });
    const manual = previous?.segments.filter((segment) => segment.origin === "MANUAL") ?? [];
    const sourceBySequence = new Map(source.map((segment) => [segment.sequence, segment]));
    // Never discard manual work, including when an in-place source replacement changed its meaning.
    if (manual.length && (previous!.sourceTranscriptId !== sourceTranscriptId || previous!.sourceLanguage !== result.sourceLanguage || previous!.targetLanguage !== result.targetLanguage || manual.some((segment) => {
      const original = sourceBySequence.get(segment.sequence);
      return !original || original.startMs !== segment.startMs || original.endMs !== segment.endMs || segment.manualSourceHash !== sourceTextHash(original.text);
    }))) throw new TranslationError("MANUAL_EDIT_PROTECTED");
    const manualBySequence = new Map(manual.map((segment) => [segment.sequence, segment]));
    const previousBySequence = new Map(previous?.segments.map((segment) => [segment.sequence, segment]) ?? []);

    const data = {
      sourceTranscriptId,
      provider: result.provider.trim(),
      model: result.model,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      qcScannedAt: null,
    };
    const translation = await transaction.translation.upsert({
      where: { movieId },
      create: { movieId, ...data },
      update: { ...data, revision: { increment: 1 } },
      select: { id: true },
    });
    await transaction.translatedSegment.deleteMany({ where: { translationId: translation.id, origin: { not: "MANUAL" } } });
    await transaction.translatedSegment.createMany({
      data: result.segments.filter((segment) => !manualBySequence.has(segment.sequence)).map((segment) => ({
        translationId: translation.id,
        sequence: segment.sequence,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        reviewStatus: previousBySequence.get(segment.sequence)?.reviewStatus === "APPROVED" ? "NEEDS_REVIEW" : "UNREVIEWED",
        provider: segment.provider ?? result.provider,
        model: segment.model ?? result.model,
        origin: segment.origin ?? (result.provider === "translation-memory" ? "TRANSLATION_MEMORY" : "MODEL"),
      })),
    });
    // Capture only after segment replacement succeeds, inside the same transaction.
    await captureTranslationMemory(transaction, movie.projectId, source, { ...result, segments: result.segments.map((segment) => ({ ...segment, text: manualBySequence.get(segment.sequence)?.text ?? segment.text })) });

    return {
      movieId,
      translationId: translation.id,
      sourceTranscriptId,
      provider: data.provider,
      model: data.model,
      segmentCount: result.segments.length,
      runtimeMs: result.runtimeMs,
      ...(result.usage ? { usage: result.usage } : {}),
      translationMemoryHits: result.translationMemoryHits ?? 0,
      modelTranslatedSegments: result.modelTranslatedSegments ?? result.segments.length,
      ...(result.modelCalls === undefined ? {} : { modelCalls: result.modelCalls }),
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
