import type { StoryEvent } from "./contracts";

export const DURATION_ENGINE = Object.freeze({ version: "story-duration-plan-v1", policy: "auto-story-v1", bytes: 512 * 1024, visualIntervals: 400, arcStates: 12 });
export type SourceInterval = { startMs: number; endMs: number };
export type CandidateCharacterArc = { id: string; characterId: string; states: { eventId: string; claimIds: string[] }[] };
export type CandidateVisualInterval = SourceInterval & {
  id: string; movieId: string; sourceSha256: string; availability: "AVAILABLE" | "UNAVAILABLE"; eventIds: string[];
};
export type StoryComplexityInventory = { events: StoryEvent[]; characterArcs: CandidateCharacterArc[]; visualIntervals: CandidateVisualInterval[] };
/** No installed numeric default and no calibration claim. All coefficients must be explicit. */
export type AutoStoryPolicy = {
  id: "auto-story-v1"; coefficientSetId: string; calibrationId: null; calibrationStatus: "UNCALIBRATED";
  caps: { events: number; characterArcs: number; conflictsAndDecisions: number; relationshipChanges: number };
  weightsMs: { event: number; characterArc: number; conflictOrDecision: number; relationshipChange: number };
  evidence: { basePermille: number; additionalPermille: number; fullCoveragePermille: number };
  maxBudgetMs: number; runtimeCapPermille: number; softFloorMs: number; runtimeFloorPermille: number;
};
