import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { LIMITS } from "../contracts";
import { EVIDENCE_ANALYSIS } from "../evidence-analysis/contracts";
import { taskScope } from "../jobs/service-boundary";
import { array, date, hash, id, integer, literal, nullable, record, text, unique } from "../validation";
import { rejectVersion } from "./errors";
import { STUDIO_EDIT, unapprovedEdit, type EditedSection, type EditedVersionPayload, type OriginalBinding, type SaveStudioEdit } from "./contracts";

export function originalIdentity(value: unknown) {
  const r = record(value, ["id", "draftHash"], "original");
  return { id: id(r.id, "original.id"), draftHash: hash(r.draftHash, "original.draftHash") };
}
export function originalBinding(value: unknown): OriginalBinding {
  const r = record(value, ["original", "source", "analysis"], "binding");
  const o = record(r.original, ["id", "payloadId", "draftHash"], "binding.original");
  const s = record(r.source, ["projectId", "movieId", "studioId", "snapshotId", "contentHash", "contextHash", "dependencyHash", "bindingHash", "expectedStudioRevision", "mediaSha256"], "binding.source");
  const a = record(r.analysis, ["candidateId", "candidateHash", "candidateSchemaVersion", "candidateOrigin", "taskId", "generation", "resultId", "resultHash", "submissionId", "recipeHash", "profileDefinitionHash"], "binding.analysis");
  return { original: { id: id(o.id, "original.id"), payloadId: id(o.payloadId, "original.payloadId"), draftHash: hash(o.draftHash, "original.draftHash") },
    source: { projectId: id(s.projectId, "source.projectId"), movieId: id(s.movieId, "source.movieId"), studioId: id(s.studioId, "source.studioId"),
      snapshotId: id(s.snapshotId, "source.snapshotId"), contentHash: hash(s.contentHash, "source.contentHash"), contextHash: hash(s.contextHash, "source.contextHash"),
      dependencyHash: hash(s.dependencyHash, "source.dependencyHash"), bindingHash: hash(s.bindingHash, "source.bindingHash"),
      expectedStudioRevision: integer(s.expectedStudioRevision, "source.revision"), mediaSha256: hash(s.mediaSha256, "source.mediaSha256") },
    analysis: { candidateId: id(a.candidateId, "analysis.candidateId"), candidateHash: hash(a.candidateHash, "analysis.candidateHash"),
      candidateSchemaVersion: literal(a.candidateSchemaVersion, EVIDENCE_ANALYSIS.version, "analysis.schema"), candidateOrigin: literal(a.candidateOrigin, "SYNTHETIC_TEST", "analysis.origin"),
      taskId: id(a.taskId, "analysis.taskId"), generation: integer(a.generation, "analysis.generation", 1000000), resultId: id(a.resultId, "analysis.resultId"),
      resultHash: hash(a.resultHash, "analysis.resultHash"), submissionId: id(a.submissionId, "analysis.submissionId"), recipeHash: hash(a.recipeHash, "analysis.recipeHash"),
      profileDefinitionHash: hash(a.profileDefinitionHash, "analysis.profileDefinitionHash") } };
}
export function previousVersion(value: unknown) {
  return nullable(value, raw => { const r = record(raw, ["id", "contentHash"], "previousVersion"); return { id: id(r.id, "previousVersion.id"), contentHash: hash(r.contentHash, "previousVersion.contentHash") }; });
}
export function editedSections(value: unknown): EditedSection[] {
  let total = 0;
  const sections = array(value, LIMITS.beats, "sections", 1).map(raw => {
    const s = record(raw, ["sectionId", "paragraphs"], "sections"); let count = 0;
    const paragraphs = array(s.paragraphs, LIMITS.claimsPerBeat, "paragraphs", 1).map(raw => {
      const spoken = text(raw, LIMITS.narrationPerBeat, "paragraph.text");
      if (!/\p{Script=Myanmar}/u.test(spoken) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u.test(spoken)) rejectVersion("R4_INVALID_INPUT");
      count += [...spoken].length; return spoken;
    });
    if (count > LIMITS.narrationPerBeat) rejectVersion("R4_INVALID_INPUT");
    total += count; return { sectionId: id(s.sectionId, "sectionId"), paragraphs };
  });
  if (total > LIMITS.narrationTotal) rejectVersion("R4_INVALID_INPUT");
  unique(sections, row => row.sectionId, "sections"); return sections;
}
export function parseSave(value: unknown): SaveStudioEdit {
  // Capture JSON before any array methods or awaits. Canonical serialization
  // rejects accessors; decoding also removes inherited array method overrides.
  const captured: unknown = JSON.parse(canonicalJson(value, STUDIO_EDIT.maxBytes));
  const r = record(captured, ["scope", "binding", "expectedRevision", "previousVersion", "idempotencyKey", "sections"], "save");
  const result = { scope: taskScope(r.scope), binding: originalBinding(r.binding), expectedRevision: integer(r.expectedRevision, "expectedRevision", 1000000),
    previousVersion: previousVersion(r.previousVersion), idempotencyKey: id(r.idempotencyKey, "idempotencyKey"), sections: editedSections(r.sections) };
  if ((result.expectedRevision === 0) !== (result.previousVersion === null)) rejectVersion("R4_REVISION_CONFLICT");
  if (canonicalJson(result.scope) !== canonicalJson({ projectId: result.binding.source.projectId, movieId: result.binding.source.movieId, studioId: result.binding.source.studioId })) rejectVersion("R4_PARENT_MISMATCH");
  return result;
}
export function parseEditedVersion(value: unknown): EditedVersionPayload {
  const captured: unknown = JSON.parse(canonicalJson(value, STUDIO_EDIT.maxBytes));
  const r = record(captured, ["scope", "binding", "expectedRevision", "previousVersion", "idempotencyKey", "sections", "schemaVersion", "origin", "id", "version", "createdAt", "editor", "review"], "version");
  const input = parseSave(Object.fromEntries(["scope", "binding", "expectedRevision", "previousVersion", "idempotencyKey", "sections"].map(key => [key, r[key]])));
  const editor = record(r.editor, ["tenantId", "principalId"], "editor");
  if (canonicalJson(r.review) !== canonicalJson(unapprovedEdit) || r.version !== input.expectedRevision + 1) rejectVersion("R4_INVALID_INPUT");
  return { ...input, schemaVersion: literal(r.schemaVersion, STUDIO_EDIT.version, "version.schema"), origin: literal(r.origin, "SYNTHETIC_TEST_EDIT", "version.origin"),
    id: id(r.id, "version.id"), version: integer(r.version, "version.number", 1000001), createdAt: date(r.createdAt, "createdAt"),
    editor: { tenantId: id(editor.tenantId, "editor.tenantId"), principalId: id(editor.principalId, "editor.principalId") }, review: unapprovedEdit };
}
export function editedContentHash(payload: EditedVersionPayload) { return contractHash(STUDIO_EDIT.hashDomain, parseEditedVersion(payload)); }
