import { contractHash } from "../../../lib/storyline/canonical";
import { generateRecapTimelinePlan } from "../../../lib/storyline/timeline/planner";
import { TIMELINE_STORE as S, savedTimelineRestrictions, timelineProposalHash, type StoredTimelineRecord, type TimelineRecordView } from "../../../lib/storyline/timeline-persistence/contracts";
import { HIGHLIGHT_STORE as M6 } from "../../../lib/storyline/highlights-persistence/contracts";
import { RENDER_PLANNING as R, renderPolicy, syntheticRenderProfile, type RenderPlanningInput, type RenderPlanningObservation, type SyntheticRenderPlanningResolver, type SyntheticSourceObservation } from "../../../lib/storyline/render-planning/contracts";
import { syntheticRenderProfileReference } from "../../../lib/storyline/render-planning/input";
import { timelineFixture, clone } from "../timeline/fixture";
export { clone };

export function sourceObservation(media: SyntheticSourceObservation["fingerprint"]): SyntheticSourceObservation {
  return { schemaVersion: R.source, execution: "SYNTHETIC_METADATA_ONLY", verification: "NOT_PROBED", possession: "POSSESSION_NOT_ESTABLISHED", fingerprint: clone(media), container: "MP4", encrypted: false,
    topology: { video: 1, audio: 1, subtitle: 0, data: 0, attachment: 0 }, video: { streamIndex: 0, codec: "H264_AVC", pixelFormat: "YUV420P", width: 640, height: 360,
      frameRate: { numerator: 25, denominator: 1 }, timebase: { numerator: 1, denominator: 1000 }, startTick: 0, durationTicks: media.durationMs, frameCount: media.durationMs / 40,
      rotation: 0, variableFrameRate: false, timestamps: "ZERO_ORIGIN_CONTIGUOUS_CFR" } };
}
export function timelineIdentity(v: TimelineRecordView) { return { id: v.record.id, version: v.record.version, recordHash: v.recordHash,
  recordHashDomain: S.record, planHash: v.record.plan.planHash, planHashDomain: "story-recap-timeline-plan-v1" as const }; }
export function planningInput(v: TimelineRecordView): RenderPlanningInput { return { schemaVersion: R.input, execution: "SYNTHETIC_ONLY", scope: v.record.scope,
  timeline: timelineIdentity(v), policy: renderPolicy, profileReference: syntheticRenderProfileReference }; }

/** In-memory saved-row MODEL only. The separate postgres suite proves actual authorized persistence. */
export async function renderFixture(options: Parameters<typeof timelineFixture>[0] = {}, configure?: Parameters<typeof timelineFixture>[1], versions = 1) {
  const f = timelineFixture(options, configure), scope = f.input.scope, plan = await generateRecapTimelinePlan(f.input, f.resolver);
  const o = clone(f.observation);
  function m6View(v: typeof o.view) {
    const r = v.record, proposal = { schemaVersion: M6.proposal, scope, idempotencyKey: r.idempotencyKey, expectedRevision: r.expectedRevision, previous: r.previous, plan: r.plan };
    const audit = { schemaVersion: M6.audit, scope, versionId: r.id, version: r.version, previous: r.previous,
      recordHash: v.recordHash, proposalHash: r.proposalHash, dependencyId: r.dependencyId, dependencyHash: r.dependencyHash, actor: r.editor, createdAt: r.createdAt, action: "SAVE_HIGHLIGHT_VERSION" };
    return { identity: { id: r.id, version: r.version, recordHash: v.recordHash, planHash: r.plan.planHash }, record: r, recordHash: v.recordHash, proposal,
      dependency: { id: o.dependency.id, hash: o.dependency.hash, scope, capture: o.dependency.capture }, parent: r.previous, audit, auditHash: contractHash(M6.audit, audit), current: true };
  }
  const dependencyHash = contractHash(S.dependency, { schemaVersion: S.dependency, scope, observation: o });
  const dependency = { id: `tldep-${dependencyHash}`, hash: dependencyHash, scope, observation: o, m6Record: m6View(o.view), m6Parent: o.parent ? m6View(o.parent) : null };
  let previous: TimelineRecordView | null = null, parent: TimelineRecordView | null = null;
  for (let version = 1; version <= versions; version++) {
    const parentIdentity = previous ? timelineIdentity(previous) : null, idempotencyKey = `timeline-request-${version}`;
    const record: StoredTimelineRecord = { schemaVersion: S.record, scope, id: `timeline-record-${version}`, version, previous: parentIdentity, expectedRevision: version - 1,
      idempotencyKey, proposalHash: timelineProposalHash({ schemaVersion: S.proposal, scope, idempotencyKey, expectedRevision: version - 1, previous: parentIdentity, plan }),
      dependencyId: dependency.id, dependencyHash, createdAt: "2026-10-20T00:00:00.000Z", editor: { principalId: "fixture-editor", sessionId: "fixture-session" }, plan, restrictions: savedTimelineRestrictions };
    parent = previous; previous = { record, recordHash: contractHash(S.record, record), currentness: "CURRENT_AT_READ" };
  }
  const view = previous!, input = planningInput(view);
  const observation = clone<RenderPlanningObservation>({ status: "RESOLVED_SYNTHETIC", observedAt: "2026-10-20T01:00:00.000Z", timeline: { view, dependency }, parent: parent ? { view: parent, dependency } : null,
    head: { scope, revision: view.record.version, identity: timelineIdentity(view) }, currentM6: o,
    admission: { scope, m7ScopeEnabled: true, m6ScopeEnabled: true, m7PolicyEnabled: true, m7PolicyVersion: "story-recap-timeline-policy-v1" },
    profile: syntheticRenderProfile, sourceObservation: sourceObservation(plan.plan.source.media) });
  let calls = 0;
  const resolver: SyntheticRenderPlanningResolver = { resolve: () => { calls++; return observation; } };
  return { f, input, observation, resolver, calls: () => calls, dependency };
}
