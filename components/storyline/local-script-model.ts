import { LIMITS } from "@/lib/storyline/contracts";
import type { Immutable, StoryCapturedObservation, StorySourcePayload, StorySourceSnapshot } from "@/lib/storyline/contracts";
import type { ValidatedEvidenceAnalysisCandidate } from "@/lib/storyline/evidence-analysis/contracts";
import type { NarrationDraft } from "@/lib/storyline/narration/contracts";

/** UI-only, explicitly injected synthetic input. No loader, database or authority.
 * Deliberately excludes private preparation, media locations and raw responses. */
export type StudioPreviewArtifact = {
  purpose: "SYNTHETIC_TEST_ONLY";
  currentness: "CURRENT_AT_READ" | "STALE" | "UNKNOWN";
  draft: NarrationDraft;
  candidate: ValidatedEvidenceAnalysisCandidate;
  source: Pick<StorySourceSnapshot, "sourceContentHash" | "sourceContextHash"> & {
    payload: Immutable<Pick<StorySourcePayload, "id" | "projectId" | "movieId" | "transcript" | "scenes" | "characters" | "relationships">>;
    dependencyHash: string;
    bindingHash: string;
    mediaSha256: string;
    observations: readonly Immutable<Pick<StoryCapturedObservation, "id" | "anchor" | "sceneId" | "transcriptSegmentId" | "ownerKind" | "ownerId" | "evidenceText">>[];
  };
};

export type StudioPreviewState =
  | { status: "LOADING" | "EMPTY" | "ERROR" | "UNAVAILABLE" }
  | { status: "READY"; artifact: StudioPreviewArtifact };

/** Consistency checks for presentation, never authentication or validation. */
export function scopedPreview(state: StudioPreviewState | undefined, projectId: string, movieId: string | null): StudioPreviewState | undefined {
  if (state?.status !== "READY") return state;
  const { draft, candidate, source, purpose } = state.artifact;
  const d = draft.payload, c = candidate.payload, s = source.payload;
  const matches = purpose === "SYNTHETIC_TEST_ONLY" && d.origin === "SYNTHETIC_TEST" && c.origin === "SYNTHETIC_TEST" &&
    d.source.projectId === projectId && d.source.movieId === movieId && s.projectId === projectId && s.movieId === movieId &&
    s.transcript.movieId === movieId &&
    (Object.keys(c.source) as (keyof typeof c.source)[]).every(key => c.source[key] === d.source[key]) &&
    d.source.snapshotId === s.id && d.source.contentHash === source.sourceContentHash &&
    d.source.contextHash === source.sourceContextHash && d.source.dependencyHash === source.dependencyHash &&
    d.source.bindingHash === source.bindingHash && d.source.mediaSha256 === source.mediaSha256 &&
    d.analysis.candidateHash === candidate.candidateHash && d.analysis.candidateOrigin === c.origin &&
    d.analysis.candidateSchemaVersion === c.schemaVersion && d.analysis.taskId === c.task.taskId &&
    d.analysis.generation === c.task.generation && d.analysis.recipeHash === c.task.recipeHash;
  return matches ? state : { status: "UNAVAILABLE" };
}

export function previewSessionKey(projectId: string, movieId: string | null, state?: StudioPreviewState): string {
  if (state?.status !== "READY") return JSON.stringify([projectId, movieId, state?.status]);
  const { draft, candidate, source } = state.artifact;
  return JSON.stringify([projectId, movieId, draft.payload.id, draft.draftHash, draft.payload.source,
    draft.payload.analysis, draft.payload.parentDraft, candidate.candidateHash, source.sourceContentHash, source.sourceContextHash]);
}

export type LocalScript = Readonly<Record<string, readonly string[]>>;
export function originalSectionText(artifact: StudioPreviewArtifact, sectionId: string): readonly string[] {
  const section = artifact.draft.payload.sections.find(row => row.id === sectionId);
  return artifact.draft.payload.beats.find(row => row.id === section?.beatId)?.narration.map(row => row.text) ?? [];
}
export function sectionText(artifact: StudioPreviewArtifact, edits: LocalScript, sectionId: string): readonly string[] {
  return edits[sectionId] ?? originalSectionText(artifact, sectionId);
}
export function sectionDirty(artifact: StudioPreviewArtifact, edits: LocalScript, sectionId: string): boolean {
  return JSON.stringify(sectionText(artifact, edits, sectionId)) !== JSON.stringify(originalSectionText(artifact, sectionId));
}
export function dirtySectionCount(artifact: StudioPreviewArtifact, edits: LocalScript): number {
  return artifact.draft.payload.sections.filter(row => sectionDirty(artifact, edits, row.id)).length;
}

export function editParagraph(artifact: StudioPreviewArtifact, edits: LocalScript, sectionId: string, index: number, text: string):
  { ok: true; edits: LocalScript } | { ok: false; error: string } {
  const original = originalSectionText(artifact, sectionId);
  if (!Number.isInteger(index) || index < 0 || index >= original.length) return { ok: false, error: "Paragraph reference unavailable." };
  // Exact Unicode is retained. Reject invalid text; never normalize or truncate.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text) ||
      Array.from(text).some(char => char.length === 1 && /[\ud800-\udfff]/u.test(char)))
    return { ok: false, error: "Text contains unsupported control characters or malformed Unicode." };
  const next = [...sectionText(artifact, edits, sectionId)];
  next[index] = text;
  const count = (rows: readonly string[]) => rows.reduce((sum, row) => sum + Array.from(row).length, 0);
  if (count(next) > LIMITS.narrationPerBeat) return { ok: false, error: `Section limit: ${LIMITS.narrationPerBeat} Unicode characters. Text was not changed.` };
  const total = artifact.draft.payload.sections.reduce((sum, section) => sum + count(section.id === sectionId ? next : sectionText(artifact, edits, section.id)), 0);
  if (total > LIMITS.narrationTotal) return { ok: false, error: `Script limit: ${LIMITS.narrationTotal} Unicode characters. Text was not changed.` };
  return { ok: true, edits: { ...edits, [sectionId]: next } };
}

export function resetSection(edits: LocalScript, sectionId: string): LocalScript {
  const next = { ...edits };
  delete next[sectionId];
  return next;
}
