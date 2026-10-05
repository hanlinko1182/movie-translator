import "server-only";

import { dirname, resolve } from "node:path";
import { lstat, realpath } from "node:fs/promises";

import { MediaProcessingError, splitExtractedAudio } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import {
  AUDIO_STORAGE_DIRECTORY,
  getAudioStorageKey,
  LOCAL_STORAGE_ROOT,
  resolveAudioStorageKey,
} from "@/lib/storage";
import { getTranscriptionProvider } from "@/lib/transcription";
import {
  TranscriptionError,
  type TranscriptSegment,
  type TranscriptionResult,
} from "@/lib/transcription/types";

// OpenRouter multipart uploads allow 25 MB. Keep a conservative safety margin.
export const OPENROUTER_TRANSCRIPTION_MAX_AUDIO_BYTES = 24_000_000;
export const TRANSCRIPTION_CHUNK_DURATION_SECONDS = 10 * 60;

type TranscribeMovieOptions = {
  maxInputBytes?: number;
  model?: string;
};

export async function assertMovieTranscriptionReady(movieId: string) {
  await loadMovieTranscriptionInput(movieId);
  getTranscriptionProvider();
}

export async function transcribeMovieAudio(
  movieId: string,
  options: TranscribeMovieOptions = {},
) {
  const { movie, audio } = await loadMovieTranscriptionInput(movieId);
  if (options.maxInputBytes !== undefined && audio.size > options.maxInputBytes) {
    throw new TranscriptionError("TRANSCRIPTION_DEVELOPMENT_LIMIT");
  }

  const provider = getTranscriptionProvider(options.model);
  const language = normalizeLanguageHint(movie.sourceLanguage);

  if (audio.size <= OPENROUTER_TRANSCRIPTION_MAX_AUDIO_BYTES) {
    return provider.transcribe({ audioPath: audio.path, language });
  }

  let split: Awaited<ReturnType<typeof splitExtractedAudio>>;
  try {
    split = await splitExtractedAudio(
      audio.path,
      movie.id,
      TRANSCRIPTION_CHUNK_DURATION_SECONDS,
    );
  } catch (error) {
    if (error instanceof MediaProcessingError) {
      throw new TranscriptionError("TRANSCRIPTION_AUDIO_INVALID");
    }
    throw error;
  }

  try {
    const results: Array<{ startMs: number; result: TranscriptionResult }> = [];
    for (const chunk of split.chunks) {
      const file = await lstat(chunk.path);
      if (!file.isFile() || file.size <= 0) {
        throw new TranscriptionError("TRANSCRIPTION_AUDIO_INVALID");
      }
      if (file.size > OPENROUTER_TRANSCRIPTION_MAX_AUDIO_BYTES) {
        throw new TranscriptionError("TRANSCRIPTION_FILE_TOO_LARGE");
      }
      results.push({
        startMs: chunk.startMs,
        result: await provider.transcribe({ audioPath: chunk.path, language }),
      });
    }
    return mergeChunkTranscriptions(results);
  } finally {
    await split.cleanup().catch(() => {
      console.error("Temporary transcription audio cleanup failed.");
    });
  }
}

async function loadMovieTranscriptionInput(movieId: string) {
  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: { id: true, sourceLanguage: true },
  });
  if (!movie) throw new TranscriptionError("MOVIE_NOT_FOUND");

  return { movie, audio: await resolveExtractedAudio(movie.id) };
}

export function mergeChunkTranscriptions(
  chunks: Array<{ startMs: number; result: TranscriptionResult }>,
): TranscriptionResult {
  if (chunks.length === 0) {
    throw new TranscriptionError("TRANSCRIPTION_INVALID_RESPONSE");
  }

  const segments: TranscriptSegment[] = [];
  const first = chunks[0].result;
  let previousStartMs = -1;
  let durationMs = 0;
  for (const chunk of chunks) {
    if (
      chunk.result.provider !== first.provider ||
      chunk.result.model !== first.model
    ) invalidResponse();
    if (!Number.isSafeInteger(chunk.startMs) || chunk.startMs < 0) invalidResponse();
    for (const segment of chunk.result.segments) {
      const startMs = chunk.startMs + segment.startMs;
      const endMs = chunk.startMs + segment.endMs;
      if (
        !Number.isSafeInteger(startMs) ||
        !Number.isSafeInteger(endMs) ||
        startMs < previousStartMs ||
        endMs < startMs ||
        !segment.text.trim()
      ) invalidResponse();
      segments.push({
        startMs,
        endMs,
        text: segment.text.trim(),
        ...(segment.confidence === undefined ? {} : { confidence: segment.confidence }),
      });
      previousStartMs = startMs;
      durationMs = Math.max(durationMs, endMs);
    }
    if (chunk.result.durationMs !== undefined) {
      const chunkEndMs = chunk.startMs + chunk.result.durationMs;
      if (!Number.isSafeInteger(chunkEndMs)) invalidResponse();
      durationMs = Math.max(durationMs, chunkEndMs);
    }
  }

  const text = chunks.map(({ result }) => result.text.trim()).filter(Boolean).join("\n");
  if (!text || segments.length === 0) invalidResponse();
  const language = chunks.find(({ result }) => result.language)?.result.language;
  const usage = mergeUsage(chunks.map(({ result }) => result.usage));
  return {
    provider: first.provider,
    model: first.model,
    text,
    ...(language ? { language } : {}),
    durationMs,
    ...(usage ? { usage } : {}),
    segments,
  };
}

function mergeUsage(values: Array<TranscriptionResult["usage"]>) {
  const present = values.filter((value) => value !== undefined);
  if (present.length === 0) return undefined;
  return {
    audioSeconds: sumUsage(present, "audioSeconds"),
    inputTokens: sumUsage(present, "inputTokens"),
    outputTokens: sumUsage(present, "outputTokens"),
    totalTokens: sumUsage(present, "totalTokens"),
    costUsd: sumUsage(present, "costUsd"),
  };
}

function sumUsage(
  values: Array<NonNullable<TranscriptionResult["usage"]>>,
  key: keyof NonNullable<TranscriptionResult["usage"]>,
) {
  const numbers = values.map((value) => value[key]).filter((value) => value !== undefined);
  return numbers.length > 0 ? numbers.reduce((total, value) => total + value, 0) : undefined;
}

async function resolveExtractedAudio(movieId: string) {
  let path: string;
  try {
    path = resolveAudioStorageKey(getAudioStorageKey(movieId));
  } catch {
    throw new TranscriptionError("TRANSCRIPTION_AUDIO_INVALID");
  }

  try {
    const [root, audioDirectory, actualPath, file] = await Promise.all([
      realpath(LOCAL_STORAGE_ROOT),
      realpath(AUDIO_STORAGE_DIRECTORY),
      realpath(path),
      lstat(path),
    ]);
    if (
      audioDirectory !== resolve(root, "audio") ||
      dirname(actualPath) !== audioDirectory ||
      actualPath !== path ||
      !file.isFile() ||
      file.size <= 0
    ) {
      throw new TranscriptionError("TRANSCRIPTION_AUDIO_INVALID");
    }
    return { path: actualPath, size: file.size };
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    if (isMissingFileError(error)) {
      throw new TranscriptionError("TRANSCRIPTION_AUDIO_MISSING");
    }
    throw new TranscriptionError("TRANSCRIPTION_AUDIO_INVALID");
  }
}

function normalizeLanguageHint(value: string) {
  const language = value.trim().toLowerCase();
  if (language === "cmn" || language.startsWith("zh")) return "zh";
  return /^[a-z]{2}$/.test(language) ? language : undefined;
}

function isMissingFileError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function invalidResponse(): never {
  throw new TranscriptionError("TRANSCRIPTION_INVALID_RESPONSE");
}
