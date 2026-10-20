import test from "node:test";
import assert from "node:assert/strict";
import { chmod, writeFile, unlink } from "node:fs/promises";
import { executionFixture } from "./fixture";
import { createFakeProcessOwnerForTest, expectedFakeOutput } from "../../../lib/storyline/render-execution-fake/process";
import { envelope } from "../../../lib/storyline/render-execution-fake/contracts";

for(const [fault,starts] of [["CHECKPOINT_ACK_LOST",0],["BEFORE_START",0],["AFTER_START",1],["UNKNOWN",1]] as const) test(`${fault}: sticky UNKNOWN and recovery never invokes`,async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await assert.rejects(f.api.executeFake(f.request("execute"),r.id,fault));assert.equal(f.process.starts(),starts);
  const replacement=createFakeProcessOwnerForTest(),restarted=f.service({process:replacement});
  assert.equal("invoke" in restarted.recovery,false);assert.equal("executeFake" in restarted.recovery,false);
  for(let n=0;n<2;n++){const state=await restarted.recovery.recover(f.request("recover"),r.id);assert.equal(state.state.state,"UNKNOWN");}
  assert.equal(f.process.starts(),starts);assert.equal(replacement.starts(),0);
  await assert.rejects(restarted.executeFake(f.request("execute"),r.id));
  assert.equal((await f.reserve("new-key")).id,r.id);
  await assert.rejects(restarted.recovery.releaseHold(f.request("recover"),r.id));
  await assert.rejects(restarted.recovery.gc(f.request("gc"),r.id));
 }finally{await f.stop();}
});
test("original flow crash before checkpoint cannot be recovered as a new flow",async()=>{
 const f=await executionFixture();try{
  const api=f.service({barrier:async p=>{if(p==="before-checkpoint")throw Error("service crash");}}),r=await f.reserve(undefined,api);
  await assert.rejects(api.executeFake(f.request("execute"),r.id));assert.equal(f.process.starts(),0);
  const fresh=f.service({process:createFakeProcessOwnerForTest()});assert.equal((await fresh.recovery.recover(f.request("recover"),r.id)).state.state,"RESERVED");
  await assert.rejects(fresh.executeFake(f.request("execute"),r.id));await fresh.cancel(f.request("execute"),r.id);
  assert.equal((await fresh.inspect(f.request("read"),r.id)).state.state,"CANCELLED");
 }finally{await f.stop();}
});
test("original independently owned journal resolves only original UNKNOWN; explicit readoption revalidates",async()=>{
 const f=await executionFixture();try{
  const api=f.service({barrier:async p=>{if(p==="result-before-journal")throw Error("service crash after original outcome");}}),r=await f.reserve(undefined,api);
  await assert.rejects(api.executeFake(f.request("execute"),r.id));assert.equal(f.process.starts(),1);
  const restarted=f.service({process:undefined,journal:f.process.originalResult});
  const result=await restarted.recovery.recover(f.request("recover"),r.id);assert.equal(result.state.state,"SUCCESS");assert.equal(result.state.owner_generation,2);
  await restarted.capture(f.request("validate"),r.id);await restarted.recovery.readopt(f.request("recover"),r.id);
  await restarted.finalize(f.request("finalize"),r.id);assert.ok((await restarted.inspectPrivate(f.request("read"),r.id)).bytes.length);assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("lost finalization acknowledgement recovers the same committed artifact without quarantine or rerun",async()=>{
 const f=await executionFixture();try{
  const api=f.service({barrier:async p=>{if(p==="finalize-after-commit")throw Error("ACK lost");}}),r=await f.reserve(undefined,api);
  await api.executeFake(f.request("execute"),r.id);await api.capture(f.request("validate"),r.id);await api.verify(f.request("validate"),r.id);
  await assert.rejects(api.finalize(f.request("finalize"),r.id));
  const s=await f.service({process:undefined}).recovery.recover(f.request("recover"),r.id);
  assert.equal(s.state.availability,"AVAILABLE");assert.ok(s.facts.artifact);assert.equal(f.process.starts(),1);
  assert.ok((await f.api.inspectPrivate(f.request("read"),r.id)).bytes.length);
 }finally{await f.stop();}
});
test("lost create acknowledgement re-reads the original exact version without overwrite",async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await f.api.executeFake(f.request("execute"),r.id);
  await assert.rejects(f.api.capture(f.request("validate"),r.id,"ACK_LOST"));
  const version=await f.api.capture(f.request("validate"),r.id);assert.equal(version,(await f.api.inspect(f.request("read"),r.id)).work.stage.body.version);
  await f.api.verify(f.request("validate"),r.id);await f.api.finalize(f.request("finalize"),r.id);assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
for(const corrupt of ["partial","changed","missing","oversized"] as const)test(`${corrupt} fake output quarantines without adopting new bytes`,async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await f.api.executeFake(f.request("execute"),r.id);
  if(corrupt==="partial")await assert.rejects(f.api.capture(f.request("validate"),r.id,"PARTIAL"));else await f.api.capture(f.request("validate"),r.id);
  const s=await f.api.inspect(f.request("read"),r.id),path=`${f.storageIdentity.root}/objects/${s.work.stage.body.version}.blob`;
  if(corrupt==="missing")await unlink(path);
  if(corrupt==="changed"||corrupt==="oversized"){await chmod(path,0o600);await writeFile(path,corrupt==="changed"?Buffer.from("corrupt"):Buffer.alloc(1048577));}
  await assert.rejects(f.api.verify(f.request("validate"),r.id));
  assert.equal((await f.api.inspect(f.request("read"),r.id)).state.availability,"QUARANTINED");await assert.rejects(f.api.finalize(f.request("finalize"),r.id));assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("simulated cancellation after start preserves original success, denies adoption",async()=>{
 const f=await executionFixture();let release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>started=r);
 try{
  const api=f.service({barrier:async p=>{if(p==="fake-started"){started();await gate;}}}),r=await f.reserve(undefined,api);
  const running=api.executeFake(f.request("execute"),r.id);await seen;await api.cancel(f.request("execute"),r.id);release();await running;
  const s=await api.inspect(f.request("read"),r.id);assert.equal(s.state.state,"SUCCESS");assert.equal(s.state.cancelled,true);assert.equal(f.process.starts(),1);
  await assert.rejects(api.capture(f.request("validate"),r.id));await assert.rejects(api.finalize(f.request("finalize"),r.id));
 }finally{release?.();await f.stop();}
});
test("concurrent finalizers converge to one immutable artifact or an explicit conflict",async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await f.api.executeFake(f.request("execute"),r.id);await f.api.capture(f.request("validate"),r.id);await f.api.verify(f.request("validate"),r.id);
  const results=await Promise.allSettled([f.api.finalize(f.request("finalize"),r.id),f.service({process:undefined}).finalize(f.request("finalize"),r.id)]);
  assert.ok(results.some(r=>r.status==="fulfilled"));
  const s=await f.api.inspect(f.request("read"),r.id);assert.equal(s.state.availability,"AVAILABLE");assert.ok(s.facts.artifact);
  assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.fact WHERE kind='artifact'")).rows[0].n,1);assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("read hold blocks GC; lost-delete ACK reconciles exact intent/tombstone",async()=>{
 const f=await executionFixture();try{
  const id=await f.complete();
  await assert.rejects(f.api.inspectPrivate(f.request("read"),id,async()=>{
   await f.api.recovery.quarantine(f.request("quarantine"),id);await f.api.recovery.releaseHold(f.request("recover"),id);
   await assert.rejects(f.api.recovery.gc(f.request("gc"),id),{code:"GC_HELD"});
  }));
  await f.api.recovery.releaseHold(f.request("recover"),id);
  await assert.rejects(f.api.recovery.gc(f.request("gc"),id,true),{code:"DELETE_ACK_LOST"});
  assert.equal((await f.api.inspect(f.request("read"),id)).state.availability,"DELETE_PENDING");
  await f.service({process:undefined}).recovery.gc(f.request("gc"),id);
  assert.equal((await f.api.inspect(f.request("read"),id)).state.availability,"DELETED");
  assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.tombstone")).rows[0].n,1);
  await assert.rejects(f.api.inspectPrivate(f.request("read"),id));assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("definitive fake failure is quiescent and immutable; it grants no capture or retry",async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await f.api.executeFake(f.request("execute"),r.id,"FAILURE");
  const s=await f.api.inspect(f.request("read"),r.id);assert.equal(s.state.state,"FAILURE");assert.equal(s.facts.result?.body.byteCount,0);assert.equal(s.facts.result?.body.byteSha256,null);
  await assert.rejects(f.api.capture(f.request("validate"),r.id));await f.api.recovery.recover(f.request("recover"),r.id);assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("conflicting original outcome cannot overwrite the journal and quarantines availability",async()=>{
 const f=await executionFixture();try{
  const id=await f.complete(),s=await f.api.inspect(f.request("read"),id),original=s.facts.result!;
  const contradictory=envelope("result",f.context,{...original.body,outcome:"FAILURE",byteSha256:null,byteCount:0});
  const observer=f.service({process:undefined,journal:()=>contradictory});await assert.rejects(observer.observeOriginal(f.request("observe"),id),{code:"EVIDENCE_CONFLICT"});
  const after=await f.api.inspect(f.request("read"),id);assert.deepEqual(after.facts.result,original);assert.equal(after.state.availability,"QUARANTINED");assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("retention and explicit holds survive ownership takeover; lease-like expiry is not deletion authority",async()=>{
 const f=await executionFixture();try{
  const id=await f.complete();await f.api.recovery.quarantine(f.request("quarantine"),id);
  await f.api.recovery.recover(f.request("recover"),id);await assert.rejects(f.api.recovery.gc(f.request("gc"),id),{code:"GC_HELD"});
  await f.api.recovery.releaseHold(f.request("recover"),id);await f.admin.query("UPDATE execution_m803.state SET retain_until=clock_timestamp()+interval '1 hour' WHERE id=$1",[id]);
  await assert.rejects(f.api.recovery.gc(f.request("gc"),id),{code:"GC_HELD"});assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("valid-looking independently planted fake bytes cannot resolve UNKNOWN or finalize without original result",async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await assert.rejects(f.api.executeFake(f.request("execute"),r.id,"UNKNOWN"));const s=await f.api.inspect(f.request("read"),r.id),version=String(s.work.stage.body.version);
  await f.storage.register(f.context,version);await f.storage.create(f.context,version,expectedFakeOutput(s.work.work_hash));
  await assert.rejects(f.api.verify(f.request("validate"),r.id),{code:"ORIGINAL_RESULT_MISSING"});await assert.rejects(f.api.finalize(f.request("finalize"),r.id));
  assert.equal((await f.api.recovery.recover(f.request("recover"),r.id)).state.state,"UNKNOWN");await assert.rejects(f.api.recovery.gc(f.request("gc"),r.id));assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
