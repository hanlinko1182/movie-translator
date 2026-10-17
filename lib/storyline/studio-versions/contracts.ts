import type { Immutable } from "../contracts";
import type { StoryTaskScope } from "../jobs/service-boundary";
import type { NarrationAnalysisDependency, NarrationSourceBinding } from "../narration/contracts";

export const STUDIO_EDIT = {
  version: "story-edited-narration-v1", hashDomain: "story-edited-narration-v1",
  proposalDomain: "story-edited-narration-proposal-v1", authDomain: "disposable-story-r4-auth-v1",
  maxBytes: 524288, maxHistory: 50,
} as const;
export type OriginalIdentity = { id: string; draftHash: string };
export type OriginalBinding = {
  original: OriginalIdentity & { payloadId: string };
  source: NarrationSourceBinding;
  analysis: NarrationAnalysisDependency;
};
export type EditedSection = { sectionId: string; paragraphs: string[] };
export type PreviousVersion = { id: string; contentHash: string };
export type SaveStudioEdit = {
  scope: StoryTaskScope; binding: OriginalBinding;
  expectedRevision: number; previousVersion: PreviousVersion | null;
  idempotencyKey: string; sections: EditedSection[];
};
export const unapprovedEdit = Object.freeze({
  humanApproval: "NONE", sourceVerified: false, semanticReview: "NOT_REVIEWED",
  eligibleForTts: false, readyForPublication: false,
} as const);
export type EditedVersionPayload = SaveStudioEdit & {
  schemaVersion: typeof STUDIO_EDIT.version; origin: "SYNTHETIC_TEST_EDIT";
  id: string; version: number; createdAt: string;
  editor: { tenantId: string; principalId: string };
  review: typeof unapprovedEdit;
};
export type StudioOriginalView = Immutable<{
  status: "ORIGINAL"; binding: OriginalBinding;
  currentness: "CURRENT_AT_READ" | "STALE_DEPENDENCIES";
  latestRevision: number; latestVersion: PreviousVersion | null;
  sections: (EditedSection & { heading: string; beatId: string; order: number; focus: string })[];
  review: typeof unapprovedEdit;
}>;
export type StudioSavedView = Immutable<Omit<EditedVersionPayload, "idempotencyKey"> & {
  status: "SAVED_VERSION"; contentHash: string;
  currentness: "CURRENT_AT_READ" | "CURRENT_AT_SAVE" | "STALE_DEPENDENCIES";
}>;
export type StudioVersionSummary = Immutable<{
  id: string; contentHash: string; version: number; previousVersion: PreviousVersion | null;
  createdAt: string; editor: { tenantId: string; principalId: string };
}>;
export type StudioHistoryView = Immutable<{
  status: "VERSION_HISTORY"; binding: OriginalBinding;
  currentness: StudioOriginalView["currentness"];
  versions: StudioVersionSummary[]; nextAfterVersion: number | null;
  review: typeof unapprovedEdit;
}>;
