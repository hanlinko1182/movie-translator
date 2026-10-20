/** Enumerated service-only child: no infrastructure bootstrap, engine or network adapter. */
import { createExecutionGatewayForTest, type Connections, type Keys } from "../../../lib/storyline/render-execution-fake/database";
import { createSyntheticExecutionAuthenticationForTest, type SessionFixture } from "../../../lib/storyline/render-execution-fake/auth";
import { createFakeExecutionServiceForTest } from "../../../lib/storyline/render-execution-fake/service";
import { createFakeProcessOwnerForTest } from "../../../lib/storyline/render-execution-fake/process";
import { createFakeSourceAuthorityForTest } from "../../../lib/storyline/render-execution-fake/source";
import { attachOwnedBlobFixture, type StorageIdentity } from "../../../lib/storyline/render-execution-fake/storage";
import type { Context, Envelope } from "../../../lib/storyline/render-execution-fake/contracts";

type Setup={connections:Connections;keys:Keys;sessions:SessionFixture[];context:Context;storageIdentity:StorageIdentity;binding:Envelope;phase:string};
process.once("message",async(setup:Setup)=>{
 let id:string|undefined;
 try{
  const attached=await attachOwnedBlobFixture(setup.storageIdentity),auth=createSyntheticExecutionAuthenticationForTest(setup.sessions),owner=createFakeProcessOwnerForTest();
  const gateway=createExecutionGatewayForTest({mode:"M803_DISPOSABLE_ONLY",connections:setup.connections,keys:setup.keys,authentication:auth.authentication});
  const source=createFakeSourceAuthorityForTest(setup.context,setup.binding,attached.port),s=setup.sessions.find(s=>s.principalId==="editor-a")!;
  function request(read=false,session=s){return new Request(`${session.origin}/isolated-fixture`,{method:read?"GET":"POST",headers:{origin:session.origin,"sec-fetch-site":"same-origin",cookie:`execution_m803_session=${session.token}`,"x-execution-m803-csrf":session.csrf}});}
  const api=createFakeExecutionServiceForTest({mode:"M803_DISPOSABLE_ONLY",context:setup.context,gateway,source,storage:attached.port,process:owner,quarantineRequest:()=>request(false,setup.sessions.find(s=>s.principalId==="editor-b")!),barrier:async phase=>{
   if(phase===setup.phase){process.send?.({event:"barrier",id,starts:owner.starts()});await new Promise<void>(()=>{});}
  }});
  const r=await api.reserve(request(),await api.proposal(request(true),"child-original-key"));id=r.id;
  await api.executeFake(request(),id);await api.capture(request(),id);await api.verify(request(),id);await api.finalize(request(),id);
  await attached.close();process.send?.({event:"unexpected-completion"});process.exitCode=1;process.disconnect();
 }catch(error){process.send?.({event:"error",code:error&&typeof error==="object"&&"code"in error?String(error.code):"CHILD_FAILED"});process.exitCode=1;process.disconnect();}
});
