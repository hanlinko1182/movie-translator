import "server-only";
import { canonicalJson, contractHash } from "../../canonical";
import { array, date, text, unique, enumeration, fail, freeze, hash, id, integer, literal, nullable, record } from "../../validation";
import type { NarrationDraft } from "../../narration/contracts";
import { STUDIO_EDIT, unapprovedEdit, type EditedVersionPayload } from "../../studio-versions/contracts";
import { VOICE_FOUNDATION as V, type NarrationReference, type M4Identity, type EditedIdentity } from "./contracts";

export const captureVoiceJson = (v: unknown) => JSON.parse(canonicalJson(v, V.maxBytes)) as unknown;
function identity(value: unknown): M4Identity | EditedIdentity {
  const kind = value && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, "kind")?.value : null;
  if (kind === "M4_ORIGINAL") {
    const r = record(value, ["kind", "id", "hash", "hashDomain"], "voice.identity");
    return { kind, id: id(r.id, "voice.id"), hash: hash(r.hash, "voice.hash"), hashDomain: literal(r.hashDomain, "story-narration-draft-v1", "voice.domain") };
  }
  const r = record(value, ["kind", "id", "hash", "hashDomain", "version", "previous"], "voice.edit");
  const version = integer(r.version, "voice.version", 1000001);
  const previous = nullable(r.previous, value => { const p = record(value, ["id", "hash", "hashDomain"], "voice.previous");
    return { id: id(p.id, "voice.previous.id"), hash: hash(p.hash, "voice.previous.hash"), hashDomain: literal(p.hashDomain, "story-edited-narration-v1", "voice.previous.domain") }; });
  if (!version || (version === 1) !== (previous === null) || previous?.id === r.id) fail("INVALID_ORDER", "voice.lineage");
  return { kind: literal(r.kind, "R4_EDITED", "voice.kind"), id: id(r.id, "voice.id"), hash: hash(r.hash, "voice.hash"),
    hashDomain: literal(r.hashDomain, "story-edited-narration-v1", "voice.domain"), version, previous };
}
/** Structural reference only; hashes cannot prove storage, freshness or approval. */
export function parseNarrationReference(value: unknown) {
  const r = record(captureVoiceJson(value), ["schemaVersion", "scope", "original", "source", "analysis", "artifact"], "voice.reference");
  const scope = record(r.scope, ["projectId", "movieId", "studioId"], "voice.scope");
  const o = record(r.original, ["id", "hash", "hashDomain", "payloadId", "parentDraft"], "voice.original");
  const s = record(r.source, ["projectId", "movieId", "studioId", "snapshotId", "contentHash", "contextHash", "dependencyHash", "bindingHash", "expectedStudioRevision", "mediaSha256"], "voice.source");
  const a = record(r.analysis, ["candidateId", "candidateHash", "candidateSchemaVersion", "candidateOrigin", "taskId", "generation", "resultId", "resultHash", "submissionId", "recipeHash", "profileDefinitionHash"], "voice.analysis");
  const original = { id: id(o.id, "voice.original.id"), hash: hash(o.hash, "voice.original.hash"),
    hashDomain: literal(o.hashDomain, "story-narration-draft-v1", "voice.original.domain"), payloadId: id(o.payloadId, "voice.payloadId"),
    parentDraft: nullable(o.parentDraft, value => { const p = record(value, ["id", "hash", "hashDomain"], "voice.parent");
      return { id: id(p.id, "voice.parent.id"), hash: hash(p.hash, "voice.parent.hash"), hashDomain: literal(p.hashDomain, "story-narration-draft-v1", "voice.parent.domain") }; }) };
  let artifact: NarrationReference["artifact"];
  if (r.artifact && typeof r.artifact === "object" && "kind" in r.artifact && r.artifact.kind === "FUTURE_APPROVED_REFERENCE") {
    const f = record(r.artifact, ["kind", "id", "hash", "hashDomain", "parent", "approval", "verification"], "voice.future");
    const p = record(f.approval, ["id", "hash", "hashDomain", "policyVersion", "verificationDependencyHash"], "voice.approval");
    artifact = { kind: "FUTURE_APPROVED_REFERENCE", id: id(f.id, "voice.future.id"), hash: hash(f.hash, "voice.future.hash"),
      hashDomain: literal(f.hashDomain, "story-approved-narration-v1", "voice.future.domain"), parent: identity(f.parent),
      approval: { id: id(p.id, "voice.approval.id"), hash: hash(p.hash, "voice.approval.hash"), hashDomain: literal(p.hashDomain, "story-narration-approval-v1", "voice.approval.domain"),
        policyVersion: id(p.policyVersion, "voice.approval.policy"), verificationDependencyHash: hash(p.verificationDependencyHash, "voice.approval.dependencies") },
      verification: literal(f.verification, "NOT_VERIFIED_BY_PLANNING", "voice.future.verification") };
  } else artifact = identity(r.artifact);
  const current = artifact.kind === "FUTURE_APPROVED_REFERENCE" ? artifact.parent : artifact;
  if (current.kind === "M4_ORIGINAL" && (current.id !== original.id || current.hash !== original.hash) ||
    current.kind === "R4_EDITED" && current.id === original.id) fail("RECEIPT_BINDING_INVALID", "voice.original");
  const result: NarrationReference = {
    schemaVersion: literal(r.schemaVersion, V.reference, "voice.reference.schema"),
    scope: { projectId: id(scope.projectId, "voice.project"), movieId: id(scope.movieId, "voice.movie"), studioId: id(scope.studioId, "voice.studio") }, original,
    source: { projectId: id(s.projectId, "voice.source.project"), movieId: id(s.movieId, "voice.source.movie"), studioId: id(s.studioId, "voice.source.studio"), snapshotId: id(s.snapshotId, "voice.snapshot"),
      contentHash: hash(s.contentHash, "voice.source.content"), contextHash: hash(s.contextHash, "voice.source.context"), dependencyHash: hash(s.dependencyHash, "voice.source.dependencies"),
      bindingHash: hash(s.bindingHash, "voice.source.binding"), expectedStudioRevision: integer(s.expectedStudioRevision, "voice.source.revision"), mediaSha256: hash(s.mediaSha256, "voice.media") },
    analysis: { candidateId: id(a.candidateId, "voice.candidate"), candidateHash: hash(a.candidateHash, "voice.candidate.hash"),
      candidateSchemaVersion: literal(a.candidateSchemaVersion, "story-evidence-candidate-v1", "voice.candidate.schema"), candidateOrigin: enumeration(a.candidateOrigin, ["SYNTHETIC_TEST", "MODEL_CANDIDATE"], "voice.candidate.origin"),
      taskId: id(a.taskId, "voice.task"), generation: integer(a.generation, "voice.generation", 1000000), resultId: id(a.resultId, "voice.result"), resultHash: hash(a.resultHash, "voice.result.hash"),
      submissionId: id(a.submissionId, "voice.submission"), recipeHash: hash(a.recipeHash, "voice.recipe"), profileDefinitionHash: hash(a.profileDefinitionHash, "voice.profile") }, artifact,
  };
  if (canonicalJson(result.scope) !== canonicalJson({ projectId: result.source.projectId, movieId: result.source.movieId, studioId: result.source.studioId })) fail("SCOPE_MISMATCH", "voice.scope");
  return freeze(result);
}
export function referenceFromM4(draft: NarrationDraft, stored: { id: string; draftHash: string }) {
  const captured = record(captureVoiceJson(draft), ["payload", "draftHash"], "voice.m4");
  const receipt = record(captureVoiceJson(stored), ["id", "draftHash"], "voice.stored");
  id(receipt.id, "voice.stored.id"); hash(receipt.draftHash, "voice.stored.hash");
  const payload = record(captured.payload, ["schemaVersion", "composerVersion", "id", "version", "parentDraft", "language", "style", "durationMode", "translationContextPolicy", "origin", "source", "analysis", "beats", "sections", "paragraphs", "claimLineage", "duration", "review"], "voice.m4.payload");
  literal(payload.schemaVersion, "story-narration-draft-v1", "voice.m4.schema");
  literal(payload.language, "my", "voice.m4.language");
  if (captured.draftHash !== receipt.draftHash || contractHash("story-narration-draft-v1", payload) !== receipt.draftHash) fail("RECEIPT_BINDING_INVALID", "voice.m4.hash");
  const d = captured.payload as NarrationDraft["payload"];
  return parseNarrationReference({ schemaVersion: V.reference, scope: { projectId: d.source.projectId, movieId: d.source.movieId, studioId: d.source.studioId },
    original: { id: receipt.id, hash: receipt.draftHash, hashDomain: "story-narration-draft-v1", payloadId: d.id,
      parentDraft: d.parentDraft ? { ...d.parentDraft, hashDomain: "story-narration-draft-v1" } : null }, source: d.source, analysis: d.analysis,
    artifact: { kind: "M4_ORIGINAL", id: receipt.id, hash: receipt.draftHash, hashDomain: "story-narration-draft-v1" } });
}
/** Strict pure projection of the existing R4 wire schema. Its existing parser
 * imports a DB-bearing scope module, so do not pull that runtime into planning. */
export function checkedEditedNarration(value: unknown, contentHash: string, original: unknown) {
  const parent = parseNarrationReference(original);
  literal(parent.analysis.candidateOrigin, "SYNTHETIC_TEST", "voice.edit.analysis.origin");
  const r = record(captureVoiceJson(value), ["scope", "binding", "expectedRevision", "previousVersion", "idempotencyKey", "sections", "schemaVersion", "origin", "id", "version", "createdAt", "editor", "review"], "voice.edit");
  canonicalJson(r, STUDIO_EDIT.maxBytes);
  if (parent.artifact.kind !== "M4_ORIGINAL" || contractHash(STUDIO_EDIT.hashDomain, r) !== hash(contentHash, "voice.edit.hash") ||
    canonicalJson(r.scope) !== canonicalJson(parent.scope) || canonicalJson(r.binding) !== canonicalJson({ original: { id: parent.original.id, draftHash: parent.original.hash, payloadId: parent.original.payloadId }, source: parent.source, analysis: parent.analysis }) ||
    canonicalJson(r.review) !== canonicalJson(unapprovedEdit)) fail("RECEIPT_BINDING_INVALID", "voice.edit.parent");
  const e = record(r.editor, ["tenantId", "principalId"], "voice.edit.editor");
  let total = 0;
  const sections = array(r.sections, 60, "voice.edit.sections", 1).map(value => {
    const section = record(value, ["sectionId", "paragraphs"], "voice.edit.section"); let count = 0;
    const paragraphs = array(section.paragraphs, 12, "voice.edit.paragraphs", 1).map(value => {
      const p = text(value, 1200, "voice.edit.text");
      if (!/\p{Script=Myanmar}/u.test(p) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u.test(p)) fail("INVALID_TEXT", "voice.edit.text");
      count += [...p].length; return p;
    });
    total += count;
    if (count > 1200 || total > 36000) fail("SIZE_LIMIT", "voice.edit.text");
    return { sectionId: id(section.sectionId, "voice.edit.section.id"), paragraphs };
  });
  unique(sections, s => s.sectionId, "voice.edit.sections");
  const previousVersion = nullable(r.previousVersion, value => { const p = record(value, ["id", "contentHash"], "voice.edit.previous");
    return { id: id(p.id, "voice.edit.previous.id"), contentHash: hash(p.contentHash, "voice.edit.previous.hash") }; });
  const version = integer(r.version, "voice.edit.version", 1000001), expectedRevision = integer(r.expectedRevision, "voice.edit.revision", 1000000);
  if (!version || version !== expectedRevision + 1 || (version === 1) !== (previousVersion === null) || previousVersion?.id === r.id) fail("INVALID_ORDER", "voice.edit.lineage");
  const parsed: EditedVersionPayload = { schemaVersion: literal(r.schemaVersion, STUDIO_EDIT.version, "voice.edit.schema"), origin: literal(r.origin, "SYNTHETIC_TEST_EDIT", "voice.edit.origin"),
    id: id(r.id, "voice.edit.id"), version, expectedRevision, previousVersion, idempotencyKey: id(r.idempotencyKey, "voice.edit.key"), createdAt: date(r.createdAt, "voice.edit.date"),
    editor: { tenantId: id(e.tenantId, "voice.edit.tenant"), principalId: id(e.principalId, "voice.edit.editor") },
    binding: { original: { id: parent.original.id, draftHash: parent.original.hash, payloadId: parent.original.payloadId }, source: parent.source, analysis: parent.analysis }, scope: parent.scope, sections, review: unapprovedEdit };
  if (canonicalJson(parsed) !== canonicalJson(r)) fail("RECEIPT_BINDING_INVALID", "voice.edit.bytes");
  return freeze(parsed);
}
/** Full canonical payload is required: the safe UI DTO omits the request key. */
export function referenceFromR4(value: unknown, contentHash: string, original: unknown) {
  const parent = parseNarrationReference(original), edit = checkedEditedNarration(value, contentHash, parent);
  return parseNarrationReference({ ...parent, artifact: { kind: "R4_EDITED", id: edit.id, hash: contentHash, hashDomain: "story-edited-narration-v1", version: edit.version,
    previous: edit.previousVersion ? { id: edit.previousVersion.id, hash: edit.previousVersion.contentHash, hashDomain: "story-edited-narration-v1" } : null } });
}
