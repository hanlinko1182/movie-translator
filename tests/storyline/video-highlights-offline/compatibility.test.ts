import assert from "node:assert/strict";
import { test } from "node:test";
import { assessNarrationCompatibility as assess, buildOfflineHighlightPlan, OfflineVideoError } from "../../../lib/storyline/video-highlights-offline";
import type { NarrationCandidate } from "../../../lib/storyline/narration-intake/candidates";
import { buildNarrationTimingPreview } from "../../../lib/storyline/narration-intake/preview";
import { fixture, narration, seconds } from "./fixture";
for (const [duration, relation, delta] of [[31, "VIDEO_LONGER", 1], [32, "EQUAL", 0], [33, "VIDEO_SHORTER", -1]] as const) {
  test(`measured narration ${duration}s: ${relation}, exact difference ${delta}, never synchronized/approved`, () => {
    const f = fixture(), p = buildOfflineHighlightPlan(f.source, f.request), audio = narration(duration * 8000);
    const before = JSON.stringify({ p, audio }), a = assess(p, audio), b = assess(p, audio);
    assert.deepEqual(a, b); assert.deepEqual(a.videoDuration, seconds(32)); assert.deepEqual(a.narrationDuration, seconds(duration));
    assert.deepEqual(a.differenceVideoMinusNarration, seconds(delta)); assert.equal(a.relation, relation);
    assert.equal(a.status, "PREVIEW_ONLY"); assert.equal(a.restrictions.narrationSyncVerified, false); assert.equal(a.adjustments, "NONE");
    assert.equal(a.restrictions.productionEligible, false); assert.ok(a.synchronizationWorkRequired.includes("EXACT_SCRIPT_BINDING"));
    assert.ok(a.missingEvidence.includes("EXACT_SCRIPT_BINDING"));
    assert.equal(JSON.stringify({ p, audio }), before);
  });
}
test("non-millisecond measured PCM duration remains exact; missing narration is explicit", () => {
  const f = fixture(), p = buildOfflineHighlightPlan(f.source, f.request), a = assess(p, narration(101, 24000));
  assert.deepEqual(a.narrationDuration, seconds(101, 24000)); assert.deepEqual(a.differenceVideoMinusNarration, seconds(767899, 24000));
  const missing = assess(p, null); assert.equal(missing.relation, "UNKNOWN"); assert.equal(missing.narrationDuration, null);
  assert.equal(missing.differenceVideoMinusNarration, null); assert.deepEqual(missing.missingEvidence, ["MEASURED_NARRATION_CANDIDATE"]);
});
test("copied audio candidate/preview, stored metadata, positive feedback and fake M8 receipt cannot provide trusted duration", () => {
  const f = fixture(), p = buildOfflineHighlightPlan(f.source, f.request), audio = narration(101);
  for (const value of [JSON.parse(JSON.stringify(audio)), buildNarrationTimingPreview(audio), { measured: { durationSeconds: seconds(32) } },
    { listeningFeedback: "GOOD", duration: seconds(32) }, { schemaVersion: "story-recap-execution-artifact-v1", duration: seconds(32) }, undefined]) {
    assert.throws(() => assess(p, value as NarrationCandidate), (e: unknown) => e instanceof OfflineVideoError && e.code === "UNTRUSTED_NARRATION");
  }
});
