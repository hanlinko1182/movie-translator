import assert from "node:assert/strict";
import { before, after, mock, test } from "node:test";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { highlightDatabaseFixture } from "./fixture";
before(() => { mock.method(globalThis, "fetch", () => assert.fail("No network/provider calls")); });
after(() => mock.restoreAll());
test("M6-02 authorized independent resolution -> immutable save -> exact read-back -> history", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const proposal = await f.proposal("first"), result = await f.save(proposal);
    assert.equal(result.status, "SAVED");
    assert.equal(result.view.record.plan.planHash, proposal.plan.planHash);
    assert.equal(canonicalJson(result.view.record.plan), canonicalJson(proposal.plan));
    assert.equal(result.view.record.version, 1); assert.equal(result.view.currentness, "CURRENT_AT_READ");
    assert.equal(result.view.record.restrictions.humanApproval, "NONE");
    const read = await f.api.readVersion(f.request(), { scope: f.scope, id: result.view.record.id });
    assert.deepEqual(read, result.view);
    const history = await f.api.listHistory(f.request(), { scope: f.scope, afterVersion: 0, limit: 5 });
    assert.deepEqual(history.entries, [read]); assert.equal(history.nextAfterVersion, null);
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { await f.stop(); }
});

import { contractHash } from "../../../lib/storyline/canonical";
import { HIGHLIGHT_STORE as S, HighlightStoreError, type HighlightSaveResult, type SaveHighlightProposal } from "../../../lib/storyline/highlights-persistence/contracts";
import { highlightProposalHash } from "./fixture";
const code = (c: string) => (e: unknown) => e instanceof HighlightStoreError && e.code === c;
function saved(r: HighlightSaveResult) { assert.notEqual(r.status, "UNKNOWN"); if (r.status === "UNKNOWN") assert.fail("Unknown result"); return r.view; }
const params = (s: Awaited<ReturnType<typeof highlightDatabaseFixture>>["scope"]) => [s.tenantId,s.projectId,s.movieId,s.studioId];
async function waitForBlock(f: Awaited<ReturnType<typeof highlightDatabaseFixture>>, blocker: number) {
  for (let i = 0; i < 100; i++) {
    const rows = (await f.admin.query("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [blocker])).rows;
    if (rows.length) return Number(rows[0].pid);
    await new Promise(r => setTimeout(r, 10));
  }
  assert.fail("Expected an independent backend waiting on the transaction fence");
}

test("M6-02 R4 saved edits remain distinct, unapproved, and bound to their original M4 lineage", async () => {
  const f = await highlightDatabaseFixture(true);
  try {
    const before = canonicalJson(f.fixture.capture.original), p = await f.proposal(), r = saved(await f.save(p));
    assert.equal(r.record.plan.plan.input.source.narration.artifact.kind, "R4_EDITED");
    assert.equal(r.record.plan.plan.input.source.narration.artifact.hashDomain, "story-edited-narration-v1");
    assert.equal(r.record.plan.plan.input.source.narration.original.hashDomain, "story-narration-draft-v1");
    assert.equal(r.record.restrictions.eligibleForRealTts, false); assert.equal(r.record.restrictions.eligibleForPublication, false);
    assert.equal(canonicalJson(f.fixture.capture.original), before);
  } finally { await f.stop(); }
});

test("M6-02 identical scoped proposal reuses the original; changed bytes conflict without another version", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("same-key"), first = saved(await f.save(p)), repeated = await f.save(p);
    assert.equal(repeated.status, "REUSED"); assert.deepEqual(saved(repeated), first);
    const changed = structuredClone(p); changed.plan = structuredClone(p.plan);
    (changed.plan.plan.input.policy as { maxClips: number }).maxClips = 1;
    await assert.rejects(() => f.save(changed), code("IDEMPOTENCY_CONFLICT"));
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { await f.stop(); }
});

test("M6-02 independent concurrent writers serialize one head transition and explicit revision conflict", async () => {
  const f = await highlightDatabaseFixture();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(r => { release = r; }), open = new Promise<void>(r => { entered = r; });
  try {
    const p = await f.proposal("writer-one"), q = { ...p, idempotencyKey: "writer-two" };
    let firstPid = 0;
    const first = f.save(p, "editor-a", { afterReservationForTest: async pid => { firstPid = pid; entered(); await gate; } });
    await open;
    const second = f.save(q, "editor-b").then(v => ({ value: v }), e => ({ error: e }));
    const waiter = await waitForBlock(f, firstPid); assert.notEqual(waiter, firstPid);
    release(); assert.equal((await first).status, "SAVED");
    const other = await second; assert("error" in other && code("REVISION_CONFLICT")(other.error));
    assert.deepEqual(await f.counts(), { versions: 1, reservations: 1, audits: 1, revisions: 1 });
  } finally { release(); await f.stop(); }
});

test("M6-02 same-key concurrent writers converge on the exact immutable identity", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("concurrent-duplicate");
    const both = await Promise.all([f.save(p, "editor-a"), f.save(p, "editor-b")]);
    assert.deepEqual(both.map(r => r.status).sort(), ["REUSED", "SAVED"]);
    assert.equal(saved(both[0]).recordHash, saved(both[1]).recordHash);
    assert.equal((await f.counts()).versions, 1);
  } finally { await f.stop(); }
});

test("M6-02 incorrect head or parent hash is a conflict and does not alter history", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("initial"); await f.save(p);
    await assert.rejects(() => f.save({ ...p, idempotencyKey: "stale-head" }), code("REVISION_CONFLICT"));
    const q = await f.proposal("wrong-parent"); q.previous = { ...q.previous!, recordHash: "f".repeat(64) };
    await assert.rejects(() => f.save(q), code("REVISION_CONFLICT"));
    assert.equal((await f.counts()).versions, 1);
  } finally { await f.stop(); }
});

test("M6-02 audit insertion failure rolls back reservation, immutable version, head and audit; same key can retry", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("audit-rollback");
    await f.admin.query(`CREATE FUNCTION highlight_m602.fail_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,highlight_m602,pg_temp AS 'BEGIN RAISE EXCEPTION ''H602_FORCED_AUDIT_FAILURE''; END';
      REVOKE ALL ON FUNCTION highlight_m602.fail_audit() FROM PUBLIC; ALTER FUNCTION highlight_m602.fail_audit() OWNER TO highlight_m602_owner;
      CREATE TRIGGER fail_audit BEFORE INSERT ON highlight_m602.audit_event FOR EACH ROW EXECUTE FUNCTION highlight_m602.fail_audit()`);
    await assert.rejects(() => f.save(p), code("TRANSACTION_FAILED"));
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
    await f.admin.query("DROP TRIGGER fail_audit ON highlight_m602.audit_event; DROP FUNCTION highlight_m602.fail_audit()");
    assert.equal(saved(await f.save(p)).record.version, 1);
  } finally { await f.stop(); }
});

test("M6-02 interruption after insertion rolls back all durable save state", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("after-insert");
    await assert.rejects(() => f.save(p, "editor-a", { afterInsertForTest: async () => { throw new Error("synthetic interruption"); } }), code("TRANSACTION_FAILED"));
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
    assert.equal((await f.save(p)).status, "SAVED");
  } finally { await f.stop(); }
});

test("M6-02 lost commit acknowledgement remains UNKNOWN and recovers only the original operation", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("unknown-key");
    const result = await f.save(p, "editor-a", { afterCommitForTest: async () => { throw new Error("lost acknowledgement"); } });
    assert.equal(result.status, "UNKNOWN"); if (result.status !== "UNKNOWN") assert.fail();
    assert.equal(result.safeCode, "COMMIT_ACK_LOST"); assert.equal(result.idempotencyKey, "unknown-key");
    const operation = await f.api.readOperation(f.request(), { scope: f.scope, idempotencyKey: p.idempotencyKey, proposalHash: highlightProposalHash(p) });
    assert.equal(operation.status, "FOUND"); if (operation.status !== "FOUND") assert.fail();
    assert.equal(operation.view.record.plan.planHash, p.plan.planHash);
    assert.equal((await f.counts()).versions, 1); assert.equal((await f.save(p)).status, "REUSED");
    assert.equal((await f.counts()).versions, 1);
  } finally { await f.stop(); }
});

test("M6-02 independently authorized read-back failure cannot be reported as rolled back or retried", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("readback-unknown");
    const r = await f.save(p, "editor-a", { afterCommitForTest: async () => { f.authentication.revokeForTest("session-editor-a"); } });
    assert.equal(r.status, "UNKNOWN"); if (r.status !== "UNKNOWN") assert.fail(); assert.equal(r.safeCode, "READBACK_UNAVAILABLE");
    const recovered = await f.api.readOperation(f.request("editor-b"), { scope: f.scope, idempotencyKey: p.idempotencyKey, proposalHash: highlightProposalHash(p) });
    assert.equal(recovered.status, "FOUND"); assert.equal((await f.counts()).versions, 1);
  } finally { await f.stop(); }
});

test("M6-02 source revision change between preflight and saving transaction rejects stale plan", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("source-drift"), next = structuredClone(f.initial.capture); next.current.currentness.sourceRevision++;
    await assert.rejects(() => f.save(p, "editor-a", { beforeTransactionForTest: async () => { await f.seedCapture(next); } }), code("STALE_SOURCE"));
    assert.deepEqual(await f.counts(), { versions: 0, reservations: 0, audits: 0, revisions: 0 });
  } finally { await f.stop(); }
});

test("M6-02 final currentness fence blocks an independent source writer through commit on the actual saving backend", async () => {
  const f = await highlightDatabaseFixture(), writer = await f.owned.securityAdministrator();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(r => { release = r; }), open = new Promise<void>(r => { entered = r; });
  try {
    const p = await f.proposal("source-fence"); let pid = 0;
    const saving = f.save(p, "editor-a", { afterReservationForTest: async backend => { pid = backend; entered(); await gate; } });
    await open;
    const changed = writer.query("UPDATE highlight_m602.current_dependency SET observed_reference=jsonb_set(observed_reference,'{media,sha256}',to_jsonb($5::text)) WHERE (tenant,project,movie,studio)=($1,$2,$3,$4)", [...params(f.scope), "f".repeat(64)]);
    const waiter = await waitForBlock(f, pid); assert.notEqual(waiter, pid); release();
    const result = await saving; assert.equal(result.status, "SAVED"); await changed;
    const historical = await f.api.readHead(f.request(), { scope: f.scope });
    assert.equal(historical.head!.currentness, "STALE_DEPENDENCIES"); assert.equal(historical.head!.record.plan.planHash, p.plan.planHash);
    await assert.rejects(() => f.save({ ...p, idempotencyKey: "new-stale-key" }), code("STALE_SOURCE"));
    assert.equal((await f.counts()).versions, 1);
  } finally { release(); await writer.end(); await f.stop(); }
});

test("M6-02 historical integrity survives a new current capture and exact old-key reuse", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("historical"), first = saved(await f.save(p)), next = structuredClone(f.initial.capture); next.current.currentness.narrationRevision++;
    await f.seedCapture(next);
    const old = await f.api.readVersion(f.request(), { scope: f.scope, id: first.record.id }); assert.equal(old.currentness, "STALE_DEPENDENCIES");
    assert.equal(canonicalJson(old.record), canonicalJson(first.record));
    assert.equal((await f.save(p)).status, "REUSED");
    const second = saved(await f.save(await f.proposal("new-current")));
    assert.equal(second.record.version, 2); assert.equal(second.record.previous!.recordHash, first.recordHash);
    assert.equal(second.currentness, "CURRENT_AT_READ"); assert.notEqual(second.record.plan.planHash, first.record.plan.planHash);
    const history = await f.api.listHistory(f.request(), { scope: f.scope, afterVersion: 0, limit: 5 });
    assert.deepEqual(history.entries.map(v => v.currentness), ["STALE_DEPENDENCIES", "CURRENT_AT_READ"]);
  } finally { await f.stop(); }
});

test("M6-02 scoped bounded history pagination preserves the exact immutable version chain", async () => {
  const f = await highlightDatabaseFixture();
  try {
    for (let i = 0; i < 3; i++) await f.save(await f.proposal(`version-${i}`));
    const one = await f.api.listHistory(f.request(), { scope: f.scope, afterVersion: 0, limit: 1 });
    const two = await f.api.listHistory(f.request(), { scope: f.scope, afterVersion: one.nextAfterVersion, limit: 1 });
    const three = await f.api.listHistory(f.request(), { scope: f.scope, afterVersion: two.nextAfterVersion, limit: 1 });
    assert.equal(one.nextAfterVersion, 1); assert.equal(two.nextAfterVersion, 2); assert.equal(three.nextAfterVersion, null);
    assert.equal(two.entries[0].record.previous!.id, one.entries[0].record.id); assert.equal(three.entries[0].record.previous!.id, two.entries[0].record.id);
    for (const limit of [0, 6, Number.MAX_SAFE_INTEGER]) await assert.rejects(() => f.api.listHistory(f.request(), { scope: f.scope, afterVersion: 0, limit }));
  } finally { await f.stop(); }
});

test("M6-02 tenant histories and same idempotency keys remain isolated even with identical M6 plan hashes", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const first = saved(await f.save(await f.proposal("shared-key")));
    const foreignScope = { ...f.scope, tenantId: "tenant-two" }, p = await f.proposal("shared-key", "foreign", foreignScope);
    const foreign = saved(await f.save(p, "foreign"));
    assert.equal(first.record.plan.planHash, foreign.record.plan.planHash); assert.notEqual(first.record.id, foreign.record.id);
    const h = await f.api.listHistory(f.request("foreign"), { scope: foreignScope, afterVersion: 0, limit: 5 });
    assert.deepEqual(h.entries.map(v => v.record.id), [foreign.record.id]);
    await assert.rejects(() => f.api.readVersion(f.request("foreign"), { scope: foreignScope, id: first.record.id }), code("NOT_FOUND"));
    await assert.rejects(() => f.api.readVersion(f.request("foreign"), { scope: f.scope, id: first.record.id }), code("FORBIDDEN"));
  } finally { await f.stop(); }
});

for (const [name, mutate] of [
  ["media fingerprint", (p: SaveHighlightProposal) => { (p.plan.plan.input.source.media as { sha256: string }).sha256 = "f".repeat(64); }],
  ["media duration", (p: SaveHighlightProposal) => { (p.plan.plan.input.source.media as { durationMs: number }).durationMs++; }],
  ["M1 content", (p: SaveHighlightProposal) => { (p.plan.plan.input.source.narration.source as { contentHash: string }).contentHash = "f".repeat(64); }],
  ["M3 candidate", (p: SaveHighlightProposal) => { (p.plan.plan.input.source.narration.analysis as { candidateHash: string }).candidateHash = "f".repeat(64); }],
  ["M4 narration", (p: SaveHighlightProposal) => { Object.assign(p.plan.plan.input.source.narration.original, { hash: "f".repeat(64) }); Object.assign(p.plan.plan.input.source.narration.artifact, { hash: "f".repeat(64) }); }],
  ["source revision", (p: SaveHighlightProposal) => { (p.plan.plan.input.source.currentness as { sourceRevision: number }).sourceRevision++; }],
  ["narration revision", (p: SaveHighlightProposal) => { (p.plan.plan.input.source.currentness as { narrationRevision: number }).narrationRevision++; }],
] as const) test(`M6-02 independently stored dependencies reject rehashed forged ${name}`, async () => {
  const f = await highlightDatabaseFixture();
  try { const p = structuredClone(await f.proposal()); mutate(p); Object.assign(p.plan, { planHash: contractHash(HIGHLIGHTS_PLAN, p.plan.plan) });
    await assert.rejects(() => f.save(p), code("STALE_SOURCE")); assert.equal((await f.counts()).versions, 0);
  } finally { await f.stop(); }
});
const HIGHLIGHTS_PLAN = "story-highlight-plan-v1";

test("M6-02 rehashed scoring manipulation and M4/R4 domain confusion do not reserve versions", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = structuredClone(await f.proposal()); (p.plan.plan.candidates[0] as { totalScore: number }).totalScore++;
    Object.assign(p.plan, { planHash: contractHash(HIGHLIGHTS_PLAN, p.plan.plan) });
    await assert.rejects(() => f.save(p), code("INVALID_PLAN"));
    const q = structuredClone(await f.proposal()); Object.assign(q.plan.plan.input.source.narration.artifact, { hashDomain: "story-edited-narration-v1" });
    await assert.rejects(() => f.save(q), code("INVALID_INPUT"));
    assert.equal((await f.counts()).reservations, 0);
  } finally { await f.stop(); }
});

test("M6-02 in-memory session revocation after insertion rolls back before commit", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal();
    await assert.rejects(() => f.save(p, "editor-a", { afterInsertForTest: async () => { f.authentication.revokeForTest("session-editor-a"); } }), code("SESSION_INVALID"));
    assert.equal((await f.counts()).versions, 0);
  } finally { await f.stop(); }
});

test("M6-02 database expiry is rechecked after insertion and cannot commit an expired session", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal();
    await f.admin.query("UPDATE highlight_m602.session SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id='session-editor-a'");
    let inserted = false;
    await assert.rejects(() => f.save(p, "editor-a", { beforeCommitForTest: async () => { inserted = true; await new Promise(r => setTimeout(r, 2100)); } }), code("FORBIDDEN"));
    assert(inserted); assert.equal((await f.counts()).versions, 0);
  } finally { await f.stop(); }
});

test("M6-02 independently stored but self-consistently hashed missing M3 evidence is not accepted", async () => {
  const f = await highlightDatabaseFixture(false, c => {
    c.context.candidate = structuredClone(c.context.candidate);
    (c.context.candidate.payload.findings[0].evidence[0] as { segmentId: string }).segmentId = "missing-source";
  });
  try {
    await assert.rejects(() => f.proposal("missing-evidence"), code("INTEGRITY_FAILED"));
    assert.equal((await f.counts()).versions, 0);
  } finally { await f.stop(); }
});

test("M6-02 fake audio stays a reference and cannot confer speech, approval or publication eligibility", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const { fakeVoiceRestrictions } = await import("../../../lib/storyline/voice/foundation/contracts");
    const a = { schemaVersion: "story-highlight-synthetic-audio-ref-v1", artifactId: "fake-reference", artifactHash: "a".repeat(64), planHash: "b".repeat(64),
      reference: f.initial.capture.current.narration, execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: fakeVoiceRestrictions };
    const prepared = await f.api.preparePlan(f.request(), { scope: f.scope, policy: f.fixture.input.policy, audio: a });
    const p: SaveHighlightProposal = { schemaVersion: S.proposal, ...prepared, idempotencyKey: "fake-audio-reference" }, r = saved(await f.save(p));
    assert.equal(r.record.plan.plan.input.audio!.speech, "NOT_VERIFIED"); assert.equal(r.record.restrictions.eligibleForRealTts, false);
    const bad = structuredClone(p); Object.assign(bad.plan.plan.input.audio!.restrictions, { eligibleForPublication: true });
    await assert.rejects(() => f.save(bad), code("INVALID_INPUT")); assert.equal((await f.counts()).versions, 1);
  } finally { await f.stop(); }
});

test("M6-02 disabled current policy blocks new saves while preserving historical integrity and exact-key recovery", async () => {
  const f = await highlightDatabaseFixture();
  try {
    const p = await f.proposal("old-policy"), first = saved(await f.save(p));
    await f.admin.query("UPDATE highlight_m602.policy SET enabled=false");
    const historical = await f.api.readVersion(f.request(), { scope: f.scope, id: first.record.id });
    assert.equal(historical.currentness, "STALE_DEPENDENCIES"); assert.equal(historical.recordHash, first.recordHash);
    const reused = await f.save(p); assert.equal(reused.status, "REUSED"); assert.equal(saved(reused).recordHash, first.recordHash);
    await assert.rejects(() => f.save({ ...p, idempotencyKey: "new-policy-save" }), code("STALE_SOURCE"));
    assert.equal((await f.counts()).versions, 1);
  } finally { await f.stop(); }
});
