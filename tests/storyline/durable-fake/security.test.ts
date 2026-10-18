import test from "node:test";
import assert from "node:assert/strict";
import { durableFixture } from "./fixture";
import { actions, connect } from "./database.fixture";
import { newSyntheticSessionFixture, createSyntheticDurableSessionForTest } from "@/lib/storyline/voice/durable-fake/auth";
import { createDurableGatewayForTest } from "@/lib/storyline/voice/durable-fake/database";

const ff={generation:0,revision:0};
test("catalog: independent non-owner actions, no private SELECT/DML/columns, no public helpers or unsafe search paths",async()=>{
 const f=await durableFixture();try{
  const admin=await f.database.admin();try{
   const funcs=await admin.query("SELECT proname,prosecdef,proconfig,pg_get_userbyid(proowner) owner,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='voice_m505'");
   for(const fun of funcs.rows){assert.equal(fun.public,false,fun.proname);assert.equal(fun.owner,"voice_m505_owner");assert.ok(fun.proconfig.includes("search_path=pg_catalog, voice_m505, pg_temp"));}
   const triggers=await admin.query("SELECT count(*)::int total FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='voice_m505' AND NOT t.tgisinternal AND t.tgenabled='O'");assert.equal(triggers.rows[0].total,21);
  }finally{await admin.end();}
  for(const action of actions){const c=await connect(f.database.connections[action]);try{
   const roles=await c.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user");assert.ok(Object.values(roles.rows[0]).every(v=>v===false));
   await assert.rejects(()=>c.query("SELECT * FROM voice_m505.artifact"),/permission denied/);
   await assert.rejects(()=>c.query("UPDATE voice_m505.reservation SET revision=99"),/permission denied/);
   await assert.rejects(()=>c.query("SET ROLE voice_m505_owner"),/permission denied/);
   await assert.rejects(()=>c.query("CREATE TEMP TABLE attack(id text)"),/permission denied/);
   for(const other of actions){const allowed=await c.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') allowed",[`voice_m505.${other}(text,text,text)`]);assert.equal(allowed.rows[0].allowed,other===action);}
   await assert.rejects(()=>c.query("SELECT voice_m505.gateway('create','{}','','{}')"),/permission denied/);
  }finally{await c.end();}}
 }finally{await f.stop();}
});
test("proof is one-use, tied to action, backend, transaction, exact payload and expiry",async()=>{
 const f=await durableFixture();try{
  let saved:{wire:string;mac:string;payload:string}|undefined;
  await f.gateway.transaction("create",async c=>{
   const p=await f.gateway.proof(c,"create","expected",ff,{op:"expected"});saved=p;
   const e=await f.gateway.redeem(c,"create",p);assert.equal(e.plan.planHash,f.plan.planHash);
  });
  await assert.rejects(()=>f.gateway.transaction("create",c=>f.gateway.redeem(c,"create",saved!)),/M505_PROOF/);
  await assert.rejects(()=>f.gateway.transaction("create",async c=>{const p=await f.gateway.proof(c,"create","expected",ff,{op:"expected"});await f.gateway.redeem(c,"create",p);return f.gateway.redeem(c,"create",p);}),/duplicate key/);
  await assert.rejects(()=>f.gateway.transaction("create",async c=>{const p=await f.gateway.proof(c,"create","expected",ff,{op:"expected"});return f.gateway.redeem(c,"create",{...p,payload:p.payload.replace('"expected"','"reserve"')});}),/M505_PROOF/);
  await assert.rejects(()=>f.gateway.transaction("validate",c=>f.gateway.redeem(c,"validate",saved!)),/M505_PROOF/);
 }finally{await f.stop();}
});
test("synthetic session requires process registration, native origin/CSRF and independent action permission",async()=>{
 const f=await durableFixture();try{
  const restricted=newSyntheticSessionFixture(f.context,"reader",["replay"]);await f.installSession(restricted);
  await assert.rejects(()=>f.runtime(restricted).service.reserve("denied",0),/M505_AUTH/);
  const factory=(headers:Record<string,string>)=>createDurableGatewayForTest({connections:f.database.connections,keys:f.database.keys,session:createSyntheticDurableSessionForTest(f.session),request:()=>new Request(f.session.origin,{method:"POST",headers})});
  for(const headers of [{origin:"http://evil.invalid","sec-fetch-site":"same-origin","x-csrf-token":f.session.csrf},{origin:f.session.origin,"sec-fetch-site":"cross-site","x-csrf-token":f.session.csrf},{origin:f.session.origin,"sec-fetch-site":"same-origin","x-csrf-token":"wrong"}])await assert.rejects(()=>factory(headers).call("create","expected",ff,{op:"expected"}),/M505_AUTH/);
  const forged=createDurableGatewayForTest({connections:f.database.connections,keys:f.database.keys,session:{kind:"M505_SYNTHETIC_SESSION",toJSON(){throw Error();}},request:()=>new Request(f.session.origin,{method:"POST"})});await assert.rejects(()=>forged.call("create","expected",ff,{op:"expected"}),/M505_AUTH/);
 }finally{await f.stop();}
});
for(const change of ["revoked","expired","source","policy","issuer-key"] as const)test(`finalization denies ${change} changed after validation`,async()=>{
 const f=await durableFixture();try{
  const r=await f.service.reserve("fence",0),o=await f.service.executeFake(r.id),stage=await f.service.allocateStage(r.id);await f.service.writeStage(r.id,stage,o.bytes!);await f.service.validate(r.id,stage);
  const admin=await f.database.admin();try{
   if(change==="revoked")await admin.query("UPDATE voice_m505.session SET revoked=true WHERE id=$1",[f.session.id]);
   else if(change==="expired")await admin.query("UPDATE voice_m505.session SET expires_at=clock_timestamp()-interval '1 ms' WHERE id=$1",[f.session.id]);
   else if(change==="issuer-key")await admin.query("UPDATE voice_m505.proof_key SET enabled=false WHERE action='finalize'");
   else await admin.query(`UPDATE voice_m505.context SET ${change==="source"?"source_epoch":"policy_epoch"}=${change==="source"?"source_epoch":"policy_epoch"}+1`);
   await assert.rejects(()=>f.service.finalize(r.id,stage),/M505_AUTH_STALE|M505_PROOF/);
   assert.equal((await admin.query("SELECT count(*)::int n FROM voice_m505.artifact")).rows[0].n,0);
  }finally{await admin.end();}
 }finally{await f.stop();}
});
test("cross-tenant public IDs cannot read or finalize another tenant's artifact",async()=>{
 const f=await durableFixture();try{
  const r=await f.service.reserve("tenant",0),admin=await f.database.admin();const other={...f.context,tenantId:"tenant-two"};
  try{await admin.query("INSERT INTO voice_m505.context(namespace,tenant,project,movie,studio,expected) SELECT namespace,$1,project,movie,studio,expected FROM voice_m505.context LIMIT 1",[other.tenantId]);}finally{await admin.end();}
  const s=newSyntheticSessionFixture(other,"other-principal");await f.installSession(s);const runtime=f.runtime(s);
  await assert.rejects(()=>runtime.service.inspect(r.id),/M505_NOT_FOUND/);await assert.rejects(()=>runtime.service.finalize(r.id,"public-stage"),/M505_NOT_FOUND/);
 }finally{await f.stop();}
});
