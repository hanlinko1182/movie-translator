import { enumeration, integer, record } from "../validation";
import { STORY_TASK_LIMITS, STORY_TASK_STATES, type StoryTaskState } from "./contracts";
import { taskFail } from "./errors";

export const STORY_TASK_ACTIONS = [
  "CLAIM_LEASE", "RETRY_BEFORE_SUBMISSION", "EXHAUST_BEFORE_SUBMISSION", "ACKNOWLEDGE_CHECKPOINT",
  "MARK_OUTCOME_UNKNOWN", "STORE_VALID_RESULT", "STORE_INVALID_RESULT", "CANCEL",
  "FINISH_CANCELLED", "RESOLVE_ORIGINAL_VALID", "RESOLVE_ORIGINAL_INVALID", "RETRY_TERMINAL",
] as const;
export type StoryTaskAction = typeof STORY_TASK_ACTIONS[number];
export type StoryTaskTransitionSnapshot = {
  state: StoryTaskState; generation: number; checkpoint: "ABSENT" | "ACKNOWLEDGED" | "RESULT_STORED";
  sendPermitEverIssued: boolean; unresolvedSubmission: boolean; preSubmissionAttempts: number; cancelRequested: boolean;
  confirmation: "UNBOUND" | "CONSUMED_CURRENT" | "CONSUMED_EXPIRED";
};
export type StoryTaskTransitionDecision = {
  state: StoryTaskState; generation: number; cancelRequested: boolean;
  requiresFreshConfirmation: boolean; providerSubmissionAuthorized: false;
};

function parseSnapshot(value: unknown): StoryTaskTransitionSnapshot {
  const p = "transition.snapshot", row = record(value,
    ["state", "generation", "checkpoint", "sendPermitEverIssued", "unresolvedSubmission", "preSubmissionAttempts", "cancelRequested", "confirmation"], p);
  const state = enumeration(row.state, STORY_TASK_STATES, `${p}.state`);
  const generation = integer(row.generation, `${p}.generation`, STORY_TASK_LIMITS.maxGeneration);
  const checkpoint = enumeration(row.checkpoint, ["ABSENT", "ACKNOWLEDGED", "RESULT_STORED"], `${p}.checkpoint`);
  const preSubmissionAttempts = integer(row.preSubmissionAttempts, `${p}.preSubmissionAttempts`, 3);
  const confirmation = enumeration(row.confirmation, ["UNBOUND", "CONSUMED_CURRENT", "CONSUMED_EXPIRED"], `${p}.confirmation`);
  for (const field of ["sendPermitEverIssued", "unresolvedSubmission", "cancelRequested"] as const) {
    if (typeof row[field] !== "boolean") taskFail("STORY_TASK_INVALID", `${p}.${field}`);
  }
  const sendPermitEverIssued = row.sendPermitEverIssued as boolean;
  const unresolvedSubmission = row.unresolvedSubmission as boolean;
  const cancelRequested = row.cancelRequested as boolean;
  if (checkpoint === "ABSENT" && (sendPermitEverIssued || unresolvedSubmission) ||
    checkpoint === "RESULT_STORED" && unresolvedSubmission ||
    state === "QUEUED" && (checkpoint !== "ABSENT" || sendPermitEverIssued) ||
    state === "LEASED" && checkpoint === "RESULT_STORED" ||
    (state === "SUBMITTED" || state === "UNKNOWN" || state === "COMPLETED") && checkpoint === "ABSENT" ||
    state === "COMPLETED" && checkpoint !== "RESULT_STORED" ||
    checkpoint !== "ABSENT" && confirmation === "UNBOUND") taskFail("STORY_TASK_INVALID", p);
  return { state, generation, checkpoint, sendPermitEverIssued, unresolvedSubmission, preSubmissionAttempts, cancelRequested, confirmation };
}

/** Structural safety check only. Future DB code must prove checkpoint/owner/result evidence itself. */
export function canAutomaticallyRetryBeforeSubmission(value: unknown): boolean {
  const s = parseSnapshot(value);
  return s.state === "LEASED" && s.checkpoint === "ABSENT" && !s.sendPermitEverIssued && !s.unresolvedSubmission &&
    !s.cancelRequested && s.confirmation === "CONSUMED_CURRENT" && s.preSubmissionAttempts < 3;
}

/** A decision never creates a send permit, confirmation, database transition or provider request. */
export function decideStoryTaskTransition(snapshotValue: unknown, actionValue: unknown): StoryTaskTransitionDecision {
  const s = parseSnapshot(snapshotValue);
  const actionRow = record(actionValue, ["kind", "definitiveOriginalResultStored", "currentAtPublication", "freshConfirmationBound"], "transition.action");
  const kind = enumeration(actionRow.kind, STORY_TASK_ACTIONS, "transition.action.kind");
  for (const field of ["definitiveOriginalResultStored", "currentAtPublication", "freshConfirmationBound"] as const) {
    if (typeof actionRow[field] !== "boolean") taskFail("STORY_TASK_INVALID", `transition.action.${field}`);
  }
  const definitive = actionRow.definitiveOriginalResultStored as boolean;
  const current = actionRow.currentAtPublication as boolean;
  const fresh = actionRow.freshConfirmationBound as boolean;
  const output = (state: StoryTaskState, generation = s.generation, cancelRequested = s.cancelRequested,
    requiresFreshConfirmation = false): StoryTaskTransitionDecision => ({
    state, generation, cancelRequested, requiresFreshConfirmation, providerSubmissionAuthorized: false,
  });
  const invalid = (): never => taskFail("STORY_TASK_TRANSITION_INVALID", "transition.action");

  if (kind === "CLAIM_LEASE" && s.state === "QUEUED" && s.checkpoint === "ABSENT" && !s.cancelRequested) return output("LEASED");
  // A dispatch attempt is not a new paid generation or a refreshed grant.
  if (kind === "RETRY_BEFORE_SUBMISSION" && canAutomaticallyRetryBeforeSubmission(s)) return output("QUEUED");
  if (kind === "EXHAUST_BEFORE_SUBMISSION" && s.state === "LEASED" && s.checkpoint === "ABSENT" && !s.sendPermitEverIssued) return output("FAILED");
  if (kind === "ACKNOWLEDGE_CHECKPOINT" && s.state === "LEASED" && s.checkpoint === "ACKNOWLEDGED" && !s.cancelRequested && s.confirmation === "CONSUMED_CURRENT") return output("SUBMITTED");
  if (kind === "MARK_OUTCOME_UNKNOWN" && s.state === "SUBMITTED" && s.checkpoint === "ACKNOWLEDGED") return output("UNKNOWN");
  if (kind === "STORE_VALID_RESULT" && s.state === "SUBMITTED" && s.checkpoint === "RESULT_STORED" && definitive)
    return output(s.cancelRequested ? "CANCELLED" : current ? "COMPLETED" : "FAILED");
  if (kind === "STORE_INVALID_RESULT" && s.state === "SUBMITTED" && s.checkpoint === "RESULT_STORED" && definitive)
    return output(s.cancelRequested ? "CANCELLED" : "FAILED");
  if (kind === "CANCEL") {
    if ((s.state === "QUEUED" || s.state === "LEASED") && s.checkpoint === "ABSENT" && !s.sendPermitEverIssued) return output("CANCELLED", s.generation, true);
    if (s.state === "SUBMITTED" || s.state === "UNKNOWN") return output(s.state, s.generation, true);
  }
  if (kind === "FINISH_CANCELLED" && s.state === "SUBMITTED" && s.checkpoint === "RESULT_STORED" && s.cancelRequested && definitive) return output("CANCELLED");
  if (kind === "RESOLVE_ORIGINAL_VALID" && s.state === "UNKNOWN" && s.checkpoint === "RESULT_STORED" && definitive) return output(s.cancelRequested ? "CANCELLED" : current ? "COMPLETED" : "FAILED");
  if (kind === "RESOLVE_ORIGINAL_INVALID" && s.state === "UNKNOWN" && s.checkpoint === "RESULT_STORED" && definitive) return output(s.cancelRequested ? "CANCELLED" : "FAILED");
  if (kind === "RETRY_TERMINAL") {
    if (s.state === "UNKNOWN" || s.unresolvedSubmission || s.checkpoint === "ACKNOWLEDGED") taskFail("STORY_TASK_RETRY_UNSAFE", "transition.action");
    if ((s.state === "FAILED" || s.state === "CANCELLED") && fresh && s.generation < STORY_TASK_LIMITS.maxGeneration &&
      (s.checkpoint === "ABSENT" || s.checkpoint === "RESULT_STORED" && definitive)) return output("QUEUED", s.generation + 1, false, true);
  }
  return invalid();
}
