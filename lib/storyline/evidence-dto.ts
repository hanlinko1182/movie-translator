import "server-only";
import { canonicalJson } from "./canonical";
import { LIMITS, type Identity } from "./contracts";
import type { PreparedStorylineCandidate } from "./prepare-source";
import { anchorKey, assertAnchor, validateSourceSnapshot } from "./source";
import { fail, freeze, id, integer, literal, record } from "./validation";

export const EVIDENCE_DTO_LIMITS = { bytes: 256 * 1024, pageSize: 8 } as const;

/** Server-owned candidate projection, not a loader, endpoint or trust receipt.
 * Never accept a candidate supplied by a browser/provider. No DB/file/provider IO.
 * A future UI can receive this DTO; the private candidate must stay on the server.
 */
export function projectPreparedEvidence(candidate: PreparedStorylineCandidate, expected: Identity, selection: unknown) {
  const wrapper = record(candidate, ["kind", "persisted", "approved", "snapshot"], "candidate");
  literal(wrapper.kind, "PREPARED_CANDIDATE", "candidate.kind");
  if (wrapper.persisted !== false || wrapper.approved !== false) fail("INVALID_ENUM", "candidate");
  const raw = record(wrapper.snapshot, ["payload", "admissions", "sourceContentHash", "sourceContextHash"], "candidate.snapshot");
  const scope = { projectId: id(expected.projectId, "expected.projectId"), movieId: id(expected.movieId, "expected.movieId") };
  const snapshot = validateSourceSnapshot(raw.payload, scope);
  if (!snapshot.payload.preparation) fail("MISSING_FIELD", "source.preparation");
  if (snapshot.sourceContentHash !== raw.sourceContentHash || snapshot.sourceContextHash !== raw.sourceContextHash
    || canonicalJson(snapshot.admissions, LIMITS.snapshotBytes * 2) !== canonicalJson(raw.admissions, LIMITS.snapshotBytes * 2)) fail("STALE_CONTEXT", "candidate.snapshot");

  const request = record(selection, ["sceneSequence", "segmentSequence", "qcOffset", "observationOffset", "limit"], "selection");
  const sceneSequence = integer(request.sceneSequence, "selection.sceneSequence");
  const segmentSequence = integer(request.segmentSequence, "selection.segmentSequence");
  const qcOffset = integer(request.qcOffset, "selection.qcOffset", LIMITS.qcPerRow);
  const observationOffset = integer(request.observationOffset, "selection.observationOffset", LIMITS.anchorPairs);
  const limit = integer(request.limit, "selection.limit", EVIDENCE_DTO_LIMITS.pageSize);
  if (!limit) fail("INVALID_NUMBER", "selection.limit");
  const source = snapshot.payload;
  const anchor = { movieId: source.movieId, transcriptId: source.transcript.id, sceneSequence, segmentSequence };
  assertAnchor(anchor, source, "selection.anchor");
  const scene = source.scenes.find(row => row.sequence === sceneSequence)!;
  const segment = source.transcript.segments.find(row => row.sequence === segmentSequence)!;
  const admission = snapshot.admissions.find(row => row.sequence === segmentSequence)!;
  const target = source.translation?.rows.find(row => row.sequence === segmentSequence) ?? null;
  const findings = target?.qcIssues ?? [];
  const observations = source.preparation!.observations.filter(row => anchorKey(row.anchor) === anchorKey(anchor));
  if (qcOffset > findings.length) fail("INVALID_NUMBER", "selection.qcOffset");
  if (observationOffset > observations.length) fail("INVALID_NUMBER", "selection.observationOffset");
  const page = <T, U>(rows: readonly T[], offset: number, project: (row: T) => U) => ({
    total: rows.length, offset, limit,
    nextOffset: offset + limit < rows.length ? offset + limit : null,
    items: rows.slice(offset, offset + limit).map(project),
  });
  const dto = {
    schemaVersion: "story-prepared-evidence-dto-v1" as const,
    kind: "PREPARED_CONTEXT" as const, persisted: false as const, approved: false as const,
    freshness: "RECHECKED_AT_PREPARATION_ONLY" as const,
    semanticVerification: "NOT_PERFORMED" as const,
    ...scope, candidateId: source.id, capturedAt: source.capturedAt,
    sourceContentHash: snapshot.sourceContentHash, sourceContextHash: snapshot.sourceContextHash,
    translationContextPolicy: source.translationContextPolicy,
    anchor,
    scene: { id: scene.id, sequence: scene.sequence, startMs: scene.startMs, endMs: scene.endMs },
    chinese: { id: segment.id, language: source.transcript.language, sequence: segment.sequence, startMs: segment.startMs, endMs: segment.endMs, text: segment.text, complete: true as const },
    translation: {
      status: admission.status, reason: admission.status === "ADMITTED" ? null : admission.reason,
      rowContextHash: admission.status === "MISSING" ? null : admission.rowContextHash,
      mayInformDraft: admission.status === "ADMITTED", independentEvidence: false as const,
      row: target && source.translation ? {
        id: target.id, translationId: target.translationId, sourceTranscriptId: source.translation.sourceTranscriptId,
        sourceLanguage: source.translation.sourceLanguage, targetLanguage: source.translation.targetLanguage,
        translationRevision: source.translation.revision, revision: target.revision,
        translationCreatedAt: source.translation.createdAt, translationUpdatedAt: source.translation.updatedAt, qcScannedAt: source.translation.qcScannedAt,
        sequence: target.sequence, startMs: target.startMs, endMs: target.endMs,
        text: target.text, complete: true as const, origin: target.origin, provider: target.provider, model: target.model,
        reviewStatus: target.reviewStatus, createdAt: target.createdAt, editedAt: target.editedAt, reviewedAt: target.reviewedAt,
      } : null,
      qc: {
        scanState: source.preparation!.translationQcState,
        activeCount: findings.filter(row => row.resolvedAt === null).length,
        resolvedCount: findings.filter(row => row.resolvedAt !== null).length,
        ...page(findings, qcOffset, row => ({ id: row.id, category: row.category, severity: row.severity, source: row.source,
          message: row.message, createdAt: row.createdAt, updatedAt: row.updatedAt, resolvedAt: row.resolvedAt, resolution: row.resolution })),
      },
    },
    // These lists describe allowance at this anchor, never a verified claim.
    allowedCharacterIds: source.characters.filter(row => row.evidence.some(item => anchorKey(item.anchor) === anchorKey(anchor))).map(row => row.id),
    allowedRelationshipIds: source.relationships.filter(row => row.evidence.some(item => anchorKey(item.anchor) === anchorKey(anchor))).map(row => row.id),
    observations: page(observations, observationOffset, row => ({
      id: row.id, ownerKind: row.ownerKind, ownerId: row.ownerId, kind: row.kind,
      evidenceText: row.evidenceText, inference: row.inference, confidence: row.confidence,
      relationshipType: row.relationshipType, relationshipSummary: row.relationshipSummary,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    })),
  };
  // Reject oversized views, never truncate exact Chinese/Myanmar text. The caller
  // may explicitly request a smaller page; no automatic repair or retry occurs.
  canonicalJson(dto, EVIDENCE_DTO_LIMITS.bytes);
  return freeze(dto);
}

export type PreparedEvidenceDto = ReturnType<typeof projectPreparedEvidence>;
