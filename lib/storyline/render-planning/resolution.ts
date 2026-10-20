import "server-only";
import { contractHash } from "../canonical";
import { date, freeze, integer, literal, record } from "../validation";
import { HIGHLIGHTS } from "../highlights/contracts";
import { TIMELINE, TimelineError } from "../timeline/contracts";
import { TIMELINE_STORE, parseRecordIdentity, parseStoredRecord, parseStoreScope, type TimelineRecordView } from "../timeline-persistence/contracts";
import { parseTimelineDependency, replayCurrentTimeline, validateHistoricalTimelineIntegrity } from "../timeline-persistence/resolution";
import { RENDER_PLANNING as R, RenderPlanningError, renderRestrictions,
  type RenderDependencySnapshot, type RenderPlanningInput, type SyntheticRenderPlanningResolver } from "./contracts";
import { parseSyntheticRenderProfile, parseSyntheticSourceObservation, rejectRender, renderCapture, renderGuard, renderSame } from "./input";
import type { Immutable } from "../contracts";

export const renderTimelineIdentity = (v: TimelineRecordView) => ({ id: v.record.id, version: v.record.version,
  recordHash: v.recordHash, recordHashDomain: TIMELINE_STORE.record, planHash: v.record.plan.planHash, planHashDomain: TIMELINE.plan });

async function capturedTimeline(value: unknown, scope: RenderPlanningInput["scope"]) {
  const r = record(value, ["view", "dependency"], "render.capture");
  const view = record(r.view, ["record", "recordHash", "currentness"], "render.view");
  const stored = parseStoredRecord(view.record), dependency = parseTimelineDependency(r.dependency, scope);
  if (!["CURRENT_AT_READ", "STALE_DEPENDENCIES", "SUPERSEDED"].includes(view.currentness as string) ||
    !renderSame(stored.scope, scope) || contractHash(TIMELINE_STORE.record, stored) !== view.recordHash ||
    dependency.id !== stored.dependencyId || dependency.hash !== stored.dependencyHash) rejectRender("INTEGRITY_FAILED");
  await validateHistoricalTimelineIntegrity(stored.plan, stored.plan.plan.input, dependency);
  return { view: { record: stored, recordHash: view.recordHash as string, currentness: view.currentness as TimelineRecordView["currentness"] }, dependency };
}
/** One independent acquisition per invocation. Archive replay is followed by separate current admission. */
export async function resolveRenderPlanning(input: Immutable<RenderPlanningInput>, resolver: SyntheticRenderPlanningResolver) {
  let value: unknown;
  try { value = renderCapture(await resolver.resolve(input), R.resolutionBytes); }
  catch { rejectRender("RESOLUTION_UNAVAILABLE"); }
  try {
    if (!value || typeof value !== "object") rejectRender("RESOLUTION_UNAVAILABLE");
    const status = Object.getOwnPropertyDescriptor(value, "status")?.value;
    if (status !== "RESOLVED_SYNTHETIC") {
      const failed = record(value, ["status"], "render.failedResolution");
      if (failed.status === "UNAUTHORIZED") rejectRender("FORBIDDEN");
      if (["UNSAVED", "NOT_FOUND"].includes(failed.status as string)) rejectRender("UNSAVED_TIMELINE");
      if (["STALE", "SUPERSEDED"].includes(failed.status as string)) rejectRender("STALE_DEPENDENCIES");
      if (failed.status === "UNSUPPORTED") rejectRender("UNSUPPORTED_SOURCE_METADATA");
      rejectRender("RESOLUTION_UNAVAILABLE");
    }
    const r = record(value, ["status", "observedAt", "timeline", "parent", "head", "currentM6", "admission", "profile", "sourceObservation"], "render.resolution");
    date(r.observedAt, "render.observedAt"); // Validated diagnostics only; excluded from every content hash.
    const selected = await capturedTimeline(r.timeline, input.scope), stored = selected.view.record;
    if (!renderSame(renderTimelineIdentity(selected.view), input.timeline)) rejectRender("INTEGRITY_FAILED");
    const h = record(r.head, ["scope", "revision", "identity"], "render.head");
    const revision = integer(h.revision, "render.head.revision", TIMELINE_STORE.maxRevision);
    if (!renderSame(parseStoreScope(h.scope), input.scope) || h.identity === null ||
      revision !== stored.version || !renderSame(parseRecordIdentity(h.identity), input.timeline) || selected.view.currentness !== "CURRENT_AT_READ") rejectRender("STALE_DEPENDENCIES");
    const parent = r.parent === null ? null : await capturedTimeline(r.parent, input.scope);
    if (parent === null ? stored.previous !== null || stored.version !== 1 :
      parent.view.record.id === stored.id || parent.view.record.version + 1 !== stored.version || !renderSame(renderTimelineIdentity(parent.view), stored.previous)) rejectRender("INTEGRITY_FAILED");
    const a = record(r.admission, ["scope", "m7ScopeEnabled", "m6ScopeEnabled", "m7PolicyEnabled", "m7PolicyVersion"], "render.admission");
    literal(a.m7PolicyVersion, TIMELINE.policy, "render.policy.version");
    if (!renderSame(parseStoreScope(a.scope), input.scope) || a.m7ScopeEnabled !== true || a.m6ScopeEnabled !== true || a.m7PolicyEnabled !== true) rejectRender("STALE_DEPENDENCIES");
    const plan = await replayCurrentTimeline(stored.plan, stored.plan.plan.input, selected.dependency, r.currentM6);
    // This revision is M6's, deliberately distinct from h.revision/stored.version.
    const m6 = selected.dependency.observation.view, m6Parent = selected.dependency.observation.parent;
    const m6Identity = (v: typeof m6) => ({ id: v.record.id, version: v.record.version, recordHash: v.recordHash,
      recordHashDomain: "story-highlight-saved-record-v1" as const, planHash: v.record.plan.planHash, planHashDomain: HIGHLIGHTS.plan });
    const profile = parseSyntheticRenderProfile(r.profile), sourceObservation = parseSyntheticSourceObservation(r.sourceObservation);
    if (!renderSame(sourceObservation.fingerprint, plan.plan.source.media) ||
      input.profileReference.hash !== contractHash(R.profile, profile)) rejectRender("INTEGRITY_FAILED");
    const sourceObservationHash = contractHash(R.source, sourceObservation);
    const dependency: RenderDependencySnapshot = { schemaVersion: R.dependency, scope: input.scope,
      timeline: input.timeline, timelineHeadRevision: revision, timelineParent: parent ? renderTimelineIdentity(parent.view) : null,
      m7Dependency: { id: selected.dependency.id, hash: selected.dependency.hash }, m6: m6Identity(m6),
      m6HeadRevision: plan.plan.headRevision, m6Parent: m6Parent ? m6Identity(m6Parent) : null,
      m6Dependency: plan.plan.dependency, source: plan.plan.source,
      policies: { m7: TIMELINE.policy, m6: HIGHLIGHTS.policy, rubric: HIGHLIGHTS.rubric },
      profileReference: input.profileReference, sourceObservationHash, restrictions: renderRestrictions };
    return freeze({ plan, dependency, sourceObservation, profile });
  } catch (e) {
    if (e instanceof RenderPlanningError) throw e;
    if (e instanceof TimelineError && e.code === "STALE" || e && typeof e === "object" && Object.getOwnPropertyDescriptor(e, "code")?.value === "STALE_SOURCE") rejectRender("STALE_DEPENDENCIES");
    return renderGuard(() => { throw e; }, "INTEGRITY_FAILED");
  }
}
