import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getRefinementTranslationProvider } from "@/lib/translation";
import { getRelevantGlossaryEntries } from "@/lib/glossary/service";
import { buildTranslationBatches } from "@/lib/translation/translate-movie";
import { assertTranslationResultAligned } from "@/lib/translation/persist-translation";
import { TranslationError, type TranslationRequest, type TranslationResult } from "@/lib/translation/types";
import { loadTranslationSnapshot, persistLocalQc, type TranslationSnapshot } from "@/lib/translation-qc/service";
import type { RefinementReceipt } from "@/lib/translation-qc/types";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { normalizeMemorySource, normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";

export type RefinementJobData = { movieId: string; sequences: number[]; translationId: string; revision: number; snapshotHash: string };
export function normalizeRefinementSequences(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.length > 1_000 || value.some((sequence) => !Number.isSafeInteger(sequence) || sequence < 0 || sequence > 2_147_483_647)) throw new TranslationError("REFINEMENT_SEQUENCES_INVALID");
  const sequences = [...new Set(value as number[])].sort((a, b) => a - b);
  if (sequences.length > 24) throw new TranslationError("REFINEMENT_SEQUENCES_INVALID");
  return sequences;
}
export function validateRefinementSelection(snapshot: TranslationSnapshot, sequences: number[]) {
  if (sequences.some((sequence) => !snapshot.translation.segments.some((segment) => segment.sequence === sequence))) throw new TranslationError("REFINEMENT_SEQUENCE_NOT_FOUND");
  if (sequences.length > 1 && sequences.length === snapshot.translation.segments.length) throw new TranslationError("REFINEMENT_SELECTION_TOO_BROAD");
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function refinementJobId(snapshot: TranslationSnapshot, sequences: number[]) {
  return `translation-refinement-${encodeURIComponent(snapshot.id)}-${digest([snapshot.translation.id, snapshot.translation.revision, digest([snapshot.transcript.id, snapshot.transcript.segments]), sequences])}`;
}
export function refinementSnapshotHash(snapshot: TranslationSnapshot, sequences: number[]) {
  return digest([
    snapshot.projectId, snapshot.sourceLanguage, snapshot.transcript.id, snapshot.transcript.segments,
    snapshot.translation.id, snapshot.translation.revision, snapshot.translation.targetLanguage,
    snapshot.translation.segments.filter((segment) => sequences.includes(segment.sequence)).map(({ id, sequence, text, provider, model, origin, refinementJobId }) => ({ id, sequence, text, provider, model, origin, refinementJobId })),
  ]);
}

export async function buildRefinementRequests(snapshot: TranslationSnapshot, sequences: number[]): Promise<TranslationRequest[]> {
  validateRefinementSelection(snapshot, sequences);
  const requests: TranslationRequest[] = [];
  for (const batch of buildTranslationBatches(snapshot.transcript.segments, snapshot.sourceLanguage)) {
    const active = batch.segments.filter((segment) => sequences.includes(segment.sequence));
    if (!active.length) continue;
    requests.push({
      ...batch, segments: active, contextOnly: batch.segments.filter((segment) => !sequences.includes(segment.sequence)),
      currentTranslations: active.map((segment) => ({ sequence: segment.sequence, text: snapshot.translation.segments.find((target) => target.sequence === segment.sequence)!.text })),
      glossary: await getRelevantGlossaryEntries(snapshot.projectId, snapshot.sourceLanguage, "my", [...batch.segments, ...(batch.contextBefore ?? []), ...(batch.contextAfter ?? [])].map((segment) => segment.text)),
    });
  }
  return requests;
}

export async function persistRefinement(data: RefinementJobData, jobId: string, result: TranslationResult, snapshot: TranslationSnapshot) {
  const selected = snapshot.transcript.segments.filter((segment) => data.sequences.includes(segment.sequence));
  assertTranslationResultAligned(result, selected, snapshot.sourceLanguage, result.model);
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "Movie" WHERE id = ${data.movieId} FOR UPDATE`;
    const current = await loadTranslationSnapshot(data.movieId, transaction);
    if (current.translation.id !== data.translationId || current.translation.revision !== data.revision || refinementSnapshotHash(current, data.sequences) !== data.snapshotHash) throw new TranslationError("REFINEMENT_STALE");
    for (const translated of result.segments) {
      const original = current.translation.segments.find((segment) => segment.sequence === translated.sequence)!;
      const source = current.transcript.segments.find((segment) => segment.sequence === translated.sequence)!;
      await transaction.translatedSegment.update({ where: { id: original.id }, data: { text: translated.text, provider: result.provider, model: result.model, origin: "REFINED", refinementJobId: jobId } });
      const key = { projectId: current.projectId, sourceLanguage: normalizeTerminologyLanguage(current.sourceLanguage), targetLanguage: "my", sourceHash: sourceTextHash(source.text) };
      // Atomic predicate protects manual edits and automatic pairs that no longer match this revision.
      await transaction.translationMemoryEntry.updateMany({ where: { ...key, origin: "AUTOMATIC", sourceText: normalizeMemorySource(source.text), targetText: original.text }, data: { targetText: translated.text } });
      await transaction.translationMemoryEntry.createMany({ data: [{ ...key, sourceText: normalizeMemorySource(source.text), targetText: translated.text, origin: "AUTOMATIC" }], skipDuplicates: true });
    }
    const updated = await loadTranslationSnapshot(data.movieId, transaction);
    await persistLocalQc(updated, transaction, data.sequences, jobId);
    return { movieId: data.movieId, translationId: current.translation.id, sequences: data.sequences, segmentCount: result.segments.length, model: result.model, runtimeMs: result.runtimeMs, ...(result.modelCalls === undefined ? {} : { modelCalls: result.modelCalls }), ...(result.usage ? { usage: result.usage } : {}) } satisfies RefinementReceipt;
  }, { timeout: 60_000 });
}

export async function retranslateSegmentsWithSol(data: RefinementJobData, jobId: string, dependencies: { getProvider?: typeof getRefinementTranslationProvider } = {}): Promise<RefinementReceipt> {
  const sequences = normalizeRefinementSequences(data.sequences);
  if (JSON.stringify(sequences) !== JSON.stringify(data.sequences)) throw new TranslationError("REFINEMENT_SEQUENCES_INVALID");
  const snapshot = await loadTranslationSnapshot(data.movieId);
  validateRefinementSelection(snapshot, sequences);
  if (data.translationId !== snapshot.translation.id || data.revision !== snapshot.translation.revision || jobId !== refinementJobId(snapshot, sequences)) throw new TranslationError("REFINEMENT_STALE");
  const selected = snapshot.translation.segments.filter((segment) => sequences.includes(segment.sequence));
  // Recover after a committed transaction but before BullMQ completion without paying again.
  if (selected.every((segment) => segment.refinementJobId === jobId)) return { movieId: data.movieId, translationId: data.translationId, sequences, segmentCount: sequences.length, model: selected[0].model!, runtimeMs: 0, modelCalls: 0, alreadyApplied: true };
  if (refinementSnapshotHash(snapshot, sequences) !== data.snapshotHash) throw new TranslationError("REFINEMENT_STALE");
  const configured = (dependencies.getProvider ?? getRefinementTranslationProvider)();
  const batches = await buildRefinementRequests(snapshot, sequences);
  const results: TranslationResult[] = [];
  for (const request of batches) {
    const result = await configured.provider.translate(request);
    assertTranslationResultAligned(result, request.segments, snapshot.sourceLanguage, configured.model);
    results.push(result);
  }
  const usage: NonNullable<TranslationResult["usage"]> = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens", "costUsd"] as const) {
    const values = results.map((result) => result.usage?.[key]);
    if (values.every((value): value is number => value !== undefined)) usage[key] = values.reduce((total, value) => total + value, 0);
  }
  const result: TranslationResult = { provider: results[0].provider, model: configured.model, sourceLanguage: snapshot.sourceLanguage, targetLanguage: "my", runtimeMs: results.reduce((total, result) => total + result.runtimeMs, 0), segments: results.flatMap((result) => result.segments).sort((a, b) => a.sequence - b.sequence), translationMemoryHits: 0, modelTranslatedSegments: sequences.length, modelCalls: results.length, ...(Object.keys(usage).length ? { usage } : {}) };
  return persistRefinement(data, jobId, result, snapshot);
}
