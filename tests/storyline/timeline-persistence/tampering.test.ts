import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { TIMELINE_STORE as S, timelineProposalHash, type SaveTimelineProposal } from "../../../lib/storyline/timeline-persistence/contracts";
import { TIMELINE as T } from "../../../lib/storyline/timeline/contracts";
import { timelineDatabaseFixture } from "./fixture";
import { clone } from "../timeline/fixture";

function rehash(plan: ReturnType<typeof clone<SaveTimelineProposal>>["plan"]) {
  for (const segment of plan.plan.segments) { const { id: _id, ...body } = segment; void _id; segment.id = `tlseg-${contractHash(T.segment, body)}`; }
  plan.planHash = contractHash(T.plan, plan.plan); plan.id = `tl-${plan.planHash}`;
}
for (const [name, mutate] of [
  ["placement", (p: ReturnType<typeof clone<SaveTimelineProposal>>) => { p.plan.plan.segments[1].outputStartMs++; }],
  ["source chronology", (p: ReturnType<typeof clone<SaveTimelineProposal>>) => { p.plan.plan.sourceOrder.reverse(); }],
  ["evidence", (p: ReturnType<typeof clone<SaveTimelineProposal>>) => { p.plan.plan.segments[0].candidate.evidence[0].sourceText = "伪造证据"; }],
  ["narration domain", (p: ReturnType<typeof clone<SaveTimelineProposal>>) => { (p.plan.plan.source.narration.artifact as unknown as Record<string, unknown>).hashDomain = "story-edited-narration-v1"; }],
  ["audio track", (p: ReturnType<typeof clone<SaveTimelineProposal>>) => { (p.plan.plan as unknown as Record<string, unknown>).audioTracks = []; }],
  ["approval", (p: ReturnType<typeof clone<SaveTimelineProposal>>) => { (p.plan.plan.restrictions as unknown as Record<string, unknown>).humanApproval = "APPROVED"; }],
] as const) test(`M7-02 rejects rehashed caller ${name} before any durable write`, async () => {
  const f = await timelineDatabaseFixture();
  try { const p = clone(await f.proposal()); mutate(p); rehash(p.plan); await assert.rejects(f.save(p)); assert.equal((await f.counts()).versions, 0); }
  finally { await f.stop(); }
});

for (const field of ["id", "version", "recordHash", "recordHashDomain", "planHash", "planHashDomain"] as const) test(`M7-02 independent loader rejects forged M6 ${field}`, async () => {
  const f = await timelineDatabaseFixture();
  try {
    const input = clone(f.input); (input.selected as unknown as Record<string, unknown>)[field] = field === "version" ? 2 : field.endsWith("Hash") ? "f".repeat(64) : "forged";
    await assert.rejects(f.api.prepareTimeline(f.request(), input)); assert.equal((await f.counts()).versions, 0);
  } finally { await f.stop(); }
});

for (const field of ["placement", "evidence", "parent"] as const) test(`M7-02 rejects coordinated saved ${field} forgery after plan/proposal/record/audit rehash`, async () => {
  const f = await timelineDatabaseFixture();
  try {
    const saved = await f.save(); if (saved.status === "UNKNOWN") assert.fail();
    const child = field === "parent" ? await f.save() : saved; if (child.status === "UNKNOWN") assert.fail();
    const target = field === "parent" ? saved : child, row = clone(target.view.record);
    if (field === "evidence") row.plan.plan.segments[0].candidate.evidence[0].sourceText = "重写证据";
    else row.plan.plan.segments[0].outputEndMs++;
    rehash(row.plan);
    const proposal: SaveTimelineProposal = { schemaVersion: S.proposal, scope: row.scope, idempotencyKey: row.idempotencyKey, expectedRevision: row.expectedRevision, previous: row.previous, plan: row.plan };
    row.proposalHash = timelineProposalHash(proposal); const recordHash = contractHash(S.record, row);
    const audit = { schemaVersion: S.audit, scope: row.scope, versionId: row.id, version: row.version, previous: row.previous, recordHash, proposalHash: row.proposalHash,
      dependencyId: row.dependencyId, dependencyHash: row.dependencyHash, actor: row.editor, createdAt: row.createdAt, action: "SAVE_TIMELINE_VERSION" };
    // Owned adversarial administrator bypasses immutable triggers solely to prove replay.
    for (const table of ["version", "reservation", "audit_event"]) await f.admin.query(`ALTER TABLE timeline_m702.${table} DISABLE TRIGGER immutable_row`);
    await f.admin.query("UPDATE timeline_m702.version SET payload=$1,hash=$2,plan_hash=$3 WHERE id=$4", [canonicalJson(row), recordHash, row.plan.planHash, row.id]);
    await f.admin.query("UPDATE timeline_m702.reservation SET proposal=$1,proposal_hash=$2 WHERE id=$3", [canonicalJson(proposal), row.proposalHash, row.id]);
    await f.admin.query("UPDATE timeline_m702.audit_event SET payload=$1,hash=$2 WHERE version_id=$3", [canonicalJson(audit), contractHash(S.audit, audit), row.id]);
    if (field === "parent") {
      const c = clone(child.view.record);
      c.previous = { id: row.id, version: row.version, recordHash, recordHashDomain: S.record, planHash: row.plan.planHash, planHashDomain: T.plan };
      const cp = { schemaVersion: S.proposal, scope: c.scope, idempotencyKey: c.idempotencyKey, expectedRevision: c.expectedRevision, previous: c.previous, plan: c.plan };
      c.proposalHash = timelineProposalHash(cp); const ch = contractHash(S.record, c);
      const ca = { ...audit, versionId: c.id, version: c.version, previous: c.previous, recordHash: ch, proposalHash: c.proposalHash, dependencyId: c.dependencyId, dependencyHash: c.dependencyHash, actor: c.editor, createdAt: c.createdAt };
      await f.admin.query("UPDATE timeline_m702.version SET payload=$1,hash=$2 WHERE id=$3", [canonicalJson(c), ch, c.id]);
      await f.admin.query("UPDATE timeline_m702.reservation SET proposal=$1,proposal_hash=$2 WHERE id=$3", [canonicalJson(cp), c.proposalHash, c.id]);
      await f.admin.query("UPDATE timeline_m702.audit_event SET payload=$1,hash=$2 WHERE version_id=$3", [canonicalJson(ca), contractHash(S.audit, ca), c.id]);
    }
    for (const table of ["version", "reservation", "audit_event"]) await f.admin.query(`ALTER TABLE timeline_m702.${table} ENABLE TRIGGER immutable_row`);
    await assert.rejects(f.api.readVersion(f.request(), { scope: f.scope, id: child.view.record.id }), { code: "INTEGRITY_FAILED" });
  } finally { await f.stop(); }
});
