import "server-only";
// Pure intake submodules only: the barrel includes private-file access and is deliberately not imported.
import { buildNarrationTimingPreview } from "../narration-intake/preview";
import type { NarrationCandidate } from "../narration-intake/candidates";
import { freeze } from "../validation";
import { deny, OFFLINE_VIDEO as V, restrictions, type OfflineHighlightPlan } from "./contracts";
import { compare, subtract, ZERO_SECONDS } from "./rational";
import { requirePlan } from "./planner";

export function assessNarrationCompatibility(plan: OfflineHighlightPlan, narration: NarrationCandidate | null) {
  requirePlan(plan); const videoDuration = plan.payload.totalDuration;
  const common = { schemaVersion: V.compatibility, planId: plan.planId, planHash: plan.planHash,
    videoDuration, videoDurationEvidence: "SYNTHETIC_DECLARED_NOT_MEASURED", status: "PREVIEW_ONLY",
    synchronizationWorkRequired: ["EXACT_SCRIPT_BINDING", "HUMAN_LISTENING_ACCEPTANCE", "REAL_VIDEO_VERIFICATION", "SEPARATE_SYNCHRONIZATION_POLICY"],
    adjustments: "NONE", restrictions } as const;
  if (narration === null) return freeze({ ...common, narrationDuration: null, differenceVideoMinusNarration: null,
    narrationDurationEvidence: "MISSING", relation: "UNKNOWN", missingEvidence: ["MEASURED_NARRATION_CANDIDATE"] } as const);
  let timing: ReturnType<typeof buildNarrationTimingPreview>;
  try { timing = buildNarrationTimingPreview(narration); } catch { return deny("UNTRUSTED_NARRATION"); }
  const difference = subtract(videoDuration, timing.end), sign = compare(difference, ZERO_SECONDS);
  return freeze({ ...common, narrationDuration: timing.end, narrationDurationEvidence: "LOCAL_AUDIO_INTEGRITY_VERIFIED",
    narrationSha256: timing.audioSha256, differenceVideoMinusNarration: difference,
    relation: sign < 0 ? "VIDEO_SHORTER" : sign > 0 ? "VIDEO_LONGER" : "EQUAL",
    missingEvidence: ["EXACT_SCRIPT_BINDING", "INDEPENDENT_QUALIFIED_LISTENING", "VERIFIED_REAL_VIDEO"] } as const);
}
