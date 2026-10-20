import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { executionFixture } from "./fixture";
import { createFakeProcessOwnerForTest } from "../../../lib/storyline/render-execution-fake/process";

for(const [phase,expectedStarts,state]of [["checkpoint-after-commit",0,"UNKNOWN"],["fake-started",1,"UNKNOWN"],["finalize-after-commit",1,"SUCCESS"]]as const)test(`service-only SIGKILL at ${phase}; original DB/blob ownership survives without invoke recovery`,async()=>{
 const f=await executionFixture();
 const child=fork(fileURLToPath(new URL("./child.fixture.ts",import.meta.url)),[],{execArgv:["--conditions=react-server","--import","tsx"],env:{PATH:"/usr/bin:/bin",NODE_ENV:"test",DATABASE_URL:"postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable"},stdio:["ignore","pipe","pipe","ipc"]});
 const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(r=>child.once("exit",(code,signal)=>r({code,signal})));
 let diagnosticBytes=0;for(const stream of [child.stdout,child.stderr])stream?.on("data",b=>{diagnosticBytes+=b.length;if(diagnosticBytes>65536)child.kill("SIGKILL");});
 const timer=setTimeout(()=>child.kill("SIGKILL"),20000);
 try{
  const barrier=new Promise<{id:string;starts:number}>((resolve,reject)=>{
   child.once("error",reject);child.once("exit",()=>reject(Error("service child exited before owned barrier")));
   child.once("message",(m:unknown)=>{const msg=m as {event:string;id:string;starts:number;code?:string};if(msg.event!=="barrier")reject(Error(`service child ${msg.code??msg.event}`));else resolve(msg);});
  });
  child.send({connections:f.connections,keys:f.keys,sessions:f.sessions,context:f.context,storageIdentity:f.storageIdentity,binding:f.binding,phase});
  const observed=await barrier;assert.equal(observed.starts,expectedStarts);assert.ok(observed.id);child.kill("SIGKILL");assert.equal((await exited).signal,"SIGKILL");
  const replacement=createFakeProcessOwnerForTest(),restarted=f.service({process:replacement}),recovered=await restarted.recovery.recover(f.request("recover"),observed.id);
  assert.equal(recovered.state.state,state);await assert.rejects(restarted.executeFake(f.request("execute"),observed.id));assert.equal(replacement.starts(),0);assert.equal(f.process.starts(),0);
  if(state==="SUCCESS"){assert.equal(recovered.state.availability,"AVAILABLE");assert.ok((await restarted.inspectPrivate(f.request("read"),observed.id)).bytes.length);}
  else {assert.equal(recovered.state.quarantine_hold,true);await assert.rejects(restarted.recovery.releaseHold(f.request("recover"),observed.id));}
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");await exited;await f.stop();}
});
