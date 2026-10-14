// All database writes below are synthetic fixture setup in newly owned clusters.
// No application datasource, Redis, provider, real media, or receipt issuance.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import type { Prisma } from "../../../generated/prisma/client";
import { scope } from "../fixtures";
import { transactionalFixture } from "./transactional-gateway.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No provider/network transport")); });
after(() => mock.restoreAll());
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const denied = async (run: () => Promise<unknown>, code?: string) => assert.rejects(run(),
  (error: unknown) => !code || (error as { code?: string }).code === code);

for (const first of [true, false]) {
  test(`M2-03C transactional source/outbox/read proof: M1 ${first ? "before" : "after"} M2`, { timeout: 150_000 }, async t => {
    const f = await transactionalFixture(first);
    try {
      const counts = async () => (await f.admin.query(`SELECT
        (SELECT count(*) FROM public."StoryTask") tasks,(SELECT count(*) FROM public."StoryPaidConfirmation") grants,
        (SELECT count(*) FROM public."StoryTaskDispatch") dispatches,(SELECT count(*) FROM public."StoryTaskEvent") events,
        (SELECT count(*) FROM public."StoryAdmission") admissions`)).rows[0];
      const decision = await f.issue();
      let mainTask = "";

      await t.test("real M1 persistence retains its candidate ID and supplies the trusted M2 recipe", async () => {
        assert.match(f.saved.snapshotId,/^candidate-/);
        assert.equal(f.saved.snapshotId,f.candidate.snapshot.payload.id);
        assert.equal(f.currentRecipe().recipe.source.snapshotId,f.saved.snapshotId);
        assert.equal((await f.admin.query(`SELECT count(*) FROM public."StorySourceSnapshot"`)).rows[0].count,"1");
      });

      await t.test("restricted roles cannot bypass validation, write paid tables, checkpoint or issue receipts", async () => {
        for (const client of [f.rawAdmission, f.reader, f.outbox, f.issuer,f.legacyRuntime,f.m1Issuer,f.checkpoint]) {
          for (const table of ["StoryTask","StoryPaidConfirmation","StoryTaskDispatch","StoryTaskEvent","StoryAdmission","StorySpendingDecision",
            "StoryProviderSubmission","StoryTestValidationKey","StoryTestAdmissionFence","StorySourceVerification"])
            await denied(() => client.query(`INSERT INTO public."${table}" DEFAULT VALUES`), "42501");
          await denied(() => client.query(`CREATE TABLE public.untrusted_object(id int)`), "42501");
        }
        await denied(() => f.rawAdmission.query(`UPDATE public."TranscriptSegment" SET text='invalid'`), "42501");
        await denied(() => f.reader.query(`UPDATE public."TranscriptSegment" SET text='invalid'`), "42501");
        await denied(() => f.reader.query(`SELECT * FROM public."TranscriptSegment"`), "42501");
        await denied(() => f.legacyRuntime.query(`SELECT * FROM public.story_m2_test_status($1,$2,$3,NULL,10)`,[scope.projectId,scope.movieId,f.saved.studioId]),"42501");
        await denied(() => f.rawAdmission.query(`SELECT secret FROM public."StoryTestValidationKey"`), "42501");
        await denied(() => f.rawAdmission.query(`SELECT public.story_m2_test_admit($1,0,0)`, [decision]), "42501");
        for (const client of [f.reader,f.outbox,f.legacyRuntime,f.m1Issuer,f.checkpoint]) {
          await denied(() => client.query(`SELECT public.story_m2_test_issue_decision(1000)`), "42501");
          await denied(() => client.query(`SELECT public.story_m2_test_finalize($1,$2,0,0)`, [decision,"f".repeat(64)]), "42501");
          if(client!==f.m1Issuer) await denied(() => client.query(`SELECT public.story_m1_verification_append('forged','forged','{}')`), "42501");
        }
        const catalogs = await f.admin.query<{ safe: boolean }>(`SELECT bool_and(p.prosecdef AND p.proowner='storyline_migration_owner'::regrole
          AND 'search_path=pg_catalog, public, pg_temp'=ANY(p.proconfig)
          AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) safe
          FROM pg_proc p WHERE p.proname IN ('story_m2_test_open_fence','story_m2_test_finalize','story_m2_test_claim_due',
            'story_m2_test_delivery','story_m2_test_missing_receipt','story_m2_test_status')`);
        assert.equal(catalogs.rows[0].safe,true);
        assert.equal((await f.admin.query(`SELECT count(*) FROM pg_default_acl`)).rows[0].count,"0");
      });

      await t.test("missing validation key and unsafe isolation fail closed before admission", async () => {
        const before=await counts();
        await f.keyEnabled(false);
        try { await denied(() => f.admit(decision)); } finally {await f.keyEnabled(true);}
        await denied(() => f.admission.$transaction(tx => tx.$queryRaw`SELECT public.story_m2_test_open_fence(${decision},${scope.projectId},${scope.movieId},${f.saved.studioId})`,
          {isolationLevel:"RepeatableRead"}));
        for(const permission of ["canCreate","canSpend"]) {
          await f.admin.query(`UPDATE public."StorySyntheticAuthority" SET "${permission}"=false WHERE "roleKind"='ADMISSION'`);
          try {await denied(() => f.admit(decision));}
          finally {await f.admin.query(`UPDATE public."StorySyntheticAuthority" SET "${permission}"=true WHERE "roleKind"='ADMISSION'`);}
        }
        assert.deepEqual(await counts(),before);
      });

      await t.test("forged proof and cross-project/movie/Studio scope are rejected without writes", async () => {
        await denied(() => f.rawAdmission.query(`SELECT public.story_m2_test_finalize($1,$2,0,0)`, [decision,"f".repeat(64)]));
        for (const values of [["wrong",scope.movieId,f.saved.studioId],[scope.projectId,"movie-other",f.saved.studioId],
          [scope.projectId,scope.movieId,"wrong-studio"]])
          await denied(() => f.rawAdmission.query(`SELECT public.story_m2_test_open_fence($1,$2,$3,$4)`, [decision,...values]));
        await f.admission.$transaction(async tx => {
          await tx.$queryRaw`SELECT public.story_m2_test_open_fence(${decision},${scope.projectId},${scope.movieId},${f.saved.studioId})`;
          // A valid fence is not proof that the server compared Chinese evidence.
          await denied(() => tx.$queryRaw`SELECT public.story_m2_test_finalize(${decision},${"f".repeat(64)},0,0)`);
          throw new Error("rollback deliberately aborted transaction");
        }).catch(error => assert.match(String(error),/rollback deliberately/));
        assert.equal((await counts()).tasks,"0");
      });

      const sourceRow = await f.runtime.transcriptSegment.findUniqueOrThrow({ where: { id: "source-1" } });
      const targetRow = await f.runtime.translatedSegment.findFirstOrThrow({ orderBy: { sequence: "asc" } });
      const issueRow = await f.runtime.translationQcIssue.findFirstOrThrow();
      const mutations: Array<[string,(tx: Prisma.TransactionClient) => Promise<unknown>,(tx: Prisma.TransactionClient) => Promise<unknown>]> = [
        ["Chinese", tx => tx.transcriptSegment.update({where:{id:sourceRow.id},data:{text:sourceRow.text+"变化。"}}),
          tx => tx.transcriptSegment.update({where:{id:sourceRow.id},data:{text:sourceRow.text}})],
        ["translation text", tx => tx.translatedSegment.update({where:{id:targetRow.id},data:{text:targetRow.text+"ပြောင်း။"}}),
          tx => tx.translatedSegment.update({where:{id:targetRow.id},data:{text:targetRow.text}})],
        ["approval", tx => tx.translatedSegment.update({where:{id:targetRow.id},data:{reviewStatus:targetRow.reviewStatus === "APPROVED" ? "UNREVIEWED" : "APPROVED"}}),
          tx => tx.translatedSegment.update({where:{id:targetRow.id},data:{reviewStatus:targetRow.reviewStatus}})],
        ["QC", tx => tx.translationQcIssue.update({where:{id:issueRow.id},data:{message:issueRow.message+" changed"}}),
          tx => tx.translationQcIssue.update({where:{id:issueRow.id},data:{message:issueRow.message,updatedAt:issueRow.updatedAt}})],
        ["alignment", tx => tx.translatedSegment.update({where:{id:targetRow.id},data:{endMs:targetRow.endMs+1}}),
          tx => tx.translatedSegment.update({where:{id:targetRow.id},data:{endMs:targetRow.endMs}})],
      ];
      for (const [name,mutate,restore] of mutations)
        await t.test(`${name} committed after preflight but before source locks rejects atomically`, async () => {
          const before = await counts();
          try { await denied(() => f.admit(decision,{beforeLock:async () => { await f.mutateSource(mutate); }})); }
          finally { await f.mutateSource(restore); }
          assert.deepEqual(await counts(),before);
        });

      await t.test("media checksum and in-transaction descriptor freshness failures roll back", async () => {
        const before = await counts();
        f.media.setInvalid(true);
        try { await denied(() => f.admit(decision)); } finally { f.media.setInvalid(false); }
        try { await denied(() => f.admit(decision,{afterValidation:async () => {f.media.setChanged(true);}})); }
        finally { f.media.setChanged(false); }
        try { await denied(() => f.admit(decision,{afterFinalize:async () => {f.media.setChanged(true);}})); }
        finally { f.media.setChanged(false); }
        assert.deepEqual(await counts(),before);
      });

      await t.test("late event failure rolls back task/grant/outbox/admission and leaves no fence", async () => {
        await f.admin.query(`CREATE FUNCTION public.story_m2_test_late_failure() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'synthetic late failure' USING ERRCODE='23514'; END $$`);
        await f.admin.query(`CREATE TRIGGER "StoryTaskEvent_test_late_failure" BEFORE INSERT ON public."StoryTaskEvent"
          FOR EACH ROW EXECUTE FUNCTION public.story_m2_test_late_failure()`);
        const before = await counts();
        try { await denied(() => f.admit(decision)); }
        finally { await f.admin.query(`DROP TRIGGER "StoryTaskEvent_test_late_failure" ON public."StoryTaskEvent"`); }
        assert.deepEqual(await counts(),before);
        assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryTestAdmissionFence"`)).rows[0].count,"0");
      });

      await t.test("current real source and full recipe admit once under concurrent restricted transactions", async () => {
        const [a,b] = await Promise.all([f.admit(decision),f.admit(decision)]);
        assert.equal(a,b); mainTask=a;
        assert.deepEqual(await counts(),{tasks:"1",grants:"1",dispatches:"1",events:"1",admissions:"1"});
        assert.equal((await f.admin.query(`SELECT "movieId",generation,"stateRevision" FROM public."StoryTask" WHERE id=$1`,[a])).rows[0].movieId,scope.movieId);
        await denied(() => f.replay(decision)); // genuine MAC from an earlier xid is not authority here
      });

      await t.test("cooperating Movie writer blocks through validation and admission commit", async () => {
        let writing: Promise<unknown> | undefined;
        let pid = 0, releasePid!: () => void;
        const gotPid = new Promise<void>(resolve => {releasePid=resolve;});
        await f.admit(decision,{afterValidation:async () => {
          writing=f.runtime.$transaction(async tx => {
            pid=(await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() pid`)[0].pid; releasePid();
            await tx.$queryRaw`SELECT id FROM public."Movie" WHERE id=${scope.movieId} FOR UPDATE`;
            await tx.movie.update({where:{id:scope.movieId},data:{title:"Synthetic movie"}});
          });
          await gotPid;
          let blocked=false;
          for(let attempt=0;attempt<20;attempt++) {
            blocked=(await f.admin.query<{blocked:boolean}>(`SELECT cardinality(pg_blocking_pids($1))>0 blocked`,[pid])).rows[0].blocked;
            if(blocked) break; await wait(10);
          }
          assert.equal(blocked,true,"source writer must wait on the admission Movie lock");
        }});
        await writing;
        assert.equal((await counts()).tasks,"1");
      });

      await t.test("conflicting idempotency key rejects changed recipe without another grant", async () => {
        await f.configure("key-one","ANALYZE_EVIDENCE",10);
        const second = await f.issue(); const before=await counts();
        await denied(() => f.admit(second)); assert.deepEqual(await counts(),before);
        await f.configure("key-one");
        await denied(() => f.admin.query(`UPDATE public."StorySyntheticAuthority" SET "canonicalRecipe"="canonicalRecipe"||' '
          WHERE "roleKind"='ADMISSION'`),"23514");
        assert.deepEqual(await counts(),before);
      });

      await t.test("outbox claim is exclusive; failed fake delivery is recoverable and acknowledgements are fenced", async () => {
        const [one,two]=await Promise.all([f.claim(),f.claim(f.outboxTwin)]);
        assert.equal(one.length+two.length,1); const c=(one[0]??two[0]);
        assert.equal(c.taskId,mainTask);
        await denied(() => f.delivery({...c,generation:1},true));
        await denied(() => f.delivery({...c,stateRevision:c.stateRevision+1},true));
        await denied(() => f.delivery({...c,owner:"forged"},true));
        const fakeQueue = new Map<string,{taskId:string;generation:number}>();
        assert.equal(fakeQueue.size,0); assert.equal(await f.delivery(c,false),true);
        await wait(40); const retry=(await f.claim())[0]; assert.ok(retry);
        const id=`story-text-${retry.taskId}-g${retry.generation}`;
        const payload={taskId:retry.taskId,generation:retry.generation};
        fakeQueue.set(id,payload); fakeQueue.set(id,payload); assert.equal(fakeQueue.size,1);
        assert.deepEqual(Object.keys(payload).sort(),["generation","taskId"]);
        assert.equal(await f.delivery(retry,true),true); assert.equal(await f.delivery(retry,true),false);
        fakeQueue.clear(); // explicit test observation: acknowledged queue receipt is missing
        assert.equal((await f.outbox.query<{ok:boolean}>(`SELECT public.story_m2_test_missing_receipt($1,$2,$3,$4) ok`,
          [retry.taskId,retry.generation,retry.stateRevision,id])).rows[0].ok,true);
        const recovered=(await f.claim())[0]; assert.ok(recovered);
        fakeQueue.set(id,payload); assert.equal(await f.delivery(recovered,true),true);
        await f.outbox.query(`SELECT public.story_m2_test_missing_receipt($1,$2,$3,$4)`,[retry.taskId,retry.generation,retry.stateRevision,id]);
        assert.deepEqual(await f.claim(),[],"three publish attempts are the fixed test ceiling");
        assert.equal((await counts()).grants,"1");
      });

      await t.test("expired consumed grant forbids redispatch without refreshing authority", async () => {
        await f.configure("short-grant","ANALYZE_EVIDENCE",9);
        const short=await f.issue(300); const task=await f.admit(short); await wait(350);
        await denied(() => f.claim(),"23514");
        // Synthetic fixture terminalization only; not an application recovery operation.
        await f.admin.query(`UPDATE public."StoryTask" SET state='FAILED',"stateRevision"="stateRevision"+1,
          "stateChangedAt"=clock_timestamp(),"errorCode"='STORY_TASK_CONFIRMATION_STALE' WHERE id=$1`,[task]);
      });

      await t.test("expired delivery and pre-checkpoint worker leases recover only in the same generation", async () => {
        await f.configure("lease-recovery","ANALYZE_EVIDENCE",8);
        const task=await f.admit(await f.issue()); const old=(await f.claim())[0]; assert.ok(old);
        await wait(550); const renewed=(await f.claim())[0]; assert.ok(renewed);
        await denied(() => f.delivery(old,true)); assert.equal(await f.delivery(renewed,true),true);
        await f.admin.query(`UPDATE public."StoryTask" SET state='LEASED',"stateRevision"="stateRevision"+1,
          "leaseOwner"='synthetic-crashed-worker',"leaseUntil"=clock_timestamp()-interval '1 second',"stateChangedAt"=clock_timestamp() WHERE id=$1`,[task]);
        await wait(40); const recovered=(await f.claim())[0]; assert.ok(recovered);
        assert.equal(recovered.generation,0); assert.equal(recovered.stateRevision,2);
        assert.equal((await f.admin.query(`SELECT "preSubmitAttempts" FROM public."StoryTaskDispatch" WHERE "taskId"=$1`,[task])).rows[0].preSubmitAttempts,1);
        assert.equal(await f.delivery(recovered,true),true);
        assert.equal((await f.admin.query(`SELECT public.story_m2_test_dispatchable('UNKNOWN') unknown,
          public.story_m2_test_dispatchable('SUBMITTED') submitted`)).rows[0].unknown,false);
        assert.equal((await f.admin.query(`SELECT public.story_m2_test_dispatchable('SUBMITTED') submitted`)).rows[0].submitted,false);
        assert.equal((await f.admin.query(`SELECT count(*) FROM public."StoryProviderSubmission"`)).rows[0].count,"0");
      });

      await t.test("bounded scoped status reads are deterministic, safe and cause zero writes or sends", async () => {
        const before=(await f.admin.query(`SELECT row_to_json(t) task,row_to_json(d) dispatch FROM public."StoryTask" t
          JOIN public."StoryTaskDispatch" d ON d."taskId"=t.id ORDER BY t.id`)).rows;
        await f.reader.query("BEGIN READ ONLY");
        let rows: Awaited<ReturnType<typeof f.status>>;
        try { rows=await f.status(); } finally {await f.reader.query("ROLLBACK");}
        const expected=["taskId","kind","state","generation","createdAt","stateChangedAt","errorCode","candidateAvailable","usageClass","inputTokens","outputTokens","costUsdMicros"].sort();
        assert.ok(rows.length>=3); for(const row of rows) {
          assert.deepEqual(Object.keys(row).sort(),expected); assert.equal(row.usageClass,"UNKNOWN");
          assert.equal(row.candidateAvailable,false); assert.equal(row.costUsdMicros,null);
        }
        const firstPage=await f.status(null,1); assert.equal(firstPage.length,1);
        assert.deepEqual(await f.status(firstPage[0].taskId,50),rows.slice(1));
        await denied(() => f.status(null,51)); await denied(() => f.status(null,0));
        for(const selection of [["wrong-project",scope.movieId,f.saved.studioId],[scope.projectId,"movie-other",f.saved.studioId],
          [scope.projectId,scope.movieId,"wrong-studio"]])
          await denied(() => f.reader.query(`SELECT * FROM public.story_m2_test_status($1,$2,$3,NULL,10)`,selection),"23514");
        await denied(() => f.reader.query(`SELECT * FROM public."StoryTask"`),"42501");
        assert.deepEqual((await f.admin.query(`SELECT row_to_json(t) task,row_to_json(d) dispatch FROM public."StoryTask" t
          JOIN public."StoryTaskDispatch" d ON d."taskId"=t.id ORDER BY t.id`)).rows,before);
      });

      await t.test("optional current immutable script is validated; a changed pointer rejects admission", async () => {
        await f.configure("review-script","REVIEW_EVIDENCE");
        const review=await f.issue(); const task=await f.admit(review); assert.ok(task);
        const before=await counts();
        await denied(() => f.admit(review,{beforeLock:async () => {await f.mutateSource(tx => tx.storylineStudio.update(
          {where:{id:f.saved.studioId},data:{currentScriptVersionId:null}}));}}));
        assert.deepEqual(await counts(),before);
      });
    } finally {await f.close();}
  });
}
