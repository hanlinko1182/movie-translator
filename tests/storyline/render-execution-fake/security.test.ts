import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash, createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { executionFixture, connect } from "./fixture";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { actions, EXECUTION, envelope, envelopeHash } from "../../../lib/storyline/render-execution-fake/contracts";
import { createExecutionGatewayForTest, assertExecutionDatabase } from "../../../lib/storyline/render-execution-fake/database";
import { createSyntheticExecutionAuthenticationForTest } from "../../../lib/storyline/render-execution-fake/auth";
import { createFakeSourceAuthorityForTest } from "../../../lib/storyline/render-execution-fake/source";
import { objectVersion } from "../../../lib/storyline/render-execution-fake/storage";

for(const principal of ["denied","expired","db-denied","db-revoked","foreign","reader"])test(`${principal}: cannot acquire fake execution authority`,async()=>{
 const f=await executionFixture();try{
  const p=await f.api.proposal(f.request("inspect"),"key");await assert.rejects(f.api.reserve(f.request("execute",principal),p));assert.equal(f.process.starts(),0);
 }finally{await f.stop();}
});
for(const [header,value]of [["origin","https://foreign.invalid"],["x-execution-m803-csrf",null],["sec-fetch-site","cross-site"],["cookie","execution_m803_session=forged"]] as const)test(`native ${header} rejected before reservation`,async()=>{
 const f=await executionFixture();try{
  const p=await f.api.proposal(f.request("inspect"),"key");await assert.rejects(f.api.reserve(f.request("execute","editor-a",{[header]:value}),p));assert.equal(f.process.starts(),0);
 }finally{await f.stop();}
});
test("M7 canCreate is neither necessary nor sufficient: independently granted reader can execute fake work",async()=>{
 const f=await executionFixture();try{
  assert.equal(f.f.sessions.find(s=>s.principalId==="reader")!.grants[0].canCreate,false);
  const sessions=structuredClone(f.sessions);sessions.find(s=>s.principalId==="reader")!.actions=[...actions];
  await f.admin.query("UPDATE execution_m803.access_grant SET actions=$1 WHERE principal='reader'",[[...actions]]);
  const auth=createSyntheticExecutionAuthenticationForTest(sessions),gateway=createExecutionGatewayForTest({mode:"M803_DISPOSABLE_ONLY",connections:f.connections,keys:f.keys,authentication:auth.authentication}),api=f.service({gateway});
  const p=await api.proposal(f.request("inspect","reader"),"reader-work"),r=await api.reserve(f.request("execute","reader"),p);
  await api.executeFake(f.request("execute","reader"),r.id);assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("expired/revoked read denies complete private bytes, never a partial response",async()=>{
 const f=await executionFixture();try{
  const id=await f.complete();await assert.rejects(f.api.inspectPrivate(f.request("read","reader"),id,async()=>{await f.admin.query("UPDATE execution_m803.session SET revoked=true WHERE principal='reader'");}));
  assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
for(const table of ["timeline_m702.repository_head","highlight_m602.repository_head","highlight_m602.current_dependency","timeline_m702.policy","execution_m803.source"])test(`${table} drift denies finalization and retains original evidence`,async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await f.api.executeFake(f.request("execute"),r.id);await f.api.capture(f.request("validate"),r.id);await f.api.verify(f.request("validate"),r.id);
  if(table.endsWith("repository_head"))await f.admin.query(`UPDATE ${table} SET revision=revision+1 WHERE tenant='tenant-one'`);
  else if(table.endsWith("current_dependency"))await f.admin.query(`UPDATE ${table} SET observed_reference=jsonb_set(observed_reference,'{currentness,sourceRevision}','99') WHERE tenant='tenant-one'`);
  else await f.admin.query(`UPDATE ${table} SET enabled=false`);
  await assert.rejects(f.api.finalize(f.request("finalize"),r.id));
  const s=await f.api.inspect(f.request("read"),r.id);assert.equal(s.state.availability,"QUARANTINED");assert.ok(s.facts.result);assert.equal(s.facts.artifact,undefined);assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("source authority revocation and actual fake source replacement deny admission",async()=>{
 const f=await executionFixture();try{
  const p=await f.api.proposal(f.request("inspect"),"key");f.source.revokeForTest();await assert.rejects(f.api.reserve(f.request("execute"),p),{code:"SOURCE_UNAVAILABLE"});assert.equal(f.process.starts(),0);
 }finally{await f.stop();}
});
test("quota and failed admission audit transaction preserve all original counters",async()=>{
 const f=await executionFixture();try{
  const api=f.service({barrier:async p=>{if(p==="reservation-before-commit")throw Error("audit commit crash");}});
  await assert.rejects(f.reserve("rolled-back",api));
  assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.work")).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT operations FROM execution_m803.fixture")).rows[0].operations,0);
  await f.admin.query("UPDATE execution_m803.fixture SET operations=16");await assert.rejects(f.reserve(),{code:"QUOTA"});assert.equal(f.process.starts(),0);
 }finally{await f.stop();}
});
test("lost reservation ACK supports exact operation lookup but cannot recreate original live flow",async()=>{
 const f=await executionFixture();try{
  const api=f.service({barrier:async p=>{if(p==="reservation-after-commit")throw Error("ACK lost");}}),p=await api.proposal(f.request("inspect"),"lost-key");
  await assert.rejects(api.reserve(f.request("execute"),p));
  const found=await api.readOperation(f.request("read"),"lost-key",envelopeHash("request",p));assert.equal(found.status,"FOUND");if(found.status!=="FOUND")throw Error("missing original");
  await assert.rejects(api.executeFake(f.request("execute"),found.id));assert.equal(f.process.starts(),0);
  assert.equal((await api.readOperation(f.request("read"),"absent-key","a".repeat(64))).status,"NOT_FOUND");
 }finally{await f.stop();}
});
test("all restricted catalogs deny private tables, helpers, other actions, owner membership and new column grants",async()=>{
 const f=await executionFixture();try{
  for(const a of actions){const c=await connect(f.connections[a]);try{await assertExecutionDatabase(c,a);await assert.rejects(c.query("SELECT * FROM execution_m803.work"));await assert.rejects(c.query("SELECT execution_m803.gateway('read','','','')"));await assert.rejects(c.query("CREATE TEMP TABLE escape(id int)"));await assert.rejects(c.query("SET ROLE execution_m803_owner"));}finally{await c.end();}}
  const c=await connect(f.connections.read);try{
   await f.admin.query(`GRANT SELECT(id) ON execution_m803.work TO ${f.connections.read.user}`);await assert.rejects(assertExecutionDatabase(c,"read"),{code:"DATABASE_UNSAFE"});
  }finally{await c.end();}
 }finally{await f.stop();}
});
test("immutable payloads reject UPDATE DELETE TRUNCATE; source bindings cannot be replaced",async()=>{
 const f=await executionFixture();try{
  const id=await f.complete();assert.ok(id);
  for(const table of ["work","key_slot","fact","audit_event","source"]){await assert.rejects(f.admin.query(`DELETE FROM execution_m803.${table}`));await assert.rejects(f.admin.query(`TRUNCATE execution_m803.${table} CASCADE`));}
  await assert.rejects(f.admin.query("UPDATE execution_m803.source SET hash=repeat('a',64)"));
 }finally{await f.stop();}
});
test("action proof binds body, backend, transaction, nonce, action and scoped principal",async()=>{
 const f=await executionFixture();try{
  const a="read",c=await connect(f.connections[a]);try{
   await c.query("BEGIN");const s=f.sessions[0],meta=(await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx,floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0];
   const body=canonicalJson({op:"lookup",key:"absent",requestHash:"a".repeat(64)});
   const base={domain:EXECUTION.access,...f.context,sessionId:s.id,principalId:s.principalId,action:a,bodyHash:createHash("sha256").update(body).digest("hex"),nonce:randomBytes(24).toString("hex"),backendPid:Number(meta.pid),transactionId:meta.tx,expiresAtMs:Number(meta.now)+3000,origin:s.origin,csrfHash:createHash("sha256").update(s.csrf).digest("hex")};
   for(const mutation of [{backendPid:Number(meta.pid)+1},{transactionId:"0"},{action:"execute"},{bodyHash:"b".repeat(64)},{scope:{...f.scope,tenantId:"tenant-two"}},{expiresAtMs:Number(meta.now)-1}]){
    await c.query("SAVEPOINT attempt");const wire=canonicalJson({...base,...mutation}),mac=createHmac("sha256",Buffer.from(f.keys.read,"hex")).update(`${EXECUTION.access}\n${wire}`).digest("hex");
    await assert.rejects(c.query("SELECT execution_m803.read($1,$2,$3)",[wire,mac,body]));await c.query("ROLLBACK TO SAVEPOINT attempt");
   }
   const wire=canonicalJson(base),mac=createHmac("sha256",Buffer.from(f.keys.read,"hex")).update(`${EXECUTION.access}\n${wire}`).digest("hex");
   await c.query("SELECT execution_m803.read($1,$2,$3)",[wire,mac,body]);await assert.rejects(c.query("SELECT execution_m803.read($1,$2,$3)",[wire,mac,body]));await c.query("ROLLBACK");
  }finally{await c.end();}
 }finally{await f.stop();}
});
for(const stage of ["reservation-before-commit","finalize-before-commit"] as const)test(`${stage}: actual source/head writer waits behind committing backend fence`,async()=>{
 const f=await executionFixture();let release!:()=>void,entered!:(pid:number)=>void;
 const gate=new Promise<void>(r=>release=r),seen=new Promise<number>(r=>entered=r);
 const writer=await f.f.owned.securityAdministrator();let writing:Promise<unknown>|undefined;
 try{
  const api=f.service({barrier:async(p,pid)=>{if(p===stage){entered(pid!);await gate;}}});
  let pending:Promise<unknown>;
  if(stage==="reservation-before-commit")pending=f.reserve(undefined,api);
  else {const r=await f.reserve();await f.api.executeFake(f.request("execute"),r.id);await f.api.capture(f.request("validate"),r.id);await f.api.verify(f.request("validate"),r.id);pending=api.finalize(f.request("finalize"),r.id);}
  const blocker=await seen,writerPid=(await writer.query("SELECT pg_backend_pid() pid")).rows[0].pid;
  writing=writer.query(stage==="reservation-before-commit"?"UPDATE highlight_m602.current_dependency SET observed_reference=jsonb_set(observed_reference,'{currentness,sourceRevision}','100') WHERE tenant='tenant-one'":"UPDATE timeline_m702.repository_head SET revision=revision+1 WHERE tenant='tenant-one'");
  let blocked=false;for(let n=0;n<50;n++){const ids=(await f.admin.query("SELECT pg_blocking_pids($1) ids",[writerPid])).rows[0].ids;if(ids.includes(blocker)){blocked=true;break;}await delay(10);}
  assert.ok(blocked,"independent writer must be blocked by actual backend");release();await pending;await writing;
 }finally{release?.();await writing?.catch(()=>{});await writer.end();await f.stop();}
});
test("proof expiry during a real source lock wait denies after wait, not transaction-start time",async()=>{
 const f=await executionFixture(),writer=await f.f.owned.securityAdministrator();try{
  await writer.query("BEGIN; UPDATE highlight_m602.current_dependency SET observed_reference=observed_reference WHERE tenant='tenant-one'");
  const gateway=createExecutionGatewayForTest({mode:"M803_DISPOSABLE_ONLY",connections:f.connections,keys:f.keys,authentication:f.auth.authentication,proofTtlMs:50});
  const denied=assert.rejects(gateway.transaction("inspect",f.request("inspect"),f.context,tx=>tx.call({op:"capture",sourceHash:f.source.sourceHash})),{code:"FORBIDDEN"});
  await delay(150);await writer.query("COMMIT");await denied;assert.equal(f.process.starts(),0);
 }finally{await writer.query("ROLLBACK");await writer.end();await f.stop();}
});
test("stale owner revision and forged actual measurements cannot publish an artifact",async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await f.api.executeFake(f.request("execute"),r.id);await f.api.capture(f.request("validate"),r.id);const verification=await f.api.verify(f.request("validate"),r.id),old=await f.api.inspect(f.request("read"),r.id);
  await f.api.recovery.recover(f.request("recover"),r.id);
  await assert.rejects(f.gateway.transaction("validate",f.request("validate"),f.context,tx=>tx.call({op:"verify",id:r.id,generation:old.state.owner_generation,revision:old.state.revision,fact:verification})),{code:"CONFLICT"});
  assert.throws(()=>envelope("verification",f.context,{...verification.body,measurements:{codec:"H264",frames:25,duration:1000,streams:{audio:0}}}));
  assert.equal(f.process.starts(),1);
 }finally{await f.stop();}
});
test("a newly owner-registered valid source version cannot bypass unresolved original scope",async()=>{
 const f=await executionFixture();try{
  const r=await f.reserve();await assert.rejects(f.api.executeFake(f.request("execute"),r.id,"UNKNOWN"));
  const version=objectVersion(),bytes=await f.storage.read(f.context,String(f.binding.body.version));
  await f.storage.register(f.context,version);await f.storage.create(f.context,version,bytes);
  const binding=envelope("source",f.context,{...f.binding.body,handle:`source-${objectVersion()}`,version}),source=createFakeSourceAuthorityForTest(f.context,binding,f.storage);
  await f.admin.query("INSERT INTO execution_m803.source SELECT namespace,tenant,project,movie,studio,$1,$2,input,recipe,manifest,profile,expires_at,true FROM execution_m803.source LIMIT 1",[source.sourceHash,canonicalJson(binding)]);
  const api=f.service({source}),p=await api.proposal(f.request("inspect"),"fresh-work-key");
  await assert.rejects(api.reserve(f.request("execute"),p),{code:"UNRESOLVED_WORK"});assert.equal(f.process.starts(),1);
  assert.equal((await f.admin.query("SELECT count(*)::int n FROM execution_m803.work")).rows[0].n,1);
 }finally{await f.stop();}
});
