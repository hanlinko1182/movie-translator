import test from "node:test";
import assert from "node:assert/strict";
import { executionFixture } from "./fixture";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { envelope } from "../../../lib/storyline/render-execution-fake/contracts";

test("reserve -> checkpoint -> one fake invocation -> capture -> independent verification -> private artifact",async()=>{
 const f=await executionFixture();try{
  const before=canonicalJson(await f.snapshotOriginals()),r=await f.reserve("request-one");
  assert.equal(r.created,true);await f.api.executeFake(f.request("execute"),r.id);assert.equal(f.process.starts(),1);
  await f.api.capture(f.request("validate"),r.id);await f.api.verify(f.request("validate"),r.id);await f.api.finalize(f.request("finalize"),r.id);
  const read=await f.api.inspectPrivate(f.request("read"),r.id);assert.ok(read.bytes.length>0);assert.equal(read.artifact.body.measurements&&JSON.stringify(read.artifact.body.measurements),JSON.stringify({codec:"NOT_MEASURED",duration:"NOT_MEASURED",frames:"NOT_MEASURED",streams:"NOT_MEASURED"}));
  assert.equal(before,canonicalJson(await f.snapshotOriginals()));
  const recovered=await f.service({process:undefined}).recovery.recover(f.request("recover"),r.id);assert.equal(recovered.state.state,"SUCCESS");assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("same-key duplicate, different-key alias and changed proposal conflict without a second invocation",async()=>{
 const f=await executionFixture();try{
  const p=await f.api.proposal(f.request("inspect"),"one"),a=await f.api.reserve(f.request("execute"),p);
  assert.deepEqual(await f.api.reserve(f.request("execute"),p),{id:a.id,created:false});
  assert.deepEqual(await f.reserve("two"),{id:a.id,created:false});
  const changed=envelope("request",f.context,{...p.body,sourceHash:"a".repeat(64)});await assert.rejects(f.api.reserve(f.request("execute"),changed));
  await f.api.executeFake(f.request("execute"),a.id);await assert.rejects(f.api.executeFake(f.request("execute"),a.id));assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("complete fake flow performs zero fetch/provider calls",async()=>{
 const f=await executionFixture(),original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw Error("network/provider forbidden");};
  const id=await f.complete();await f.api.inspectPrivate(f.request("read"),id);assert.equal(calls,0);assert.equal(f.process.starts(),1);
 }finally{globalThis.fetch=original;await f.stop();}
});
