// Disposable, synthetic ACL review only. No application DATABASE_URL is read.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "pg";
import { DisposableStorylinePostgres } from "../disposable-postgres";

const tables = ["StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryProviderSubmission", "StoryTaskResult", "StoryTaskEvent"];
const groups = ["storyline_runtime", "storyline_verification_issuer", "storyline_admission_writer", "storyline_checkpoint_worker"] as const;

async function applyM2(client: Client) {
  const draft = await readFile("docs/drafts/storyline-m2-jobs.sql", "utf8");
  assert.match(draft, /ROLLBACK;\s*$/);
  await client.query(draft.replace(/ROLLBACK;\s*$/, "COMMIT;"));
}

for (const order of ["M1 roles then M2", "M2 then M1 roles"] as const) {
  test(`M2 privilege boundary survives ${order} on isolated PostgreSQL`, { timeout: 150_000 }, async () => {
    const owned = await DisposableStorylinePostgres.start();
    const baseline = await owned.client();
    try {
      const migrations = (await readdir("prisma/migrations", { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && !entry.name.includes("storyline_m1_foundation"))
        .map(entry => entry.name).sort();
      for (const folder of migrations) await baseline.query(await readFile(join("prisma/migrations", folder, "migration.sql"), "utf8"));
      await baseline.query(await readFile("prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql", "utf8"));
      const admin = await owned.securityAdministrator();
      try {
        const m1Roles = await readFile("docs/drafts/storyline-verification-roles.sql", "utf8");
        if (order === "M1 roles then M2") { await admin.query(m1Roles); await applyM2(admin); }
        else { await applyM2(admin); await admin.query(m1Roles); }
        await admin.query(`CREATE ROLE storyline_admission_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
        await admin.query(`CREATE ROLE storyline_checkpoint_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
        await admin.query(`GRANT USAGE ON SCHEMA public TO storyline_admission_writer, storyline_checkpoint_worker`);
        for (const table of tables) {
          const row = (await admin.query<{ owner: string; ownerWrite: boolean }>(
            `SELECT pg_get_userbyid(c.relowner) owner, has_table_privilege(current_user, c.oid, 'INSERT, UPDATE, DELETE') "ownerWrite"
             FROM pg_class c WHERE c.oid = $1::regclass`, [`public."${table}"`])).rows[0];
          assert.equal(row.owner, (await admin.query<{ role: string }>(`SELECT current_user role`)).rows[0].role);
          assert.equal(row.ownerWrite, true);
        }
      } finally { await admin.end(); }

      for (const group of groups) {
        const config = await owned.restrictedLogin(group);
        const client = new Client(config);
        await client.connect();
        try {
          for (const table of tables) {
            const access = (await client.query<{ select: boolean; insert: boolean; update: boolean; delete: boolean }>(
              `SELECT has_table_privilege(current_user,$1,'SELECT') "select", has_table_privilege(current_user,$1,'INSERT') "insert",
                has_table_privilege(current_user,$1,'UPDATE') "update", has_table_privilege(current_user,$1,'DELETE') "delete"`, [`public."${table}"`])).rows[0];
            assert.deepEqual(access, { select: false, insert: false, update: false, delete: false }, `${group} ${table}`);
            await assert.rejects(client.query(`INSERT INTO public."${table}" DEFAULT VALUES`),
              (error: unknown) => (error as { code?: string }).code === "42501", `${group} ${table}`);
          }
          assert.equal((await client.query<{ canWrite: boolean }>(
            `SELECT has_table_privilege(current_user,'public."StorySourceVerification"','INSERT') "canWrite"`)).rows[0].canWrite, false);
        } finally { await client.end(); }
      }
    } finally { await baseline.end(); await owned.stop(); }
  });
}
