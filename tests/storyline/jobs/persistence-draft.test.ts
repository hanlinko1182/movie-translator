import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const models = ["StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryProviderSubmission", "StoryTaskResult", "StoryTaskEvent"];
const root = process.cwd();
const fragmentPath = "docs/drafts/storyline-m2-jobs.prisma";
const sqlPath = "docs/drafts/storyline-m2-jobs.sql";

test("M2 draft has exactly six additive models, no live migration, and rolls back by default", async () => {
  const [fragment, sql, live] = await Promise.all([
    readFile(fragmentPath, "utf8"), readFile(sqlPath, "utf8"), readFile("prisma/schema.prisma", "utf8"),
  ]);
  assert.deepEqual([...fragment.matchAll(/^model (\w+)/gm)].map(match => match[1]), models);
  assert.deepEqual([...sql.matchAll(/^CREATE TABLE "(\w+)"/gm)].map(match => match[1]), models);
  for (const model of models) assert.doesNotMatch(live, new RegExp(`^model ${model}\\b`, "m"));
  assert.match(sql, /^-- REVIEW ONLY/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|DELETE FROM|INSERT INTO)\b/m);
  assert.doesNotMatch(sql, /ON DELETE CASCADE|ON UPDATE CASCADE/);
});

test("draft declares scoped M1 links and database-only safety guards", async () => {
  const sql = await readFile(sqlPath, "utf8");
  for (const ref of ["StorylineStudio", "StorySourceSnapshot", "StoryScriptVersion"]) assert.match(sql, new RegExp(`REFERENCES "${ref}"`));
  for (const model of models) {
    assert.match(sql, new RegExp(`CREATE TABLE "${model}"`));
    assert.match(sql, new RegExp(`"${model}_no_delete"`));
    assert.match(sql, new RegExp(`"${model}_no_truncate"`));
  }
  assert.match(sql, /StoryProviderSubmission_global_unresolved_slot/);
  assert.match(sql, /WHERE "state" IN \('SUBMITTED','UNKNOWN'\)/);
  assert.match(sql, /Definitive result required to release slot/);
  assert.match(sql, /Submission checkpoint required/);
  assert.match(sql, /Single-use confirmation violated/);
  assert.match(sql, /Stale dispatch generation/);
  assert.match(sql, /StoryTaskResult_immutable/);
  assert.match(sql, /StoryTaskEvent_append_only/);
});

test("every scalar Prisma draft field has an SQL column and pure state/limit identities agree", async () => {
  const [fragment, sql] = await Promise.all([readFile(fragmentPath, "utf8"), readFile(sqlPath, "utf8")]);
  for (const model of models) {
    const prismaBlock = fragment.match(new RegExp(`model ${model} \\{([\\s\\S]*?)^\\}`, "m"))?.[1];
    const sqlBlock = sql.match(new RegExp(`CREATE TABLE "${model}" \\(([\\s\\S]*?)^\\);`, "m"))?.[1];
    assert.ok(prismaBlock && sqlBlock, model);
    const fields = [...prismaBlock.matchAll(/^  (\w+)\s+(?:String|Int|BigInt|DateTime|StoryTaskKind|StoryTaskState|StoryConfirmationState|StorySubmissionState|StoryResultOutcome|StoryUsageClass)\??(?:\[\])?/gm)].map(match => match[1]);
    assert.ok(fields.length > 3, model);
    for (const field of fields) assert.ok(sqlBlock.includes(`"${field}"`), `${model}.${field}`);
  }
  for (const state of ["QUEUED", "LEASED", "SUBMITTED", "UNKNOWN", "COMPLETED", "FAILED", "CANCELLED"])
    assert.match(sql, new RegExp(`'${state}'`));
  assert.match(sql, /octet_length\("canonicalRecipe"\) BETWEEN 1 AND 16384/);
  assert.match(sql, /octet_length\("normalizedPayload"\) BETWEEN 2 AND 524288/);
});

test("M2 fragment validates with Prisma against isolated dummy config; app schema remains untouched", async () => {
  const livePath = join(root, "prisma/schema.prisma");
  const before = await readFile(livePath, "utf8");
  const fragment = await readFile(fragmentPath, "utf8");
  const directory = await mkdtemp(join(tmpdir(), "storyline-m2-schema-review-"));
  try {
    const assembled = before
      .replace("  verifications StorySourceVerification[]", "  verifications StorySourceVerification[]\n  tasks StoryTask[]\n  paidConfirmations StoryPaidConfirmation[]")
      .replace("  scripts StoryScriptVersion[]\n  currentIn StorylineStudio[]", "  scripts StoryScriptVersion[]\n  storyTasks StoryTask[]\n  currentIn StorylineStudio[]")
      .replace("  beats StoryBeat[]", "  storyTasks StoryTask[]\n  beats StoryBeat[]");
    assert.notEqual(assembled, before);
    await writeFile(join(directory, "schema.prisma"), `${assembled}\n${fragment}`);
    await writeFile(join(directory, "prisma.config.ts"), 'export default { schema: "./schema.prisma", datasource: { url: "postgresql://review:review@127.0.0.1:1/disposable_not_connected" } };\n');
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "", DATABASE_URL: "postgresql://review:review@127.0.0.1:1/disposable_not_connected" };
    delete env.NODE_TEST_CONTEXT;
    try {
      execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "validate", "--config", join(directory, "prisma.config.ts")], {
        cwd: root, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"], env,
      });
    } catch (error) {
      const result = error as { code?: string; status?: number; stdout?: string; stderr?: string; message?: string };
      assert.fail(`Isolated Prisma validation failed (${result.code ?? result.status ?? "unknown"}):\n${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.message ?? ""}`);
    }
    assert.equal(await readFile(livePath, "utf8"), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
