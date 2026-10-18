import test from "node:test";
import assert from "node:assert/strict";
import { durableFixture } from "./fixture";

test("owned disposable ledger: reserve, acknowledged fake, exact bytes, verify, commit, replay",async()=>{
 const f=await durableFixture();
 try {
  const r=await f.service.reserve("smoke",0);assert.equal(r.created,true);
  const output=await f.service.executeFake(r.id);assert.ok(output.bytes);
  const stage=await f.service.allocateStage(r.id);await f.service.writeStage(r.id,stage,output.bytes!);
  await f.service.validate(r.id,stage);const artifact=await f.service.finalize(r.id,stage);
  assert.equal(artifact.payload.execution,"FAKE_ONLY");
  const replay=await f.service.replay(r.id);assert.deepEqual(replay.bytes,output.bytes);
  assert.equal(f.service.fakeCalls(),1);assert.equal((await f.service.inspect(r.id)).artifact_state,"COMMITTED");
 }finally{await f.stop();}
});

async function staged(f:Awaited<ReturnType<typeof durableFixture>>,key="test",chunk=0) {
 const r=await f.service.reserve(key,chunk),output=await f.service.executeFake(r.id),stage=await f.service.allocateStage(r.id);await f.service.writeStage(r.id,stage,output.bytes!);return {id:r.id,output,stage};
}
async function completed(f:Awaited<ReturnType<typeof durableFixture>>,key="test",chunk=0) {
 const s=await staged(f,key,chunk);await f.service.validate(s.id,s.stage);await f.service.finalize(s.id,s.stage);return s;
}

test("independent concurrent connections converge same key; changed payload conflicts and fresh key cannot bypass recipe",async()=>{
 const f=await durableFixture();try{
  const other=f.runtime().service;
  const results=await Promise.all([f.service.reserve("same",0),other.reserve("same",0)]);assert.equal(results[0].id,results[1].id);assert.equal(results.filter(x=>x.created).length,1);
  await assert.rejects(()=>other.reserve("same",1),/KEY_CONFLICT/);await assert.rejects(()=>other.reserve("fresh-key",0),/RECIPE_CLAIMED/);
  await assert.rejects(()=>f.service.reserve("plan-forgery",1,"f".repeat(64)),/EXPECTED/);
  const admin=await f.database.admin();try{assert.equal((await admin.query("SELECT count(*)::int n FROM voice_m505.request")).rows[0].n,1);}finally{await admin.end();}
 }finally{await f.stop();}
});
test("UNKNOWN and lost checkpoint ACK preserve recipe, cannot admit convincing bytes or regain process permits",async()=>{
 const f=await durableFixture();try{
  const r=await f.service.reserve("unknown",0);await f.service.executeFake(r.id,"UNKNOWN");assert.equal(f.service.fakeCalls(),1);
  await assert.rejects(()=>f.service.allocateStage(r.id),/RESULT_MISSING/);await assert.rejects(()=>f.service.executeFake(r.id),/NO_PROCESS_PERMIT/);
  const fresh=f.runtime().service;await fresh.recover(r.id);await assert.rejects(()=>fresh.executeFake(r.id),/NO_PROCESS_PERMIT/);await assert.rejects(()=>fresh.reserve("unknown-fresh",0),/RECIPE_CLAIMED/);
  assert.equal((await fresh.inspect(r.id)).delivery,"UNKNOWN");
  const lost=await f.service.reserve("lost-checkpoint",1);await assert.rejects(()=>f.service.executeFake(lost.id,"FIXTURE_BYTES",true),/ACK_LOST/);
  await fresh.recover(lost.id);assert.equal((await fresh.inspect(lost.id)).delivery,"UNKNOWN");assert.equal(f.service.fakeCalls(),1);assert.equal(fresh.fakeCalls(),0);
 }finally{await f.stop();}
});
test("original durable journal resolves original UNKNOWN after restart without another fake execution",async()=>{
 let stop=true;const f=await durableFixture(async name=>{if(name==="journal_after_commit"&&stop){stop=false;throw Error("ACK_LOST");}});
 try{
  const r=await f.service.reserve("original",0);await assert.rejects(()=>f.service.executeFake(r.id),/ACK_LOST/);
  let s=await f.service.inspect(r.id);await f.gateway.call("recovery",r.id,{generation:s.owner_generation,revision:s.revision},{op:"unknown"});
  s=await f.service.inspect(r.id);assert.equal(s.delivery,"UNKNOWN");assert.ok(s.journal);
  const fresh=f.runtime().service;await fresh.settleJournal(r.id);assert.equal((await fresh.inspect(r.id)).delivery,"DEFINITIVE_SUCCESS");assert.equal(fresh.fakeCalls(),0);assert.equal(f.service.fakeCalls(),1);
 }finally{await f.stop();}
});
test("cancellation before checkpoint is unsent; post-checkpoint preserves UNKNOWN and blocks GC",async()=>{
 const f=await durableFixture();try{
  const before=await f.service.reserve("cancel-before",0);await f.service.cancel(before.id);assert.equal((await f.service.inspect(before.id)).delivery,"CANCELLED");await assert.rejects(()=>f.service.executeFake(before.id),/NO_PROCESS_PERMIT/);
  const after=await f.service.reserve("cancel-after",1);await f.service.executeFake(after.id,"UNKNOWN");await f.service.cancel(after.id);assert.equal((await f.service.inspect(after.id)).delivery,"UNKNOWN");
  await assert.rejects(()=>f.service.releaseQuarantineHold(after.id),/HOLD_UNRESOLVED/);await assert.rejects(()=>f.service.gc(after.id,"unknown-stage"),/GC_HELD/);assert.equal(f.service.fakeCalls(),1);
 }finally{await f.stop();}
});
test("definitive failure is retained and cannot stage audio or authorize another recipe invocation",async()=>{
 const f=await durableFixture();try{
  const r=await f.service.reserve("failure",0);await f.service.executeFake(r.id,"DEFINITIVE_FAILURE");assert.equal((await f.service.inspect(r.id)).delivery,"DEFINITIVE_FAILURE");
  await assert.rejects(()=>f.service.allocateStage(r.id),/RESULT_MISSING/);await assert.rejects(()=>f.service.reserve("new-failure",0),/RECIPE_CLAIMED/);assert.equal(f.service.fakeCalls(),1);
 }finally{await f.stop();}
});
for(const fault of ["ACK_LOST","INTERRUPTED"] as const)test(`blob ${fault}: recover exact registered target or quarantine, never rewrite`,async()=>{
 const f=await durableFixture();try{
  const r=await f.service.reserve("blob-fault",0),o=await f.service.executeFake(r.id),stage=await f.service.allocateStage(r.id);
  await assert.rejects(()=>f.service.writeStage(r.id,stage,o.bytes!,fault));
  if(fault==="ACK_LOST"){await f.service.validate(r.id,stage);await f.service.finalize(r.id,stage);assert.deepEqual((await f.service.replay(r.id)).bytes,o.bytes);}
  else{await assert.rejects(()=>f.service.validate(r.id,stage));assert.equal((await f.service.inspect(r.id)).artifact_state,"QUARANTINED");}
  assert.equal((await f.service.inspect(r.id)).attempts.length,1);assert.equal(f.service.fakeCalls(),1);
 }finally{await f.stop();}
});
test("owner takeover separates submission generation and fences obsolete validation and concurrent finalizers",async()=>{
 const f=await durableFixture();try{
  const s=await staged(f),old=await f.service.inspect(s.id),fresh=f.runtime().service;await fresh.recover(s.id);
  await assert.rejects(()=>f.gateway.call("validate",s.id,{generation:old.owner_generation,revision:old.revision},{op:"validate",stageId:s.stage}),/M505_CAS/);
  await fresh.validate(s.id,s.stage);
  const results=await Promise.allSettled([fresh.finalize(s.id,s.stage),f.service.finalize(s.id,s.stage)]);assert.ok(results.some(r=>r.status==="fulfilled"));
  const state=await fresh.inspect(s.id);assert.equal(state.owner_generation,2);assert.equal(state.submission.body.generation,1);assert.ok(state.artifact);
  assert.deepEqual(await fresh.finalize(s.id,s.stage),state.artifact);
  const admin=await f.database.admin();try{assert.equal((await admin.query("SELECT count(*)::int n FROM voice_m505.artifact")).rows[0].n,1);}finally{await admin.end();}
 }finally{await f.stop();}
});
for(const cut of ["reservation_before_commit","journal_before_commit","validation_before_commit","finalization_before_commit"])test(`before-commit fault at ${cut} rolls back facts and audit atomically`,async()=>{
 let armed=false;const f=await durableFixture(async name=>{if(armed&&name===cut)throw Error("INJECTED_ROLLBACK");});
 try{
  if(cut==="reservation_before_commit") {armed=true;await assert.rejects(()=>f.service.reserve("rollback",0),/INJECTED/);}
  else if(cut==="journal_before_commit") {const r=await f.service.reserve("rollback",0);armed=true;await assert.rejects(()=>f.service.executeFake(r.id),/INJECTED/);assert.equal((await f.service.inspect(r.id)).journal,null);}
  else {const s=await staged(f);if(cut==="finalization_before_commit")await f.service.validate(s.id,s.stage);const before=await f.service.inspect(s.id);armed=true;
   await assert.rejects(()=>cut==="validation_before_commit"?f.service.validate(s.id,s.stage):f.service.finalize(s.id,s.stage),/INJECTED/);assert.deepEqual(await f.service.inspect(s.id),before);}
  const admin=await f.database.admin();try{
   const target=cut.replace("_before_commit","");assert.equal((await admin.query("SELECT count(*)::int n FROM voice_m505.audit_event WHERE action=$1",[target==="reservation"?"reserve":target==="validation"?"validate":target==="finalization"?"finalize":target])).rows[0].n,0);
  }finally{await admin.end();}
 }finally{await f.stop();}
});
test("audit insertion failure cannot leave partial reservation, key claim, or proof consumption",async()=>{
 const f=await durableFixture(),admin=await f.database.admin();try{
  await admin.query("CREATE FUNCTION voice_m505.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT_FAULT'; END $$; CREATE TRIGGER injected BEFORE INSERT ON voice_m505.audit_event FOR EACH ROW EXECUTE FUNCTION voice_m505.fail_audit()");
  await assert.rejects(()=>f.service.reserve("audit-fault",0),/AUDIT_FAULT/);
  assert.equal((await admin.query("SELECT count(*)::int n FROM voice_m505.request")).rows[0].n,0);
  assert.equal((await admin.query("SELECT count(*)::int n FROM voice_m505.reservation")).rows[0].n,0);
  await admin.query("DROP TRIGGER injected ON voice_m505.audit_event");assert.equal((await f.service.reserve("audit-fault",0)).created,true);
 }finally{await admin.end();await f.stop();}
});
test("complete collection is immutable, canonical, privately replayed and rejects incomplete/duplicate coverage",async()=>{
 const f=await durableFixture();try{
  const original=JSON.stringify(f.draft),ids:string[]=[];
  for(let i=0;i<f.plan.plan.chunks.length;i++)ids.push((await completed(f,`collection-${i}`,i)).id);
  await assert.rejects(()=>f.service.collection(ids.slice(1)));await assert.rejects(()=>f.service.collection([...ids.slice(1),ids[1]]));
  const collection=await f.service.collection([...ids].reverse()),again=await f.service.collection(ids);assert.equal(collection.hash,again.hash);
  assert.equal((await f.service.replayCollection(collection.payload.body.id as string)).items.length,ids.length);assert.equal(JSON.stringify(f.draft),original);
  for(const id of ids){const a=(await f.service.inspect(id)).artifact!;assert.deepEqual(a.payload.restrictions,{humanApproval:"NONE",sourceVerified:false,eligibleForRealTts:false,eligibleForPublication:false,spendingAuthority:"NONE",syntheticAncestry:true});}
  const admin=await f.database.admin();try{await assert.rejects(()=>admin.query("UPDATE voice_m505.artifact SET hash=$1",["f".repeat(64)]),/IMMUTABLE/);await assert.rejects(()=>admin.query("TRUNCATE voice_m505.collection_member"),/IMMUTABLE/);}finally{await admin.end();}
 }finally{await f.stop();}
});
test("current authorization after whole-byte read denies revocation; live read hold blocks GC",async()=>{
 const f=await durableFixture();try{
  const s=await completed(f);await assert.rejects(()=>f.service.replay(s.id,async()=>{
   await f.service.cancel(s.id);await f.service.releaseQuarantineHold(s.id);await assert.rejects(()=>f.service.gc(s.id,s.stage),/GC_HELD/);
  }),/HOLD_EXPIRED/);
  const admin=await f.database.admin();try{assert.equal((await admin.query("SELECT count(*)::int n FROM voice_m505.gc_intent")).rows[0].n,0);}finally{await admin.end();}
 }finally{await f.stop();}
});
test("committed corruption quarantines mutable availability and preserves immutable historical artifact",async()=>{
 const f=await durableFixture();try{
  const s=await completed(f),before=await f.service.inspect(s.id),version=before.attempts[0].version;
  const {chmod,writeFile}=await import("node:fs/promises");const path=`${f.identity.root}/objects/${version}`;await chmod(path,0o600);await writeFile(path,Buffer.from("corrupt owned synthetic fixture"));
  await assert.rejects(()=>f.service.replay(s.id));const after=await f.service.inspect(s.id);assert.equal(after.availability,"QUARANTINED");assert.deepEqual(after.artifact,before.artifact);await assert.rejects(()=>f.service.replay(s.id),/UNAVAILABLE/);
 }finally{await f.stop();}
});
test("bounded orphan recovery holds unregistered owned bytes and never regenerates or deletes them",async()=>{
 const f=await durableFixture();try{
  const {newObjectVersion}=await import("@/lib/storyline/voice/durable-fake/storage"),{pcmWav}=await import("../audio-verification/fixture");const version=newObjectVersion();await f.attached.port.create(version,pcmWav());
  assert.deepEqual(await f.service.recoverOrphans(),{held:1,remaining:0});assert.deepEqual(await f.attached.port.inventory(),[version]);await assert.rejects(()=>f.service.runRecoveryOnce(Array(11).fill("orphan")),/BATCH/);assert.equal(f.service.fakeCalls(),0);
 }finally{await f.stop();}
});
test("exact-version GC lost acknowledgement retains DELETE_PENDING and reconciles without reuse",async()=>{
 const f=await durableFixture();try{
  const s=await completed(f);await f.service.cancel(s.id);await f.service.releaseQuarantineHold(s.id);await assert.rejects(()=>f.service.gc(s.id,s.stage,true),/ACK_LOST/);
  assert.equal((await f.service.inspect(s.id)).availability,"DELETE_PENDING");await assert.rejects(()=>f.service.replay(s.id),/UNAVAILABLE/);await f.runtime().service.recoverGc(s.id);assert.equal((await f.service.inspect(s.id)).availability,"DELETED");assert.equal((await f.service.inspect(s.id)).gcIntents.length,1);
 }finally{await f.stop();}
});
