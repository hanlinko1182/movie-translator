import assert from "node:assert/strict";
import { test } from "node:test";
import { generateRenderRecipe as generate, validateRenderRecipe as validate } from "../../../lib/storyline/render-planning";
import { planningInput } from "./fixture";
import { renderDatabaseFixture } from "./postgres.fixture";

test("M8 actual authorized saved M7/M6 resolution and replay leave immutable rows and all business counters unchanged", async () => {
  const { f, input, resolver, stop } = await renderDatabaseFixture();
  try {
    const counts = await f.counts(), m6Counts = await f.m6.counts();
    const original = (await f.admin.query("SELECT tenant,project,movie,studio,id,value FROM highlight_m602.narration_snapshot ORDER BY tenant,project,movie,studio,id")).rows;
    const p = await generate(input, resolver()); assert.deepEqual(await validate(p, input, resolver()), p);
    assert.deepEqual(await f.counts(), counts); assert.deepEqual(await f.m6.counts(), m6Counts);
    assert.deepEqual((await f.admin.query("SELECT tenant,project,movie,studio,id,value FROM highlight_m602.narration_snapshot ORDER BY tenant,project,movie,studio,id")).rows, original);
    const next = await f.save(); if (next.status === "UNKNOWN") throw Error("unknown fixture");
    await assert.rejects(validate(p, input, resolver()), { code: "STALE_DEPENDENCIES" });
    const q = await generate(planningInput(next.view), resolver()); assert.notEqual(q.id, p.id);
    assert.equal(q.recipe.dependency.timelineHeadRevision, 2); assert.equal(q.recipe.dependency.m6HeadRevision, 1); assert.ok(q.recipe.dependency.timelineParent);
    assert.equal(q.recipe.restrictions.eligibleForPublication, false); assert.equal(q.recipe.restrictions.sourceVerified, false);
  } finally { await stop(); }
});
test("M8 actual native session denial and exact tenant/project/movie/studio isolation have no planning fallback", async () => {
  const { f, input, resolver, stop } = await renderDatabaseFixture();
  try {
    f.authentication.revokeForTest(f.sessions.find(s => s.principalId === "editor-b")!.id);
    for (const principal of ["denied", "expired", "editor-b", "db-revoked", "db-denied"]) await assert.rejects(generate(input, resolver(principal)), { code: "FORBIDDEN" });
    for (const field of ["tenantId", "projectId", "movieId", "studioId"] as const) await assert.rejects(generate({ ...input, scope: { ...input.scope, [field]: "other" } }, resolver()));
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { await stop(); }
});
test("M8 actual R4 lineage remains unapproved and source/media/policy drift rejects new processing", async () => {
  const { f, input, resolver, stop } = await renderDatabaseFixture(true);
  try {
    const p = await generate(input, resolver()); assert.equal(p.recipe.dependency.source.narration.artifact.hashDomain, "story-edited-narration-v1");
    await f.admin.query("UPDATE timeline_m702.policy SET enabled=false"); await assert.rejects(validate(p, input, resolver()));
    await f.admin.query("UPDATE timeline_m702.policy SET enabled=true");
    await f.admin.query("UPDATE highlight_m602.policy SET enabled=false"); await assert.rejects(generate(input, resolver()));
    await f.admin.query("UPDATE highlight_m602.policy SET enabled=true");
    const changed = structuredClone(f.m6.initial.capture); changed.current.currentness.sourceRevision++;
    await f.m6.seedCapture(changed); await assert.rejects(validate(p, input, resolver()));
    assert.equal(p.recipe.restrictions.humanApproval, "NONE"); assert.equal(p.recipe.restrictions.spendingAuthority, "NONE");
  } finally { await stop(); }
});
test("M8 actual independent M6 replacement invalidates a previously current M7 even with identical source metadata", async () => {
  const { f, input, resolver, stop } = await renderDatabaseFixture();
  try {
    const p = await generate(input, resolver()), next = await f.m6.save(); if (next.status === "UNKNOWN") throw Error("unknown fixture");
    await assert.rejects(validate(p, input, resolver()));
    assert.equal((await f.api.readVersion(f.request("reader"), { scope: f.scope, id: input.timeline.id })).currentness, "STALE_DEPENDENCIES");
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
    const m6 = next.view;
    const target = { ...f.input, selected: { ...f.input.selected, id: m6.record.id, version: m6.record.version, recordHash: m6.recordHash, planHash: m6.record.plan.planHash } };
    const fresh = await f.save(await f.proposal(undefined, "editor-a", target)); if (fresh.status === "UNKNOWN") throw Error("unknown fixture");
    const currentInput = planningInput(fresh.view), current = await generate(currentInput, resolver());
    assert.equal(current.recipe.dependency.m6HeadRevision, 2); assert.equal(current.recipe.dependency.m6Parent?.version, 1);
    assert.equal(current.recipe.dependency.timelineParent?.version, 1);
    const observation = await resolver().resolve(currentInput); if (observation.status !== "RESOLVED_SYNTHETIC") throw Error("resolution fixture");
    const hostile = structuredClone(observation.timeline.dependency) as { m6Parent: { auditHash: string } };
    hostile.m6Parent.auditHash = "f".repeat(64);
    await assert.rejects(validate(current, currentInput, { resolve: () => ({ ...observation, timeline: { ...observation.timeline, dependency: hostile } }) }));
  } finally { await stop(); }
});
