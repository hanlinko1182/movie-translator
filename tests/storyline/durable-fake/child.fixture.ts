import { attachOwnedAudioFixture, type StorageIdentity } from "@/lib/storyline/voice/durable-fake/storage";
import { createDurableGatewayForTest, type DurableFixtureConnections, type DurableFixtureKeys } from "@/lib/storyline/voice/durable-fake/database";
import { createSyntheticDurableSessionForTest, type SessionFixture } from "@/lib/storyline/voice/durable-fake/auth";
import { createDurableFakeLifecycleForTest } from "@/lib/storyline/voice/durable-fake/service";
import type { Context } from "@/lib/storyline/voice/durable-fake/contracts";
type Job={connections:DurableFixtureConnections;keys:DurableFixtureKeys;session:SessionFixture;identity:StorageIdentity;context:Context;cut?:string;command:"flow"|"recover"|"gc"|"gc_recover";id?:string;stage?:string};
process.once("message",async(value:Job)=>{
 const attached=await attachOwnedAudioFixture(value.identity);
 try {
  const s=value.session;
  const gateway=createDurableGatewayForTest({connections:value.connections,keys:value.keys,session:createSyntheticDurableSessionForTest(s),request:()=>new Request(s.origin,{method:"POST",headers:{origin:s.origin,"sec-fetch-site":"same-origin","x-csrf-token":s.csrf}})});
  const service=createDurableFakeLifecycleForTest({gateway,storage:attached.port,context:value.context,principalId:s.principalId,barrier:async(name)=>{
   if(name===value.cut){process.send?.({type:"barrier",name});await new Promise(()=>{});}
  }});
  if(value.command==="flow") {
   const r=await service.reserve("crash-key",0);process.send?.({type:"identity",id:r.id});
   const output=await service.executeFake(r.id); const stage=await service.allocateStage(r.id);process.send?.({type:"stage",stage});
   await service.writeStage(r.id,stage,output.bytes!);await service.validate(r.id,stage);await service.finalize(r.id,stage);await service.replay(r.id);
   process.send?.({type:"done",calls:service.fakeCalls(),id:r.id,stage});
  }else if(value.command==="recover") {
   const states=await service.runRecoveryOnce([value.id!]);const state=states[0];
   let bytesHash:string|null=null;
   if(state.artifact){const replay=await service.replay(value.id!);bytesHash=replay.artifact.hash;}
   process.send?.({type:"done",calls:service.fakeCalls(),delivery:state.delivery,artifact:state.artifact_state,bytesHash});
  }else if(value.command==="gc") {await service.gc(value.id!,value.stage!);process.send?.({type:"done",calls:service.fakeCalls()});}
  else {await service.recoverGc(value.id!);process.send?.({type:"done",calls:service.fakeCalls()});}
 }catch(e){process.send?.({type:"error",message:e instanceof Error?e.message:"ERROR"});}
 finally{await attached.close();process.disconnect();}
});
