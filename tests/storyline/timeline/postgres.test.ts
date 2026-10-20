import assert from "node:assert/strict";
import { test } from "node:test";
import { generateRecapTimelinePlan as generate, validateRecapTimelinePlan as validate, timelinePolicy, TIMELINE as T, type SyntheticTimelineResolver, type TimelineObservation, type RecapTimelineInput } from "../../../lib/storyline/timeline";
import { highlightDatabaseFixture } from "../highlights-persistence/fixture";

/** SQL and native session ownership exist ONLY in this disposable test composition. */
function resolver(f: Awaited<ReturnType<typeof highlightDatabaseFixture>>, principal = "reader"): SyntheticTimelineResolver {
  return { async resolve(input) {
    const request = f.request(principal), scope = input.scope;
    const view = await f.api.readVersion(request, { scope, id: input.selected.id });
    const h = await f.api.readHead(request, { scope });
    const parent = view.record.previous ? await f.api.readVersion(request, { scope, id: view.record.previous.id }) : null;
    const params = [scope.tenantId, scope.projectId, scope.movieId, scope.studioId];
    const d = (await f.admin.query("SELECT highlight_m602.load_dependency($1,$2,$3,$4,$5) value", [...params, view.record.dependencyId])).rows[0].value;
    const c = (await f.admin.query("SELECT dependency_id,observed_reference FROM highlight_m602.current_dependency WHERE (tenant,project,movie,studio)=($1,$2,$3,$4)", params)).rows[0];
    const p = (await f.admin.query("SELECT version,rubric,enabled FROM highlight_m602.policy WHERE version='story-highlight-policy-v1'")).rows[0];
    const current = (await f.admin.query("SELECT hash FROM highlight_m602.dependency WHERE (tenant,project,movie,studio,id)=($1,$2,$3,$4,$5)", [...params, c.dependency_id])).rows[0];
    return { status: "RESOLVED_SYNTHETIC", view, head: { scope: h.scope, revision: h.revision,
      identity: h.head ? { id: h.head.record.id, version: h.head.record.version, recordHash: h.head.recordHash, planHash: h.head.record.plan.planHash } : null },
      parent, dependency: { id: d.id, hash: d.hash, capture: d.capture }, current: { dependencyId: c.dependency_id, dependencyHash: current.hash,
        source: c.observed_reference, policyEnabled: p.enabled, policyVersion: p.version, rubricVersion: p.rubric } } satisfies TimelineObservation;
  } };
}
function input(view: TimelineObservation["view"]): RecapTimelineInput {
  return { schemaVersion: T.input, execution: "SYNTHETIC_ONLY", scope: view.record.scope,
    selected: { id: view.record.id, version: view.record.version, recordHash: view.recordHash, recordHashDomain: "story-highlight-saved-record-v1",
      planHash: view.record.plan.planHash, planHashDomain: "story-highlight-plan-v1" }, policy: timelinePolicy };
}

test("fresh owned M6 authorized save/read/head, timeline replay, duplicate save and superseded history", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const original = JSON.stringify(f.initial.capture.original), proposal = await f.proposal();
    const saved = await f.save(proposal); if (saved.status === "UNKNOWN") throw Error("unknown"); assert.equal(saved.status, "SAVED");
    const selected = input(saved.view), before = await f.counts(), r = resolver(f);
    const timeline = await generate(selected, r); assert.deepEqual(await validate(timeline, selected, r), timeline);
    assert.deepEqual(await f.counts(), before, "timeline reads do not create M6 versions/reservations/audits/head changes");
    assert.equal(JSON.stringify(f.initial.capture.original), original);
    assert.equal((await f.save(proposal)).status, "REUSED");
    const next = await f.save(); if (next.status === "UNKNOWN") throw Error("unknown");
    assert.equal(next.view.record.version, 2);
    const historical = await f.api.readVersion(f.request("reader"), { scope: f.scope, id: saved.view.record.id });
    assert.equal(historical.currentness, "CURRENT_AT_READ", "historical integrity is distinct from current head");
    await assert.rejects(validate(timeline, selected, r), { code: "STALE" });
    const fresh = await generate(input(next.view), r);
    assert.ok(timeline.plan.segments.every((s, i) => s.id !== fresh.plan.segments[i].id));
    await assert.rejects(generate(input(next.view), resolver(f, "denied")), { code: "RESOLUTION_FAILED" });
    await assert.rejects(generate(input(next.view), resolver(f, "expired")), { code: "RESOLUTION_FAILED" });
    for (const key of ["tenantId", "projectId", "movieId", "studioId"] as const) await assert.rejects(generate({ ...input(next.view), scope: { ...f.scope, [key]: "other" } }, r));
    await assert.rejects(generate({ ...input(next.view), selected: { ...input(next.view).selected, id: "unsaved-proposal" } }, r));
  } finally { await f.stop(); }
});

test("fresh owned R4 record cannot be planned after source revision or policy drift", async () => {
  const f = await highlightDatabaseFixture(true);
  try {
    const saved = await f.save(); if (saved.status === "UNKNOWN") throw Error("unknown");
    const selected = input(saved.view), r = resolver(f), timeline = await generate(selected, r);
    assert.equal(timeline.plan.source.narration.artifact.hashDomain, "story-edited-narration-v1");
    await f.admin.query("UPDATE highlight_m602.policy SET enabled=false");
    await assert.rejects(validate(timeline, selected, r), { code: "STALE" });
    await f.admin.query("UPDATE highlight_m602.policy SET enabled=true");
    const changed = structuredClone(f.initial.capture); changed.current.currentness.sourceRevision++;
    await f.seedCapture(changed); await assert.rejects(generate(selected, r), { code: "STALE" });
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { await f.stop(); }
});
