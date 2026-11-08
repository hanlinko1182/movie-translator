import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { freeze } from "../validation";
import { capture, deny, fields, integer, opaque, OFFLINE_VIDEO as V, intervalPolicy, restrictions, safeLabels,
  type HighlightPayload, type HighlightSegment, type OfflineHighlightPlan, type SyntheticVideoDescriptor } from "./contracts";
import { add, compare, parseSeconds, subtract, ZERO_SECONDS } from "./rational";
import { binding, requireDescriptor } from "./source";

const issued = new WeakMap<object, { source: SyntheticVideoDescriptor; request: unknown }>();
function project(source: SyntheticVideoDescriptor, request: unknown): HighlightPayload {
  const metadata = requireDescriptor(source), bound = binding(source);
  const r = fields(request, ["schemaVersion", "source", "overlap", "segments"]);
  if (r.schemaVersion !== V.selection || r.overlap !== "REJECT") deny("INVALID_POLICY");
  if (canonicalJson(r.source) !== canonicalJson(bound)) deny("SOURCE_BINDING_MISMATCH");
  if (!Array.isArray(r.segments) || !r.segments.length || r.segments.length > V.maxSegments) deny("SEGMENT_LIMIT");
  const seen = new Set<string>(), segments: HighlightSegment[] = []; let cursor = ZERO_SECONDS;
  for (const [i, value] of r.segments.entries()) {
    const s = fields(value, ["segmentId", "order", "start", "end", "label"]), segmentId = opaque(s.segmentId, "seg");
    if (seen.has(segmentId)) deny("DUPLICATE_SEGMENT_ID"); seen.add(segmentId);
    if (integer(s.order, 0, V.maxSegments - 1) !== i) deny("SEGMENT_ORDER");
    if (s.label !== null && !safeLabels.includes(s.label as typeof safeLabels[number])) deny("UNSAFE_LABEL");
    const start = parseSeconds(s.start), end = parseSeconds(s.end);
    if (compare(end, start) <= 0 || compare(end, metadata.duration) > 0) deny("INVALID_INTERVAL");
    if (i && compare(start, segments[i - 1].start) < 0) deny("SOURCE_ORDER");
    if (i && compare(start, segments[i - 1].end) < 0) deny("SOURCE_OVERLAP");
    const duration = subtract(end, start), outputEnd = add(cursor, duration);
    if (compare(outputEnd, { numerator: V.maxPlanSeconds, denominator: 1 }) > 0) deny("PLAN_DURATION_LIMIT");
    segments.push(freeze({ segmentId, order: i, source: bound, start, end, duration, outputStart: cursor, outputEnd,
      label: s.label as HighlightSegment["label"] })); cursor = outputEnd;
  }
  return freeze({ schemaVersion: V.plan, source: bound, sourceDuration: metadata.duration,
    durationEvidence: "SYNTHETIC_DECLARED_NOT_MEASURED", policy: intervalPolicy, segments, totalDuration: cursor, restrictions });
}
export function buildOfflineHighlightPlan(source: SyntheticVideoDescriptor, request: unknown): OfflineHighlightPlan {
  const captured = freeze(capture(request)), payload = project(source, captured), planHash = contractHash(V.plan, payload);
  const result = Object.freeze({ planId: `vhl-${planHash}`, planHash, payload }) as OfflineHighlightPlan;
  issued.set(result, { source, request: captured }); return result;
}
export function requirePlan(value: OfflineHighlightPlan): OfflineHighlightPlan {
  const original = issued.get(value); if (!original) deny("UNTRUSTED_PLAN");
  const payload = project(original.source, original.request), hash = contractHash(V.plan, payload);
  if (hash !== value.planHash || value.planId !== `vhl-${hash}` || canonicalJson(payload) !== canonicalJson(value.payload)) deny("PLAN_INTEGRITY");
  return value;
}
/** Identity/duration expectations are strict canonical contracts; never repair or substitute an original. */
export function validateOfflineHighlightPlan(plan: OfflineHighlightPlan, source: SyntheticVideoDescriptor, expected: unknown): OfflineHighlightPlan {
  requirePlan(plan); requireDescriptor(source);
  if (issued.get(plan)!.source !== source) deny("ORIGINAL_DESCRIPTOR_MISMATCH");
  const r = fields(capture(expected), ["planId", "planHash", "totalDuration"]), duration = parseSeconds(r.totalDuration, Number.MAX_SAFE_INTEGER);
  if (r.planId !== plan.planId || r.planHash !== plan.planHash || compare(duration, plan.payload.totalDuration) !== 0) deny("EXPECTED_PLAN_MISMATCH");
  return plan;
}
export function buildOfflineVideoTimelinePreview(plan: OfflineHighlightPlan) {
  requirePlan(plan);
  return freeze({ schemaVersion: V.preview, planId: plan.planId, planHash: plan.planHash, source: plan.payload.source,
    segments: plan.payload.segments, start: ZERO_SECONDS, end: plan.payload.totalDuration,
    synchronization: "PREVIEW_ONLY", timestampPrecision: "MATHEMATICAL_ONLY_NOT_FRAME_VERIFIED", restrictions });
}
