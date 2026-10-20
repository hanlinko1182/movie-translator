import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { freeze, integer } from "../validation";
import { HIGHLIGHTS } from "../highlights/contracts";
import { RENDER_PLANNING as R, renderRestrictions, type RenderRecipe, type RenderRecipePayload, type RenderSegment, type SyntheticRenderPlanningResolver } from "./contracts";
import { exactUnits, parseRenderPlanningInput, rejectRender, renderGuard, renderSame } from "./input";
import { parseRenderRecipe } from "./recipe";
import { resolveRenderPlanning } from "./resolution";

export async function generateRenderRecipe(value: unknown, resolver: SyntheticRenderPlanningResolver): Promise<RenderRecipe> {
  const input = parseRenderPlanningInput(value), resolved = await resolveRenderPlanning(input, resolver);
  return renderGuard(() => {
    const { plan: { plan }, profile, sourceObservation, dependency } = resolved;
    const fps = profile.frameRate, tickRate = { numerator: profile.timebase.denominator, denominator: profile.timebase.numerator };
    const frames = (ms: number) => exactUnits(ms, fps, "FRAME_BOUNDARY_UNREPRESENTABLE");
    const ticks = (ms: number) => exactUnits(ms, tickRate, "UNSUPPORTED_TIMEBASE");
    let cursor = 0, frameCursor = 0, tickCursor = 0;
    const segments: RenderSegment[] = plan.segments.map((s, i) => {
      for (const ms of [s.sourceStartMs, s.sourceEndMs, s.durationMs, s.outputStartMs, s.outputEndMs]) integer(ms, "render.ms", R.maxDurationMs);
      if (s.sourceEndMs > sourceObservation.fingerprint.durationMs || s.sourceStartMs >= s.sourceEndMs) rejectRender("SOURCE_OUT_OF_BOUNDS");
      if (s.outputStartMs !== cursor || s.outputEndMs - s.outputStartMs !== s.durationMs || s.sourceEndMs - s.sourceStartMs !== s.durationMs || s.presentationIndex !== i) rejectRender("INTEGRITY_FAILED");
      const sourceStartFrame = frames(s.sourceStartMs), sourceEndFrame = frames(s.sourceEndMs), outputStartFrame = frames(s.outputStartMs), outputEndFrame = frames(s.outputEndMs), frameCount = frames(s.durationMs);
      const sourceStartTick = ticks(s.sourceStartMs), sourceEndTick = ticks(s.sourceEndMs), outputStartTick = ticks(s.outputStartMs), outputEndTick = ticks(s.outputEndMs), durationTicks = ticks(s.durationMs);
      if (outputStartFrame !== frameCursor || outputStartTick !== tickCursor || sourceEndFrame - sourceStartFrame !== frameCount || outputEndFrame - outputStartFrame !== frameCount ||
        sourceEndTick - sourceStartTick !== durationTicks || outputEndTick - outputStartTick !== durationTicks) rejectRender("INTEGRITY_FAILED");
      cursor = s.outputEndMs; frameCursor = outputEndFrame; tickCursor = outputEndTick;
      const c = s.candidate;
      return { timelineSegmentId: s.id, candidateId: c.id, candidateHash: contractHash(HIGHLIGHTS.candidate, c), presentationIndex: i, sourceChronologyIndex: plan.sourceOrder.indexOf(s.id),
        sourceStartMs: s.sourceStartMs, sourceEndMs: s.sourceEndMs, outputStartMs: s.outputStartMs, outputEndMs: s.outputEndMs, durationMs: s.durationMs,
        sourceStartFrame, sourceEndFrame, outputStartFrame, outputEndFrame, frameCount, sourceStartTick, sourceEndTick, outputStartTick, outputEndTick, durationTicks, transition: "CUT_ONLY",
        provenance: { findingId: c.findingId, claimIds: c.claimIds, characterIds: c.characterIds, relationshipId: c.relationshipId, classification: c.classification, category: c.category,
          statement: c.statement, confidence: c.confidence, uncertainty: c.uncertainty, qualification: c.qualification, observedBasisIds: c.observedBasisIds, evidence: c.evidence, contradictions: c.contradictions } };
    });
    if (!segments.length || segments.length > 64 || cursor !== plan.totalOutputMs || frames(cursor) !== frameCursor || ticks(cursor) !== tickCursor) rejectRender("INTEGRITY_FAILED");
    const recipe: RenderRecipePayload = { schemaVersion: R.recipe, input, inputHash: contractHash(R.input, input), timelinePlanHash: input.timeline.planHash,
      dependency, dependencyHash: contractHash(R.dependency, dependency), sourceObservation, sourceObservationHash: contractHash(R.source, sourceObservation),
      profile, profileHash: contractHash(R.profile, profile), policyHash: contractHash(R.policy, input.policy), segments,
      sourceOrder: plan.sourceOrder, presentationOrder: plan.presentationOrder, totalOutputMs: cursor, totalOutputFrames: frameCursor, totalOutputTicks: tickCursor,
      audio: "EXCLUDE_ALL", outputAudioTracks: 0, historicalFakeAudio: plan.audio, restrictions: renderRestrictions };
    canonicalJson(recipe, R.recipeBytes);
    const recipeHash = contractHash(R.recipe, recipe), result = { id: `rr-${recipeHash}`, recipe, recipeHash };
    canonicalJson(result, R.recipeBytes); return freeze(result);
  }, "INTEGRITY_FAILED");
}
/** Reacquire once and regenerate ALL content; self-consistency is never admission. */
export async function validateRenderRecipe(value: unknown, expectedInput: unknown, resolver: SyntheticRenderPlanningResolver): Promise<RenderRecipe> {
  const candidate = parseRenderRecipe(value), input = parseRenderPlanningInput(expectedInput);
  const expected = await generateRenderRecipe(input, resolver);
  if (!renderSame(candidate, expected)) rejectRender("INTEGRITY_FAILED");
  return expected;
}
