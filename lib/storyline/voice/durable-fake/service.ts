import "server-only";
import { randomBytes } from "node:crypto";
import { canonicalJson, contractHash } from "../../canonical";
import { validateVoicePlan } from "../foundation/chunk-plan";
import { VOICE_FOUNDATION as V, type FakeVoiceResult, type VoicePlan } from "../foundation/contracts";
import { createFakeVoiceHarness, createSyntheticVoiceAdapterForTest } from "../foundation/fake-adapter";
import { parseSyntheticAudioReceipt, verifyFakeVoiceOutput } from "../audio-verification/receipt";
import { verifySyntheticAudioCollection } from "../audio-verification/collection";
import type { SyntheticAudioReceipt } from "../audio-verification/contracts";
import { envelope, envelopeHash, expectedRequest, parseEnvelope, type Context, type Envelope } from "./contracts";
import type { Action } from "./auth";
import type { DurableGateway, Fence } from "./database";
import { audioHash, newObjectVersion, type ImmutableAudioPort, type WriteFault } from "./storage";
const uid = (prefix: string) => `${prefix}-${randomBytes(16).toString("hex")}`;
type Stage = { id: string; version: string; payload: Envelope; hash: string; bytes: number; audio_hash: string };
type Verification = { stage_id: string; owner_generation: number; payload: Envelope; hash: string };
type Artifact = { payload: Envelope; hash: string; stage_id: string };
export type DurableState = { id: string; owner_generation: number; revision: number; checkpoint: boolean; delivery: string; artifact_state: string; cancelled: boolean;
  request: Envelope; requestHash: string; submission: Envelope; payload: Envelope; hash: string;
  journal: { output: FakeVoiceResult; receipt: SyntheticAudioReceipt; audio_hash: string; bytes: number } | null;
  attempts: Stage[]; verification: Verification[]; artifact: Artifact | null; availability: string | null; gcIntents: {id:string;version:string;hash:string;bytes:number;state:string}[] };
export type Barrier = (name: string) => Promise<void>;
/** Explicit fixture-only service; no singleton, timer, transport, app imports or
 * environmental fallback. Fresh processes recover facts, never execution permits. */
export function createDurableFakeLifecycleForTest(options: { gateway: DurableGateway; storage: ImmutableAudioPort; context: Context; principalId: string; barrier?: Barrier }) {
  const { gateway: db, storage, context } = options;
  const permits = new Set<string>(); let fakeCalls=0;
  const barrier: Barrier = options.barrier ?? (async () => {});
  const fence = (s: DurableState): Fence => ({ generation: s.owner_generation, revision: s.revision });
  const inspect = async (id: string, action: Action = "replay"): Promise<DurableState> => db.call(action,id,{generation:0,revision:0},{op:"inspect"});
  async function expected(action: Action) {
    const e = await db.call(action,"expected",{generation:0,revision:0},{op:"expected"});
    const plan = validateVoicePlan(e.plan);
    if (canonicalJson(e.scope)!==canonicalJson(context.scope) || plan.plan.reference.artifact.kind === "FUTURE_APPROVED_REFERENCE") throw new Error("M505_EXPECTED");
    return plan;
  }
  async function reserve(key: string, chunkIndex: number, proposedPlanHash?: string) {
    const plan = await expected("create"); if (proposedPlanHash!==undefined && proposedPlanHash!==plan.planHash) throw new Error("M505_EXPECTED");
    const e = expectedRequest(context,plan,chunkIndex,key), id = uid("submission");
    const innerRequestHash = contractHash(V.request,{schemaVersion:V.request,execution:"FAKE_ONLY",planHash:plan.planHash,chunkIndex});
    const submission = envelope("submission",context,{id,requestHash:e.hash,recipeHash:e.request.body.recipeHash,generation:1,innerRequestHash,innerSubmissionId:`fake-submission-${innerRequestHash}`,checkpointId:uid("checkpoint")});
    const reservation = envelope("reservation",context,{id,submissionHash:envelopeHash("submission",submission),planHash:plan.planHash,chunkIndex,principalId:options.principalId,ownerGeneration:1,revision:0});
    await barrier("reservation_before");
    const result = await db.call("create",id,{generation:1,revision:0},{op:"reserve",key,hash:e.hash,recipe:e.request.body.recipeHash,request:e.request,submission,submissionHash:envelopeHash("submission",submission),reservation,reservationHash:envelopeHash("reservation",reservation)},async()=>barrier("reservation_before_commit"));
    await barrier("reservation_after_commit");
    if (result.created) permits.add(result.id);
    return result as {id:string;created:boolean};
  }
  async function executeFake(id: string, scenario: "FIXTURE_BYTES"|"UNKNOWN"|"DEFINITIVE_FAILURE"="FIXTURE_BYTES", checkpointAckLost=false) {
    if (!permits.delete(id)) throw new Error("M505_NO_PROCESS_PERMIT"); // Burn before first await.
    const s=await inspect(id,"create");
    await db.call("create",id,fence(s),{op:"checkpoint"},async()=>barrier("checkpoint_before_commit"));
    await barrier("checkpoint_after_commit");
    if (checkpointAckLost) throw new Error("M505_CHECKPOINT_ACK_LOST");
    const plan=await expected("observe"), fake=createSyntheticVoiceAdapterForTest({capability:plan.plan.capability,scenario});
    const deadline=performance.now()+1000;
    const confirmed=await inspect(id,"create"); await db.call("create",id,fence(confirmed),{op:"checkpoint_confirm"});
    if(performance.now()>=deadline) throw new Error("M505_PROCESS_PERMIT_EXPIRED");
    const output=createFakeVoiceHarness({adapter:fake.adapter,scope:context.scope}).submit({schemaVersion:V.request,execution:"FAKE_ONLY",idempotencyKey:s.request.body.idempotencyKey,plan,chunkIndex:s.request.body.chunkIndex});
    fakeCalls+=fake.calls(); await barrier("fake_result_before_journal");
    if (output.result.outcome==="UNKNOWN") {
      const now=await inspect(id,"recovery"); await db.call("recovery",id,fence(now),{op:"unknown"}); return output;
    }
    const receipt=output.result.outcome==="FIXTURE_BYTES"?verifyFakeVoiceOutput({plan,chunkIndex:s.request.body.chunkIndex,output}):null;
    const now=await inspect(id,"observe");
    await db.call("observe",id,fence(now),{op:"journal",output:output.result,resultHash:contractHash("story-voice-fake-result-v1",output.result),receipt,audioHash:receipt?.receipt.audio.audioSha256??null,bytes:receipt?.receipt.audio.fileBytes??0},async()=>barrier("journal_before_commit"));
    await barrier("journal_after_commit"); await settleJournal(id); return output;
  }
  async function settleJournal(id:string) { const s=await inspect(id,"observe"); return db.call("observe",id,fence(s),{op:"settle"}); }
  async function allocateStage(id:string) {
    const s=await inspect(id,"create"); if (!s.journal || s.journal.output.outcome!=="FIXTURE_BYTES") throw new Error("M505_RESULT_MISSING");
    const stageId=uid("stage"), version=newObjectVersion();
    const stage=envelope("stage",context,{id:stageId,reservationId:id,submissionId:id,ownerGeneration:s.owner_generation,objectVersion:version,audioSha256:s.journal.audio_hash,bytes:s.journal.bytes});
    await db.call("create",id,fence(s),{op:"stage",stageId,version,stage,stageHash:envelopeHash("stage",stage),audioHash:s.journal.audio_hash,bytes:s.journal.bytes});
    await barrier("stage_after_commit");return stageId;
  }
  async function writeStage(id:string,stageId:string,bytes:Uint8Array,fault:WriteFault="NONE") {
    const s=await inspect(id,"create"),a=s.attempts.find(x=>x.id===stageId);
    if (!a || s.cancelled || s.artifact_state!=="STAGED" || !s.journal || audioHash(bytes)!==s.journal.audio_hash || bytes.length!==s.journal.bytes) throw new Error("M505_STAGE_BYTES");
    await db.call("create",id,fence(s),{op:"write_confirm"});
    await barrier("blob_before_write"); await storage.create(a.version,bytes,fault);await barrier("blob_after_write");
  }
  async function quarantine(id:string,reason:string,action:Action="recovery") { const s=await inspect(id,action); await db.call(action,id,fence(s),{op:"quarantine",reason}); }
  async function validate(id:string,stageId:string) {
    const s=await inspect(id,"validate"), a=s.attempts.find(x=>x.id===stageId), plan=await expected("validate");
    if (!a || !s.journal || s.journal.output.outcome!=="FIXTURE_BYTES") throw new Error("M505_RESULT_MISSING");
    let inner:SyntheticAudioReceipt;
    try {
      const bytes=await storage.read(a.version);
      inner=parseSyntheticAudioReceipt(s.journal.receipt,{plan,chunkIndex:s.request.body.chunkIndex,bytes});
      if (audioHash(bytes)!==a.audio_hash || bytes.length!==a.bytes || envelopeHash("stage",a.payload)!==a.hash) throw new Error("M505_STAGE_BYTES");
    } catch(e) { await quarantine(id,"INVALID_STAGED_BYTES","validate");throw e; }
    await barrier("validation_after_read");
    const verification=envelope("verification",context,{stageHash:a.hash,submissionId:id,ownerGeneration:s.owner_generation,revision:s.revision,inner});
    await db.call("validate",id,fence(s),{op:"validate",stageId,verification,verificationHash:envelopeHash("verification",verification)},async()=>barrier("validation_before_commit"));
    await barrier("validation_after_commit");return verification;
  }
  async function finalize(id:string,stageId:string) {
    const s=await inspect(id,"finalize");
    if (s.artifact) return s.artifact; // Immutable fact, replay still has current availability/byte gates.
    const a=s.attempts.find(x=>x.id===stageId), v=s.verification.find(x=>x.stage_id===stageId&&x.owner_generation===s.owner_generation);
    if (!a || !v) throw new Error("M505_VALIDATION_MISSING");
    const artifact=envelope("artifact",context,{id,requestHash:s.requestHash,recipeHash:s.request.body.recipeHash,submissionHash:envelopeHash("submission",s.submission),reservationHash:s.hash,stageHash:a.hash,verificationHash:v.hash,planHash:s.request.body.plan && (s.request.body.plan as VoicePlan).planHash,chunkIndex:s.request.body.chunkIndex,objectVersion:a.version,inner:v.payload.body.inner});
    await barrier("finalization_before");
    await db.call("finalize",id,fence(s),{op:"finalize",stageId,artifact,artifactHash:envelopeHash("artifact",artifact)},async()=>barrier("finalization_before_commit"));
    await barrier("finalization_after_commit");return (await inspect(id,"finalize")).artifact!;
  }
  async function recover(id:string) {
    const s=await inspect(id,"recovery"), caseId=uid("recovery"), auditId=uid("audit");
    const recovery=envelope("recovery",context,{id:caseId,submissionId:id,ownerGeneration:s.owner_generation+1,revision:s.revision+1,reason:"EXPLICIT_RECOVERY",action:"RECONCILE_ONLY",auditId});
    await db.call("recovery",id,fence(s),{op:"recover",caseId,recovery});
    const current=await inspect(id,"recovery");
    if (current.checkpoint && current.delivery==="AWAITING_RESULT") {
      if (current.journal) await settleJournal(id); else await db.call("recovery",id,fence(current),{op:"unknown"});
    }
    return inspect(id,"recovery");
  }
  async function replay(id:string,afterRead?:()=>Promise<void>) {
    const s=await inspect(id,"replay"), holdId=uid("hold"), plan=await expected("replay");
    if (!s.artifact) throw new Error("M505_UNAVAILABLE");
    await db.call("replay",id,fence(s),{op:"hold",holdId});
    let bytes:Uint8Array;
    try {
      bytes=await storage.read(s.artifact.payload.body.objectVersion as string);
      const artifact=parseEnvelope("artifact",s.artifact.payload,{plan,chunkIndex:s.request.body.chunkIndex,bytes});
      if (envelopeHash("artifact",artifact)!==s.artifact.hash) throw new Error("M505_ARTIFACT_HASH");

      parseSyntheticAudioReceipt(artifact.body.inner,{plan,chunkIndex:artifact.body.chunkIndex,bytes});
    } catch(e) { await quarantine(id,"INVALID_COMMITTED_BYTES","replay");throw e; }
    if(afterRead) await afterRead(); await barrier("replay_after_read");
    const current=await inspect(id,"replay"); await db.call("replay",id,fence(current),{op:"replay_finish",holdId});
    return { artifact:s.artifact,bytes:Uint8Array.from(bytes) };
  }
  async function cancel(id:string) { permits.delete(id); const s=await inspect(id,"create");return db.call("create",id,fence(s),{op:"cancel"}); }
  async function gc(id:string,stageId:string,ackLost=false) {
    const s=await inspect(id,"gc"), intentId=uid("gc");
    const target=await db.call("gc",id,fence(s),{op:"gc_begin",stageId,intentId});
    await barrier("gc_after_intent"); await storage.remove(target.version,target.hash,target.bytes,ackLost);await barrier("gc_after_delete");
    const current=await inspect(id,"gc"); await db.call("gc",id,fence(current),{op:"gc_finish",intentId,version:target.version});return intentId;
  }
  async function collection(ids:string[]) {
    const plan=await expected("replay"), items=[];
    for(const id of ids) { const item=await replay(id); items.push({id,...item}); }
    const inner=verifySyntheticAudioCollection({plan,items:items.map(x=>({receipt:x.artifact.payload.body.inner,bytes:x.bytes}))});
    const ordered=items.sort((a,b)=>(a.artifact.payload.body.chunkIndex as number)-(b.artifact.payload.body.chunkIndex as number));
    const result=envelope("collection",context,{id:`collection-${contractHash("story-durable-synthetic-audio-collection-v1",ordered.map(x=>x.artifact.hash))}`,planHash:plan.planHash,artifacts:ordered.map(x=>x.artifact.hash),inner});
    await db.call("finalize",result.body.id as string,{generation:0,revision:0},{op:"collection",collection:result,collectionHash:envelopeHash("collection",result),members:ordered.map(x=>({id:x.id,hash:x.artifact.hash}))});
    return {payload:result,hash:envelopeHash("collection",result),members:ordered.map(x=>x.id)};
  }
  async function replayCollection(id:string) {
    const stored=await db.call("replay",id,{generation:0,revision:0},{op:"read_collection"});
    if(!stored) throw new Error("M505_COLLECTION_NOT_FOUND");
    const payload=stored.payload as Envelope;
    if(envelopeHash("collection",payload)!==stored.hash) throw new Error("M505_COLLECTION_HASH");
    const manifests=(payload.body.inner as {manifest:{entries:{chunk:{index:number}}[]}}).manifest;
    const ids:string[]=[];
    // Member IDs are independently ledger-resolved, not caller-supplied hashes.
    for(const entry of manifests.entries) {
      const member=await db.call("replay",id,{generation:0,revision:0},{op:"collection_member",index:entry.chunk.index});ids.push(member.id);
    }
    const values=[];for(const member of ids) values.push(await replay(member));
    const inner=verifySyntheticAudioCollection({plan:await expected("replay"),items:values.map(x=>({receipt:x.artifact.payload.body.inner,bytes:x.bytes}))});
    parseEnvelope("collection",payload,{plan:await expected("replay"),items:values.map(x=>({receipt:x.artifact.payload.body.inner,bytes:x.bytes}))});
    if(canonicalJson(inner)!==canonicalJson(payload.body.inner) || canonicalJson(values.map(x=>x.artifact.hash))!==canonicalJson(payload.body.artifacts)) throw new Error("M505_COLLECTION_BINDING");
    await db.call("replay",id,{generation:0,revision:0},{op:"collection_check"});
    return {payload,items:values};
  }
  async function releaseQuarantineHold(id:string) {const s=await inspect(id,"recovery");return db.call("recovery",id,fence(s),{op:"release_quarantine_hold"});}
  async function recoverGc(id:string) {
    const s=await inspect(id,"gc");
    for(const intent of s.gcIntents.filter(x=>x.state==="DELETE_PENDING").slice(0,2)) {
      await storage.remove(intent.version,intent.hash,intent.bytes); const now=await inspect(id,"gc");
      await db.call("gc",id,fence(now),{op:"gc_finish",intentId:intent.id,version:intent.version});
    }
  }
  async function recoverOrphans() {
    const registered:string[]=await db.call("recovery","inventory",{generation:0,revision:0},{op:"inventory"});
    const orphans=(await storage.inventory()).filter(v=>!registered.includes(v));
    for(const version of orphans.slice(0,10)) { const bytes=await storage.read(version);await db.call("recovery","orphan",{generation:0,revision:0},{op:"orphan",version,hash:audioHash(bytes),bytes:bytes.length}); }
    return {held:orphans.slice(0,10).length,remaining:Math.max(0,orphans.length-10)};
  }
  async function runRecoveryOnce(ids:string[]) {
    if(ids.length>10 || new Set(ids).size!==ids.length) throw new Error("M505_RECOVERY_BATCH");
    const results=[];
    for(const id of ids) {
      let s=await recover(id);
      if(s.delivery==="DEFINITIVE_SUCCESS"&&!s.cancelled&&s.artifact_state==="STAGED"&&s.attempts.length) {
        const attempt=s.attempts.at(-1)!;await validate(id,attempt.id);await finalize(id,attempt.id);s=await inspect(id,"recovery");
      }
      results.push(s);
    }
    return results;
  }
  return Object.freeze({reserve,executeFake,settleJournal,allocateStage,writeStage,validate,finalize,recover,replay,cancel,gc,collection,replayCollection,releaseQuarantineHold,recoverGc,recoverOrphans,runRecoveryOnce,inspect,quarantine,fakeCalls:()=>fakeCalls});
}
