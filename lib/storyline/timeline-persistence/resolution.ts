import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { freeze, hash, id, record } from "../validation";
import { HIGHLIGHT_STORE as M6, parseStoredRecord as parseM6Record, parseSaveHighlightProposal as parseM6Proposal, highlightProposalHash } from "../highlights-persistence/contracts";
import { validateHighlightPlan } from "../highlights/planner";
import type { SyntheticHighlightCapture } from "../highlights/contracts";
import type { HighlightRecordView } from "../highlights-persistence/contracts";
import { TIMELINE as T, TimelineError, type TimelineObservation, type RecapTimelinePlan } from "../timeline/contracts";
import { parseRecapTimelineInput } from "../timeline/input";
import { generateRecapTimelinePlan, validateRecapTimelinePlan } from "../timeline/planner";
import { TIMELINE_STORE as S, parseStoreScope, storeSame, rejectStore, type DependencyView, type TimelineStoreScope } from "./contracts";

/** Verify the independent SQL M6 projection, including proposal/audit/physical parent.
 * Its currentness flag is NOT converted into new-save admission authority. */
function m6View(value: unknown, scope: TimelineStoreScope): HighlightRecordView {
  const r = record(value, ["identity", "record", "recordHash", "proposal", "dependency", "parent", "audit", "auditHash", "current"], "timelineStore.m6View");
  const v = parseM6Record(r.record), proposal = parseM6Proposal(r.proposal);
  const identity = { id: v.id, version: v.version, recordHash: r.recordHash, planHash: v.plan.planHash };
  const d = record(r.dependency, ["id", "hash", "scope", "capture"], "timelineStore.m6Dependency");
  const audit = { schemaVersion: M6.audit, scope, versionId: v.id, version: v.version, previous: v.previous,
    recordHash: r.recordHash, proposalHash: v.proposalHash, dependencyId: v.dependencyId, dependencyHash: v.dependencyHash,
    actor: v.editor, createdAt: v.createdAt, action: "SAVE_HIGHLIGHT_VERSION" };
  if (typeof r.current !== "boolean" || !storeSame(v.scope, scope) || !storeSame(r.identity, identity) || !storeSame(v.previous, r.parent) ||
    contractHash(M6.record, v) !== hash(r.recordHash, "timelineStore.m6Hash") ||
    v.proposalHash !== highlightProposalHash(proposal) || !storeSame(proposal, { schemaVersion: M6.proposal, scope, idempotencyKey: v.idempotencyKey, expectedRevision: v.expectedRevision, previous: v.previous, plan: v.plan }) ||
    !storeSame(d.scope, scope) || d.id !== v.dependencyId || d.hash !== v.dependencyHash ||
    contractHash(M6.dependency, { schemaVersion: M6.dependency, scope, capture: d.capture }) !== d.hash ||
    !storeSame(audit, r.audit) || contractHash(M6.audit, audit) !== r.auditHash) rejectStore("INTEGRITY_FAILED");
  validateHighlightPlan(v.plan, v.plan.plan.input, { resolve: () => ({ status: "CAPTURED_SYNTHETIC", capture: d.capture as SyntheticHighlightCapture }) });
  return freeze({ record: v, recordHash: r.recordHash as string, currentness: r.current ? "CURRENT_AT_READ" : "STALE_DEPENDENCIES" });
}
/** Database output only. No repository request accepts this capture. */
export function parseTimelineDependency(value: unknown, scope: TimelineStoreScope): DependencyView {
  const d = record(JSON.parse(canonicalJson(value, T.resolutionBytes)), ["id", "hash", "scope", "observation", "m6Record", "m6Parent"], "timelineStore.dependency");
  const observed = d.observation as TimelineObservation;
  const selected = m6View(d.m6Record, scope), parent = d.m6Parent === null ? null : m6View(d.m6Parent, scope);
  const identity = { id: selected.record.id, version: selected.record.version, recordHash: selected.recordHash, planHash: selected.record.plan.planHash };
  const dep = (d.m6Record as { dependency: { id: string; hash: string; capture: TimelineObservation["dependency"]["capture"] } }).dependency;
  // Explicit archival observation: reconstruct historical admission coordinates
  // from immutable rows. This is never a present-currentness claim.
  const expected: TimelineObservation = { status: "RESOLVED_SYNTHETIC", view: { ...selected, currentness: "CURRENT_AT_READ" },
    parent: parent ? { ...parent, currentness: "CURRENT_AT_READ" } : null, head: { scope, revision: selected.record.version, identity },
    dependency: { id: dep.id, hash: dep.hash, capture: dep.capture }, current: { dependencyId: dep.id, dependencyHash: dep.hash,
      source: dep.capture.current, policyEnabled: true, policyVersion: "story-highlight-policy-v1", rubricVersion: "story-highlight-rubric-v1" } };
  const envelope = { schemaVersion: S.dependency, scope: parseStoreScope(d.scope), observation: expected };
  const digest = contractHash(S.dependency, envelope);
  if (!storeSame(envelope.scope, scope) || !storeSame(observed, expected) || d.hash !== digest || d.id !== `tldep-${digest}` ||
    dep.capture.edit && dep.capture.edit.payload.editor.tenantId !== scope.tenantId) rejectStore("INTEGRITY_FAILED");
  return freeze({ id: id(d.id, "timelineStore.dependencyId"), hash: hash(d.hash, "timelineStore.dependencyHash"), scope, observation: expected });
}
/** Named archival integrity path. Recreates the historical deterministic plan,
 * not permission to save/process it now. Only reads/reuse call this function. */
export async function validateHistoricalTimelineIntegrity(value: unknown, expectedInput: unknown, dependency: DependencyView): Promise<RecapTimelinePlan> {
  try { return await validateRecapTimelinePlan(value, expectedInput, { resolve: () => JSON.parse(canonicalJson(dependency.observation, T.resolutionBytes)) as TimelineObservation }); }
  catch { rejectStore("INTEGRITY_FAILED"); }
}
export async function replayCurrentTimeline(value: unknown, expectedInput: unknown, d: DependencyView, current: unknown) {
  const input = parseRecapTimelineInput(expectedInput);
  // Current authority comes from a separately locked SQL observation, never the plan.
  const observation = JSON.parse(canonicalJson(current, T.resolutionBytes)) as TimelineObservation;
  if (!storeSame(observation.view.record, d.observation.view.record) || observation.view.recordHash !== d.observation.view.recordHash ||
    !storeSame(observation.parent?.record ?? null, d.observation.parent?.record ?? null) || !storeSame(observation.dependency, d.observation.dependency)) rejectStore("INTEGRITY_FAILED");
  try {
    const resolver = { resolve: () => observation };
    return value === null ? await generateRecapTimelinePlan(input, resolver) : await validateRecapTimelinePlan(value, input, resolver);
  } catch (error) {
    if (error instanceof TimelineError && error.code === "STALE") rejectStore("STALE_SOURCE");
    if (error instanceof TimelineError && error.code === "INVALID_PLAN") rejectStore("INVALID_PLAN");
    rejectStore("INTEGRITY_FAILED");
  }
}
