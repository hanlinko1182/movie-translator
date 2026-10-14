// Genuine M1 producer and restricted M2 identity/admission, disposable only.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { StoryTaskContractError } from "../../../lib/storyline/jobs/errors";
import { createPersistedStoryTaskSourceAccess } from "../../../lib/storyline/jobs/persisted-source";
import { prepareStorylineSource } from "../../../lib/storyline/prepare-source";
import { readStorylineSource } from "../../../lib/storyline/read-source";
import { validateSourceSnapshot } from "../../../lib/storyline/source";
import { scope } from "../fixtures";
import { transactionalFixture } from "./transactional-gateway.fixture";

before(()=>{mock.method(globalThis,"fetch",()=>assert.fail("No provider/network calls"));});
after(()=>mock.restoreAll());
const rejected=(run:()=>Promise<unknown>,code?:string)=>assert.rejects(run(),(error:unknown)=>
  error instanceof StoryTaskContractError && (!code || error.code===code));

for(const first of [true,false]) test(`M2-03D persisted identity: M1 ${first ? "before":"after"} M2`,{timeout:120000},async t=>{
  const f=await transactionalFixture(first);
  try {
    const reference=f.sourceReference();
    const input={...reference,kind:"ANALYZE_EVIDENCE",profileId:"synthetic-text",profileVersion:"v1",
      window:{firstSegmentSequence:0,lastSegmentSequence:11},parentResultHashes:[]};
    const inspect=async()=>f.media.inspect((await readStorylineSource(scope,f.admission)).storageKey);

    await t.test("actual M1 candidate persists unchanged and completes one restricted admission",async()=>{
      assert.match(f.saved.snapshotId,/^candidate-/); assert.equal(f.saved.snapshotId,f.candidate.snapshot.payload.id);
      const row=await f.runtime.storySourceSnapshot.findUniqueOrThrow({where:{id:f.saved.snapshotId}});
      assert.equal(row.canonicalPayload,canonicalJson(f.candidate.snapshot.payload));
      assert.equal(await f.runtime.storySourceSnapshot.count(),1);
      const recipe=f.currentRecipe(); assert.equal(recipe.recipe.source.snapshotId,row.id);
      const decision=await f.issue(); const [a,b]=await Promise.all([f.admit(decision),f.admit(decision)]); assert.equal(a,b);
      for(const table of ["StoryTask","StoryTaskDispatch","StoryTaskEvent","StoryAdmission","StoryPaidConfirmation"])
        assert.equal((await f.admin.query(`SELECT count(*) FROM public."${table}"`)).rows[0].count,"1");
      assert.equal((await f.admin.query(`SELECT state FROM public."StoryPaidConfirmation" WHERE "taskId"=$1`,[a])).rows[0].state,"CONSUMED");
      assert.equal((await f.admin.query(`SELECT "sourceSnapshotId" FROM public."StoryTask" WHERE id=$1`,[a])).rows[0].sourceSnapshotId,row.id);
    });

    await t.test("source JSON, persisted=true, copied handles and foreign access cannot assert durable eligibility",async()=>{
      const media=await inspect();
      await f.sourceAccess.transaction(async tx=>{
        const handle=await f.sourceAccess.load(tx,reference,media);
        assert.throws(()=>JSON.stringify(handle),StoryTaskContractError);
        for(const forged of [f.candidate,f.source,{persisted:true,snapshot:f.source},{...handle},{},null])
          await rejected(()=>f.sourceAccess.createRecipe(tx,input,forged,f.currentProfile()),"STORY_TASK_INVALID");
        const foreign=createPersistedStoryTaskSourceAccess(f.admission);
        await rejected(()=>foreign.createRecipe(tx,input,handle,f.currentProfile()),"STORY_TASK_INVALID");
      });
      assert.throws(()=>createPersistedStoryTaskSourceAccess({persisted:true} as unknown as PrismaClient),StoryTaskContractError);
    });

    await t.test("handles expire with their transaction and reject unrelated actual transaction clients",async()=>{
      const media=await inspect();
      const old=await f.sourceAccess.transaction(tx=>f.sourceAccess.load(tx,reference,media));
      await rejected(()=>f.sourceAccess.transaction(tx=>f.sourceAccess.createRecipe(tx,input,old,f.currentProfile())),"STORY_TASK_INVALID");
      await f.admission.$transaction(async tx=>{
        await rejected(()=>f.sourceAccess.load(tx,reference,media),"STORY_TASK_INVALID");
      });
    });

    await t.test("unsafe database-owner bootstrap is refused before invoking application work",async()=>{
      const unsafe=new PrismaClient({adapter:new PrismaPg({...f.owned.prismaAdapterConfig(),pipeline:true})});
      let ran=false;
      try {await rejected(()=>createPersistedStoryTaskSourceAccess(unsafe).transaction(async()=>{ran=true;}),"STORY_TASK_INVALID");}
      finally {await unsafe.$disconnect();}
      assert.equal(ran,false);
    });

    await t.test("a real newly prepared but unpersisted candidate has no eligible database record",async()=>{
      const original=await f.runtime.translationQcIssue.findFirstOrThrow();
      try {
        await f.mutateSource(tx=>tx.translationQcIssue.update({where:{id:original.id},data:{message:original.message+" synthetic change"}}));
        const unpersisted=await prepareStorylineSource(scope,{database:f.runtime,inspectMedia:f.media.inspect});
        assert.notEqual(unpersisted.snapshot.payload.id,f.saved.snapshotId);
        assert.equal(await f.runtime.storySourceSnapshot.findUnique({where:{id:unpersisted.snapshot.payload.id}}),null);
        const media=await inspect();
        await rejected(()=>f.sourceAccess.transaction(tx=>f.sourceAccess.load(tx,
          {...reference,sourceSnapshotId:unpersisted.snapshot.payload.id},media)),"STORY_TASK_SCOPE_MISMATCH");
        assert.equal(await f.runtime.storySourceSnapshot.count(),1);
      } finally {await f.mutateSource(tx=>tx.translationQcIssue.update({where:{id:original.id},data:{message:original.message,updatedAt:original.updatedAt}}));}
    });

    await t.test("exact project/movie/Studio, source ID and revision must match persisted current context",async()=>{
      const media=await inspect();
      for(const changed of [{projectId:"foreign-project"},{movieId:"movie-other"},{studioId:"foreign-studio"},
        {sourceSnapshotId:"invented-persisted-source"},{expectedStudioRevision:reference.expectedStudioRevision+1}])
        await rejected(()=>f.sourceAccess.transaction(tx=>f.sourceAccess.load(tx,{...reference,...changed},media)));
      await f.sourceAccess.transaction(async tx=>{
        const handle=await f.sourceAccess.load(tx,reference,media);
        await rejected(()=>f.sourceAccess.createRecipe(tx,{...input,sourceSnapshotId:"substituted"},handle,f.currentProfile()),"STORY_TASK_SCOPE_MISMATCH");
      });
    });

    await t.test("canonical source, recipe bytes and hashes cannot be substituted by a caller",async()=>{
      const media=await inspect(),identity=f.currentRecipe();
      await f.sourceAccess.transaction(async tx=>{
        const handle=await f.sourceAccess.load(tx,reference,media);
        for(const value of [
          {...identity.recipe,source:{...identity.recipe.source,contextHash:"f".repeat(64)}},
          {...identity.recipe,source:{...identity.recipe.source,mediaSha256:"f".repeat(64)}},
          {...identity.recipe,profile:{...identity.recipe.profile,definitionHash:"f".repeat(64)}},
          {...identity,recipeHash:"f".repeat(64)},
        ]) await rejected(()=>f.sourceAccess.validateRecipe(tx,value,handle,f.currentProfile()));
        const unchanged=await f.sourceAccess.validateRecipe(tx,JSON.parse(identity.canonicalRecipe),handle,f.currentProfile());
        assert.equal(unchanged.recipeHash,identity.recipeHash); assert.equal(unchanged.canonicalRecipe,identity.canonicalRecipe);
      });
    });

    await t.test("a change after handle creation is rechecked rather than authorized by the handle",async()=>{
      const media=await inspect(); const original=await f.runtime.translatedSegment.findFirstOrThrow();
      try {
        await rejected(()=>f.sourceAccess.transaction(async tx=>{
          const handle=await f.sourceAccess.load(tx,reference,media);
          await f.mutateSource(writer=>writer.translatedSegment.update({where:{id:original.id},data:{reviewStatus:original.reviewStatus==="APPROVED"?"UNREVIEWED":"APPROVED"}}));
          return f.sourceAccess.createRecipe(tx,input,handle,f.currentProfile());
        }),"STORY_TASK_SOURCE_STALE");
      } finally {await f.mutateSource(tx=>tx.translatedSegment.update({where:{id:original.id},data:{reviewStatus:original.reviewStatus}}));}
    });

    await t.test("replaced media and failed descriptor checks reject persisted eligibility",async()=>{
      f.media.setInvalid(true);
      try {const media=await inspect(); await rejected(()=>f.sourceAccess.transaction(tx=>f.sourceAccess.load(tx,reference,media)),"STORY_TASK_SOURCE_STALE");}
      finally {f.media.setInvalid(false);}
      const media=await inspect(); f.media.setChanged(true);
      try {await rejected(()=>f.sourceAccess.transaction(tx=>f.sourceAccess.load(tx,reference,media)),"STORY_TASK_SOURCE_STALE");}
      finally {f.media.setChanged(false);}
    });

    await t.test("optional scripts require exact current immutable ID and recipe hash",async()=>{
      await f.configure("identity-review","REVIEW_EVIDENCE");
      const ref=f.sourceReference("REVIEW_EVIDENCE"),media=await inspect(),identity=f.currentRecipe();
      await rejected(()=>f.sourceAccess.transaction(tx=>f.sourceAccess.load(tx,{...ref,scriptVersionId:"foreign-script"},media)),"STORY_TASK_SOURCE_STALE");
      await f.sourceAccess.transaction(async tx=>{
        const handle=await f.sourceAccess.load(tx,ref,media);
        await rejected(()=>f.sourceAccess.validateRecipe(tx,{...identity.recipe,script:{...identity.recipe.script,hash:"f".repeat(64)}},handle,f.currentProfile()));
        assert.equal((await f.sourceAccess.validateRecipe(tx,identity.recipe,handle,f.currentProfile())).recipe.script?.versionId,f.scriptSaved.scriptVersionId);
      });
    });

    await t.test("a self-consistent forged persisted row still fails authoritative Chinese reconstruction",async()=>{
      const payload={...f.source.payload,id:"forged-source-record",transcript:{...f.source.payload.transcript,
        segments:f.source.payload.transcript.segments.map((row,index)=>index===1?{...row,text:row.text+"伪造。"}:row)}};
      const forged=validateSourceSnapshot(payload,scope),p=forged.payload,prep=p.preparation!;
      const revision=await f.mutateSource(async tx=>{
        await tx.$queryRaw`SELECT id FROM public."StorylineStudio" WHERE id=${f.saved.studioId} FOR UPDATE`;
        await tx.storySourceSnapshot.create({data:{id:p.id,studioId:f.saved.studioId,...scope,sourceContentHash:forged.sourceContentHash,
          sourceContextHash:forged.sourceContextHash,dependencyHash:prep.dependencyHash,sourceBindingHash:prep.sourceBindingHash,
          sourceSha256:p.media.sha256,sourceBytes:BigInt(p.media.bytes),sourceDurationMs:p.media.durationMs,
          canonicalPayload:canonicalJson(p),capturedAt:new Date(p.capturedAt)}});
        return (await tx.storylineStudio.update({where:{id:f.saved.studioId},data:{currentSnapshotId:p.id,currentScriptVersionId:null}})).revision;
      });
      const media=await inspect();
      await rejected(()=>f.sourceAccess.transaction(tx=>f.sourceAccess.load(tx,{...reference,sourceSnapshotId:p.id,expectedStudioRevision:revision},media)),"STORY_TASK_SOURCE_STALE");
      // Original immutable producer identity/content remains unchanged.
      assert.equal((await f.runtime.storySourceSnapshot.findUniqueOrThrow({where:{id:f.saved.snapshotId}})).canonicalPayload,canonicalJson(f.source.payload));
    });
  } finally {await f.close();}
});
