import "server-only";

import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import {
  AUDIO_STORAGE_DIRECTORY,
  getAudioStorageKey,
  LOCAL_STORAGE_ROOT,
  resolveAudioStorageKey,
  resolveMovieStorageKey,
} from "@/lib/storage";

const mediaErrors = {
  MOVIE_FILE_MISSING: { status: 404, message: "The stored movie file is missing" },
  INVALID_STORAGE_KEY: { status: 400, message: "The movie storage key is invalid" },
  MEDIA_PROBE_FAILED: { status: 422, message: "Unable to inspect the movie media" },
  AUDIO_STREAM_NOT_FOUND: { status: 422, message: "The movie has no audio stream" },
  AUDIO_EXTRACTION_FAILED: { status: 500, message: "Unable to extract movie audio" },
  AUDIO_CHUNKING_FAILED: { status: 500, message: "Unable to split movie audio" },
} as const;

type MediaErrorCode = keyof typeof mediaErrors;

export class MediaProcessingError extends Error {
  readonly status: number;

  constructor(readonly code: MediaErrorCode) {
    super(mediaErrors[code].message);
    this.name = "MediaProcessingError";
    this.status = mediaErrors[code].status;
  }
}

export type MediaInspection = {
  durationSeconds: number;
  hasAudio: boolean;
  audio: {
    codecName: string | null;
    sampleRate: number | null;
    channels: number | null;
  } | null;
};

// Validate both the key and its real filesystem destination before execution.
export async function resolveMovieSource(storageKey: string) {
  let source: string;
  try {
    source = resolveMovieStorageKey(storageKey);
  } catch {
    throw new MediaProcessingError("INVALID_STORAGE_KEY");
  }

  try {
    const [root, actualSource, file] = await Promise.all([
      realpath(LOCAL_STORAGE_ROOT),
      realpath(source),
      lstat(source),
    ]);

    if (!file.isFile() || dirname(actualSource) !== resolve(root, "movies")) {
      throw new MediaProcessingError("INVALID_STORAGE_KEY");
    }

    return actualSource;
  } catch (error) {
    if (error instanceof MediaProcessingError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new MediaProcessingError("MOVIE_FILE_MISSING");
    }
    throw new MediaProcessingError("MEDIA_PROBE_FAILED");
  }
}

export async function inspectMovie(source: string): Promise<MediaInspection> {
  const output = await runMediaBinary(
    "ffprobe",
    [
      "-v", "error",
      ...localInputArgs(source),
      "-show_entries", "format=duration:stream=codec_type,codec_name,sample_rate,channels",
      "-of", "json",
    ],
    30_000,
    "MEDIA_PROBE_FAILED",
  );

  try {
    const value: unknown = JSON.parse(output);
    if (!isObject(value) || !isObject(value.format) || !Array.isArray(value.streams)) {
      throw new Error("Invalid media metadata");
    }

    const rawDuration = value.format.duration;
    if (typeof rawDuration !== "string" || !/^\d+(?:\.\d+)?$/.test(rawDuration)) {
      throw new Error("Invalid media duration");
    }

    const durationSeconds = Number(rawDuration);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || Math.round(durationSeconds) > 2_147_483_647) {
      throw new Error("Media duration is outside the database range");
    }

    if (!value.streams.every(isObject)) throw new Error("Invalid media streams");
    const audio = value.streams.find((stream) => stream.codec_type === "audio");

    return {
      durationSeconds,
      hasAudio: Boolean(audio),
      audio: audio ? {
        codecName: typeof audio.codec_name === "string" ? audio.codec_name : null,
        sampleRate: positiveInteger(audio.sample_rate),
        channels: positiveInteger(audio.channels),
      } : null,
    };
  } catch {
    throw new MediaProcessingError("MEDIA_PROBE_FAILED");
  }
}

export async function extractMovieAudio(source: string, movieId: string) {
  let storageKey: string;
  let destination: string;
  try {
    storageKey = getAudioStorageKey(movieId);
    destination = resolveAudioStorageKey(storageKey);
  } catch {
    throw new MediaProcessingError("INVALID_STORAGE_KEY");
  }

  let temporaryDirectory: string | undefined;
  try {
    await mkdir(AUDIO_STORAGE_DIRECTORY, { recursive: true, mode: 0o700 });
    const [root, directory] = await Promise.all([
      realpath(LOCAL_STORAGE_ROOT),
      realpath(AUDIO_STORAGE_DIRECTORY),
    ]);
    if (directory !== resolve(root, "audio")) {
      throw new MediaProcessingError("INVALID_STORAGE_KEY");
    }

    temporaryDirectory = await mkdtemp(join(directory, `.${movieId}-`));
    const temporaryOutput = join(temporaryDirectory, "audio.wav");
    await runMediaBinary(
      "ffmpeg",
      [
        "-nostdin", "-v", "error", "-n",
        ...localInputArgs(source),
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", "-f", "wav", temporaryOutput,
      ],
      15 * 60_000,
      "AUDIO_EXTRACTION_FAILED",
    );
    await chmod(temporaryOutput, 0o600);
    // Same-filesystem rename replaces only this movie's deterministic artifact.
    await rename(temporaryOutput, destination);
    return { storageKey };
  } catch (error) {
    if (error instanceof MediaProcessingError) throw error;
    console.error("Audio artifact could not be stored.");
    throw new MediaProcessingError("AUDIO_EXTRACTION_FAILED");
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {
        console.error("Temporary audio artifact cleanup failed.");
      });
    }
  }
}

export type AudioChunk = {
  path: string;
  startMs: number;
};

export async function splitExtractedAudio(
  source: string,
  movieId: string,
  chunkDurationSeconds: number,
) {
  if (!Number.isSafeInteger(chunkDurationSeconds) || chunkDurationSeconds <= 0) {
    throw new MediaProcessingError("AUDIO_CHUNKING_FAILED");
  }

  let temporaryDirectory: string | undefined;
  try {
    const expectedSource = resolveAudioStorageKey(getAudioStorageKey(movieId));
    const [root, directory, actualSource, sourceFile] = await Promise.all([
      realpath(LOCAL_STORAGE_ROOT),
      realpath(AUDIO_STORAGE_DIRECTORY),
      realpath(source),
      lstat(source),
    ]);
    if (
      directory !== resolve(root, "audio") ||
      source !== expectedSource ||
      actualSource !== source ||
      dirname(actualSource) !== directory ||
      !sourceFile.isFile() ||
      sourceFile.size <= 0
    ) {
      throw new MediaProcessingError("INVALID_STORAGE_KEY");
    }

    temporaryDirectory = await mkdtemp(join(directory, `.${movieId}-transcription-`));
    const outputPattern = join(temporaryDirectory, "chunk-%06d.wav");
    await runMediaBinary(
      "ffmpeg",
      [
        "-nostdin", "-v", "error", "-n",
        ...localInputArgs(source),
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", "-f", "segment",
        "-segment_time", String(chunkDurationSeconds),
        "-reset_timestamps", "1", outputPattern,
      ],
      15 * 60_000,
      "AUDIO_CHUNKING_FAILED",
    );

    const filenames = (await readdir(temporaryDirectory))
      .filter((filename) => /^chunk-\d{6}\.wav$/.test(filename))
      .sort();
    if (filenames.length === 0) {
      throw new MediaProcessingError("AUDIO_CHUNKING_FAILED");
    }

    const chunks: AudioChunk[] = [];
    for (const [index, filename] of filenames.entries()) {
      const path = join(temporaryDirectory, filename);
      await chmod(path, 0o600);
      chunks.push({ path, startMs: index * chunkDurationSeconds * 1000 });
    }

    const directoryToRemove = temporaryDirectory;
    temporaryDirectory = undefined;
    return {
      chunks,
      cleanup: async () => {
        await rm(directoryToRemove, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (error instanceof MediaProcessingError) throw error;
    console.error("Transcription audio chunks could not be created.");
    throw new MediaProcessingError("AUDIO_CHUNKING_FAILED");
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {
        console.error("Temporary transcription audio cleanup failed.");
      });
    }
  }
}

function runMediaBinary(
  binary: "ffmpeg" | "ffprobe",
  args: string[],
  timeout: number,
  failure: MediaErrorCode,
): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    execFile(binary, args, {
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      shell: false,
    }, (error, stdout, stderr) => {
      if (error) {
        // Raw binary diagnostics stay on the server; errors returned by the API
        // contain only the controlled code/message above. Timeout kills the
        // process before this callback runs and temporary-file cleanup begins.
        console.error(`${binary} failed${error.killed ? " (terminated)" : ""}:`, stderr);
        reject(new MediaProcessingError(failure));
        return;
      }
      resolveOutput(stdout);
    });
  });
}

export function localInputArgs(source: string) {
  // Force an allowed upload container, preventing disguised playlists from
  // loading other files. Disable network protocols for both binaries.
  const extension = extname(source).toLowerCase();
  const format = extension === ".wav"
    ? "wav"
    : [".mp4", ".mov"].includes(extension) ? "mov" : "matroska";
  return ["-protocol_whitelist", "file", "-f", format, "-i", source];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
