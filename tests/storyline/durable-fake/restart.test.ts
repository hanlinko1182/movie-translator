import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { durableFixture } from "./fixture";

function child(f:Awaited<ReturnType<typeof durableFixture>>,command:string,cut?:string,id?:string,stage?:string) {
 const p=fork(fileURLToPath(new URL("./child.fixture.ts",import.meta.url)),[],{execArgv:["--conditions=react-server","--import","tsx"],stdio:["ignore","pipe","pipe","ipc"],env:{PATH:process.env.PATH,NODE_ENV:"test",DATABASE_URL:"postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable"}});
 const messages:Record<string,unknown>[]=[];let diagnostic="";
 p.stderr?.on("data",data=>{diagnostic+=String(data).slice(0,1000);});
 const result=new Promise<Record<string,unknown>>((resolve,reject)=>{
  const timer=setTimeout(()=>{p.kill("SIGKILL");reject(new Error("CHILD_TIMEOUT"));},15000);
  p.on("message",(value:Record<string,unknown>)=>{messages.push(value);if(value.type==="barrier")p.kill("SIGKILL");});
  p.on("error",reject);p.on("exit",(code,signal)=>{clearTimeout(timer);const error=messages.find(m=>m.type==="error");
   if(error)reject(new Error(String(error.message)));else if(signal==="SIGKILL"&&messages.some(m=>m.type==="barrier"))resolve({messages,crashed:true});
   else if(code===0&&messages.some(m=>m.type==="done"))resolve(messages.find(m=>m.type==="done")!);else reject(new Error(`CHILD_EXIT_${code}_${signal}: ${diagnostic}`));});
 });
 p.send({connections:f.database.connections,keys:f.database.keys,session:f.session,identity:f.identity,context:f.context,command,cut,id,stage});return result;
}
for(const cut of ["reservation_before","reservation_before_commit","reservation_after_commit","checkpoint_after_commit","journal_before_commit","journal_after_commit","stage_after_commit","blob_after_write","validation_before_commit","validation_after_commit","finalization_before_commit","finalization_after_commit"]) {
 test(`actual child death/restart at ${cut}: original durable identity, no regenerated execution`,async()=>{
  const f=await durableFixture();
  try {
   const killed=await child(f,"flow",cut);assert.equal(killed.crashed,true);
   const repeated=await f.service.reserve("crash-key",0);
   if(cut==="reservation_before"||cut==="reservation_before_commit") {assert.equal(repeated.created,true);assert.equal((await f.service.inspect(repeated.id)).checkpoint,false);return;}
   assert.equal(repeated.created,false);
   await assert.rejects(()=>f.service.executeFake(repeated.id),/NO_PROCESS_PERMIT/);
   if(cut==="stage_after_commit") {
    await assert.rejects(()=>child(f,"recover",undefined,repeated.id),/ENOENT/);assert.equal((await f.service.inspect(repeated.id)).artifact_state,"QUARANTINED");
   }else{
    const recovered=await child(f,"recover",undefined,repeated.id);assert.equal(recovered.calls,0);
    if(["blob_after_write","validation_before_commit","validation_after_commit","finalization_before_commit","finalization_after_commit"].includes(cut)) {assert.equal(recovered.artifact,"COMMITTED");assert.ok(recovered.bytesHash);}
    else if(["checkpoint_after_commit","journal_before_commit"].includes(cut))assert.equal(recovered.delivery,"UNKNOWN");
    else if(cut==="journal_after_commit")assert.equal(recovered.delivery,"DEFINITIVE_SUCCESS");
    const s=await f.service.inspect(repeated.id);assert.equal(s.submission.body.generation,1);assert.equal(s.owner_generation,2);
   }
   assert.equal(f.service.fakeCalls(),0);
  }finally{await f.stop();}
 });
}
for(const cut of ["gc_after_intent","gc_after_delete"]) test(`separate GC child restart at ${cut} retains exact tombstone`,async()=>{
 const f=await durableFixture();try{
  const r=await f.service.reserve("gc-crash",0),o=await f.service.executeFake(r.id),stage=await f.service.allocateStage(r.id);await f.service.writeStage(r.id,stage,o.bytes!);await f.service.validate(r.id,stage);await f.service.finalize(r.id,stage);
  await f.service.cancel(r.id);await f.service.releaseQuarantineHold(r.id);
  assert.equal((await child(f,"gc",cut,r.id,stage)).crashed,true);
  assert.equal((await f.service.inspect(r.id)).availability,"DELETE_PENDING");
  const recovered=await child(f,"gc_recover",undefined,r.id);assert.equal(recovered.calls,0);assert.equal((await f.service.inspect(r.id)).availability,"DELETED");
 }finally{await f.stop();}
});
