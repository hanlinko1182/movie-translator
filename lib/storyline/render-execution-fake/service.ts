import "server-only";
import { randomBytes } from "node:crypto";
import { id as parseId, hash as parseHash } from "../validation";
import { canonicalJson } from "../canonical";
import { validateRenderRecipe } from "../render-planning/planner";
import type { RenderPlanningObservation, RenderRecipe } from "../render-planning/contracts";
import { envelope, envelopeHash, parseEnvelope, profileHash, workHash, same, measurements, reject, type Context, type Envelope, type Action } from "./contracts";
import { CommitUnknown, type ExecutionGateway } from "./database";
import type { FakeSourceAuthority } from "./source";
import { objectVersion, byteHash, type PrivateBlobPort } from "./storage";
import { expectedFakeOutput, type FakeProcessOwner } from "./process";

export type ExecutionState = { work:{id:string;work_hash:string;request:Envelope;admission:Envelope;submission:Envelope;stage:Envelope};
  state:{revision:number;owner_generation:number;state:string;availability:string;cancelled:boolean;quarantine_hold:boolean};
  facts:Partial<Record<"checkpoint"|"result"|"verification"|"artifact",Envelope>>;
  intent:null|{version:string;byteSha256:string;byteCount:number;id:string} };
export type Barrier = (phase:string,pid?:number)=>Promise<void>;
const uid=()=>`operation-${randomBytes(16).toString("hex")}`;
const fence=(s:ExecutionState)=>({revision:s.state.revision,generation:s.state.owner_generation});
export function createFakeExecutionServiceForTest(options:{mode:"M803_DISPOSABLE_ONLY";context:Context;gateway:ExecutionGateway;source:FakeSourceAuthority;storage:PrivateBlobPort;process?:FakeProcessOwner;journal?:(id:string)=>Envelope|null;barrier?:Barrier}) {
  if(options.mode!=="M803_DISPOSABLE_ONLY")reject("INVALID_MODE");
  const {context,gateway:db,source,storage}=options,barrier:Barrier=options.barrier??(async()=>{});
  const originalFlows=new Map<string,{session:string;principal:string}>();
  const journal=options.journal??options.process?.originalResult??(()=>null);
  async function load(request:unknown,id:string,action:Action="read"):Promise<ExecutionState> {
    parseId(id,"execution.operation");
    return db.transaction(action,request,context,async tx=>await tx.call({op:"inspect",id}) as ExecutionState);
  }
  async function fresh(tx:{call:(b:Record<string,unknown>)=>Promise<unknown>},candidate?:unknown) {
    const raw=await tx.call({op:"capture",sourceHash:source.sourceHash}) as {observation:RenderPlanningObservation;source:Envelope;recipe:RenderRecipe};
    if(!same(raw.source,source.binding))reject("SOURCE_BINDING");
    const recipe=await validateRenderRecipe(candidate??raw.recipe,raw.recipe.recipe.input,{resolve:()=>raw.observation});
    if(recipe.recipe.sourceObservation.fingerprint.sha256!==source.binding.body.byteSha256||recipe.recipe.sourceObservation.fingerprint.bytes!==source.binding.body.byteCount)reject("SOURCE_BINDING");
    return recipe;
  }
  async function change(request:unknown,id:string,action:Action,body:Record<string,unknown>) {
    const s=await load(request,id,action);
    return db.transaction(action,request,context,tx=>tx.call({id,...fence(s),...body}));
  }
  async function quarantine(request:unknown,id:string) { return change(request,id,"quarantine",{op:"quarantine"}); }
  async function proposal(request:unknown,key:string) {
    db.authenticate("inspect",request,context);
    await source.inspect(context,source.sourceHash);
    const recipe=await db.transaction("inspect",request,context,tx=>fresh(tx));
    return envelope("request",context,{key,recipe,sourceHash:source.sourceHash,profileHash});
  }
  async function reserve(request:unknown,input:unknown) {
    const r=parseEnvelope("request",input);if(!same(context,{namespace:r.namespace,scope:r.scope})||r.body.sourceHash!==source.sourceHash)reject("INVALID_BINDING");
    const actor=db.authenticate("execute",request,context);await source.inspect(context,source.sourceHash);
    const id=uid(),work=workHash(r),bytes=expectedFakeOutput(work),submission=envelope("submission",context,{operationId:id,submissionId:uid(),generation:1});
    const admission=envelope("admission",context,{operationId:id,workHash:work,requestHash:envelopeHash("request",r),sourceHash:source.sourceHash,recipeHash:(r.body.recipe as RenderRecipe).recipeHash,quotaBytes:2097152});
    const stage=envelope("stage",context,{operationId:id,version:objectVersion(),byteSha256:byteHash(bytes),byteCount:bytes.length});
    const result=await db.transaction("execute",request,context,async tx=>{
      await fresh(tx,r.body.recipe);
      const result=await tx.call({op:"reserve",id,request:r,workHash:work,admission,submission,stage}) as {id:string;created:boolean};
      await barrier("reservation-before-commit",tx.backendPid);return result;
    },{afterCommit:()=>barrier("reservation-after-commit")});
    if(result.created)originalFlows.set(result.id,{session:actor.id,principal:actor.principalId});
    return result;
  }
  async function recordOriginal(request:unknown,id:string) {
    const original=journal(id);if(!original)reject("ORIGINAL_RESULT_MISSING");
    const result=parseEnvelope("result",original),s=await load(request,id,"observe");
    const expected=expectedFakeOutput(s.work.work_hash);
    if(result.body.operationId!==id||result.body.submissionId!==s.work.submission.body.submissionId||result.body.outcome==="SUCCESS"&&(result.body.byteSha256!==byteHash(expected)||result.body.byteCount!==expected.length))reject("INVALID_RESULT");
    try {return await db.transaction("observe",request,context,tx=>tx.call({op:"result",id,...fence(s),fact:result}));}
    catch(e){if((e as {code?:string}).code==="EVIDENCE_CONFLICT")await quarantine(request,id).catch(()=>{});throw e;}
  }
  async function executeFake(request:unknown,id:string,fault:"NONE"|"CHECKPOINT_ACK_LOST"|"BEFORE_START"|"AFTER_START"|"UNKNOWN"|"FAILURE"="NONE") {
    const flow=originalFlows.get(id);originalFlows.delete(id); // Consumed before awaits; never rebuilt from SQL.
    const actor=db.authenticate("execute",request,context);
    if(!flow||flow.session!==actor.id||flow.principal!==actor.principalId||!options.process)reject("NO_ORIGINAL_FLOW");
    let checkpointed=false;
    try {
      await barrier("before-checkpoint");await source.inspect(context,source.sourceHash);
      const s=await load(request,id,"execute");
      const fact=envelope("checkpoint",context,{operationId:id,submissionId:s.work.submission.body.submissionId,generation:1,ownerGeneration:s.state.owner_generation});
      await db.transaction("execute",request,context,async tx=>{await fresh(tx,s.work.request.body.recipe);await tx.call({op:"checkpoint",id,...fence(s),fact});await barrier("checkpoint-before-commit",tx.backendPid);});
      checkpointed=true;await barrier("checkpoint-after-commit");if(fault==="CHECKPOINT_ACK_LOST")reject("CHECKPOINT_ACK_LOST");
      const confirmed=await load(request,id,"execute");
      if(confirmed.state.cancelled||confirmed.state.owner_generation!==s.state.owner_generation)reject("NO_ORIGINAL_FLOW");
      // A fresh source check after ACK never substitutes the original source version.
      await source.inspect(context,source.sourceHash);
      await db.transaction("execute",request,context,async tx=>{await fresh(tx,s.work.request.body.recipe);await tx.call({op:"launchFence",id,...fence(confirmed)});});
      const cap=options.process.arm(context,id,String(s.work.submission.body.submissionId),s.work.work_hash,s.state.owner_generation);
      await options.process.invoke(cap,s.state.owner_generation,fault==="NONE"?"NONE":fault,()=>barrier("fake-started"));
      await barrier("result-before-journal");await recordOriginal(request,id);await barrier("result-after-journal");
      return load(request,id,"execute");
    } catch(e) {
      if(checkpointed)await change(request,id,"execute",{op:"unknown"}).catch(()=>{});
      throw e;
    }
  }
  async function capture(request:unknown,id:string,fault:"NONE"|"ACK_LOST"|"PARTIAL"="NONE") {
    const s=await load(request,id,"validate");
    if(s.state.state!=="SUCCESS"||!s.facts.result||s.state.cancelled||s.state.availability==="DELETE_PENDING"||s.state.availability==="DELETED")reject("INVALID_STATE");
    const version=String(s.work.stage.body.version),bytes=expectedFakeOutput(s.work.work_hash);
    await storage.register(context,version);await barrier("capture-before-write");
    // An existing original version is inspected, never overwritten after an ACK loss.
    try {const existing=await storage.read(context,version);if(!same([...existing],[...bytes]))reject("OUTPUT_INTEGRITY");return version;}
    catch(e) {if((e as NodeJS.ErrnoException).code!=="ENOENT"){await quarantine(request,id).catch(()=>{});throw e;}}
    try {await storage.create(context,version,bytes,fault);await barrier("capture-after-write");return version;}
    catch(e){if((e as {code?:string}).code==="STORAGE_PARTIAL")await quarantine(request,id).catch(()=>{});throw e;}
  }
  async function verify(request:unknown,id:string) {
    const s=await load(request,id,"validate");
    try {
      await source.inspect(context,source.sourceHash);if(!s.facts.result)reject("ORIGINAL_RESULT_MISSING");
      const stage=parseEnvelope("stage",s.work.stage),result=parseEnvelope("result",s.facts.result),version=String(stage.body.version);
      const bytes=await storage.read(context,version),expected=expectedFakeOutput(s.work.work_hash);
      if(byteHash(bytes)!==byteHash(expected)||bytes.length!==expected.length||result.body.byteSha256!==byteHash(bytes)||!same(stage.body.byteCount,bytes.length))reject("OUTPUT_INTEGRITY");
      const recipe=s.work.request.body.recipe as RenderRecipe;
      const fact=envelope("verification",context,{operationId:id,resultHash:envelopeHash("result",result),sourceHash:source.sourceHash,recipeHash:recipe.recipeHash,dependencyHash:recipe.recipe.dependencyHash,profileHash,version,byteSha256:byteHash(bytes),byteCount:bytes.length,measurements});
      await barrier("verification-before-commit");await db.transaction("validate",request,context,tx=>tx.call({op:"verify",id,...fence(s),fact}));return fact;
    } catch(e) {
      if(!(e instanceof CommitUnknown)&&!['CONFLICT'].includes(String((e as {code?:string}).code)))await quarantine(request,id).catch(()=>{});
      throw e;
    }
  }
  async function finalize(request:unknown,id:string) {
    db.authenticate("finalize",request,context);
    const s=await load(request,id,"finalize");if(!s.facts.verification||!s.facts.result)reject("UNVERIFIED");
    // Verify exact captured bytes again outside locks; GC cannot delete a live uncommitted operation.
    let bytes:Uint8Array;
    try {await source.inspect(context,source.sourceHash);bytes=await storage.read(context,String(s.work.stage.body.version));}
    catch(e){await quarantine(request,id).catch(()=>{});throw e;}
    if(byteHash(bytes)!==s.facts.verification.body.byteSha256||bytes.length!==s.facts.verification.body.byteCount) {await quarantine(request,id).catch(()=>{});reject("OUTPUT_INTEGRITY");}
    const fact=envelope("artifact",context,{operationId:id,admissionHash:envelopeHash("admission",s.work.admission),submissionHash:envelopeHash("submission",s.work.submission),resultHash:envelopeHash("result",s.facts.result),stageHash:envelopeHash("stage",s.work.stage),verificationHash:envelopeHash("verification",s.facts.verification),version:s.work.stage.body.version,recipeHash:(s.work.request.body.recipe as RenderRecipe).recipeHash,sourceHash:source.sourceHash,byteSha256:byteHash(bytes),byteCount:bytes.length,measurements});
    try {
      await db.transaction("finalize",request,context,async tx=>{await fresh(tx,s.work.request.body.recipe);await tx.call({op:"finalize",id,...fence(s),fact});await barrier("finalize-before-commit",tx.backendPid);},{afterCommit:()=>barrier("finalize-after-commit")});return fact;
    } catch(e) {
      if(!(e instanceof CommitUnknown)&&String((e as {code?:string}).code)!=="CONFLICT")await quarantine(request,id).catch(()=>{});
      throw e;
    }
  }
  async function inspectPrivate(request:unknown,id:string,afterRead?:()=>Promise<void>) {
    db.authenticate("read",request,context);
    const hold=uid();await source.inspect(context,source.sourceHash);
    const s=await load(request,id,"read");if(!s.facts.artifact)reject("UNAVAILABLE");
    await db.transaction("read",request,context,async tx=>{await fresh(tx,s.work.request.body.recipe);await tx.call({op:"readBegin",id,...fence(s),hold});});
    try {
      const artifact=parseEnvelope("artifact",s.facts.artifact),bytes=await storage.read(context,String(artifact.body.version));
      if(byteHash(bytes)!==artifact.body.byteSha256||bytes.length!==artifact.body.byteCount)reject("OUTPUT_INTEGRITY");
      await afterRead?.();await source.inspect(context,source.sourceHash);
      const current=await load(request,id,"read");
      await db.transaction("read",request,context,async tx=>{await fresh(tx,current.work.request.body.recipe);await tx.call({op:"readFinish",id,...fence(current),hold});});
      return {artifact,bytes:Uint8Array.from(bytes)};
    } catch(e) {await quarantine(request,id).catch(()=>{});throw e;}
    finally {await change(request,id,"read",{op:"readRelease",hold}).catch(()=>{});}
  }
  async function recover(request:unknown,id:string) {
    await change(request,id,"recover",{op:"recover"});
    let s=await load(request,id,"recover");
    if(s.state.state==="CHECKPOINTED")await change(request,id,"recover",{op:"unknown"});
    if(journal(id)&&!s.facts.result)await recordOriginal(request,id);
    s=await load(request,id,"recover");return s; // No invoke, arm, source replacement, new work or fresh key.
  }
  async function gc(request:unknown,id:string,ackLost=false) {
    let s=await load(request,id,"gc"),intent=s.intent;
    if(!intent) {
      const version=String(s.work.stage.body.version),bytes=await storage.read(context,version);
      intent={version,byteSha256:byteHash(bytes),byteCount:bytes.length,id:uid()};
      await db.transaction("gc",request,context,tx=>tx.call({op:"gcBegin",id,...fence(s),intent}));await barrier("gc-after-intent");
    }
    await storage.remove(context,intent.version,intent.byteSha256,intent.byteCount,intent.id,ackLost);await barrier("gc-after-delete");
    s=await load(request,id,"gc");await db.transaction("gc",request,context,tx=>tx.call({op:"gcFinish",id,...fence(s),intent}));
  }
  async function readopt(request:unknown,id:string) {
    await verify(request,id);await source.inspect(context,source.sourceHash);const s=await load(request,id,"recover");
    return db.transaction("recover",request,context,async tx=>{await fresh(tx,s.work.request.body.recipe);return tx.call({op:"readopt",id,...fence(s)});});
  }
  const recovery=Object.freeze({recover,quarantine,gc,readopt,releaseHold:(request:unknown,id:string)=>change(request,id,"recover",{op:"releaseHold"})});
  async function readOperation(request:unknown,key:string,requestHash:string) {
    parseId(key,"execution.key");parseHash(requestHash,"execution.requestHash");
    return db.transaction("read",request,context,tx=>tx.call({op:"lookup",key,requestHash})) as Promise<{status:"FOUND";id:string}|{status:"NOT_FOUND"}>;
  }
  return Object.freeze({proposal,reserve,executeFake,capture,verify,finalize,inspectPrivate,inspect:load,observeOriginal:recordOriginal,readOperation,recovery,cancel:async(request:unknown,id:string)=>{originalFlows.delete(id);const result=await change(request,id,"execute",{op:"cancel"});options.process?.cancelAndObserve(id);return result;},
    canonicalRequest:(r:unknown)=>canonicalJson(parseEnvelope("request",r))});
}
