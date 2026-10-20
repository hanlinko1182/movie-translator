import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { hash, id, integer, literal, record } from "../validation";
import { HIGHLIGHTS as H } from "../highlights/contracts";
import { parseHighlightSource } from "../highlights/input";
import { validateHighlightPlan } from "../highlights/planner";
import { HIGHLIGHT_STORE as S, parseRecordIdentity, parseStoredRecord, parseStoreScope } from "../highlights-persistence/contracts";
import type { Immutable } from "../contracts";
import { TIMELINE as T, TimelineError, type RecapTimelineInput, type SyntheticTimelineResolver, type TimelineObservation } from "./contracts";

const same = (a: unknown, b: unknown) => canonicalJson(a, T.resolutionBytes) === canonicalJson(b, T.resolutionBytes);
function view(value: unknown) {
  const r = record(value, ["record", "recordHash", "currentness"], "timeline.view");
  const stored = parseStoredRecord(r.record);
  if (hash(r.recordHash, "timeline.recordHash") !== contractHash(S.record, stored) ||
    stored.plan.planHash !== contractHash(H.plan, stored.plan.plan)) throw new TimelineError("INTEGRITY_FAILED");
  if (!["CURRENT_AT_READ", "STALE_DEPENDENCIES"].includes(r.currentness as string)) throw new TimelineError("INTEGRITY_FAILED");
  return { record: stored, recordHash: r.recordHash as string, currentness: r.currentness };
}
export async function resolveTimeline(input: Immutable<RecapTimelineInput>, resolver: SyntheticTimelineResolver) {
  let observation: unknown;
  try { observation = JSON.parse(canonicalJson(await resolver.resolve(input), T.resolutionBytes)); }
  catch { throw new TimelineError("RESOLUTION_FAILED"); }
  try {
    const r = record(observation, ["status", "view", "head", "parent", "dependency", "current"], "timeline.resolution");
    literal(r.status, "RESOLVED_SYNTHETIC", "timeline.status");
    const selected = view(r.view), stored = selected.record;
    const identity = { id: stored.id, version: stored.version, recordHash: selected.recordHash, planHash: stored.plan.planHash };
    const expected = { id: input.selected.id, version: input.selected.version, recordHash: input.selected.recordHash, planHash: input.selected.planHash };
    if (!same(stored.scope, input.scope) || !same(identity, expected)) throw new TimelineError("INTEGRITY_FAILED");
    const h = record(r.head, ["scope", "revision", "identity"], "timeline.head");
    parseStoreScope(h.scope); const revision = integer(h.revision, "timeline.revision", S.maxRevision);
    if (!same(h.scope, input.scope) || revision !== stored.version || h.identity === null || !same(parseRecordIdentity(h.identity), identity)) throw new TimelineError("STALE");
    if (r.parent === null) {
      if (stored.previous !== null || stored.version !== 1) throw new TimelineError("INTEGRITY_FAILED");
    } else {
      const parent = view(r.parent), p = parent.record;
      if (!same(p.scope, input.scope) || p.id === stored.id || p.version + 1 !== stored.version ||
        !same(stored.previous, { id: p.id, version: p.version, recordHash: parent.recordHash, planHash: p.plan.planHash })) throw new TimelineError("INTEGRITY_FAILED");
    }
    const d = record(r.dependency, ["id", "hash", "capture"], "timeline.dependency");
    const dependencyId = id(d.id, "timeline.dependency.id"), dependencyHash = hash(d.hash, "timeline.dependency.hash");
    if (dependencyId !== stored.dependencyId || dependencyHash !== stored.dependencyHash ||
      contractHash(S.dependency, { schemaVersion: S.dependency, scope: input.scope, capture: d.capture }) !== dependencyHash) throw new TimelineError("INTEGRITY_FAILED");
    const c = record(r.current, ["dependencyId", "dependencyHash", "source", "policyEnabled", "policyVersion", "rubricVersion"], "timeline.current");
    literal(c.policyVersion, H.policy, "timeline.current.policy"); literal(c.rubricVersion, H.rubric, "timeline.current.rubric");
    const current = parseHighlightSource(c.source);
    if (c.policyEnabled !== true || selected.currentness !== "CURRENT_AT_READ" || c.dependencyId !== dependencyId ||
      c.dependencyHash !== dependencyHash || !same(current, stored.plan.plan.input.source)) throw new TimelineError("STALE");
    const capture = (r.dependency as TimelineObservation["dependency"]).capture;
    const plan = validateHighlightPlan(stored.plan, stored.plan.plan.input, { resolve: () => ({ status: "CAPTURED_SYNTHETIC", capture }) });
    if (plan.plan.status !== "PLANNED" || !plan.plan.sourceOrder.length || plan.plan.coverage.missingCharacterIds.length ||
      plan.plan.coverage.missingRelationshipIds.length) throw new TimelineError("INELIGIBLE");
    return { plan: plan.plan, revision, dependency: { id: dependencyId, hash: dependencyHash } };
  } catch (error) {
    if (error instanceof TimelineError) throw error;
    throw new TimelineError("INTEGRITY_FAILED");
  }
}
