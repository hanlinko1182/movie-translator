import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Client } from "pg";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import type { StoryScriptPayload, StoryScriptVersion, StorySourceSnapshot } from "../../lib/storyline/contracts";
import { prepareStorylineSource } from "../../lib/storyline/prepare-source";
import { validateScriptPayload } from "../../lib/storyline/script";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { verificationBinding } from "../../lib/storyline/verification";
import { SOURCE_COMPARISON_RUBRIC } from "../../lib/storyline/human-verification-contracts";
import { DisposableStorylinePostgres } from "./disposable-postgres";
import { preparationFixture, refreshCharacterHash } from "./preparation.fixture";
import { date, scope, scriptFixture } from "./fixtures";

const draftPath = "docs/drafts/storyline-m1-foundation.sql";
const sha = (value: string) => contractHash("synthetic-storyline-fixture-v1", value);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function step(t: TestContext, name: string, run: () => Promise<void>) {
  await t.test(name, run);
}
async function fails(run: () => Promise<unknown>, code: string) {
  try { await run(); }
  catch (error) {
    assert.equal((error as { code?: string }).code, code, `Expected PostgreSQL SQLSTATE ${code}`);
    return;
  }
  assert.fail(`Expected PostgreSQL SQLSTATE ${code}`);
}
async function tx(client: Client, run: () => Promise<void>) {
  await client.query("BEGIN");
  try { await run(); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
}
async function count(client: Client, table: string) {
  assert.match(table, /^Story(?:lineStudio|SourceSnapshot|ScriptVersion|Beat|SourceVerification)$/);
  const result = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`);
  return Number(result.rows[0].n);
}
async function makeBase(client: Client) {
  await client.query(`INSERT INTO "Project" ("id", "name", "slug", "updatedAt") VALUES
    ('fixture-project', 'Synthetic A', 'synthetic-a', $1),
    ('fixture-project-b', 'Synthetic B', 'synthetic-b', $1)`, [date]);
  await client.query(`INSERT INTO "Movie" ("id", "projectId", "title", "storageKey", "updatedAt") VALUES
    ('movie-old', 'fixture-project', 'Synthetic movie A', 'synthetic-only/a.mp4', $1),
    ('movie-new', 'fixture-project-b', 'Synthetic movie B', 'synthetic-only/b.mp4', $1),
    ('movie-third', 'fixture-project', 'Synthetic movie C', 'synthetic-only/c.mp4', $1)`, [date]);
  await client.query(`INSERT INTO "StorylineStudio" ("id", "projectId", "movieId", "verificationGenesisHash", "updatedAt") VALUES
    ('studio-a', 'fixture-project', 'movie-old', $1, $3),
    ('studio-b', 'fixture-project-b', 'movie-new', $2, $3)`, [
    contractHash("story-verification-ledger-empty-v1", scope),
    contractHash("story-verification-ledger-empty-v1", { projectId: "fixture-project-b", movieId: "movie-new" }), date,
  ]);
}
async function addSnapshot(client: Client, studioId: string, source: StorySourceSnapshot) {
  const p = source.payload, prep = p.preparation!;
  await client.query(`INSERT INTO "StorySourceSnapshot" (
    "id", "studioId", "projectId", "movieId", "sourceContentHash", "sourceContextHash",
    "dependencyHash", "sourceBindingHash", "sourceSha256", "sourceBytes", "sourceDurationMs", "canonicalPayload", "capturedAt"
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
    p.id, studioId, p.projectId, p.movieId, source.sourceContentHash, source.sourceContextHash,
    prep.dependencyHash, prep.sourceBindingHash, p.media.sha256, p.media.bytes, p.media.durationMs,
    canonicalJson(p), p.capturedAt,
  ]);
}
async function addScript(client: Client, studioId: string, script: StoryScriptVersion) {
  const p = script.payload;
  await client.query(`INSERT INTO "StoryScriptVersion" (
    "id", "studioId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash",
    "version", "parentVersionId", "parentVersion", "origin", "canonicalPayload"
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
    p.id, studioId, p.sourceSnapshotId, p.sourceContentHash, p.sourceContextHash, script.scriptHash,
    p.version, p.parentVersionId, p.version === 1 ? null : p.version - 1, p.origin, canonicalJson(p),
  ]);
  for (const beat of p.beats) await client.query(`INSERT INTO "StoryBeat" (
    "scriptVersionId", "studioId", "beatId", "order", "category", "startMs", "endMs", "canonicalPayload"
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [p.id, studioId, beat.id, beat.order, beat.category, beat.startMs, beat.endMs, canonicalJson(beat)]);
}

type ReceiptInput = {
  source: StorySourceSnapshot; script: StoryScriptVersion; claimId: string;
  sequence: number; previousLedgerHash: string; previousEntryId: string | null;
  kind?: "RECEIPT" | "REVOCATION"; outcome?: "SOURCE_VERIFIED" | "INCONCLUSIVE" | "UNSUPPORTED" | "REVOKED";
  studioId?: string;
};
function receipt(input: ReceiptInput) {
  const { source, script, claimId, sequence, previousLedgerHash, previousEntryId } = input;
  const binding = verificationBinding(claimId, source, script);
  const proposalCore = {
    schemaVersion: "story-human-verification-v1", kind: "SOURCE_COMPARISON_PROPOSAL", persisted: false,
    binding, scriptHash: script.scriptHash,
    chineseEvidenceHash: sha(`chinese:${claimId}`),
    translationContextHash: contractHash("story-compared-translations-v1", binding.translationContextRefs),
    rubricVersion: "chinese-source-comparison-v1", policyVersion: "story-human-verification-v1",
    ledgerHeadHash: previousLedgerHash,
  };
  const proposal = { ...proposalCore, proposalHash: contractHash("story-human-verification-proposal-v1", proposalCore) };
  const comparison = Object.fromEntries(Object.keys(SOURCE_COMPARISON_RUBRIC).map(key => [key,
    key === "translationConsistency" && binding.translationContextRefs.length === 0 ? "NOT_APPLICABLE" : "SUPPORTED"]));
  const kind = input.kind ?? "RECEIPT", outcome = input.outcome ?? "SOURCE_VERIFIED";
  const content = {
    schemaVersion: "story-persisted-human-verification-v1", issuerPolicyVersion: "story-server-issuer-v1",
    kind, previousEntryId, sequence, previousLedgerHash, proposal, outcome,
    comparison: kind === "REVOCATION" ? null : comparison,
    rationale: "Synthetic Chinese comparison fixture", operator: { authority: "TRUSTED_LOCAL_OPERATOR", operatorId: "synthetic-only", auditLabel: "Synthetic reviewer" },
    reviewedAt: date, issuedAt: date, basisReceiptHashes: [],
  };
  const entryHash = contractHash("story-persisted-human-verification-entry-v1", content);
  return { id: `verification-${entryHash}`, studioId: input.studioId ?? "studio-a", scriptVersionId: script.payload.id,
    sourceSnapshotId: source.payload.id, sourceContentHash: source.sourceContentHash, sourceContextHash: source.sourceContextHash,
    scriptHash: script.scriptHash, claimId, claimContentHash: binding.claimContentHash,
    anchorSetHash: binding.anchorSetHash, allowedAnchorSetHash: binding.allowedAnchorSetHash,
    translationContextHash: proposal.translationContextHash, qualificationHash: binding.qualificationHash,
    entryHash, sequence, previousLedgerHash, previousEntryId, kind, outcome, canonicalPayload: canonicalJson(content),
    reviewedAt: date, issuedAt: date,
  };
}
type ReceiptRow = ReturnType<typeof receipt>;
async function addReceipt(client: Client, row: ReceiptRow) {
  await client.query(`INSERT INTO "StorySourceVerification" (
    "id", "studioId", "scriptVersionId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash",
    "claimId", "claimContentHash", "anchorSetHash", "allowedAnchorSetHash", "translationContextHash", "qualificationHash",
    "entryHash", "sequence", "previousLedgerHash", "previousEntryId", "kind", "outcome", "canonicalPayload", "reviewedAt", "issuedAt"
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`, [
    row.id, row.studioId, row.scriptVersionId, row.sourceSnapshotId, row.sourceContentHash, row.sourceContextHash, row.scriptHash,
    row.claimId, row.claimContentHash, row.anchorSetHash, row.allowedAnchorSetHash, row.translationContextHash, row.qualificationHash,
    row.entryHash, row.sequence, row.previousLedgerHash, row.previousEntryId, row.kind, row.outcome, row.canonicalPayload, row.reviewedAt, row.issuedAt,
  ]);
}
async function changedSource(text = "စမ်းသပ်ထားသော ပြင်ဆင်ချက်။") {
  const fake = preparationFixture();
  fake.movie.translation!.segments[0].text = text;
  refreshCharacterHash(fake.movie);
  return (await prepareStorylineSource(scope, { database: fake.database, inspectMedia: fake.inspectMedia, now: fake.now })).snapshot;
}

test("Storyline M1 draft SQL against a disposable PostgreSQL cluster", { timeout: 120_000 }, async t => {
  const owned = await DisposableStorylinePostgres.start();
  const client = await owned.client();
  try {
    let source!: StorySourceSnapshot, script!: StoryScriptVersion;
    await step(t, "isolated PG 18.6 uses a unique scratch database and private socket", async () => {
      const row = (await client.query<{ version: string; address: string | null }>("SELECT current_setting('server_version') AS version, inet_server_addr()::text AS address")).rows[0];
      assert.match(row.version, /^18\./); assert.equal(row.address, null);
      assert.match(owned.name, /^m1e15_db_[a-f0-9]{20}$/);
    });
    await step(t, "all committed baseline migrations apply to the empty scratch database", async () => {
      const root = "prisma/migrations";
      const folders = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.includes("storyline_m1_foundation")).map(entry => entry.name).sort();
      assert.ok(folders.length >= 14);
      for (const folder of folders) await client.query(await readFile(join(root, folder, "migration.sql"), "utf8"));
      assert.equal((await client.query("SELECT count(*)::int AS n FROM \"Movie\"")).rows[0].n, 0);
    });
    await step(t, "forced DDL failure rolls back every new index, type and table", async () => {
      const draft = await readFile(draftPath, "utf8");
      assert.match(draft, /^-- REVIEW ONLY/);
      assert.match(draft, /ROLLBACK;\s*$/);
      const committed = draft.replace(/ROLLBACK;\s*$/, "COMMIT;");
      assert.notEqual(committed, draft);
      const injected = committed.replace('CREATE TABLE "StorySourceSnapshot"', 'SELECT 1/0; CREATE TABLE "StorySourceSnapshot"');
      assert.notEqual(injected, committed);
      await fails(() => client.query(injected), "22012");
      await client.query("ROLLBACK");
      assert.equal((await client.query(`SELECT to_regclass('public."StorylineStudio"') AS item`)).rows[0].item, null);
      assert.equal((await client.query(`SELECT to_regtype('public."StoryScriptOrigin"') AS item`)).rows[0].item, null);
      assert.equal((await client.query(`SELECT to_regclass('public."Movie_id_projectId_key"') AS item`)).rows[0].item, null);
    });
    await step(t, "review-only SQL applies when transformed in memory only after isolation", async () => {
      const draft = await readFile(draftPath, "utf8");
      await client.query(draft.replace(/ROLLBACK;\s*$/, "COMMIT;"));
      for (const table of ["StorylineStudio", "StorySourceSnapshot", "StoryScriptVersion", "StoryBeat", "StorySourceVerification"])
        assert.equal(await count(client, table), 0);
    });
    await step(t, "synthetic source snapshot and two ordered beats preserve exact Unicode", async () => {
      await makeBase(client);
      const fake = preparationFixture();
      source = (await prepareStorylineSource(scope, { database: fake.database, inspectMedia: fake.inspectMedia, now: fake.now })).snapshot;
      script = validateScriptPayload(scriptFixture(source), source);
      await addSnapshot(client, "studio-a", source);
      await tx(client, () => addScript(client, "studio-a", script));
      assert.equal(await count(client, "StorySourceSnapshot"), 1);
      assert.equal(await count(client, "StoryBeat"), 2);
      const saved = (await client.query<{ canonicalPayload: string }>(`SELECT "canonicalPayload" FROM "StorySourceSnapshot" WHERE id = $1`, [source.payload.id])).rows[0];
      assert.equal(saved.canonicalPayload, canonicalJson(source.payload));
      const restored = validateSourceSnapshot(JSON.parse(saved.canonicalPayload), scope);
      assert.equal(restored.sourceContextHash, source.sourceContextHash);
      assert.equal(restored.payload.transcript.segments[0].text, source.payload.transcript.segments[0].text);
      assert.equal(restored.admissions[0].status, "ADMITTED");
      if (restored.admissions[0].status === "ADMITTED") {
        assert.equal(restored.admissions[0].row.origin, "MANUAL");
        assert.equal(restored.admissions[0].row.reviewStatus, "NEEDS_REVIEW");
        assert.equal(restored.admissions[0].row.qcIssues[0].source, "MANUAL");
      }
      assert.equal(restored.admissions[1].status, "ADMITTED");
      if (restored.admissions[1].status === "ADMITTED") assert.equal(restored.admissions[1].row.reviewStatus, "APPROVED");
      assert.equal(restored.admissions[10].status, "EXCLUDED_INVALID");
      assert.equal(restored.admissions[11].status, "MISSING");
      const state = (await client.query<{ revision: number; nextScriptVersion: number }>(`SELECT revision, "nextScriptVersion" FROM "StorylineStudio" WHERE id = 'studio-a'`)).rows[0];
      assert.equal(state.revision, 2); assert.equal(state.nextScriptVersion, 2);
    });
    await step(t, "ownership, hash binding, deduplication and immutable row guards reject invalid writes", async () => {
      await fails(() => client.query(`INSERT INTO "StorylineStudio" (id,"projectId","movieId","verificationGenesisHash","updatedAt") VALUES ('wrong-studio','fixture-project-b','movie-third',$1,$2)`,
        ["a".repeat(64), date]), "23503");
      await fails(() => client.query(`INSERT INTO "StorylineStudio" (id,"projectId","movieId","verificationGenesisHash","updatedAt") VALUES ('duplicate-studio','fixture-project','movie-old',$1,$2)`,
        ["a".repeat(64), date]), "23505");
      const wrongScope = { ...source, payload: { ...source.payload, id: "snapshot-wrong-studio" } };
      await fails(() => addSnapshot(client, "studio-b", wrongScope), "23503");
      await fails(() => addSnapshot(client, "studio-a", source), "23505");
      await fails(() => client.query(`UPDATE "StorySourceSnapshot" SET "sourceSha256" = $1 WHERE id = $2`, ["b".repeat(64), source.payload.id]), "23514");
      await fails(() => client.query(`DELETE FROM "StorySourceSnapshot" WHERE id = $1`, [source.payload.id]), "23514");
      await fails(() => client.query(`UPDATE "StoryScriptVersion" SET origin = 'HUMAN' WHERE id = $1`, [script.payload.id]), "23514");
      await fails(() => client.query(`DELETE FROM "StoryScriptVersion" WHERE id = $1`, [script.payload.id]), "23514");
      await fails(() => client.query(`UPDATE "StoryBeat" SET "startMs" = 1 WHERE "scriptVersionId" = $1`, [script.payload.id]), "23514");
      await fails(() => client.query(`DELETE FROM "StoryBeat" WHERE "scriptVersionId" = $1`, [script.payload.id]), "23514");
      await fails(() => client.query(`TRUNCATE "StoryBeat"`), "23514");
      await fails(() => client.query(`DELETE FROM "Movie" WHERE id = 'movie-old'`), "23001");
      await fails(() => client.query(`UPDATE "Movie" SET "projectId"='fixture-project-b' WHERE id='movie-old'`), "23001");
      assert.equal(await count(client, "StoryBeat"), 2);
    });
    await step(t, "snapshot SQL bounds and payload projections reject malformed stored input", async () => {
      const bad = { ...source, payload: { ...source.payload, id: "snapshot-negative-bytes", media: { ...source.payload.media, bytes: -1 } } };
      await fails(() => addSnapshot(client, "studio-a", bad), "23514");
      const badHash = { ...source, payload: { ...source.payload, id: "snapshot-bad-hash" }, sourceContentHash: "not-a-sha256" };
      await fails(() => addSnapshot(client, "studio-a", badHash), "23514");
      assert.equal(await count(client, "StorySourceSnapshot"), 1);
    });
    await step(t, "deferred beat projection rejects incomplete scripts and rolls allocation back", async () => {
      const alternate = structuredClone(script.payload) as StoryScriptPayload;
      alternate.id = "script-incomplete"; alternate.version = 2; alternate.parentVersionId = script.payload.id;
      alternate.beats[0].narration[0].text = "မတူသော ဇာတ်ကြောင်း။";
      const next = validateScriptPayload(alternate, source);
      const before = (await client.query<{ revision: number; nextScriptVersion: number }>(`SELECT revision,"nextScriptVersion" FROM "StorylineStudio" WHERE id='studio-a'`)).rows[0];
      await fails(() => tx(client, async () => {
        const p = next.payload;
        await client.query(`INSERT INTO "StoryScriptVersion" (id,"studioId","sourceSnapshotId","sourceContentHash","sourceContextHash","scriptHash",version,"parentVersionId","parentVersion",origin,"canonicalPayload") VALUES ($1,'studio-a',$2,$3,$4,$5,2,$6,1,$7,$8)`,
          [p.id, p.sourceSnapshotId, p.sourceContentHash, p.sourceContextHash, next.scriptHash, p.parentVersionId, p.origin, canonicalJson(p)]);
      }), "23514");
      assert.equal(await count(client, "StoryScriptVersion"), 1);
      assert.deepEqual((await client.query(`SELECT revision,"nextScriptVersion" FROM "StorylineStudio" WHERE id='studio-a'`)).rows[0], before);
    });
    await step(t, "cross-Studio script references and surplus or duplicate beat ordering are rejected", async () => {
      const wrongPayload = structuredClone(script.payload) as StoryScriptPayload;
      wrongPayload.id = "script-wrong-studio";
      const wrong = validateScriptPayload(wrongPayload, source);
      await fails(() => tx(client, () => addScript(client, "studio-b", wrong)), "23503");
      const extra = { ...script.payload.beats[0], id: "beat-extra", order: 2 };
      await fails(() => tx(client, () => client.query(`INSERT INTO "StoryBeat" ("scriptVersionId","studioId","beatId","order",category,"startMs","endMs","canonicalPayload") VALUES ($1,'studio-a',$2,2,'OBSERVATION',0,2000,$3)`,
        [script.payload.id, extra.id, canonicalJson(extra)]).then(() => undefined)), "23514");
      await fails(() => client.query(`INSERT INTO "StoryBeat" ("scriptVersionId","studioId","beatId","order",category,"startMs","endMs","canonicalPayload") VALUES ($1,'studio-a','beat-duplicate',0,'OBSERVATION',0,2000,$2)`,
        [script.payload.id, canonicalJson({ ...script.payload.beats[0], id: "beat-duplicate" })]), "23505");
      assert.equal(await count(client, "StoryBeat"), 2);
    });
    await step(t, "receipt ledger enforces bindings, ordering, revocation and append-only history", async () => {
      const genesis = (await client.query<{ verificationGenesisHash: string }>(`SELECT "verificationGenesisHash" FROM "StorylineStudio" WHERE id='studio-a'`)).rows[0].verificationGenesisHash;
      const first = receipt({ source, script, claimId: "claim-0", sequence: 0, previousLedgerHash: genesis, previousEntryId: null });
      await addReceipt(client, first);
      assert.equal(await count(client, "StorySourceVerification"), 1);
      await fails(() => addReceipt(client, first), "23514");
      await fails(() => addReceipt(client, { ...receipt({ source, script, claimId: "claim-1", sequence: 1, previousLedgerHash: first.entryHash, previousEntryId: null }), studioId: "studio-b" }), "23514");
      await fails(() => addReceipt(client, receipt({ source, script, claimId: "claim-1", sequence: 2, previousLedgerHash: first.entryHash, previousEntryId: null })), "23514");
      await fails(() => addReceipt(client, receipt({ source, script, claimId: "claim-0", sequence: 1, previousLedgerHash: genesis, previousEntryId: first.id })), "23514");
      const revoke = receipt({ source, script, claimId: "claim-0", sequence: 1, previousLedgerHash: first.entryHash, previousEntryId: first.id, kind: "REVOCATION", outcome: "REVOKED" });
      await addReceipt(client, revoke);
      await fails(() => addReceipt(client, receipt({ source, script, claimId: "claim-0", sequence: 2, previousLedgerHash: revoke.entryHash, previousEntryId: revoke.id, kind: "REVOCATION", outcome: "REVOKED" })), "23514");
      await fails(() => client.query(`UPDATE "StorySourceVerification" SET outcome='INCONCLUSIVE' WHERE id=$1`, [first.id]), "23514");
      await fails(() => client.query(`DELETE FROM "StorySourceVerification" WHERE id=$1`, [revoke.id]), "23514");
      const tooLong = receipt({ source, script, claimId: "claim-1", sequence: 2048, previousLedgerHash: revoke.entryHash, previousEntryId: null });
      await fails(() => addReceipt(client, tooLong), "23514");
      assert.equal(await count(client, "StorySourceVerification"), 2);
    });
    await step(t, "competing Studio creation for one selected movie has one winner", async () => {
      const genesis = contractHash("story-verification-ledger-empty-v1", { projectId: "fixture-project", movieId: "movie-third" });
      const insert = (connection: Client, id: string) => connection.query(`INSERT INTO "StorylineStudio" (id,"projectId","movieId","verificationGenesisHash","updatedAt") VALUES ($1,'fixture-project','movie-third',$2,$3)`, [id, genesis, date]);
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await insert(a, "studio-c-one");
        const losing = insert(b, "studio-c-two");
        await pause(50); await a.query("COMMIT");
        await fails(() => losing, "23505"); await b.query("ROLLBACK");
        assert.equal((await client.query(`SELECT count(*)::int AS n FROM "StorylineStudio" WHERE "movieId"='movie-third'`)).rows[0].n, 1);
      } finally { await a.end(); await b.end(); }
    });
    await step(t, "concurrent identical snapshot insert deduplicates and rolls back losing revision", async () => {
      const alternative = await changedSource();
      assert.notEqual(alternative.sourceContextHash, source.sourceContextHash);
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await addSnapshot(a, "studio-a", alternative);
        const losing = addSnapshot(b, "studio-a", alternative);
        await pause(50);
        await a.query("COMMIT");
        await fails(() => losing, "23505");
        await b.query("ROLLBACK");
        assert.equal((await client.query(`SELECT count(*)::int AS n FROM "StorySourceSnapshot" WHERE "sourceContextHash"=$1`, [alternative.sourceContextHash])).rows[0].n, 1);
      } finally { await a.end(); await b.end(); }
    });
    await step(t, "concurrent script version allocation admits one winner", async () => {
      const nextPayload = structuredClone(script.payload) as StoryScriptPayload;
      nextPayload.id = "script-version-two"; nextPayload.version = 2; nextPayload.parentVersionId = script.payload.id;
      nextPayload.beats[0].narration[0].text = "ဇာတ်ကြောင်းအသစ်။";
      const next = validateScriptPayload(nextPayload, source);
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await addScript(a, "studio-a", next);
        const losing = addScript(b, "studio-a", next);
        await pause(50); await a.query("COMMIT");
        await fails(() => losing, "23514"); await b.query("ROLLBACK");
        assert.equal((await client.query(`SELECT "nextScriptVersion" FROM "StorylineStudio" WHERE id='studio-a'`)).rows[0].nextScriptVersion, 3);
        assert.equal((await client.query(`SELECT count(*)::int AS n FROM "StoryScriptVersion" WHERE version=2`)).rows[0].n, 1);
      } finally { await a.end(); await b.end(); }
    });
    await step(t, "optimistic Studio revision compare-and-set rejects a stale writer", async () => {
      const revision = (await client.query<{ revision: number }>(`SELECT revision FROM "StorylineStudio" WHERE id='studio-a'`)).rows[0].revision;
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        assert.equal((await a.query(`UPDATE "StorylineStudio" SET revision=revision WHERE id='studio-a' AND revision=$1`, [revision])).rowCount, 1);
        const losing = b.query(`UPDATE "StorylineStudio" SET revision=revision WHERE id='studio-a' AND revision=$1`, [revision]);
        await pause(50); await a.query("COMMIT");
        assert.equal((await losing).rowCount, 0); await b.query("COMMIT");
        assert.equal((await client.query(`SELECT revision FROM "StorylineStudio" WHERE id='studio-a'`)).rows[0].revision, revision + 1);
      } finally { await a.end(); await b.end(); }
    });
    await step(t, "concurrent receipt issuance and revocation have one ledger winner", async () => {
      const head = (await client.query<{ entryHash: string }>(`SELECT "entryHash" FROM "StorySourceVerification" WHERE "studioId"='studio-a' ORDER BY sequence DESC LIMIT 1`)).rows[0].entryHash;
      const aRow = receipt({ source, script, claimId: "claim-1", sequence: 2, previousLedgerHash: head, previousEntryId: null });
      const bRow = receipt({ source, script, claimId: "claim-1", sequence: 2, previousLedgerHash: head, previousEntryId: null, outcome: "INCONCLUSIVE" });
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await addReceipt(a, aRow);
        const losing = addReceipt(b, bRow);
        await pause(50); await a.query("COMMIT");
        await fails(() => losing, "23514"); await b.query("ROLLBACK");
        assert.equal(await count(client, "StorySourceVerification"), 3);
      } finally { await a.end(); await b.end(); }
    });
    await step(t, "database rejects invalid receipt shape but cannot authenticate a forged issuer or hash", async () => {
      assert.equal((await client.query<{ allowed: boolean }>(`SELECT has_table_privilege(current_user,'"StorySourceVerification"','INSERT') AS allowed`)).rows[0].allowed, true);
      const head = (await client.query<{ entryHash: string }>(`SELECT "entryHash" FROM "StorySourceVerification" WHERE "studioId"='studio-a' ORDER BY sequence DESC LIMIT 1`)).rows[0].entryHash;
      const lastClaim = (await client.query<{ id: string }>(`SELECT id FROM "StorySourceVerification" WHERE "studioId"='studio-a' AND "claimId"='claim-1' ORDER BY sequence DESC LIMIT 1`)).rows[0].id;
      const base = receipt({ source, script, claimId: "claim-1", sequence: 3, previousLedgerHash: head, previousEntryId: lastClaim });
      await fails(() => addReceipt(client, { ...base, translationContextHash: "b".repeat(64) }), "23514");
      await fails(() => addReceipt(client, { ...base, claimId: "claim-unknown" }), "23514");
      const forged = { ...base, entryHash: "f".repeat(64), id: `verification-${"f".repeat(64)}` };
      await client.query("BEGIN");
      try {
        await addReceipt(client, forged);
        assert.equal((await client.query(`SELECT count(*)::int AS n FROM "StorySourceVerification" WHERE id=$1`, [forged.id])).rows[0].n, 1);
      } finally { await client.query("ROLLBACK"); }
      assert.equal(await count(client, "StorySourceVerification"), 3);
    });
    await step(t, "revocation competing with supersession and later failure cannot fork or partially commit", async () => {
      const head = (await client.query<{ id: string; entryHash: string }>(`SELECT id,"entryHash" FROM "StorySourceVerification" WHERE "studioId"='studio-a' ORDER BY sequence DESC LIMIT 1`)).rows[0];
      const revocation = receipt({ source, script, claimId: "claim-1", sequence: 3, previousLedgerHash: head.entryHash, previousEntryId: head.id, kind: "REVOCATION", outcome: "REVOKED" });
      const replacement = receipt({ source, script, claimId: "claim-1", sequence: 3, previousLedgerHash: head.entryHash, previousEntryId: head.id, outcome: "INCONCLUSIVE" });
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await addReceipt(a, revocation);
        const losing = addReceipt(b, replacement);
        await pause(50); await a.query("COMMIT");
        await fails(() => losing, "23514"); await b.query("ROLLBACK");
        assert.equal(await count(client, "StorySourceVerification"), 4);
        const rolledBack = receipt({ source, script, claimId: "claim-0", sequence: 4, previousLedgerHash: revocation.entryHash,
          previousEntryId: (await client.query<{ id: string }>(`SELECT id FROM "StorySourceVerification" WHERE "claimId"='claim-0' ORDER BY sequence DESC LIMIT 1`)).rows[0].id });
        await fails(() => tx(client, async () => {
          await addReceipt(client, rolledBack);
          await client.query(`UPDATE "StorylineStudio" SET "currentSnapshotId"='missing-snapshot' WHERE id='studio-a'`);
        }), "23503");
        assert.equal(await count(client, "StorySourceVerification"), 4);
      } finally { await a.end(); await b.end(); }
    });
    await step(t, "source-writer race is serialized, while live-file currentness remains an issuer obligation", async () => {
      const alternative = await changedSource("နောက်ထပ် စမ်းသပ်စာသား။");
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await a.query(`UPDATE "Movie" SET "storageKey"='synthetic-only/changed.mp4' WHERE id='movie-old'`);
        const waiting = addSnapshot(b, "studio-a", alternative);
        await pause(50); await a.query("COMMIT");
        await waiting; await b.query("COMMIT");
        assert.equal((await client.query(`SELECT "storageKey" FROM "Movie" WHERE id='movie-old'`)).rows[0].storageKey, "synthetic-only/changed.mp4");
        assert.equal((await client.query(`SELECT count(*)::int AS n FROM "StorySourceSnapshot" WHERE id=$1`, [alternative.payload.id])).rows[0].n, 1);
      } finally { await a.end(); await b.end(); }
    });
    await step(t, "opposite Movie lock order produces a bounded deadlock and both transactions roll back", async () => {
      const a = await owned.client(), b = await owned.client();
      try {
        await a.query("BEGIN"); await b.query("BEGIN");
        await a.query(`SELECT id FROM "Movie" WHERE id='movie-old' FOR UPDATE`);
        await b.query(`SELECT id FROM "Movie" WHERE id='movie-new' FOR UPDATE`);
        const first = a.query(`SELECT id FROM "Movie" WHERE id='movie-new' FOR UPDATE`).then(() => ({ side: "a", code: "ok" }), error => ({ side: "a", code: (error as { code?: string }).code }));
        await pause(50);
        const second = b.query(`SELECT id FROM "Movie" WHERE id='movie-old' FOR UPDATE`).then(() => ({ side: "b", code: "ok" }), error => ({ side: "b", code: (error as { code?: string }).code }));
        const loser = await Promise.race([first, second]);
        assert.equal(loser.code, "40P01");
        if (loser.side === "a") await a.query("ROLLBACK"); else await b.query("ROLLBACK");
        const winner = await (loser.side === "a" ? second : first);
        assert.equal(winner.code, "ok");
        if (loser.side === "a") await b.query("ROLLBACK"); else await a.query("ROLLBACK");
      } finally { await a.end(); await b.end(); }
    });
  } finally {
    await client.end();
    await owned.stop();
  }
  await assert.rejects(() => access(owned.root), { code: "ENOENT" }, "Only this test-owned scratch cluster should be removed at teardown");
});
