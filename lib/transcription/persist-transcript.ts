import "server-only";

import { prisma } from "@/lib/prisma";
import { TranscriptionError, type TranscriptionResult } from "@/lib/transcription/types";

const MAX_DATABASE_INTEGER = 2_147_483_647;

export type PersistedTranscriptionSummary = {
  movieId: string;
  transcriptId: string;
  provider: string;
  model: string;
  segmentCount: number;
  durationMs: number | null;
};

export async function persistTranscriptionResult(
  movieId: string,
  result: TranscriptionResult,
): Promise<PersistedTranscriptionSummary> {
  validateTranscriptionResult(result);

  return prisma.$transaction(async (transaction) => {
    // Serialize replacements for the same Movie, including concurrent retries.
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${movieId} FOR UPDATE`;
    const movie = await transaction.movie.findUnique({
      where: { id: movieId },
      select: { id: true },
    });
    if (!movie) throw new TranscriptionError("MOVIE_NOT_FOUND");

    const data = {
      provider: result.provider.trim(),
      model: result.model.trim(),
      language: result.language?.trim() || null,
      durationMs: result.durationMs ?? null,
      text: result.text.trim(),
    };
    const transcript = await transaction.transcript.upsert({
      where: { movieId },
      create: { movieId, ...data },
      update: data,
      select: { id: true },
    });

    await transaction.transcriptSegment.deleteMany({
      where: { transcriptId: transcript.id },
    });
    await transaction.transcriptSegment.createMany({
      data: result.segments.map((segment, sequence) => ({
        transcriptId: transcript.id,
        sequence,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        confidence: segment.confidence ?? null,
      })),
    });

    return {
      movieId,
      transcriptId: transcript.id,
      provider: data.provider,
      model: data.model,
      segmentCount: result.segments.length,
      durationMs: data.durationMs,
    };
  }, { timeout: 30_000 });
}

function validateTranscriptionResult(result: TranscriptionResult) {
  if (
    !result ||
    typeof result.text !== "string" || !result.text.trim() ||
    typeof result.provider !== "string" || !result.provider.trim() ||
    typeof result.model !== "string" || !result.model.trim() ||
    (result.language !== undefined &&
      (typeof result.language !== "string" || !result.language.trim())) ||
    (result.durationMs !== undefined && !validMilliseconds(result.durationMs)) ||
    !Array.isArray(result.segments) || result.segments.length === 0
  ) {
    throw new TranscriptionError("TRANSCRIPTION_INVALID_RESPONSE");
  }

  let previousStartMs = -1;
  for (const segment of result.segments) {
    if (
      !segment ||
      !validMilliseconds(segment.startMs) ||
      !validMilliseconds(segment.endMs) ||
      segment.endMs < segment.startMs ||
      segment.startMs < previousStartMs ||
      typeof segment.text !== "string" ||
      !segment.text.trim() ||
      segment.text !== segment.text.trim() ||
      (segment.confidence !== undefined &&
        (typeof segment.confidence !== "number" ||
          !Number.isFinite(segment.confidence) ||
          segment.confidence < 0 || segment.confidence > 1))
    ) {
      throw new TranscriptionError("TRANSCRIPTION_INVALID_RESPONSE");
    }
    previousStartMs = segment.startMs;
  }
}

function validMilliseconds(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 &&
    (value as number) <= MAX_DATABASE_INTEGER;
}
