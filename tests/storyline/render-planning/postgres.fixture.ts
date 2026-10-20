import { timelineDatabaseFixture } from "../timeline-persistence/fixture";
import { planningInput, sourceObservation, timelineIdentity } from "./fixture";
import { syntheticRenderProfile, type RenderPlanningObservation, type SyntheticRenderPlanningResolver } from "../../../lib/storyline/render-planning/contracts";
import type { TimelineObservation } from "../../../lib/storyline/timeline/contracts";

/** Actual authentication/SQL exists only in this newly owned disposable fixture. No M8 gateway or route. */
export async function renderDatabaseFixture(edited = false) {
  const f = await timelineDatabaseFixture(edited);
  try {
    const saved = await f.save(); if (saved.status === "UNKNOWN") throw Error("Fixture save ambiguous");
    const input = planningInput(saved.view), manifest = sourceObservation(saved.view.record.plan.plan.source.media);
    function resolver(principal = "reader"): SyntheticRenderPlanningResolver {
      return { async resolve(input) {
        try {
          const scope = input.scope, args = [scope.tenantId, scope.projectId, scope.movieId, scope.studioId];
          const request = f.request(principal), view = await f.api.readVersion(request, { scope, id: input.timeline.id }), head = await f.api.readHead(request, { scope });
          const parent = view.record.previous ? await f.api.readVersion(request, { scope, id: view.record.previous.id }) : null;
          const dependency = (await f.admin.query("SELECT timeline_m702.load_dependency($1,$2,$3,$4,$5) value", [...args, view.record.dependencyId])).rows[0].value;
          const parentDependency = parent ? (await f.admin.query("SELECT timeline_m702.load_dependency($1,$2,$3,$4,$5) value", [...args, parent.record.dependencyId])).rows[0].value : null;
          const m6Id = view.record.plan.plan.input.selected.id, m6request = f.m6.request(principal);
          const m6View = await f.m6.api.readVersion(m6request, { scope, id: m6Id }), m6Head = await f.m6.api.readHead(m6request, { scope });
          const m6Parent = m6View.record.previous ? await f.m6.api.readVersion(m6request, { scope, id: m6View.record.previous.id }) : null;
          const currentM6: TimelineObservation = (await f.admin.query("SELECT timeline_m702.current_observation($1,$2,$3,$4,$5) value", [...args, m6Id])).rows[0].value;
          currentM6.view = m6View; currentM6.parent = m6Parent;
          currentM6.head = { scope, revision: m6Head.revision, identity: m6Head.head ? { id: m6Head.head.record.id, version: m6Head.head.record.version, recordHash: m6Head.head.recordHash, planHash: m6Head.head.record.plan.planHash } : null };
          const policy = (await f.admin.query("SELECT (SELECT enabled FROM timeline_m702.scope WHERE (tenant,project,movie,studio)=($1,$2,$3,$4)) m7scope,(SELECT enabled FROM highlight_m602.scope WHERE (tenant,project,movie,studio)=($1,$2,$3,$4)) m6scope,(SELECT enabled FROM timeline_m702.policy WHERE version='story-recap-timeline-policy-v1') m7policy", args)).rows[0];
          return { status: "RESOLVED_SYNTHETIC", observedAt: "2026-10-20T01:00:00.000Z", timeline: { view, dependency }, parent: parent ? { view: parent, dependency: parentDependency } : null,
            head: { scope: head.scope, revision: head.revision, identity: head.head ? timelineIdentity(head.head) : null }, currentM6,
            admission: { scope, m7ScopeEnabled: policy.m7scope, m6ScopeEnabled: policy.m6scope, m7PolicyEnabled: policy.m7policy, m7PolicyVersion: "story-recap-timeline-policy-v1" },
            profile: syntheticRenderProfile, sourceObservation: manifest } satisfies RenderPlanningObservation;
        } catch (e) {
          const code = e && typeof e === "object" ? Object.getOwnPropertyDescriptor(e, "code")?.value : null;
          if (["AUTH_REQUIRED", "SESSION_INVALID", "FORBIDDEN", "ORIGIN_REJECTED", "CSRF_REJECTED"].includes(code)) return { status: "UNAUTHORIZED" };
          if (code === "NOT_FOUND") return { status: "NOT_FOUND" };
          return { status: "UNKNOWN" };
        }
      } };
    }
    return { f, input, saved, resolver, stop: () => f.stop() };
  } catch (e) { await f.stop(); throw e; }
}
