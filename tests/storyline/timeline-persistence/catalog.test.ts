import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineDatabaseFixture, uid, timelineProposalHash } from "./fixture";
for (const [name, sql] of [
  ["private table grant", "GRANT SELECT ON timeline_m702.version TO timeline_m702_read"],
  ["private column grant", "GRANT SELECT(id) ON timeline_m702.version TO timeline_m702_read"],
  ["PUBLIC helper execution", "GRANT EXECUTE ON FUNCTION timeline_m702.load_dependency(text,text,text,text,text) TO PUBLIC"],
  ["changed search path", "ALTER FUNCTION timeline_m702.load_dependency(text,text,text,text,text) SET search_path=pg_temp,timeline_m702,pg_catalog"],
  ["disabled M7 immutability", "ALTER TABLE timeline_m702.version DISABLE TRIGGER immutable_row"],
  ["disabled M6 immutability", "ALTER TABLE highlight_m602.version DISABLE TRIGGER immutable_row"],
  ["changed M6 helper ownership", "ALTER FUNCTION highlight_m602.load_dependency(text,text,text,text,text) OWNER TO timeline_m702_owner"],
  ["disabled deferred completion", "ALTER TABLE timeline_m702.reservation DISABLE TRIGGER reservation_complete"],
] as const) test(`M7-02 same-backend catalog checks reject ${name}`, async () => {
  const f = await timelineDatabaseFixture();
  try { await f.admin.query(sql); await assert.rejects(f.api.readHead(f.request(), { scope: f.scope }), { code: "DATABASE_UNSAFE" }); }
  finally { await f.stop(); }
});
test("M7-02 composite FK rejects a foreign tenant M6 dependency", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const foreign = { ...f.scope, tenantId: "tenant-two" };
    const saved = await f.m6.save(await f.m6.proposal(uid(), "foreign", foreign), "foreign"); if (saved.status === "UNKNOWN") assert.fail();
    await assert.rejects(f.admin.query("INSERT INTO timeline_m702.dependency VALUES($1,$2,$3,$4,'foreign-dep',$5,$6)", [f.scope.tenantId, f.scope.projectId, f.scope.movieId, f.scope.studioId, saved.view.record.id, "f".repeat(64)]), (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "23503");
  } finally { await f.stop(); }
});
test("M7-02 unfinished restricted reservation cannot commit without version/head/audit completion", async () => {
  const f = await timelineDatabaseFixture();
  try {
    const p = await f.proposal();
    await assert.rejects(f.gateway.transaction("create", f.request("editor-a", true), f.scope, async tx => {
      const capture = await tx.call({ op: "capture", input: f.input, key: p.idempotencyKey, proposalHash: timelineProposalHash(p) }) as { dependency: { id: string; hash: string } };
      await tx.call({ op: "reserve", proposal: p, proposalHash: timelineProposalHash(p), dependencyId: capture.dependency.id, dependencyHash: capture.dependency.hash });
    }), { code: "TRANSACTION_FAILED" });
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
  } finally { await f.stop(); }
});
