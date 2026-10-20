import test from "node:test";
import assert from "node:assert/strict";
import { symlink, chmod, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { voiceFoundationFixture } from "../voice-foundation/fixture";
import { pcmWav } from "../audio-verification/fixture";
import { domain, DURABLE_FAKE, envelope, envelopeHash, expectedRequest, parseEnvelope } from "@/lib/storyline/voice/durable-fake/contracts";
import { attachOwnedAudioFixture, audioHash, cleanupOwnedAudioFixture, createOwnedAudioFixture, newObjectVersion } from "@/lib/storyline/voice/durable-fake/storage";

const f=voiceFoundationFixture(16384),context={namespace:`fixture-${"a".repeat(32)}`,tenantId:"tenant",scope:f.scope};
for(const [label,mutate] of Object.entries({
 "unknown outer":(v:Record<string,unknown>)=>({...v,extra:true}),
 "REAL execution":(v:Record<string,unknown>)=>({...v,execution:"REAL"}),
 "approved domain":(v:Record<string,unknown>)=>({...v,schemaVersion:"story-durable-approved-narration-binding-v1"}),
 "restriction promotion":(v:Record<string,unknown>)=>({...v,restrictions:{...(v.restrictions as object),eligibleForRealTts:true}}),
 "cross scope":(v:Record<string,unknown>)=>({...v,scope:{...context.scope,movieId:"other"}}),
 "unknown body":(v:Record<string,unknown>)=>({...v,body:{...(v.body as object),extra:1}}),
 "unsafe number":(v:Record<string,unknown>)=>({...v,body:{...(v.body as object),chunkIndex:Number.MAX_SAFE_INTEGER+1}}),
 "fraction":(v:Record<string,unknown>)=>({...v,body:{...(v.body as object),chunkIndex:0.5}}),
 "future approved parent":(v:Record<string,unknown>)=>({...v,body:{...(v.body as object),plan:{...f.plan,plan:{...f.plan.plan,reference:f.future}}}}),
}))test(`strict durable contract rejects ${label}`,()=>{
 const e=expectedRequest(context,f.plan,0,"key");assert.throws(()=>parseEnvelope("request",mutate(e.request)));
});
test("new domain hash is canonical and leaves existing plan/reference identity unchanged",()=>{
 const before=JSON.stringify(f.plan),e=expectedRequest(context,f.plan,0,"key"),other=expectedRequest(context,f.plan,0,"other");
 assert.equal(JSON.stringify(f.plan),before);assert.equal(e.request.body.recipeHash,other.request.body.recipeHash);assert.notEqual(e.hash,other.hash);
 assert.equal(envelopeHash("request",parseEnvelope("request",e.request)),e.hash);
 assert.equal(new Set(Object.keys(DURABLE_FAKE).map(k=>domain(k as keyof typeof DURABLE_FAKE))).size,13);
 assert.throws(()=>envelope("binding",context,{reference:f.future,planHash:f.plan.planHash,eligibility:"SYNTHETIC_ONLY",approval:"NONE"}));
});
test("bounded canonical capture rejects getters, unsafe prototypes, and composition overflow",()=>{
 const e=expectedRequest(context,f.plan,0,"key");let calls=0;
 assert.throws(()=>parseEnvelope("request",{...e.request,get body(){calls++;return e.request.body;}}));assert.equal(calls,0);
 assert.throws(()=>parseEnvelope("request",Object.assign(Object.create({x:1}),e.request)));
 assert.throws(()=>parseEnvelope("stage",{...e.request,body:{blob:"x".repeat(17000)}}));
});
for(const fault of ["NONE","ACK_LOST","INTERRUPTED"] as const)test(`owned immutable storage: ${fault} is exact-version and cannot overwrite`,async()=>{
 const identity=await createOwnedAudioFixture(),a=await attachOwnedAudioFixture(identity),b=await attachOwnedAudioFixture(identity),version=newObjectVersion(),bytes=pcmWav();
 try{
  if(fault==="NONE")await a.port.create(version,bytes);else await assert.rejects(()=>a.port.create(version,bytes,fault));
  const actual=await b.port.read(version);assert.equal(actual.length,fault==="INTERRUPTED"?13:bytes.length);
  if(fault!=="INTERRUPTED")assert.deepEqual(actual,Uint8Array.from(bytes));
  await assert.rejects(()=>a.port.create(version,bytes),/EEXIST/);
  actual[0]=0;assert.notEqual((await b.port.read(version))[0],0);
  await assert.rejects(()=>b.port.remove(version,"f".repeat(64),bytes.length),/MISMATCH/);
 }finally{await a.close();await b.close();await cleanupOwnedAudioFixture(identity);}
});
test("storage denies traversal, symbolic links, foreign owner, and version reuse after acknowledged/ambiguous deletion",async()=>{
 const identity=await createOwnedAudioFixture(),a=await attachOwnedAudioFixture(identity),v=newObjectVersion(),bytes=pcmWav();
 try{
  for(const path of ["../foreign","/etc/passwd","latest","a".repeat(33)])await assert.rejects(()=>a.port.read(path),/STORAGE_VERSION/);
  await assert.rejects(()=>attachOwnedAudioFixture({...identity,nonce:"foreign"}),/OWNER/);
  await symlink("/etc/passwd",join(identity.root,"objects",v));await assert.rejects(()=>a.port.read(v),/ELOOP/);await assert.rejects(()=>a.port.create(v,bytes),/EEXIST/);
  const exact=newObjectVersion();await a.port.create(exact,bytes);await assert.rejects(()=>a.port.remove(exact,audioHash(bytes),bytes.length,true),/ACK_LOST/);
  await a.port.remove(exact,audioHash(bytes),bytes.length);await assert.rejects(()=>a.port.create(exact,bytes),/TOMBSTONE/);
  const before=await readFile("/etc/passwd");assert.ok(before.length);
 }finally{await a.close();await cleanupOwnedAudioFixture(identity);}
});
test("storage refuses a changed/missing ownership marker and oversized/sparse bytes",async()=>{
 const identity=await createOwnedAudioFixture(),a=await attachOwnedAudioFixture(identity);
 try{
  await assert.rejects(()=>a.port.create(newObjectVersion(),new Uint8Array(4194305)));
  const v=newObjectVersion(),file=join(identity.root,"objects",v),f=await open(file,"wx",0o600);await f.truncate(4194305);await f.close();
  await assert.rejects(()=>a.port.read(v),/STORAGE_BYTES/);
  await assert.rejects(()=>cleanupOwnedAudioFixture({...identity,ownerPid:identity.ownerPid+1}),/OWNER/);
  await chmod(file,0o400);
 }finally{await a.close();await cleanupOwnedAudioFixture(identity);}
});
