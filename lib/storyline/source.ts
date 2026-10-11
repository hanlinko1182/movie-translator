import "server-only";
import { createHash } from "node:crypto";
import { CONFIDENCES, RELATIONSHIP_TYPES } from "@/lib/character-analysis/types";
import { normalizeMemorySource, normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";
import { contractHash, canonicalJson } from "./canonical";
import { LIMITS, STORYLINE, type Identity, type SourceAnchor, type EvidenceAllowance, type StorySourcePayload,
  type StorySourceSnapshot, type TranslationContext, type TranslationRow, type TranslationAdmission, type QcMetadata } from "./contracts";
import { array, date, enumeration, fail, freeze, hash, id, integer, interval, literal, nullable, record, text, unique } from "./validation";

const QC_CATEGORIES = ["EMPTY_OUTPUT", "EXCESSIVE_LENGTH", "POSSIBLE_OMISSION", "NUMBER_MISMATCH", "MARKDOWN_OR_COMMENTARY", "GLOSSARY_MISMATCH", "SUSPICIOUS_REPETITION", "SOURCE_TARGET_MISMATCH", "AMBIGUOUS_OR_WORDPLAY"] as const;
const byId = <T extends { id: string }>(a: T, b: T) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function anchorKey(anchor: SourceAnchor): string { return `${anchor.movieId}:${anchor.transcriptId}:${anchor.sceneSequence}:${anchor.segmentSequence}`; }
export function parseAnchor(value: unknown, path = "anchor"): SourceAnchor {
  const row = record(value, ["movieId", "transcriptId", "sceneSequence", "segmentSequence"], path);
  return { movieId: id(row.movieId, `${path}.movieId`), transcriptId: id(row.transcriptId, `${path}.transcriptId`), sceneSequence: integer(row.sceneSequence, `${path}.sceneSequence`), segmentSequence: integer(row.segmentSequence, `${path}.segmentSequence`) };
}
export function assertAnchor(anchor: SourceAnchor, source: Pick<StorySourcePayload, "movieId" | "transcript" | "scenes"> | StorySourceSnapshot["payload"], path = "anchor") {
  const scene = source.scenes.find(row => row.sequence === anchor.sceneSequence);
  const segment = source.transcript.segments.find(row => row.sequence === anchor.segmentSequence);
  if (anchor.movieId !== source.movieId || anchor.transcriptId !== source.transcript.id || !scene || !segment || segment.startMs >= scene.endMs || (segment.endMs <= scene.startMs && !(segment.startMs === segment.endMs && segment.startMs >= scene.startMs))) fail("INVALID_ANCHOR", path);
}
export function sourceAnchors(source: StorySourceSnapshot["payload"] | Pick<StorySourcePayload, "movieId" | "transcript" | "scenes">): SourceAnchor[] {
  const result: SourceAnchor[] = [];
  for (const segment of source.transcript.segments) {
    let low = 0, high = source.scenes.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (source.scenes[mid].endMs <= segment.startMs) low = mid + 1; else high = mid;
    }
    const before = result.length;
    for (let index = low; index < source.scenes.length; index++) {
      const scene = source.scenes[index];
      if (scene.startMs >= segment.endMs && !(segment.startMs === segment.endMs && scene.startMs <= segment.startMs)) break;
      result.push({ movieId: source.movieId, transcriptId: source.transcript.id, sceneSequence: scene.sequence, segmentSequence: segment.sequence });
      if (result.length > LIMITS.anchorPairs) fail("SIZE_LIMIT", "source.anchors");
    }
    if (result.length === before || segment.endMs > source.scenes[source.scenes.length - 1].endMs) fail("INVALID_INTERVAL", "source.transcript.segments");
  }
  return result;
}
function scoped(row: Identity, scope: Identity, path: string) {
  if (row.projectId !== scope.projectId || row.movieId !== scope.movieId) fail("SCOPE_MISMATCH", path);
}
function qc(value: unknown): QcMetadata {
  const p = "translation.rows.qcIssues";
  const row = record(value, ["id", "translatedSegmentId", "category", "severity", "source", "message", "createdAt", "updatedAt", "resolvedAt", "resolution"], p);
  return { id: id(row.id, `${p}.id`), translatedSegmentId: id(row.translatedSegmentId, `${p}.translatedSegmentId`), category: enumeration(row.category, QC_CATEGORIES, `${p}.category`), severity: enumeration(row.severity, ["INFO", "WARNING", "ERROR"], `${p}.severity`), source: enumeration(row.source, ["HEURISTIC", "MODEL", "MANUAL"], `${p}.source`), message: text(row.message, 2000, `${p}.message`), createdAt: date(row.createdAt, `${p}.createdAt`), updatedAt: date(row.updatedAt, `${p}.updatedAt`), resolvedAt: nullable(row.resolvedAt, v => date(v, `${p}.resolvedAt`)), resolution: nullable(row.resolution, v => text(v, 2000, `${p}.resolution`, true)) };
}
function translationRow(value: unknown): TranslationRow {
  const p = "translation.rows";
  const row = record(value, ["id", "translationId", "sequence", "startMs", "endMs", "text", "revision", "origin", "provider", "model", "refinementJobId", "reviewStatus", "manualSourceHash", "createdAt", "editedAt", "reviewedAt", "qcIssues"], p);
  const qcIssues = array(row.qcIssues, LIMITS.qcPerRow, `${p}.qcIssues`).map(qc).sort(byId);
  unique(qcIssues, row => row.id, `${p}.qcIssues`);
  if (qcIssues.some(issue => issue.translatedSegmentId !== row.id)) fail("SCOPE_MISMATCH", `${p}.qcIssues`);
  return {
    id: id(row.id, `${p}.id`), translationId: id(row.translationId, `${p}.translationId`), sequence: integer(row.sequence, `${p}.sequence`),
    startMs: integer(row.startMs, `${p}.startMs`), endMs: integer(row.endMs, `${p}.endMs`), text: text(row.text, LIMITS.text, `${p}.text`, true), revision: integer(row.revision, `${p}.revision`),
    origin: enumeration(row.origin, ["UNKNOWN", "MODEL", "TRANSLATION_MEMORY", "REFINED", "MANUAL"], `${p}.origin`),
    provider: nullable(row.provider, v => text(v, 160, `${p}.provider`)), model: nullable(row.model, v => text(v, 160, `${p}.model`)), refinementJobId: nullable(row.refinementJobId, v => text(v, 512, `${p}.refinementJobId`)),
    reviewStatus: enumeration(row.reviewStatus, ["UNREVIEWED", "NEEDS_REVIEW", "APPROVED"], `${p}.reviewStatus`), manualSourceHash: nullable(row.manualSourceHash, v => hash(v, `${p}.manualSourceHash`)),
    createdAt: date(row.createdAt, `${p}.createdAt`), editedAt: nullable(row.editedAt, v => date(v, `${p}.editedAt`)), reviewedAt: nullable(row.reviewedAt, v => date(v, `${p}.reviewedAt`)), qcIssues,
  };
}
function parseTranslation(value: unknown, movieId: string): TranslationContext | null {
  if (value === null) return null;
  const p = "translation";
  const row = record(value, ["id", "movieId", "sourceTranscriptId", "sourceLanguage", "targetLanguage", "revision", "provider", "model", "createdAt", "updatedAt", "qcScannedAt", "rows"], p);
  const translation: TranslationContext = {
    id: id(row.id, `${p}.id`), movieId: id(row.movieId, `${p}.movieId`), sourceTranscriptId: id(row.sourceTranscriptId, `${p}.sourceTranscriptId`),
    sourceLanguage: text(row.sourceLanguage, 16, `${p}.sourceLanguage`), targetLanguage: text(row.targetLanguage, 16, `${p}.targetLanguage`), revision: integer(row.revision, `${p}.revision`),
    provider: text(row.provider, 160, `${p}.provider`), model: text(row.model, 160, `${p}.model`), createdAt: date(row.createdAt, `${p}.createdAt`), updatedAt: date(row.updatedAt, `${p}.updatedAt`),
    qcScannedAt: nullable(row.qcScannedAt, v => date(v, `${p}.qcScannedAt`)), rows: array(row.rows, LIMITS.segments, `${p}.rows`).map(translationRow).sort((a, b) => a.sequence - b.sequence),
  };
  if (translation.movieId !== movieId || translation.rows.some(row => row.translationId !== translation.id)) fail("SCOPE_MISMATCH", p);
  unique(translation.rows, row => row.id, `${p}.rows`); unique(translation.rows, row => row.sequence, `${p}.rows`);
  unique(translation.rows.flatMap(row => row.qcIssues), row => row.id, `${p}.rows.qcIssues`);
  return translation;
}

/** Pure admission over validated source data; never filters on subtitle approval/QC. */
function admit(source: StorySourcePayload): TranslationAdmission[] {
  const translation = source.translation;
  const rows = translation?.rows ?? [];
  const sequences = [...new Set([...source.transcript.segments.map(row => row.sequence), ...rows.map(row => row.sequence)])].sort((a, b) => a - b);
  return sequences.map(sequence => {
    const row = rows.find(row => row.sequence === sequence);
    if (!row || !translation) return { status: "MISSING", sequence, reason: "MISSING", rowId: null };
    const original = source.transcript.segments.find(segment => segment.sequence === sequence);
    const { rows: allRows, ...metadata } = translation;
    void allRows;
    const rowContextHash = contractHash("story-translation-row-v1", { metadata, row, source: original ?? null, projectId: source.projectId });
    return admission(row, original, source, translation, rowContextHash);
  });
}
function admission(row: TranslationRow, original: StorySourcePayload["transcript"]["segments"][number] | undefined, source: StorySourcePayload, translation: TranslationContext, rowContextHash: string): TranslationAdmission {
  const excluded = (status: "EXCLUDED_STALE" | "EXCLUDED_INVALID", reason: Extract<TranslationAdmission, { rowId: string }>["reason"]): TranslationAdmission => ({ status, sequence: row.sequence, reason, rowId: row.id, rowContextHash });
  if (!original) return excluded("EXCLUDED_INVALID", "ORPHAN_SEQUENCE");
  if (translation.sourceTranscriptId !== source.transcript.id) return excluded("EXCLUDED_STALE", "SOURCE_TRANSCRIPT_CHANGED");
  if (normalizeTerminologyLanguage(translation.sourceLanguage) !== normalizeTerminologyLanguage(source.sourceLanguage) || translation.targetLanguage !== source.targetLanguage) return excluded("EXCLUDED_INVALID", "LANGUAGE_MISMATCH");
  if (row.startMs !== original.startMs || row.endMs !== original.endMs) return excluded("EXCLUDED_INVALID", "TIMING_MISMATCH");
  if (!row.text.trim()) return excluded("EXCLUDED_INVALID", "EMPTY_TARGET");
  if (row.origin === "MANUAL") {
    // Existing manual binding normalizes for TM hashing only. Snapshot text is untouched.
    const expected = createHash("sha256").update(normalizeMemorySource(original.text), "utf8").digest("hex");
    if (row.manualSourceHash !== expected) return excluded("EXCLUDED_STALE", "MANUAL_SOURCE_CHANGED");
  }
  return { status: "ADMITTED", sequence: row.sequence, row, rowContextHash };
}

/** Structural preparation only. M1-B must load authoritative DB/media data before calling. */
export function validateSourceSnapshot(value: unknown, expected: Identity): StorySourceSnapshot {
  canonicalJson(value, LIMITS.snapshotBytes);
  id(expected.projectId, "expected.projectId"); id(expected.movieId, "expected.movieId");
  const row = record(value, ["schemaVersion", "id", "capturedAt", "projectId", "movieId", "sourceLanguage", "targetLanguage", "media", "transcript", "scenes", "characterContext", "characters", "relationships", "translationContextPolicy", "translation"], "source");
  const projectId = id(row.projectId, "source.projectId"), movieId = id(row.movieId, "source.movieId");
  scoped({ projectId, movieId }, expected, "source");
  const mediaRaw = record(row.media, ["sha256", "bytes", "durationMs"], "source.media");
  const media = { sha256: hash(mediaRaw.sha256, "source.media.sha256"), bytes: integer(mediaRaw.bytes, "source.media.bytes", Number.MAX_SAFE_INTEGER), durationMs: integer(mediaRaw.durationMs, "source.media.durationMs") };
  if (!media.bytes || !media.durationMs) fail("INVALID_NUMBER", "source.media");
  const transcriptRaw = record(row.transcript, ["id", "movieId", "language", "segments"], "source.transcript");
  const transcript = {
    id: id(transcriptRaw.id, "source.transcript.id"), movieId: id(transcriptRaw.movieId, "source.transcript.movieId"), language: enumeration(transcriptRaw.language, ["zh", "cmn"], "source.transcript.language"),
    segments: array(transcriptRaw.segments, LIMITS.segments, "source.transcript.segments", 1).map(raw => {
      const p = "source.transcript.segments", item = record(raw, ["id", "transcriptId", "sequence", "startMs", "endMs", "text"], p);
      const result = { id: id(item.id, `${p}.id`), transcriptId: id(item.transcriptId, `${p}.transcriptId`), sequence: integer(item.sequence, `${p}.sequence`), startMs: integer(item.startMs, `${p}.startMs`), endMs: integer(item.endMs, `${p}.endMs`), text: text(item.text, LIMITS.text, `${p}.text`) };
      if (result.transcriptId !== transcriptRaw.id) fail("SCOPE_MISMATCH", p);
      interval(result.startMs, result.endMs, media.durationMs, p, true); return result;
    }),
  };
  if (transcript.movieId !== movieId) fail("SCOPE_MISMATCH", "source.transcript");
  unique(transcript.segments, row => row.id, "source.transcript.segments"); unique(transcript.segments, row => row.sequence, "source.transcript.segments");
  if (transcript.segments.some((row, index, rows) => index > 0 && row.sequence <= rows[index - 1].sequence)) fail("INVALID_ORDER", "source.transcript.segments");
  const scenes = array(row.scenes, LIMITS.scenes, "source.scenes", 1).map((raw, index) => {
    const p = "source.scenes", item = record(raw, ["id", "movieId", "sequence", "startMs", "endMs"], p);
    const result = { id: id(item.id, `${p}.id`), movieId: id(item.movieId, `${p}.movieId`), sequence: integer(item.sequence, `${p}.sequence`), startMs: integer(item.startMs, `${p}.startMs`), endMs: integer(item.endMs, `${p}.endMs`) };
    if (result.movieId !== movieId) fail("SCOPE_MISMATCH", p);
    if (result.sequence !== index) fail("INVALID_ORDER", p);
    interval(result.startMs, result.endMs, media.durationMs, p); return result;
  });
  unique(scenes, row => row.id, "source.scenes");
  if (scenes.some((row, index) => row.startMs !== (index ? scenes[index - 1].endMs : 0))) fail("INVALID_INTERVAL", "source.scenes");
  const sourceBase = { movieId, transcript, scenes };
  sourceAnchors(sourceBase);
  function allowances(raw: unknown, p: string): EvidenceAllowance[] {
    const result = array(raw, LIMITS.segments, p, 1).map(raw => {
      const item = record(raw, ["anchor", "confidence", "evidenceText", "inference"], p);
      const anchor = parseAnchor(item.anchor, `${p}.anchor`); assertAnchor(anchor, sourceBase, `${p}.anchor`);
      return { anchor, confidence: enumeration(item.confidence, CONFIDENCES, `${p}.confidence`), evidenceText: text(item.evidenceText, LIMITS.text, `${p}.evidenceText`), inference: text(item.inference, LIMITS.text, `${p}.inference`, true) };
    });
    unique(result, row => anchorKey(row.anchor), p);
    return result.sort((a, b) => a.anchor.sceneSequence - b.anchor.sceneSequence || a.anchor.segmentSequence - b.anchor.segmentSequence);
  }
  const characters = array(row.characters, LIMITS.entities, "source.characters").map(raw => {
    const p = "source.characters", item = record(raw, ["id", "projectId", "movieId", "name", "uncertain", "evidence"], p);
    const result = { id: id(item.id, `${p}.id`), projectId: id(item.projectId, `${p}.projectId`), movieId: id(item.movieId, `${p}.movieId`), name: text(item.name, 160, `${p}.name`), uncertain: item.uncertain as boolean, evidence: allowances(item.evidence, `${p}.evidence`) };
    if (typeof item.uncertain !== "boolean") fail("INVALID_ENUM", `${p}.uncertain`);
    scoped(result, expected, p); return result;
  }).sort(byId);
  unique(characters, row => row.id, "source.characters");
  const relationships = array(row.relationships, LIMITS.entities, "source.relationships").map(raw => {
    const p = "source.relationships", item = record(raw, ["id", "projectId", "movieId", "characterAId", "characterBId", "type", "summary", "confidence", "evidence"], p);
    const result = { id: id(item.id, `${p}.id`), projectId: id(item.projectId, `${p}.projectId`), movieId: id(item.movieId, `${p}.movieId`), characterAId: id(item.characterAId, `${p}.characterAId`), characterBId: id(item.characterBId, `${p}.characterBId`), type: enumeration(item.type, RELATIONSHIP_TYPES, `${p}.type`), summary: text(item.summary, 2000, `${p}.summary`), confidence: enumeration(item.confidence, CONFIDENCES, `${p}.confidence`), evidence: allowances(item.evidence, `${p}.evidence`) };
    scoped(result, expected, p);
    if (result.characterAId === result.characterBId || [result.characterAId, result.characterBId].some(id => !characters.some(row => row.id === id))) fail("EVIDENCE_OWNERSHIP", p);
    return result;
  }).sort(byId);
  unique(relationships, row => row.id, "source.relationships");
  const source: StorySourcePayload = { schemaVersion: literal(row.schemaVersion, STORYLINE.sourceVersion, "source.schemaVersion"), id: id(row.id, "source.id"), capturedAt: date(row.capturedAt, "source.capturedAt"), projectId, movieId,
    sourceLanguage: enumeration(row.sourceLanguage, ["zh", "cmn"], "source.sourceLanguage"), targetLanguage: literal(row.targetLanguage, "my", "source.targetLanguage"), media, transcript, scenes,
    characterContext: literal(row.characterContext, "CURRENT", "source.characterContext"), characters, relationships, translationContextPolicy: literal(row.translationContextPolicy, STORYLINE.translationPolicy, "source.translationContextPolicy"), translation: parseTranslation(row.translation, movieId) };
  if (source.sourceLanguage !== transcript.language) fail("SCOPE_MISMATCH", "source.transcript.language");
  const admissions = admit(source);
  const sourceContentHash = contractHash("story-source-content-v1", { projectId, movieId, media, transcript, scenes, characters, relationships,
    targets: admissions.filter(row => row.status === "ADMITTED").map(row => ({ sequence: row.sequence, text: row.row.text, startMs: row.row.startMs, endMs: row.row.endMs })) });
  const { id: snapshotId, capturedAt, ...context } = source;
  void snapshotId; void capturedAt;
  return freeze({ payload: source, admissions, sourceContentHash, sourceContextHash: contractHash("story-source-context-v1", { context, admissions }) });
}
