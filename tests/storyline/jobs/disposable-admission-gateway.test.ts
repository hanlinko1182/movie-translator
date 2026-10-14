// Executable synthetic proof on a newly owned private PostgreSQL cluster only.
// No application DATABASE_URL, operator credentials, source media, Redis, or provider.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "pg";
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { prepareStorylineSource } from "../../../lib/storyline/prepare-source";
import { DisposableStorylinePostgres } from "../disposable-postgres";
import { preparationFixture } from "../preparation.fixture";
import { date, scope } from "../fixtures";

const hash = (value: string) => contractHash("synthetic-m2-gateway-v1", value);
const apply = async (client: Client, path: string) => {
  const sql = await readFile(path, "utf8");
  assert.match(sql, /ROLLBACK;\s*$/);
  await client.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
};
const denied = async (run: () => Promise<unknown>, code?: string) => {
  await assert.rejects(run(), (error: unknown) => !code || (error as { code?: string }).code === code);
};

for (const order of ["M1 roles then M2", "M2 then M1 roles"] as const) {
  test(`disposable restricted admission proof: ${order}`, { timeout: 150_000 }, async t => {
    const owned = await DisposableStorylinePostgres.start();
    const baseline = await owned.client();
    let admin: Client | undefined, issuer: Client | undefined, admission: Client | undefined, admissionTwin: Client | undefined;
    try {
      const folders = (await readdir("prisma/migrations", { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && !entry.name.includes("storyline_m1_foundation"))
        .map(entry => entry.name).sort();
      for (const folder of folders) await baseline.query(await readFile(join("prisma/migrations", folder, "migration.sql"), "utf8"));
      await baseline.query(await readFile("prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql", "utf8"));
      admin = await owned.securityAdministrator();
      const roles = await readFile("docs/drafts/storyline-verification-roles.sql", "utf8");
      if (order === "M1 roles then M2") await admin.query(roles);
      await apply(admin, "docs/drafts/storyline-m2-jobs.sql");
      await apply(admin, "docs/drafts/storyline-m2-admission-ledger.sql");
      if (order === "M2 then M1 roles") await admin.query(roles);
      await apply(admin, "docs/drafts/storyline-m2-disposable-admission-gateway.sql");

      await admin.query(`INSERT INTO public."Project" (id,name,slug,"updatedAt") VALUES ('fixture-project','Synthetic','synthetic-gateway',$1)`, [date]);
      await admin.query(`INSERT INTO public."Movie" (id,"projectId",title,"storageKey","updatedAt") VALUES ('movie-old','fixture-project','Synthetic older','synthetic-only/old.mp4',$1)`, [date]);
      await admin.query(`INSERT INTO public."Project" (id,name,slug,"updatedAt") VALUES ('other-project','Synthetic Other','synthetic-other',$1)`, [date]);
      await admin.query(`INSERT INTO public."Movie" (id,"projectId",title,"storageKey","updatedAt") VALUES ('other-movie','other-project','Synthetic other','synthetic-only/other.mp4',$1)`, [date]);
      await admin.query(`INSERT INTO public."StorylineStudio" (id,"projectId","movieId","verificationGenesisHash","updatedAt") VALUES ('other-studio','other-project','other-movie',$1,$2)`, [
        contractHash("story-verification-ledger-empty-v1", { projectId: "other-project", movieId: "other-movie" }), date,
      ]);
      await admin.query(`INSERT INTO public."StorylineStudio" (id,"projectId","movieId",revision,"verificationGenesisHash","updatedAt") VALUES ('studio-old','fixture-project','movie-old',2,$1,$2)`, [
        contractHash("story-verification-ledger-empty-v1", { projectId: "fixture-project", movieId: "movie-old" }), date,
      ]);
      const prepared = preparationFixture();
      const source = (await prepareStorylineSource(scope, { database: prepared.database, inspectMedia: prepared.inspectMedia, now: prepared.now })).snapshot;
      const p = source.payload, prep = p.preparation!;
      await admin.query(`INSERT INTO public."StorySourceSnapshot" (id,"studioId","projectId","movieId","sourceContentHash","sourceContextHash","dependencyHash","sourceBindingHash","sourceSha256","sourceBytes","sourceDurationMs","canonicalPayload","capturedAt")
        VALUES ($1,'studio-old','fixture-project','movie-old',$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [p.id, source.sourceContentHash, source.sourceContextHash,
        prep.dependencyHash, prep.sourceBindingHash, p.media.sha256, p.media.bytes, p.media.durationMs, canonicalJson(p), p.capturedAt]);
      await admin.query(`UPDATE public."StorylineStudio" SET "currentSnapshotId"=$1 WHERE id='studio-old'`, [p.id]);
      const studioRevision = (await admin.query<{ revision: number }>(
        `SELECT revision FROM public."StorylineStudio" WHERE id='studio-old'`)).rows[0].revision;

      const profileHash = hash("fake-profile"), costPolicyHash = hash("fake-cost-policy");
      const recipe = { schemaVersion: "story-task-recipe-v1", projectId: "fixture-project", movieId: "movie-old",
        studioId: "studio-old", kind: "ANALYZE_EVIDENCE", expectedStudioRevision: studioRevision,
        source: { snapshotId: p.id, contentHash: source.sourceContentHash, contextHash: source.sourceContextHash },
        script: null, profile: { definitionHash: profileHash }, window: { startMs: 0, endMs: 1000 } };
      const canonicalRecipe = canonicalJson(recipe), recipeHash = contractHash("story-task-recipe-v1", recipe);
      const issuerConfig = await owned.restrictedLogin("storyline_synthetic_issuer");
      const admissionConfig = await owned.restrictedLogin("storyline_admission_writer");
      const seedAuthority = async (loginName: string, roleKind: string) => admin!.query(`INSERT INTO public."StorySyntheticAuthority" (
        "loginName","roleKind","subjectId","projectId","movieId","studioId","idempotencyKey",kind,
        "sourceSnapshotId","sourceContentHash","sourceContextHash","recipeHash","canonicalRecipe","profileHash",
        "costPolicyHash","quoteMaxUsdMicros","expectedStudioRevision","canCreate","canSpend","acknowledgedAt")
        VALUES ($1,$2,'synthetic-operator','fixture-project','movie-old','studio-old','key-one','ANALYZE_EVIDENCE',
          $3,$4,$5,$6,$7,$8,$9,1000,$10,true,true,clock_timestamp())`,
        [loginName, roleKind, p.id, source.sourceContentHash, source.sourceContextHash, recipeHash, canonicalRecipe, profileHash, costPolicyHash, studioRevision]);
      await seedAuthority(issuerConfig.user!, "ISSUER");
      await seedAuthority(admissionConfig.user!, "ADMISSION");
      issuer = new Client(issuerConfig); admission = new Client(admissionConfig); admissionTwin = new Client(admissionConfig);
      await issuer.connect(); await admission.connect(); await admissionTwin.connect();
      const issue = async (ttl = 120000) => (await issuer!.query<{ id: string }>(
        `SELECT public.story_m2_test_issue_decision($1) id`, [ttl])).rows[0].id;
      const admitAs = async (client: Client, id: string, revision = 0) => (await client.query<{ id: string }>(
        `SELECT public.story_m2_test_admit($1,0,$2) id`, [id, revision])).rows[0].id;
      const admit = async (id: string) => admitAs(admission!, id);
      let decision = "";
      let admittedTask = "";

      await t.test("only restricted synthetic issuer and admission functions are callable", async () => {
        const paidTables = ["StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryProviderSubmission",
          "StoryTaskResult", "StoryTaskEvent", "StoryAdmission", "StorySpendingDecision", "StorySyntheticAuthority"];
        for (const client of [issuer!, admission!])
          for (const table of paidTables)
            await denied(() => client.query(`INSERT INTO public."${table}" DEFAULT VALUES`), "42501");
        await denied(() => admission!.query(`SELECT public.story_m2_test_issue_decision(1000)`), "42501");
        await denied(() => issuer!.query(`SELECT public.story_m2_test_admit('forged',0,0)`), "42501");
        await denied(() => admission!.query(`INSERT INTO public."StoryProviderSubmission" DEFAULT VALUES`), "42501");
        await denied(() => admission!.query(`SELECT public.story_m1_verification_append('x','x','{}')`), "42501");
        for (const group of ["storyline_runtime", "storyline_verification_issuer", "storyline_checkpoint_worker"] as const) {
          const restricted = new Client(await owned.restrictedLogin(group));
          await restricted.connect();
          try {
            for (const table of paidTables)
              await denied(() => restricted.query(`INSERT INTO public."${table}" DEFAULT VALUES`), "42501");
            await denied(() => restricted.query(`SELECT public.story_m2_test_admit('forged',0,0)`), "42501");
            await denied(() => restricted.query(`SELECT public.story_m2_test_issue_decision(1000)`), "42501");
          } finally { await restricted.end(); }
        }
      });

      await t.test("synthetic authority rejects recipe bytes with a mismatched hash", async () => {
        await denied(() => admin!.query(`UPDATE public."StorySyntheticAuthority" SET "recipeHash"=$1 WHERE "loginName"=$2`,
          ["f".repeat(64), admissionConfig.user]), "23514");
        assert.equal((await admin!.query<{ recipeHash: string }>(
          `SELECT "recipeHash" FROM public."StorySyntheticAuthority" WHERE "loginName"=$1`,
          [admissionConfig.user])).rows[0].recipeHash, recipeHash);
      });

      await t.test("forged, expired, wrong-operator, wrong-scope and stale-CAS decisions fail", async () => {
        await denied(() => admit("forged"));
        const expired = await issue(50);
        await new Promise(resolve => setTimeout(resolve, 90));
        await denied(() => admit(expired), "23514");
        const id = await issue();
        await admin!.query(`UPDATE public."StorySyntheticAuthority" SET "subjectId"='wrong-operator' WHERE "loginName"=$1`, [admissionConfig.user]);
        await denied(() => admit(id), "23514");
        await admin!.query(`UPDATE public."StorySyntheticAuthority" SET "subjectId"='synthetic-operator',
          "projectId"='other-project',"movieId"='other-movie',"studioId"='other-studio' WHERE "loginName"=$1`, [admissionConfig.user]);
        await denied(() => admit(id), "23514");
        await admin!.query(`UPDATE public."StorySyntheticAuthority" SET "projectId"='fixture-project',
          "movieId"='movie-old',"studioId"='studio-old' WHERE "loginName"=$1`, [admissionConfig.user]);
        await denied(() => admitAs(admission!, id, 1), "23514");
        assert.equal((await admin!.query<{ count: string }>(`SELECT count(*) FROM public."StoryTask"`)).rows[0].count, "0");
        // Keep this server-issued decision for the subsequent true concurrent admission.
        decision = id;
      });

      await t.test("two connections race; identical admission reuses one task and one grant", async () => {
        const [first, second] = await Promise.all([admit(decision), admitAs(admissionTwin!, decision)]);
        assert.equal(first, second);
        admittedTask = first;
        assert.equal(await admit(decision), first);
        for (const table of ["StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryTaskEvent", "StoryAdmission"])
          assert.equal((await admin!.query<{ count: string }>(`SELECT count(*) FROM public."${table}"`)).rows[0].count, "1", table);
        assert.equal((await admin!.query<{ state: string; authorityRef: string }>(
          `SELECT state,"authorityRef" FROM public."StoryPaidConfirmation" WHERE "taskId"=$1`, [first])).rows[0].state, "CONSUMED");
      });

      await t.test("same scoped key with changed recipe is rejected before another grant", async () => {
        const changed = canonicalJson({ ...recipe, window: { startMs: 0, endMs: 1500 } });
        await admin!.query(`UPDATE public."StorySyntheticAuthority" SET "canonicalRecipe"=$1,"recipeHash"=$2 WHERE "loginName"=$3`,
          [changed, contractHash("story-task-recipe-v1", JSON.parse(changed)), admissionConfig.user]);
        await denied(() => admit(decision), "23505");
        await admin!.query(`UPDATE public."StorySyntheticAuthority" SET "canonicalRecipe"=$1,"recipeHash"=$2 WHERE "loginName"=$3`,
          [canonicalRecipe, recipeHash, admissionConfig.user]);
        assert.equal((await admin!.query<{ count: string }>(`SELECT count(*) FROM public."StoryPaidConfirmation"`)).rows[0].count, "1");
      });

      await t.test("late event failure rolls back task, dispatch and consumed confirmation", async () => {
        const changed = canonicalJson({ ...recipe, window: { startMs: 0, endMs: 2000 } });
        await admin!.query(`UPDATE public."StorySyntheticAuthority" SET "idempotencyKey"='key-two',
          "canonicalRecipe"=$1,"recipeHash"=$2 WHERE "loginName" IN ($3,$4)`,
          [changed, contractHash("story-task-recipe-v1", JSON.parse(changed)), issuerConfig.user, admissionConfig.user]);
        const secondDecision = await issue();
        await admin!.query(`CREATE FUNCTION public.story_m2_test_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'forced late failure' USING ERRCODE='23514'; END $$`);
        await admin!.query(`CREATE TRIGGER "StoryTaskEvent_test_failure" BEFORE INSERT ON public."StoryTaskEvent"
          FOR EACH ROW EXECUTE FUNCTION public.story_m2_test_event_failure()`);
        await denied(() => admit(secondDecision), "23514");
        for (const table of ["StoryTask", "StoryTaskDispatch", "StoryPaidConfirmation", "StoryTaskEvent", "StoryAdmission"])
          assert.equal((await admin!.query<{ count: string }>(`SELECT count(*) FROM public."${table}"`)).rows[0].count, "1", table);
        assert.equal((await admin!.query<{ count: string }>(`SELECT count(*) FROM public."StoryPaidConfirmation" WHERE "authorityRef"=$1`,
          [secondDecision])).rows[0].count, "0");
        assert.equal((await admin!.query<{ state: string }>(`SELECT state FROM public."StoryTask" WHERE id=$1`,
          [admittedTask])).rows[0].state, "QUEUED");
      });
    } finally {
      await admissionTwin?.end(); await admission?.end(); await issuer?.end(); await admin?.end(); await baseline.end(); await owned.stop();
    }
  });
}
