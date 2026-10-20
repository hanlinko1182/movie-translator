import test from "node:test";
import assert from "node:assert/strict";
import { chmod, writeFile, symlink, unlink } from "node:fs/promises";
import { createOwnedBlobFixture, attachOwnedBlobFixture, objectVersion, byteHash } from "../../../lib/storyline/render-execution-fake/storage";
import { envelope } from "../../../lib/storyline/render-execution-fake/contracts";
import { createFakeSourceAuthorityForTest } from "../../../lib/storyline/render-execution-fake/source";
import { createFakeProcessOwnerForTest } from "../../../lib/storyline/render-execution-fake/process";
const scope={tenantId:"tenant",projectId:"project",movieId:"movie",studioId:"studio"};

test("owned exact blob protocol rejects cross-scope, traversal, overwrite and conditional-delete mismatch",async()=>{
 const owner=await createOwnedBlobFixture(),f=await attachOwnedBlobFixture(owner),context={namespace:owner.namespace,scope},version=objectVersion(),bytes=Uint8Array.from([1,2,3]);
 try{
  await f.port.register(context,version);await f.port.create(context,version,bytes);
  await assert.rejects(f.port.create(context,version,bytes));
  await assert.rejects(f.port.read({...context,scope:{...scope,tenantId:"foreign"}},version));
  await assert.rejects(f.port.read(context,"../foreign"));await assert.rejects(f.port.read(context,"https://foreign.invalid/object"));
  await assert.rejects(f.port.remove(context,version,"a".repeat(64),bytes.length,"intent"));
  assert.deepEqual(await f.port.read(context,version),bytes);
  await f.port.remove(context,version,byteHash(bytes),bytes.length,"intent");await assert.rejects(f.port.create(context,version,bytes));
  await f.port.remove(context,version,byteHash(bytes),bytes.length,"intent");
  await assert.rejects(f.port.remove(context,version,byteHash(bytes),bytes.length,"other-intent"));
 }finally{await f.close();}
});
test("owner marker and symlink defenses never follow a foreign blob",async()=>{
 const owner=await createOwnedBlobFixture(),f=await attachOwnedBlobFixture(owner),context={namespace:owner.namespace,scope},a=objectVersion(),b=objectVersion();
 try{
  await assert.rejects(attachOwnedBlobFixture({...owner,nonce:"f".repeat(64)}));
  await f.port.register(context,a);await f.port.register(context,b);await f.port.create(context,a,Uint8Array.from([1,2]));
  await symlink(`${owner.root}/objects/${a}.blob`,`${owner.root}/objects/${b}.blob`);
  await assert.rejects(f.port.read(context,b));await assert.rejects(f.port.remove(context,b,byteHash(Uint8Array.from([1,2])),2,"intent"));
  assert.deepEqual(await f.port.read(context,a),Uint8Array.from([1,2]));
 }finally{await f.close();}
});
test("opaque fake source binding checks full actual bytes and never accepts replaced bytes",async()=>{
 const owner=await createOwnedBlobFixture(),f=await attachOwnedBlobFixture(owner),context={namespace:owner.namespace,scope},v=objectVersion(),bytes=Uint8Array.from([1,3,5]);
 try{
  await f.port.register(context,v);await f.port.create(context,v,bytes);
  const binding=envelope("source",context,{handle:"opaque-handle",ownerId:"fixture-owner",version:v,byteSha256:byteHash(bytes),byteCount:bytes.length,generation:1,expiresAtMs:Date.now()+60000});
  const source=createFakeSourceAuthorityForTest(context,binding,f.port);await source.inspect(context,source.sourceHash);
  await chmod(`${owner.root}/objects/${v}.blob`,0o600);await writeFile(`${owner.root}/objects/${v}.blob`,Uint8Array.from([1,3,6]));
  await assert.rejects(source.inspect(context,source.sourceHash),{code:"SOURCE_INTEGRITY"});
  await assert.rejects(source.inspect({...context,scope:{...scope,movieId:"other"}},source.sourceHash));
 }finally{await f.close();}
});
test("source handle expiry, version quotas and byte ceilings fail without truncation",async()=>{
 const owner=await createOwnedBlobFixture(),f=await attachOwnedBlobFixture(owner),context={namespace:owner.namespace,scope},v=objectVersion(),bytes=Uint8Array.from([1]);
 try{
  await f.port.register(context,v);await assert.rejects(f.port.create(context,v,new Uint8Array(1048577)),{code:"BLOB_LIMIT"});
  await f.port.create(context,v,bytes);
  const source=createFakeSourceAuthorityForTest(context,envelope("source",context,{handle:"handle",ownerId:"owner",version:v,byteSha256:byteHash(bytes),byteCount:1,generation:1,expiresAtMs:Date.now()-1}),f.port);
  await assert.rejects(source.inspect(context,source.sourceHash));
  for(let i=1;i<32;i++)await f.port.register(context,objectVersion());
  await assert.rejects(f.port.register(context,objectVersion()),{code:"STORAGE_QUOTA"});
 }finally{await f.close();}
});
test("fake process permits are nonserializable, one-use and cannot be copied or replayed",async()=>{
 const p=createFakeProcessOwnerForTest(),context={namespace:"fixture",scope},cap=p.arm(context,"operation","submission","a".repeat(64),1);
 assert.throws(()=>JSON.stringify(cap));await assert.rejects(p.invoke({...cap},1));assert.equal(p.starts(),0);
 await p.invoke(cap,1);assert.equal(p.starts(),1);await assert.rejects(p.invoke(cap,1));
 await assert.rejects(p.invoke(p.arm(context,"operation","submission","a".repeat(64),1),1));assert.equal(p.starts(),1);
});
test("storage fixture reattachment retains exact immutable bytes, without claiming host durability",async()=>{
 const owner=await createOwnedBlobFixture(),first=await attachOwnedBlobFixture(owner),context={namespace:owner.namespace,scope},v=objectVersion(),bytes=Uint8Array.from([4,5]);
 await first.port.register(context,v);await first.port.create(context,v,bytes);await first.close();
 const second=await attachOwnedBlobFixture(owner);try{assert.deepEqual(await second.port.read(context,v),bytes);await second.port.remove(context,v,byteHash(bytes),2,"intent");await assert.rejects(second.port.read(context,v));}finally{await second.close();}
});
test("missing registered object is not a deletion acknowledgement",async()=>{
 const owner=await createOwnedBlobFixture(),f=await attachOwnedBlobFixture(owner),context={namespace:owner.namespace,scope},v=objectVersion(),bytes=Uint8Array.from([9]);
 try{await f.port.register(context,v);await f.port.create(context,v,bytes);await unlink(`${owner.root}/objects/${v}.blob`);await assert.rejects(f.port.remove(context,v,byteHash(bytes),1,"intent"));}finally{await f.close();}
});
test("global fake simulator concurrency is one, including different operation identities",async()=>{
 const p=createFakeProcessOwnerForTest(),context={namespace:"fixture",scope};let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>entered=r);
 const first=p.invoke(p.arm(context,"first","submission-one","a".repeat(64),1),1,"NONE",async()=>{entered();await gate;});
 await seen;await assert.rejects(p.invoke(p.arm(context,"second","submission-two","b".repeat(64),1),1));
 release();await first;assert.equal(p.starts(),1);
});
