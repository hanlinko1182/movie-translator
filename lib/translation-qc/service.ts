import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { TranslationError } from "@/lib/translation/types";
import { normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";
import { checkTranslationRows } from "@/lib/translation-qc/check-translation";
import { summarizeQc, type TranslationReview } from "@/lib/translation-qc/types";

export async function loadTranslationSnapshot(movieId: string, database: Prisma.TransactionClient = prisma) {
  const movie = await database.movie.findUnique({
    where: { id: movieId },
    select: { id: true, projectId: true, sourceLanguage: true,
      transcript: { select: { id: true, segments: { orderBy: { sequence: "asc" }, select: { sequence: true, startMs: true, endMs: true, text: true } } } },
      translation: { include: { segments: { orderBy: { sequence: "asc" }, include: { qcIssues: { orderBy: { createdAt: "asc" } } } } } },
    },
  });
  if (!movie) throw new TranslationError("MOVIE_NOT_FOUND");
  if (!movie.translation) throw new TranslationError("TRANSLATION_NOT_FOUND");
  if (!movie.transcript) throw new TranslationError("TRANSCRIPT_NOT_FOUND");
  const { translation, transcript } = movie;
  if (translation.sourceTranscriptId !== transcript.id || translation.sourceLanguage !== movie.sourceLanguage || translation.targetLanguage !== "my" || transcript.segments.length === 0 || translation.segments.length !== transcript.segments.length) throw new TranslationError("REFINEMENT_ALIGNMENT_INVALID");
  let previousSequence = -1;
  transcript.segments.forEach((segment, index) => {
    const target = translation.segments[index];
    if (!Number.isInteger(segment.sequence) || segment.sequence <= previousSequence || segment.startMs < 0 || segment.endMs < segment.startMs || !segment.text.trim() || target.sequence !== segment.sequence || target.startMs !== segment.startMs || target.endMs !== segment.endMs) throw new TranslationError("REFINEMENT_ALIGNMENT_INVALID");
    previousSequence = segment.sequence;
  });
  return { ...movie, translation, transcript };
}
export type TranslationSnapshot = Awaited<ReturnType<typeof loadTranslationSnapshot>>;

export async function persistLocalQc(snapshot: TranslationSnapshot, transaction: Prisma.TransactionClient, sequences?: number[], resolutionContext?: string) {
  const candidates = await transaction.glossaryEntry.findMany({ where: { projectId: snapshot.projectId, sourceLanguage: normalizeTerminologyLanguage(snapshot.sourceLanguage), targetLanguage: "my" }, select: { sourceText: true, targetText: true } });
  // QC evaluates every applicable stored rule; prompt budgets must not hide QC evidence.
  const rows = snapshot.translation.segments.map((target, index) => ({ sourceText: snapshot.transcript.segments[index].text, text: target.text }));
  const findings = checkTranslationRows(rows, []);
  for (let index = 0; index < rows.length; index++) {
    const segment = snapshot.translation.segments[index];
    if (sequences && !sequences.includes(segment.sequence)) continue;
    const relevant = candidates.filter((entry) => rows[index].sourceText.includes(entry.sourceText));
    const glossaryFindings = checkTranslationRows([rows[index]], relevant)[0];
    const current = [...findings[index], ...glossaryFindings].filter((finding, position, all) => all.findIndex((other) => other.category === finding.category) === position);
    const where = { translatedSegmentId: segment.id, source: "HEURISTIC" as const, resolvedAt: null };
    if (resolutionContext) {
      await transaction.translationQcIssue.updateMany({ where: { ...where, category: { notIn: current.map((finding) => finding.category) } }, data: { resolvedAt: new Date(), resolution: `Local finding no longer applies after ${resolutionContext}; human approval is not implied.` } });
    }
    await transaction.translationQcIssue.deleteMany({ where });
    if (current.length) await transaction.translationQcIssue.createMany({ data: current.map((finding) => ({ translatedSegmentId: segment.id, ...finding, source: "HEURISTIC" })) });
  }
}

// Include source content so an in-place transcript change also invalidates editor tokens.
export function translationSegmentVersion(translation: { id: string; revision: number }, segment: { id: string; revision: number }, source: { sequence: number; startMs: number; endMs: number; text: string } | undefined) {
  return createHash("sha256").update(JSON.stringify([translation.id, translation.revision, segment.id, segment.revision, source])).digest("hex");
}
export function segmentVersion(snapshot: TranslationSnapshot, segment: TranslationSnapshot["translation"]["segments"][number]) {
  return translationSegmentVersion(snapshot.translation, segment, snapshot.transcript.segments.find((source) => source.sequence === segment.sequence));
}

export function snapshotReview(snapshot: TranslationSnapshot): TranslationReview {
  const rows = snapshot.translation.segments.map((segment, index) => ({
    id: segment.id, sequence: segment.sequence, startMs: segment.startMs, endMs: segment.endMs,
    sourceText: snapshot.transcript.segments[index].text, text: segment.text,
    provider: segment.provider, model: segment.model, origin: segment.origin,
    reviewStatus: segment.reviewStatus, version: translationSegmentVersion(snapshot.translation, segment, snapshot.transcript.segments[index]),
    editedAt: segment.editedAt?.toISOString() ?? null, reviewedAt: segment.reviewedAt?.toISOString() ?? null,
    issues: segment.qcIssues.map((issue) => ({ id: issue.id, category: issue.category, severity: issue.severity, message: issue.message, source: issue.source, resolvedAt: issue.resolvedAt?.toISOString() ?? null, resolution: issue.resolution })),
  }));
  return { movieId: snapshot.id, translationId: snapshot.translation.id, revision: snapshot.translation.revision, sourceLanguage: snapshot.sourceLanguage, targetLanguage: snapshot.translation.targetLanguage, rows, summary: summarizeQc(rows), qcScanned: snapshot.translation.qcScannedAt !== null };
}

export async function getTranslationReview(movieId: string) { return snapshotReview(await loadTranslationSnapshot(movieId)); }
export async function runTranslationQc(movieId: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${movieId} FOR UPDATE`;
    const snapshot = await loadTranslationSnapshot(movieId, transaction);
    await persistLocalQc(snapshot, transaction);
    await transaction.translation.update({ where: { id: snapshot.translation.id }, data: { qcScannedAt: new Date() } });
    return snapshotReview(await loadTranslationSnapshot(movieId, transaction));
  }, { timeout: 60_000 });
}
