import { voiceFoundationFixture } from "../voice-foundation/fixture";
import { createDurableDatabaseFixture } from "./database.fixture";
import { attachOwnedAudioFixture, cleanupOwnedAudioFixture, createOwnedAudioFixture } from "@/lib/storyline/voice/durable-fake/storage";
import { createSyntheticDurableSessionForTest, newSyntheticSessionFixture, csrfHash, type SessionFixture } from "@/lib/storyline/voice/durable-fake/auth";
import { createDurableGatewayForTest } from "@/lib/storyline/voice/durable-fake/database";
import { createDurableFakeLifecycleForTest, type Barrier } from "@/lib/storyline/voice/durable-fake/service";

export async function durableFixture(barrier?:Barrier) {
  const source=voiceFoundationFixture(16384), identity=await createOwnedAudioFixture();
  const context={namespace:identity.namespace,tenantId:"tenant-one",scope:source.scope};
  const database=await createDurableDatabaseFixture(context,source.plan);
  const attached=await attachOwnedAudioFixture(identity), session=newSyntheticSessionFixture(context,"principal-one");
  async function installSession(s:SessionFixture) {
    const c=await database.admin();
    try {await c.query("INSERT INTO voice_m505.session(id,namespace,tenant,project,movie,studio,principal,csrf_hash,origin,actions,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0))",
      [s.id,s.namespace,s.tenantId,s.scope.projectId,s.scope.movieId,s.scope.studioId,s.principalId,csrfHash(s.csrf),s.origin,s.actions,s.expiresAtMs]);}
    finally {await c.end();}
  }
  await installSession(session);
  function runtime(s=session, b=barrier) {
    const request=()=>new Request(s.origin,{method:"POST",headers:{origin:s.origin,"sec-fetch-site":"same-origin","x-csrf-token":s.csrf}});
    const gateway=createDurableGatewayForTest({connections:database.connections,keys:database.keys,session:createSyntheticDurableSessionForTest(s),request});
    return {gateway,service:createDurableFakeLifecycleForTest({gateway,storage:attached.port,context,principalId:s.principalId,barrier:b})};
  }
  return {...source,context,identity,database,attached,session,installSession,runtime,...runtime(),async stop(){await attached.close();await database.stop();await cleanupOwnedAudioFixture(identity);}};
}
