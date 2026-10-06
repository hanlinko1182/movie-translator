import "server-only";

import { prisma } from "@/lib/prisma";
import { TranslationError } from "@/lib/translation/types";
import { loadTranslationSnapshot, persistLocalQc, segmentVersion, snapshotReview } from "@/lib/translation-qc/service";
import type { ReviewStatus } from "@/lib/translation-qc/types";
import { normalizeMemorySource, normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";
import { sourceTextHash } from "@/lib/translation-memory/hash";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TranslationError("INVALID_TRANSLATION_EDIT");
  return value as Record<string, unknown>;
}
function status(value: unknown): ReviewStatus {
  if (value !== "UNREVIEWED" && value !== "NEEDS_REVIEW" && value !== "APPROVED") throw new TranslationError("INVALID_REVIEW_STATUS");
  return value;
}
function version(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 300) throw new TranslationError("INVALID_TRANSLATION_EDIT");
  return value;
}
export function parseSegmentEdit(value: unknown) {
  const body = object(value);
  if (Object.keys(body).some((key) => !["text", "reviewStatus", "version"].includes(key)) || !("text" in body || "reviewStatus" in body)) throw new TranslationError("INVALID_TRANSLATION_EDIT");
  let text: string | undefined;
  if ("text" in body) {
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 32_000) throw new TranslationError("INVALID_TRANSLATION_TEXT");
    text = body.text.trim();
  }
  return { text, reviewStatus: "reviewStatus" in body ? status(body.reviewStatus) : undefined, version: version(body.version) };
}
export function parseBulkReview(value: unknown) {
  const body = object(value);
  if (Object.keys(body).some((key) => !["sequences", "reviewStatus", "versions"].includes(key)) || !Array.isArray(body.sequences) || !body.sequences.length || body.sequences.length > 24 || body.sequences.some((sequence) => !Number.isSafeInteger(sequence) || sequence < 0 || sequence > 2_147_483_647) || new Set(body.sequences).size !== body.sequences.length) throw new TranslationError("INVALID_TRANSLATION_EDIT");
  const sequences = body.sequences as number[];
  const versions = object(body.versions);
  if (Object.keys(versions).length !== sequences.length || Object.keys(versions).some((key) => !sequences.some((sequence) => String(sequence) === key))) throw new TranslationError("INVALID_TRANSLATION_EDIT");
  return { sequences, reviewStatus: status(body.reviewStatus), versions: Object.fromEntries(sequences.map((sequence) => [sequence, version(versions[sequence])])) };
}

export async function editTranslationSegment(movieId: string, sequence: number, input: ReturnType<typeof parseSegmentEdit>) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${movieId} FOR UPDATE`;
    const snapshot = await loadTranslationSnapshot(movieId, transaction);
    const segment = snapshot.translation.segments.find((segment) => segment.sequence === sequence);
    if (!segment) throw new TranslationError("SEGMENT_NOT_FOUND");
    if (input.version !== segmentVersion(snapshot, segment)) throw new TranslationError("STALE_TRANSLATION_SEGMENT");
    const changed = input.text !== undefined && input.text !== segment.text;
    if (changed && input.reviewStatus === "APPROVED") throw new TranslationError("INVALID_REVIEW_STATUS");
    const reviewStatus = changed ? "NEEDS_REVIEW" : input.reviewStatus ?? segment.reviewStatus;
    const source = snapshot.transcript.segments.find((source) => source.sequence === sequence)!;
    const now = new Date();
    await transaction.translatedSegment.update({ where: { id: segment.id }, data: {
      reviewStatus, reviewedAt: reviewStatus === "APPROVED" ? (input.reviewStatus === "APPROVED" ? now : segment.reviewedAt) : null,
      revision: { increment: 1 },
      ...(input.text === undefined ? {} : { text: input.text, origin: "MANUAL", editedAt: now, refinementJobId: null, manualSourceHash: sourceTextHash(source.text) }),
    } });
    if (input.text !== undefined) {
      const key = { projectId: snapshot.projectId, sourceLanguage: normalizeTerminologyLanguage(snapshot.sourceLanguage), targetLanguage: normalizeTerminologyLanguage(snapshot.translation.targetLanguage), sourceHash: sourceTextHash(source.text) };
      const pair = { sourceText: normalizeMemorySource(source.text), targetText: input.text, origin: "MANUAL" as const };
      await transaction.translationMemoryEntry.upsert({ where: { projectId_sourceLanguage_targetLanguage_sourceHash: key }, create: { ...key, ...pair }, update: pair });
      await persistLocalQc(await loadTranslationSnapshot(movieId, transaction), transaction, [sequence], "human edit");
    }
    // Human mutations invalidate queued refinement snapshots and their deterministic identity.
    // Sol completion itself retains the generation so completed jobs still deduplicate.
    await transaction.translation.update({ where: { id: snapshot.translation.id }, data: { revision: { increment: 1 } } });
    return snapshotReview(await loadTranslationSnapshot(movieId, transaction));
  }, { timeout: 60_000 });
}

export async function reviewTranslationSegments(movieId: string, input: ReturnType<typeof parseBulkReview>) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${movieId} FOR UPDATE`;
    const snapshot = await loadTranslationSnapshot(movieId, transaction);
    const selected = input.sequences.map((sequence) => {
      const segment = snapshot.translation.segments.find((segment) => segment.sequence === sequence);
      if (!segment) throw new TranslationError("SEGMENT_NOT_FOUND");
      if (input.versions[sequence] !== segmentVersion(snapshot, segment)) throw new TranslationError("STALE_TRANSLATION_SEGMENT");
      return segment;
    });
    await transaction.translatedSegment.updateMany({ where: { id: { in: selected.map((segment) => segment.id) } }, data: { reviewStatus: input.reviewStatus, reviewedAt: input.reviewStatus === "APPROVED" ? new Date() : null, revision: { increment: 1 } } });
    await transaction.translation.update({ where: { id: snapshot.translation.id }, data: { revision: { increment: 1 } } });
    return snapshotReview(await loadTranslationSnapshot(movieId, transaction));
  }, { timeout: 60_000 });
}
