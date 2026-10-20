import assert from "node:assert/strict";
import { before, test } from "node:test";
import { contractHash } from "../../../lib/storyline/canonical";
import { generateRecapTimelinePlan } from "../../../lib/storyline/timeline";
import { TIMELINE_STORE as S, parseSaveTimelineProposal, parseStoredRecord, timelineProposalHash, savedTimelineRestrictions, type SaveTimelineProposal } from "../../../lib/storyline/timeline-persistence/contracts";
import { timelineFixture, clone } from "../timeline/fixture";
let proposal: SaveTimelineProposal;
before(async () => {
  const f = timelineFixture(); proposal = { schemaVersion: S.proposal, scope: f.input.scope, idempotencyKey: "contract-request", expectedRevision: 0, previous: null, plan: await generateRecapTimelinePlan(f.input, f.resolver) };
});
test("M7-02 strict contract preserves exact M7 hash/ID, time policy, selected M6 and synthetic restrictions", () => {
  assert.deepEqual(parseSaveTimelineProposal(proposal), proposal);
  assert.equal(timelineProposalHash(proposal), contractHash(S.proposal, proposal));
  assert.equal(proposal.plan.id, `tl-${proposal.plan.planHash}`); assert.equal(proposal.plan.plan.input.policy.transition, "CUT_ONLY");
  assert.equal(proposal.plan.plan.restrictions.persistence, "NOT_PERSISTED");
  assert.equal(savedTimelineRestrictions.storage, "DISPOSABLE_POSTGRES_ONLY");
  assert.equal(savedTimelineRestrictions.rendering, "NOT_RENDERED"); assert.equal(savedTimelineRestrictions.spendingAuthority, "NONE");
});
const attacks: [string, (p: ReturnType<typeof clone<SaveTimelineProposal>>) => void][] = [
  ["extra role", p => { (p as unknown as Record<string, unknown>).role = "owner"; }],
  ["source capture", p => { (p as unknown as Record<string, unknown>).capture = {}; }],
  ["unsupported version", p => { (p as unknown as Record<string, unknown>).schemaVersion = "future"; }],
  ["wrong tenant", p => { p.scope.tenantId = "other"; }],
  ["bad ID", p => { p.idempotencyKey = "bad/key"; }],
  ["malformed Unicode", p => { p.idempotencyKey = "\ud800"; }],
  ["bad hash", p => { p.plan.planHash = "A".repeat(64); }],
  ["wrong derived plan ID", p => { p.plan.id = "caller-clip-id"; }],
  ["zero previous mismatch", p => { p.expectedRevision = 1; }],
  ["wrong M6 hash domain", p => { (p.plan.plan.input.selected as unknown as Record<string, unknown>).recordHashDomain = S.record; }],
  ["wrong M7 policy", p => { (p.plan.plan.input.policy as unknown as Record<string, unknown>).timeUnit = "SECONDS"; }],
  ["speed", p => { (p.plan.plan.input.policy as unknown as Record<string, unknown>).speedNumerator = 2; }],
  ["negative revision", p => { p.expectedRevision = -1; }], ["negative zero", p => { p.expectedRevision = -0; }],
  ["fraction", p => { p.expectedRevision = 0.5; }], ["unsafe revision", p => { p.expectedRevision = Number.MAX_SAFE_INTEGER + 1; }],
  ["revision bound", p => { p.expectedRevision = 1000000; }],
  ["oversized", p => { p.idempotencyKey = "x".repeat(S.maxBytes); }],
];
for (const [name, change] of attacks) test(`M7-02 proposal parser rejects ${name}`, () => {
  const p = clone(proposal); change(p); assert.throws(() => parseSaveTimelineProposal(p));
});
for (const field of ["recordHashDomain", "planHashDomain", "version", "id"] as const) test(`M7-02 rejects wrong previous ${field}`, () => {
  const p = clone(proposal); p.expectedRevision = 1;
  p.previous = { id: "prior", version: 1, recordHash: "a".repeat(64), recordHashDomain: S.record, planHash: "b".repeat(64), planHashDomain: "story-recap-timeline-plan-v1" };
  if (field === "version") p.previous.version = 2; else (p.previous as unknown as Record<string, unknown>)[field] = "wrong/domain";
  assert.throws(() => parseSaveTimelineProposal(p));
});
test("M7-02 rejects non-JSON and getter captures without execution", () => {
  let calls = 0; const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const v of [new Date(), cycle, Array(2), { get plan() { calls++; return proposal.plan; } }]) assert.throws(() => parseSaveTimelineProposal(v));
  assert.equal(calls, 0);
});
test("M7-02 stored shape verifies canonical proposal, actor fields, restrictions and no self-parent", () => {
  const row = { ...proposal, id: "stored-one", version: 1, schemaVersion: S.record, proposalHash: timelineProposalHash(proposal), dependencyId: "dependency-one", dependencyHash: "a".repeat(64),
    createdAt: "2026-10-19T00:00:00.000Z", editor: { principalId: "editor", sessionId: "session" }, restrictions: savedTimelineRestrictions };
  assert.deepEqual(parseStoredRecord(row), row);
  for (const field of ["humanApproval", "sourceVerified", "eligibleForRealTts", "eligibleForPublication", "spendingAuthority", "originalMovieAudio", "rendering"] as const) {
    const bad = clone(row); (bad.restrictions as unknown as Record<string, unknown>)[field] = "GRANTED"; assert.throws(() => parseStoredRecord(bad));
  }
  const next = clone(row); next.expectedRevision = 1; next.version = 2;
  next.previous = { id: next.id, version: 1, recordHash: "a".repeat(64), recordHashDomain: S.record, planHash: "b".repeat(64), planHashDomain: "story-recap-timeline-plan-v1" } as never;
  next.proposalHash = timelineProposalHash({ ...proposal, expectedRevision: 1, previous: next.previous });
  assert.throws(() => parseStoredRecord(next));
});
