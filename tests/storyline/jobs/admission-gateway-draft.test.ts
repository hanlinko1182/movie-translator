// Review-only, synthetic schema/ACL tests. Never reads the application DATABASE_URL.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "pg";
import { DisposableStorylinePostgres } from "../disposable-postgres";

const ledgerPath = "docs/drafts/storyline-m2-admission-ledger.sql";
const fragmentPath = "docs/drafts/storyline-m2-admission-ledger.prisma";
const ledgerTables = ["StorySpendingDecision", "StoryAdmission"];
const roles = ["storyline_runtime", "storyline_verification_issuer", "storyline_admission_writer", "storyline_checkpoint_worker"] as const;

test("admission ledger remains review-only, immutable, scoped, and without an executable gateway", async () => {
  const [sql, prisma] = await Promise.all([readFile(ledgerPath, "utf8"), readFile(fragmentPath, "utf8")]);
  assert.deepEqual([...sql.matchAll(/^CREATE TABLE "(\w+)"/gm)].map(match => match[1]), ledgerTables);
  assert.deepEqual([...prisma.matchAll(/^model (\w+)/gm)].map(match => match[1]), ledgerTables);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.match(sql, /UNIQUE \("subjectId","projectId","movieId","idempotencyKey"\)/);
  assert.match(sql, /UNIQUE \("nonceHash"\)|"nonceHash" VARCHAR\(64\) NOT NULL UNIQUE/);
  assert.match(sql, /"StorySpendingDecision_immutable"/);
  assert.match(sql, /"StoryAdmission_immutable"/);
  assert.match(sql, /"StoryAdmission_confirmation_fkey"/);
  assert.match(sql, /"StoryAdmission_decision_fkey"/);
  assert.match(sql, /"StoryAdmission_task_fkey"/);
  assert.match(sql, /REVOKE ALL ON FUNCTION story_m2_guard_admission\(\) FROM PUBLIC/);
  assert.doesNotMatch(sql, /SECURITY DEFINER|GRANT (?:EXECUTE|INSERT|UPDATE|DELETE)/);
});

test("both review-only Prisma fragments validate in an isolated schema", async () => {
  const root = process.cwd();
  const base = await readFile("prisma/schema.prisma", "utf8");
  const m2 = await readFile("docs/drafts/storyline-m2-jobs.prisma", "utf8");
  const ledger = await readFile(fragmentPath, "utf8");
  const assembled = `${base}\n${m2}\n${ledger}`
    .replace("  verifications StorySourceVerification[]", "  verifications StorySourceVerification[]\n  tasks StoryTask[]\n  paidConfirmations StoryPaidConfirmation[]\n  spendingDecisions StorySpendingDecision[]\n  admissions StoryAdmission[]")
    .replace("  scripts StoryScriptVersion[]\n  currentIn StorylineStudio[]", "  scripts StoryScriptVersion[]\n  storyTasks StoryTask[]\n  spendingDecisions StorySpendingDecision[]\n  currentIn StorylineStudio[]")
    .replace("  beats StoryBeat[]", "  storyTasks StoryTask[]\n  spendingDecisions StorySpendingDecision[]\n  beats StoryBeat[]")
    .replace("  events StoryTaskEvent[]", "  events StoryTaskEvent[]\n  admissions StoryAdmission[]")
    .replace("  submissions StoryProviderSubmission[]\n  @@unique([id, taskId, generation])", "  submissions StoryProviderSubmission[]\n  admissions StoryAdmission[]\n  @@unique([id, taskId, generation])");
  assert.notEqual(assembled, base);
  const directory = await mkdtemp(join(tmpdir(), "storyline-m2-admission-review-"));
  try {
    await writeFile(join(directory, "schema.prisma"), assembled);
    await writeFile(join(directory, "prisma.config.ts"), 'export default { schema: "./schema.prisma", datasource: { url: "postgresql://review:review@127.0.0.1:1/disposable_not_connected" } };\n');
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "", DATABASE_URL: "postgresql://review:review@127.0.0.1:1/disposable_not_connected" };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "validate", "--config", join(directory, "prisma.config.ts")], {
      cwd: root, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"], env,
    });
    assert.equal(await readFile("prisma/schema.prisma", "utf8"), base);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const order of ["M1 roles then M2", "M2 then M1 roles"] as const) {
  test(`admission ledger grants no runtime or gateway DML in ${order}`, { timeout: 150_000 }, async () => {
    const owned = await DisposableStorylinePostgres.start();
    const baseline = await owned.client();
    try {
      const folders = (await readdir("prisma/migrations", { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && !entry.name.includes("storyline_m1_foundation"))
        .map(entry => entry.name).sort();
      for (const folder of folders) await baseline.query(await readFile(join("prisma/migrations", folder, "migration.sql"), "utf8"));
      await baseline.query(await readFile("prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql", "utf8"));
      const admin = await owned.securityAdministrator();
      try {
        const m1Roles = await readFile("docs/drafts/storyline-verification-roles.sql", "utf8");
        const apply = async (path: string) => {
          const sql = await readFile(path, "utf8");
          assert.match(sql, /ROLLBACK;\s*$/);
          await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
        };
        if (order === "M1 roles then M2") { await admin.query(m1Roles); await apply("docs/drafts/storyline-m2-jobs.sql"); }
        else { await apply("docs/drafts/storyline-m2-jobs.sql"); await admin.query(m1Roles); }
        await apply(ledgerPath);
        const constraints = (await admin.query<{ conname: string }>(
          `SELECT conname FROM pg_constraint WHERE conrelid = 'public."StoryAdmission"'::regclass`)).rows.map(row => row.conname);
        for (const name of ["StoryAdmission_scoped_key", "StoryAdmission_task_generation_key", "StoryAdmission_decision_fkey", "StoryAdmission_confirmation_fkey"])
          assert.ok(constraints.includes(name), name);
        const triggers = (await admin.query<{ tgname: string }>(
          `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public."StoryAdmission"'::regclass AND NOT tgisinternal`)).rows.map(row => row.tgname);
        for (const name of ["StoryAdmission_binding_guard", "StoryAdmission_immutable", "StoryAdmission_no_truncate"])
          assert.ok(triggers.includes(name), name);
        const slot = (await admin.query<{ exists: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='StoryProviderSubmission_global_unresolved_slot') "exists"`)).rows[0];
        assert.equal(slot.exists, true);
        for (const role of ["storyline_admission_writer", "storyline_checkpoint_worker"])
          await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
        await admin.query("GRANT USAGE ON SCHEMA public TO storyline_admission_writer, storyline_checkpoint_worker");
      } finally { await admin.end(); }

      for (const role of roles) {
        const client = new Client(await owned.restrictedLogin(role));
        await client.connect();
        try {
          for (const table of ledgerTables) {
            const result = (await client.query<{ insert: boolean; update: boolean; delete: boolean }>(
              `SELECT has_table_privilege(current_user,$1,'INSERT') "insert", has_table_privilege(current_user,$1,'UPDATE') "update", has_table_privilege(current_user,$1,'DELETE') "delete"`,
              [`public."${table}"`])).rows[0];
            assert.deepEqual(result, { insert: false, update: false, delete: false });
            await assert.rejects(client.query(`INSERT INTO public."${table}" DEFAULT VALUES`),
              (error: unknown) => (error as { code?: string }).code === "42501");
          }
          const gateway = (await client.query<{ gateway: string | null }>(
            "SELECT to_regprocedure('public.story_m2_admit(text)')::text gateway")).rows[0];
          assert.equal(gateway.gateway, null);
          assert.equal((await client.query<{ callable: boolean }>(
            `SELECT has_function_privilege(current_user,'public.story_m2_guard_admission()','EXECUTE') "callable"`)).rows[0].callable, false);
          assert.equal((await client.query<{ canWrite: boolean }>(
            `SELECT has_table_privilege(current_user,'public."StorySourceVerification"','INSERT') "canWrite"`)).rows[0].canWrite, false);
        } finally { await client.end(); }
      }
    } finally { await baseline.end(); await owned.stop(); }
  });
}
