import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { freeze, hash, record } from "../validation";
import { TIMELINE as T, TimelineError, timelineRestrictions, type RecapTimelinePlan, type SyntheticTimelineResolver } from "./contracts";
import { parseRecapTimelineInput } from "./input";
import { resolveTimeline } from "./resolution";

function milliseconds(n: number) {
  if (!Number.isSafeInteger(n) || Object.is(n, -0) || n < 0) throw new TimelineError("INTEGRITY_FAILED");
  return n;
}
export async function generateRecapTimelinePlan(value: unknown, resolver: SyntheticTimelineResolver): Promise<RecapTimelinePlan> {
  const input = parseRecapTimelineInput(value), resolved = await resolveTimeline(input, resolver), m6 = resolved.plan;
  const chosen = m6.decisions.filter(d => d.status === "SELECTED").map(d => d.candidateId);
  const order = m6.presentationOrder;
  if (chosen.length > 64 || new Set(chosen).size !== chosen.length || order.length !== chosen.length ||
    new Set(order).size !== order.length || order.some(id => !chosen.includes(id))) throw new TimelineError("INTEGRITY_FAILED");
  const candidates = order.map(id => {
    const matches = m6.candidates.filter(c => c.id === id);
    if (matches.length !== 1) throw new TimelineError("INTEGRITY_FAILED");
    return matches[0];
  });
  const chronological = [...candidates].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (canonicalJson(chronological.map(c => c.id)) !== canonicalJson(m6.sourceOrder)) throw new TimelineError("INTEGRITY_FAILED");
  chronological.forEach((c, i) => {
    milliseconds(c.startMs); milliseconds(c.endMs);
    if (c.startMs >= c.endMs || c.endMs > m6.input.source.media.durationMs || i > 0 && chronological[i - 1].endMs > c.startMs) throw new TimelineError("INTEGRITY_FAILED");
  });
  let cursor = 0;
  const segments = candidates.map((candidate, presentationIndex) => {
    const durationMs = milliseconds(candidate.endMs - candidate.startMs), outputStartMs = cursor;
    cursor = milliseconds(cursor + durationMs);
    const body = { schemaVersion: T.segment, scope: input.scope, selected: input.selected, source: m6.input.source, candidate,
      presentationIndex, sourceStartMs: candidate.startMs, sourceEndMs: candidate.endMs, durationMs,
      outputStartMs, outputEndMs: cursor, restrictions: timelineRestrictions };
    return { ...body, id: `tlseg-${contractHash(T.segment, body)}` };
  });
  if (cursor !== milliseconds(m6.totalSourceMs)) throw new TimelineError("INTEGRITY_FAILED");
  const segmentId = (id: string) => segments.find(s => s.candidate.id === id)!.id;
  const plan = { schemaVersion: T.plan, input, inputHash: contractHash(T.input, input), policyHash: contractHash(T.policy, input.policy),
    headRevision: resolved.revision, dependency: resolved.dependency, source: m6.input.source, segments,
    sourceOrder: m6.sourceOrder.map(segmentId), presentationOrder: order.map(segmentId), omissions: m6.gaps,
    audio: m6.input.audio, totalOutputMs: cursor, restrictions: timelineRestrictions };
  canonicalJson(plan, T.maxBytes);
  const planHash = contractHash(T.plan, plan);
  const result = { id: `tl-${planHash}`, plan, planHash };
  canonicalJson(result, T.maxBytes);
  return freeze(result);
}
/** Reacquire authoritative observations and compare ALL content, even after a canonical rehash. */
export async function validateRecapTimelinePlan(value: unknown, expectedInput: unknown, resolver: SyntheticTimelineResolver): Promise<RecapTimelinePlan> {
  try {
    const r = record(JSON.parse(canonicalJson(value, T.maxBytes)), ["id", "plan", "planHash"], "timeline.plan");
    const expected = await generateRecapTimelinePlan(expectedInput, resolver);
    if (hash(r.planHash, "timeline.hash") !== contractHash(T.plan, r.plan) || canonicalJson(r) !== canonicalJson(expected)) throw new TimelineError("INVALID_PLAN");
    return expected;
  } catch (error) {
    if (error instanceof TimelineError) throw error;
    throw new TimelineError("INVALID_PLAN");
  }
}
