import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import { LIMITS, BEAT_CATEGORIES } from "../../lib/storyline/contracts";
import { HUMAN_VERIFICATION } from "../../lib/storyline/human-verification-contracts";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { validateScriptPayload } from "../../lib/storyline/script";
import { scope, sourceFixture, scriptFixture } from "./fixtures";

const root = process.cwd();
const draftPath = "docs/drafts/storyline-m1-foundation";
const fragment = readFileSync(`${draftPath}.prisma`, "utf8");
const sql = readFileSync(`${draftPath}.sql`, "utf8");
const models = ["StorylineStudio", "StorySourceSnapshot", "StoryScriptVersion", "StoryBeat", "StorySourceVerification"];

// Static checks below review the draft, not PostgreSQL trigger execution.
test("promoted proposal retains exactly five draft models and review SQL still rolls back", async () => {
  assert.deepEqual([...fragment.matchAll(/^model (\w+)/gm)].map(match => match[1]), models);
  assert.deepEqual([...sql.matchAll(/^CREATE TABLE "(\w+)"/gm)].map(match => match[1]), models);
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|DELETE FROM|ALTER TYPE|INSERT INTO)\b/m);
  assert.match(sql, /^-- REVIEW ONLY/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.doesNotMatch(sql, /\bCOMMIT\s*;/);
  const live = await readFile("prisma/schema.prisma", "utf8");
  for (const model of models) assert.match(live, new RegExp(`model ${model}\\b`));
  const migration = await readFile("prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql", "utf8");
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /ROLLBACK;\s*$/);
  const statements = (text: string) => text.split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n");
  assert.equal(statements(migration), statements(sql).replace(/ROLLBACK;\s*$/, "COMMIT;\n"));
});

test("live proposal validates with installed Prisma using isolated dummy configuration and no database", async () => {
  const livePath = join(root, "prisma/schema.prisma");
  const before = await readFile(livePath, "utf8");
  const directory = await mkdtemp(join(tmpdir(), "storyline-schema-review-"));
  try {
    await writeFile(join(directory, "schema.prisma"), before);
    // No dotenv import, real configuration or database endpoint is used.
    await writeFile(join(directory, "prisma.config.ts"), 'export default { schema: "./schema.prisma", datasource: { url: "postgresql://review:review@127.0.0.1:1/disposable_not_connected" } };\n');
    const environment: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "", DATABASE_URL: "postgresql://review:review@127.0.0.1:1/disposable_not_connected" };
    // The CLI is a plain subprocess, not a nested node:test protocol child.
    delete environment.NODE_TEST_CONTEXT;
    try {
      execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "validate", "--config", join(directory, "prisma.config.ts")], {
        cwd: root, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
        env: environment,
      });
    } catch (error) {
      const result = error as { code?: string; status?: number; stdout?: string; stderr?: string };
      assert.fail(`Pure draft validation failed (${result.code ?? result.status ?? "unknown"}):\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    }
    // Prisma CLI exits nonzero for schema errors. Its success banner is not
    // reliable inside node:test child processes, so the exit code is the gate.
    assert.equal(await readFile(livePath, "utf8"), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("FK scopes include selected movie/project, snapshot hashes, parent version and receipt claim", () => {
  for (const statement of [
    'FOREIGN KEY ("movieId", "projectId") REFERENCES "Movie" ("id", "projectId")',
    'FOREIGN KEY ("studioId", "projectId", "movieId") REFERENCES "StorylineStudio" ("id", "projectId", "movieId")',
    'FOREIGN KEY ("sourceSnapshotId", "studioId", "sourceContentHash", "sourceContextHash") REFERENCES "StorySourceSnapshot" ("id", "studioId", "sourceContentHash", "sourceContextHash")',
    'FOREIGN KEY ("parentVersionId", "studioId", "parentVersion") REFERENCES "StoryScriptVersion" ("id", "studioId", "version")',
    'FOREIGN KEY ("scriptVersionId", "studioId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash") REFERENCES "StoryScriptVersion" ("id", "studioId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash")',
    'FOREIGN KEY ("previousEntryId", "studioId", "claimId") REFERENCES "StorySourceVerification" ("id", "studioId", "claimId")',
  ]) assert.ok(sql.includes(statement), statement);
  for (const table of ["Transcript", "TranscriptSegment", "Translation", "TranslatedSegment", "Scene", "Character", "CharacterRelationship", "Recap", "RenderJob"]) {
    assert.doesNotMatch(sql, new RegExp(`REFERENCES "${table}"`));
  }
  assert.doesNotMatch(sql, /ON DELETE CASCADE|ON UPDATE CASCADE/);
});

test("immutable history rejects updates, deletes and truncation; roots and successors cannot fork", () => {
  for (const model of models.slice(1)) {
    assert.match(sql, new RegExp(`BEFORE UPDATE OR DELETE ON "${model}"`));
    assert.match(sql, new RegExp(`BEFORE TRUNCATE ON "${model}"`));
  }
  assert.match(sql, /"previousEntryId" TEXT UNIQUE/);
  assert.match(sql, /UNIQUE INDEX "StorySourceVerification_one_claim_root"[\s\S]*WHERE "previousEntryId" IS NULL/);
  assert.match(sql, /NEW\."previousEntryId" IS DISTINCT FROM previous\."id"/);
  assert.match(sql, /NEW\."previousLedgerHash" IS DISTINCT FROM COALESCE/);
  assert.match(sql, /NEW\."sequence" <> COALESCE\(head\."sequence" \+ 1, 0\)/);
  assert.doesNotMatch(fragment, /approvedAt|approvalStatus|isTrusted|SOURCE_VERIFIED\s+@default/);
});

test("SQL ceilings follow pure contracts, including byte ceilings and finite integer intervals", () => {
  for (const value of [LIMITS.snapshotBytes, LIMITS.scriptBytes, LIMITS.receiptBytes, HUMAN_VERIFICATION.maxEntries - 1]) assert.ok(sql.includes(String(value)));
  for (const category of BEAT_CATEGORIES) assert.ok(sql.includes(`'${category}'`));
  assert.match(sql, /"order" BETWEEN 0 AND 59 AND "startMs" >= 0 AND "endMs" > "startMs"/);
  assert.match(sql, /"endMs" > duration/);
  assert.match(sql, /isfinite\("reviewedAt"\)/);
  assert.match(sql, /\) IS TRUE\)/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /NEW\."version" <> studio\."nextScriptVersion"/);
  assert.match(sql, /NEW\."revision" := OLD\."revision" \+ 1/);
  assert.ok(sql.indexOf('FROM "Movie"', sql.indexOf("CREATE FUNCTION story_m1_lock_studio")) < sql.indexOf('INTO STRICT result FROM "StorylineStudio"'));
});

test("canonical source and script round trips preserve exact ALL_CURRENT metadata and historical anchors", () => {
  const source = validateSourceSnapshot(sourceFixture(), scope);
  const stored = canonicalJson(source.payload, LIMITS.snapshotBytes);
  const loaded = validateSourceSnapshot(JSON.parse(stored), scope);
  assert.equal(loaded.sourceContentHash, source.sourceContentHash);
  assert.equal(loaded.sourceContextHash, source.sourceContextHash);
  assert.equal(canonicalJson(loaded.payload), stored);
  assert.deepEqual(loaded.admissions, source.admissions);
  assert.equal(loaded.payload.transcript.segments.length, 12);
  assert.equal(loaded.payload.scenes.length, 1);
  const manual = loaded.admissions[0];
  assert.equal(manual.status, "ADMITTED");
  if (manual.status === "ADMITTED") {
    assert.equal(manual.row.origin, "MANUAL");
    assert.equal(manual.row.reviewStatus, "NEEDS_REVIEW");
    assert.equal(manual.row.text, sourceFixture().translation!.rows[0].text);
    assert.equal(manual.row.qcIssues[0].source, "MANUAL");
  }
  const script = validateScriptPayload(scriptFixture(loaded), loaded);
  const scriptBytes = canonicalJson(script.payload, LIMITS.scriptBytes);
  const reread = validateScriptPayload(JSON.parse(scriptBytes), loaded);
  assert.equal(reread.scriptHash, script.scriptHash);
  assert.equal(script.payload.beats.length, 2);
  for (const beat of script.payload.beats) assert.deepEqual(JSON.parse(canonicalJson(beat)), beat);
});

test("approval-only, QC-only, text-only and alignment changes invalidate persisted context bindings", () => {
  const baseline = validateSourceSnapshot(sourceFixture(), scope);
  for (const mutate of [
    (row: ReturnType<typeof sourceFixture>) => { row.translation!.rows[0].reviewStatus = "APPROVED"; },
    (row: ReturnType<typeof sourceFixture>) => { row.translation!.rows[0].qcIssues[0].resolution = "Human review"; },
    (row: ReturnType<typeof sourceFixture>) => { row.translation!.rows[0].text += " ထပ်မံ။"; },
    (row: ReturnType<typeof sourceFixture>) => { row.translation!.rows[0].endMs += 1; },
  ]) {
    const changed = sourceFixture(); mutate(changed);
    const next = validateSourceSnapshot(changed, scope);
    assert.notEqual(next.sourceContextHash, baseline.sourceContextHash);
    assert.throws(() => validateScriptPayload(scriptFixture(baseline), next));
  }
  const nextCapture = sourceFixture(); nextCapture.capturedAt = "2026-10-02T00:00:00.000Z";
  assert.equal(validateSourceSnapshot(nextCapture, scope).sourceContextHash, baseline.sourceContextHash);
});

test("hash shape is not issuance trust and durable receipt format cannot import ephemeral authority", () => {
  const digest = contractHash("story-verification-ledger-empty-v1", scope);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(sql, /story-persisted-human-verification-v1/);
  assert.match(sql, /story-server-issuer-v1/);
  assert.doesNotMatch(sql, /SECURITY DEFINER\s+AS|current_setting\(/);
  assert.match(sql, /REVOKE ALL ON "StorySourceVerification" FROM PUBLIC/);
});
