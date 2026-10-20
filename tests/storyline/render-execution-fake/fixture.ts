import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { timelineDatabaseFixture, connect } from "../timeline-persistence/fixture";
import { highlightsFixture } from "../highlights/fixture";
import { sourceObservation, planningInput, timelineIdentity } from "../render-planning/fixture";
import { syntheticRenderProfile, type RenderPlanningObservation } from "../../../lib/storyline/render-planning/contracts";
import { generateRenderRecipe } from "../../../lib/storyline/render-planning/planner";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { actions, envelope, envelopeHash, type Action, type Context } from "../../../lib/storyline/render-execution-fake/contracts";
import { newSessionFixture, createSyntheticExecutionAuthenticationForTest, csrfHash } from "../../../lib/storyline/render-execution-fake/auth";
import { createExecutionGatewayForTest, type Connections, type Keys } from "../../../lib/storyline/render-execution-fake/database";
import { createFakeExecutionServiceForTest } from "../../../lib/storyline/render-execution-fake/service";
import { createFakeSourceAuthorityForTest } from "../../../lib/storyline/render-execution-fake/source";
import { createFakeProcessOwnerForTest } from "../../../lib/storyline/render-execution-fake/process";
import { byteHash, objectVersion, createOwnedBlobFixture, attachOwnedBlobFixture } from "../../../lib/storyline/render-execution-fake/storage";
export { connect };

export async function executionFixture() {
  const bytes=Uint8Array.from(Buffer.from("M803 independently owned opaque SOURCE fixture; not media\n"));
  // Full original M1/M2/M3/M4 chain is built with this fingerprint before any immutable SQL seed.
  const synthetic=highlightsFixture({raw:r=>{r.media.sha256=byteHash(bytes);r.media.bytes=bytes.length;}});
  const f=await timelineDatabaseFixture(false,c=>Object.assign(c,structuredClone(synthetic.capture)));
  let attached:Awaited<ReturnType<typeof attachOwnedBlobFixture>>|undefined;
  try {
    const saved=await f.save();if(saved.status==="UNKNOWN")throw Error("M7 fixture save unknown");
    const {admin,scope}=f,sc=[scope.tenantId,scope.projectId,scope.movieId,scope.studioId],input=planningInput(saved.view);
    const dependency=(await admin.query("SELECT timeline_m702.load_dependency($1,$2,$3,$4,$5) v",[...sc,saved.view.record.dependencyId])).rows[0].v;
    const currentM6=(await admin.query("SELECT timeline_m702.current_observation($1,$2,$3,$4,$5) v",[...sc,saved.view.record.plan.plan.input.selected.id])).rows[0].v;
    const manifest=sourceObservation(saved.view.record.plan.plan.source.media);
    const observation:RenderPlanningObservation={status:"RESOLVED_SYNTHETIC",observedAt:"2026-10-20T00:00:00.000Z",timeline:{view:saved.view,dependency},parent:null,head:{scope,revision:1,identity:timelineIdentity(saved.view)},currentM6,
      admission:{scope,m7ScopeEnabled:true,m6ScopeEnabled:true,m7PolicyEnabled:true,m7PolicyVersion:"story-recap-timeline-policy-v1"},profile:syntheticRenderProfile,sourceObservation:manifest};
    const recipe=await generateRenderRecipe(input,{resolve:()=>observation});
    const storageIdentity=await createOwnedBlobFixture();attached=await attachOwnedBlobFixture(storageIdentity);
    const context:Context={namespace:storageIdentity.namespace,scope},version=objectVersion();
    await attached.port.register(context,version);await attached.port.create(context,version,bytes);
    const binding=envelope("source",context,{handle:`source-${objectVersion()}`,ownerId:"independent-fixture-owner",version,byteSha256:byteHash(bytes),byteCount:bytes.length,generation:1,expiresAtMs:Date.now()+3600000});
    const source=createFakeSourceAuthorityForTest(context,binding,attached.port),sourceHash=envelopeHash("source",binding);
    await admin.query(await readFile(new URL("./schema.sql",import.meta.url),"utf8"));
    await admin.query("INSERT INTO execution_m803.fixture(namespace,versions) VALUES($1,1)",[context.namespace]);
    for(const tenant of ["tenant-one","tenant-two"])await admin.query("INSERT INTO execution_m803.scope VALUES($1,$2,$3,$4,$5,true)",[context.namespace,tenant,scope.projectId,scope.movieId,scope.studioId]);
    await admin.query("INSERT INTO execution_m803.source VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)",[context.namespace,...sc,sourceHash,canonicalJson(binding),canonicalJson(input),canonicalJson(recipe),canonicalJson(manifest),canonicalJson(syntheticRenderProfile),new Date(Number(binding.body.expiresAtMs))]);
    const sessions=f.sessions.map(old=>({...newSessionFixture({...context,scope:{...scope,tenantId:old.tenantId}},old.principalId,old.principalId==="reader"?["read","inspect"]:old.principalId==="denied"?[]:[...actions]),expiresAtMs:old.expiresAtMs}));
    const connections={} as Connections,keys={} as Keys;
    for(const a of actions) {
      const user=`m803_${a}_${randomBytes(8).toString("hex")}`,password=randomBytes(32).toString("hex");
      await admin.query(`CREATE ROLE ${user} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE execution_m803_${a} PASSWORD '${password}'`);
      connections[a]={...f.owned.prismaAdapterConfig(),user,password};keys[a]=randomBytes(32).toString("hex");
      await admin.query("INSERT INTO execution_m803.proof_key VALUES($1,$2,decode($3,'hex'),true)",[a,user,keys[a]]);
    }
    for(const s of sessions) {
      await admin.query("INSERT INTO execution_m803.session VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[context.namespace,s.scope.tenantId,s.id,s.principalId,csrfHash(s.csrf),s.origin,new Date(s.expiresAtMs),s.principalId==="db-revoked"]);
      await admin.query("INSERT INTO execution_m803.access_grant VALUES($1,$2,$3,$4,$5,$6,$7)",[context.namespace,s.scope.tenantId,scope.projectId,scope.movieId,scope.studioId,s.principalId,s.principalId==="db-denied"?[]:s.actions]);
    }
    const auth=createSyntheticExecutionAuthenticationForTest(sessions),gateway=createExecutionGatewayForTest({mode:"M803_DISPOSABLE_ONLY",connections,keys,authentication:auth.authentication,catalogDiagnosticForTest:(code,message)=>console.error("M803 catalog diagnostic",code,message)}),process=createFakeProcessOwnerForTest();
    const storage=attached.port;
    const service=(overrides:Partial<Parameters<typeof createFakeExecutionServiceForTest>[0]>={})=>createFakeExecutionServiceForTest({mode:"M803_DISPOSABLE_ONLY",context,gateway,source,storage,process,quarantineRequest:()=>request("quarantine","editor-b"),...overrides});
    const api=service();
    function request(action:Action,name="editor-a",headers:Record<string,string|null>={}) {
      const s=sessions.find(s=>s.principalId===name)!;
      const h=new Headers({origin:s.origin,"sec-fetch-site":"same-origin",cookie:`execution_m803_session=${s.token}`,"x-execution-m803-csrf":s.csrf});
      for(const [k,v]of Object.entries(headers))if(v===null)h.delete(k);else h.set(k,v);
      return new Request(`${s.origin}/isolated-fixture`,{method:action==="read"||action==="inspect"?"GET":"POST",headers:h});
    }
    async function reserve(key=`request-${objectVersion()}`,selected=api) {return selected.reserve(request("execute"),await selected.proposal(request("inspect"),key));}
    async function complete(selected=api) {const r=await reserve(undefined,selected);await selected.executeFake(request("execute"),r.id);await selected.capture(request("validate"),r.id);await selected.verify(request("validate"),r.id);await selected.finalize(request("finalize"),r.id);return r.id;}
    return {f,admin,context,scope,sc,saved,recipe,source,binding,storage,storageIdentity,connections,keys,sessions,auth,gateway,process,service,api,request,reserve,complete,
      async snapshotOriginals(){return (await admin.query("SELECT (SELECT jsonb_agg(to_jsonb(x)) FROM timeline_m702.version x) m7,(SELECT jsonb_agg(to_jsonb(x)) FROM highlight_m602.version x) m6,(SELECT jsonb_agg(to_jsonb(x)) FROM highlight_m602.narration_snapshot x) m4")).rows[0];},
      async stop(){await attached?.close();await f.stop();}};
  }catch(e){await attached?.close();await f.stop();throw e;}
}
