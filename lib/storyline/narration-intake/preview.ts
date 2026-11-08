import "server-only";
import { freeze } from "../validation";
import { deny, exact, INTAKE, rational, restrictions } from "./contracts";
import { requireCandidate, type NarrationCandidate } from "./candidates";

/** Pure duration projection; no M7 conversion, rounding, persistence or video synchronization. */
export function buildNarrationTimingPreview(candidate: NarrationCandidate, claimedDuration?: unknown) {
  const metadata = requireCandidate(candidate), end = metadata.measured.durationSeconds;
  if (claimedDuration !== undefined) {
    const r = exact(claimedDuration, ["numerator", "denominator"]);
    if (typeof r.numerator !== "number" || typeof r.denominator !== "number") deny("INVALID_DURATION");
    const claimed = rational(r.numerator, r.denominator);
    if (claimed.numerator !== end.numerator || claimed.denominator !== end.denominator) deny("DURATION_MISMATCH");
  }
  return freeze({ schemaVersion: INTAKE.preview, candidateId: metadata.candidateId,
    audioSha256: metadata.measured.sha256, unit: "RATIONAL_SECONDS", interval: "HALF_OPEN",
    start: rational(0, 1), end, track: "narration", synchronization: "PREVIEW_ONLY", restrictions });
}
