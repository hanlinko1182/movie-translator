import { contractHash } from "../../../lib/storyline/canonical";
import { generateHighlightPlan } from "../../../lib/storyline/highlights/planner";
import { HIGHLIGHT_STORE as S, highlightProposalHash, savedHighlightRestrictions, type StoredHighlightRecord, type HighlightRecordView } from "../../../lib/storyline/highlights-persistence/contracts";
import { TIMELINE as T, timelinePolicy, type RecapTimelineInput, type SyntheticTimelineResolver, type TimelineObservation } from "../../../lib/storyline/timeline/contracts";
import { highlightsFixture } from "../highlights/fixture";

export type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
export const clone = <T>(v: T): Mutable<T> => structuredClone(v) as Mutable<T>;

/** Independently owned in-memory saved-record model; NOT evidence of PostgreSQL persistence. */
export function timelineFixture(options: Parameters<typeof highlightsFixture>[0] = {}, configure?: (f: ReturnType<typeof highlightsFixture>) => void) {
  const f = highlightsFixture(options); configure?.(f);
  const scope = { tenantId: "synthetic-tenant", ...f.input.source.narration.scope };
  const plan = generateHighlightPlan(f.input, f.resolver);
  const dependency = { id: "stored-dependency", hash: contractHash(S.dependency, { schemaVersion: S.dependency, scope, capture: f.capture }), capture: clone(f.capture) };
  const proposal = { schemaVersion: S.proposal, scope, expectedRevision: 0, previous: null, idempotencyKey: "saved-request", plan };
  const record: StoredHighlightRecord = { schemaVersion: S.record, scope, id: "saved-record", version: 1, previous: null, expectedRevision: 0,
    idempotencyKey: proposal.idempotencyKey, proposalHash: highlightProposalHash(proposal), dependencyId: dependency.id, dependencyHash: dependency.hash,
    createdAt: "2026-10-19T00:00:00.000Z", editor: { principalId: "fixture-editor", sessionId: "fixture-session" }, plan, restrictions: savedHighlightRestrictions };
  const view: HighlightRecordView = { record, recordHash: contractHash(S.record, record), currentness: "CURRENT_AT_READ" };
  const identity = { id: record.id, version: record.version, recordHash: view.recordHash, planHash: plan.planHash };
  const input: RecapTimelineInput = { schemaVersion: T.input, execution: "SYNTHETIC_ONLY", scope,
    selected: { ...identity, recordHashDomain: S.record, planHashDomain: "story-highlight-plan-v1" }, policy: timelinePolicy };
  const observation: TimelineObservation = clone<TimelineObservation>({ status: "RESOLVED_SYNTHETIC", view, head: { scope, revision: 1, identity }, parent: null, dependency,
    current: { dependencyId: dependency.id, dependencyHash: dependency.hash, source: f.capture.current, policyEnabled: true, policyVersion: "story-highlight-policy-v1", rubricVersion: "story-highlight-rubric-v1" } });
  const resolver: SyntheticTimelineResolver = { resolve: () => observation };
  return { f, input, observation, resolver };
}
/** Rehash the hostile record/proposal/head/input together; the capture stays independent. */
export function reseal(f: ReturnType<typeof timelineFixture>) {
  const r = clone(f.observation.view.record);
  r.plan.planHash = contractHash("story-highlight-plan-v1", r.plan.plan);
  r.proposalHash = highlightProposalHash({ schemaVersion: S.proposal, scope: r.scope, expectedRevision: r.expectedRevision, previous: r.previous, idempotencyKey: r.idempotencyKey, plan: r.plan });
  const recordHash = contractHash(S.record, r);
  f.observation.view = { record: r, recordHash, currentness: f.observation.view.currentness };
  f.input.selected = { ...f.input.selected, id: r.id, version: r.version, recordHash, planHash: r.plan.planHash };
  f.observation.head.identity = { id: r.id, version: r.version, recordHash, planHash: r.plan.planHash };
}
