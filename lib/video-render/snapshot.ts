import "server-only";
import { createHash } from "node:crypto";
import { formatAss } from "@/lib/subtitle-export/ass";
import { formatSrt } from "@/lib/subtitle-export/srt";
import { normalizeExportSegments } from "@/lib/subtitle-export/segments";
import { selectSubtitleRows } from "@/lib/subtitle-export/selection";
import { summarizeSubtitleReview } from "@/lib/subtitle-export/service";
import type { TranslationSnapshot } from "@/lib/translation-qc/service";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { BURN_IN_PROFILE, parseRenderRequest, RenderError, type RenderRequest } from "./contracts";

export type SourceMediaIdentity = Readonly<{
  storageKey: string; sha256: string; sizeBytes: number;
  durationMs: number; width: number; height: number; hasAudio: boolean;
}>;

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// No timestamps, generation IDs or object insertion order in recipe identity.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new RenderError("SUBTITLE_SNAPSHOT_INVALID");
}
export function hashRenderRecipe(recipe: unknown): string { return sha256(canonicalJson(recipe)); }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function buildRenderSnapshot(request: RenderRequest, movie: TranslationSnapshot, media: SourceMediaIdentity, capturedAt = new Date()) {
  const input = parseRenderRequest(request);
  if (movie.id !== input.movieId || movie.projectId !== input.projectId) throw new RenderError("PROJECT_MOVIE_MISMATCH");
  if (!/^movies\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|mkv|webm)$/i.test(media.storageKey) || !/^[0-9a-f]{64}$/.test(media.sha256) ||
    ![media.sizeBytes, media.durationMs, media.width, media.height].every((value) => Number.isSafeInteger(value) && value > 0) || typeof media.hasAudio !== "boolean") {
    throw new RenderError("SOURCE_MEDIA_INVALID");
  }
  const selected = selectSubtitleRows(movie.translation.segments, input.scope);
  const normalized = normalizeExportSegments(selected);
  const sources = new Map(movie.transcript.segments.map((row) => [row.sequence, row]));
  const rows = selected.map((segment, index) => {
    const source = sources.get(segment.sequence);
    if (!source || source.startMs !== segment.startMs || source.endMs !== segment.endMs ||
      (segment.origin === "MANUAL" && segment.manualSourceHash !== sourceTextHash(source.text))) throw new RenderError("SUBTITLE_SNAPSHOT_INVALID");
    return {
      segmentId: segment.id, sequence: segment.sequence, startMs: segment.startMs, endMs: segment.endMs,
      sourceText: source.text, text: segment.text, subtitleText: normalized[index].text,
      origin: segment.origin, provider: segment.provider, model: segment.model,
      refinementJobId: segment.refinementJobId, segmentRevision: segment.revision,
      reviewStatus: segment.reviewStatus, manualSourceHash: segment.manualSourceHash,
      editedAt: segment.editedAt?.toISOString() ?? null, reviewedAt: segment.reviewedAt?.toISOString() ?? null,
      qcIssues: segment.qcIssues.map((issue) => ({
        id: issue.id, category: issue.category, severity: issue.severity, source: issue.source,
        message: issue.message, resolvedAt: issue.resolvedAt?.toISOString() ?? null, resolution: issue.resolution,
        createdAt: issue.createdAt.toISOString(), updatedAt: issue.updatedAt.toISOString(),
      })),
    };
  });
  const encode = (text: string) => {
    const bytes = Buffer.from(text, "utf8");
    return { encoding: "utf8" as const, bytesBase64: bytes.toString("base64"), sha256: sha256(bytes), sizeBytes: bytes.length };
  };
  const subtitles = { srt: encode(formatSrt(normalized)), ass: encode(formatAss(normalized)) };
  const recipe = {
    version: 1, projectId: input.projectId, movieId: input.movieId, mode: input.mode, scope: input.scope,
    profile: { ...BURN_IN_PROFILE }, sourceMedia: { ...media },
    // Hash actual content, not just Translation.revision (Sol may leave it unchanged).
    selected: rows.map(({ sequence, startMs, endMs, sourceText, text }) => ({ sequence, startMs, endMs, sourceText, text })),
    subtitleChecksums: { srt: subtitles.srt.sha256, ass: subtitles.ass.sha256 },
  };
  const recipeHash = hashRenderRecipe(recipe);
  const snapshot = {
    version: 1, capturedAt: capturedAt.toISOString(), recipe, recipeHash,
    translation: { id: movie.translation.id, revision: movie.translation.revision,
      sourceTranscriptId: movie.transcript.id, sourceLanguage: movie.translation.sourceLanguage,
      targetLanguage: movie.translation.targetLanguage, provider: movie.translation.provider, model: movie.translation.model,
      qcScannedAt: movie.translation.qcScannedAt?.toISOString() ?? null },
    reviewSummary: summarizeSubtitleReview(movie.translation.segments), rows, subtitles,
  };
  return deepFreeze({ snapshot, recipeHash, deduplicationKey: `${input.movieId}:${recipeHash}` });
}
export type PreparedRenderSnapshot = ReturnType<typeof buildRenderSnapshot>;
