import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { generateHighlightPlan } from "../../../lib/storyline/highlights/planner";
import { highlightsFixture } from "../highlights/fixture";
import { HIGHLIGHT_STORE as S, parseSaveHighlightProposal, parseStoredRecord, highlightProposalHash, savedHighlightRestrictions, type SaveHighlightProposal } from "../../../lib/storyline/highlights-persistence/contracts";
function input(): SaveHighlightProposal {
  const f = highlightsFixture(); return { schemaVersion: S.proposal, scope: { tenantId: "tenant-one", ...f.input.source.narration.scope }, idempotencyKey: "proposal-one", expectedRevision: 0, previous: null, plan: generateHighlightPlan(f.input, f.resolver) };
}
for (const [name, mutate] of [
  ["unknown role", (p: SaveHighlightProposal) => { Object.assign(p, { role: "ADMIN" }); }],
  ["unsupported version", (p: SaveHighlightProposal) => { Object.assign(p, { schemaVersion: "unknown" }); }],
  ["unknown scope", (p: SaveHighlightProposal) => { Object.assign(p.scope, { owner: "admin" }); }],
  ["cross-movie binding", (p: SaveHighlightProposal) => { p.scope.movieId = "other-movie"; }],
  ["negative revision", (p: SaveHighlightProposal) => { p.expectedRevision = -1; }],
  ["unsafe revision", (p: SaveHighlightProposal) => { p.expectedRevision = Number.MAX_SAFE_INTEGER + 1; }],
  ["negative zero", (p: SaveHighlightProposal) => { p.expectedRevision = -0; }],
  ["missing parent", (p: SaveHighlightProposal) => { p.expectedRevision = 1; }],
  ["contradictory first parent", (p: SaveHighlightProposal) => { p.previous = { id: "parent", recordHash: "a".repeat(64), planHash: "b".repeat(64), version: 1 }; }],
  ["wrong parent domain", (p: SaveHighlightProposal) => { p.expectedRevision = 1; p.previous = { id: "parent", recordHash: "a".repeat(64), planHash: "b".repeat(64), version: 1 }; Object.assign(p.previous, { hashDomain: "story-narration-draft-v1" }); }],
  ["malformed plan hash", (p: SaveHighlightProposal) => { Object.assign(p.plan, { planHash: "invalid" }); }],
  ["invalid Unicode", (p: SaveHighlightProposal) => { p.idempotencyKey = "\ud800"; }],
  ["oversize key", (p: SaveHighlightProposal) => { p.idempotencyKey = "a".repeat(129); }],
] as const) test(`M6-02 strict persistence proposal rejects ${name}`, () => { const p = structuredClone(input()); mutate(p); assert.throws(() => parseSaveHighlightProposal(p)); });

test("M6-02 persistence domains preserve the exact M6-01 plan hash and strict immutable record", () => {
  const p = input(), proposal = parseSaveHighlightProposal(p); assert(Object.isFrozen(proposal.plan.plan.candidates));
  const v = { schemaVersion: S.record, scope: p.scope, id: "saved-plan", version: 1, previous: null, expectedRevision: 0, idempotencyKey: p.idempotencyKey,
    proposalHash: highlightProposalHash(p), dependencyId: "stored-context", dependencyHash: "d".repeat(64), createdAt: "2026-10-19T00:00:00.000Z",
    editor: { principalId: "synthetic-editor", sessionId: "synthetic-session" }, plan: p.plan, restrictions: savedHighlightRestrictions };
  const parsed = parseStoredRecord(v); assert.equal(parsed.plan.planHash, p.plan.planHash);
  assert.notEqual(contractHash(S.record, parsed), p.plan.planHash); assert.equal(canonicalJson(parsed.plan), canonicalJson(p.plan));
  assert.throws(() => parseStoredRecord({ ...v, schemaVersion: "story-highlight-plan-v1" }));
  assert.throws(() => parseStoredRecord({ ...v, restrictions: { ...savedHighlightRestrictions, humanApproval: "APPROVED" } }));
  assert.throws(() => parseStoredRecord({ ...v, version: 2 }));
});
