import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { actions, reject, same, type Action, type Context } from "./contracts";
export type SessionFixture = Context & { id:string; principalId:string; token:string; csrf:string; origin:string; expiresAtMs:number; actions:Action[] };
export type Authentication = Readonly<{mode:"M803_DISPOSABLE_ONLY"}>;
const authorities=new WeakMap<Authentication,(r:unknown,c:Context,a:Action)=>SessionFixture>();
export const csrfHash=(v:string)=>createHash("sha256").update(v).digest("hex");
export function newSessionFixture(context:Context,principalId="editor",grants:Action[]=[...actions]):SessionFixture {
  return {...structuredClone(context),id:`session-${principalId}`,principalId,token:randomBytes(32).toString("hex"),csrf:randomBytes(32).toString("hex"),origin:"https://fake-execution.m803.invalid",expiresAtMs:Date.now()+3600000,actions:[...grants]};
}
export function createSyntheticExecutionAuthenticationForTest(input: SessionFixture[]) {
  const sessions=structuredClone(input), revoked=new Set<string>();
  const cap=Object.freeze({mode:"M803_DISPOSABLE_ONLY" as const});
  authorities.set(cap,(request,context,action)=>{
    if (!actions.includes(action) || !(request instanceof Request)) reject("AUTH_REQUIRED");
    const read=action==="read"||action==="inspect";
    const cookies=(request.headers.get("cookie")??"").split(";").map(s=>s.trim()).filter(s=>s.startsWith("execution_m803_session="));
    if(cookies.length!==1)reject("AUTH_REQUIRED");
    const s=sessions.find(s=>cookies[0]===`execution_m803_session=${s.token}`);
    if(!s||revoked.has(s.id)||Date.now()>=s.expiresAtMs)reject("SESSION_INVALID");
    if(request.url!==`${s.origin}/isolated-fixture`||request.method!==(read?"GET":"POST")||request.headers.get("origin")!==s.origin||request.headers.get("sec-fetch-site")!=="same-origin")reject("ORIGIN_REJECTED");
    if(!read&&request.headers.get("x-execution-m803-csrf")!==s.csrf)reject("CSRF_REJECTED");
    if(!same(context,{namespace:s.namespace,scope:s.scope})||!s.actions.includes(action)||["execute","validate","finalize","read"].includes(action)&&!s.actions.includes("inspect")||action==="finalize"&&!s.actions.includes("execute"))reject("FORBIDDEN");
    return structuredClone(s);
  });
  return {authentication:cap,revokeForTest:(id:string)=>revoked.add(id)};
}
export function verifyExecutionRequest(auth:Authentication,r:unknown,c:Context,a:Action) {
  const verify=authorities.get(auth); if(!verify)reject("AUTH_REQUIRED"); return verify(r,c,a);
}
