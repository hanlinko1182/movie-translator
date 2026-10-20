import "server-only";
import { Client, type ClientConfig } from "pg";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { canonicalJson } from "../canonical";
import { actions, EXECUTION, limits, parseEnvelope, envelopeHash, reject, same, FakeExecutionError, type Action, type Context, type Kind } from "./contracts";
import { verifyExecutionRequest, csrfHash, type Authentication } from "./auth";
export type Connections = Record<Action,ClientConfig>;
export type Keys = Record<Action,string>;
export class CommitUnknown extends Error {}
export async function assertExecutionDatabase(c:Client,action:Action) {
  const row=(await c.query(`SELECT current_user=session_user AND inet_server_addr() IS NULL AND current_database()~'^m1e15_db_[a-f0-9]{20}$'
   AND current_user~$1 AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
   AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE (p.rolsuper OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication OR p.rolbypassrls OR p.rolname IN('execution_m803_owner','timeline_m702_owner','highlight_m602_owner','pg_read_server_files','pg_write_server_files','pg_execute_server_program')) AND pg_has_role(session_user,p.oid,'MEMBER'))
   AND NOT has_database_privilege(current_user,current_database(),'CREATE,TEMP') AND NOT has_schema_privilege(current_user,'public','CREATE') AND pg_my_temp_schema()=0 AND current_setting('session_replication_role')='origin'
   AND (SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolreplication FROM pg_roles WHERE rolname='execution_m803_owner')
   AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE (p.rolsuper OR p.rolcreatedb OR p.rolcreaterole OR p.rolreplication OR p.rolbypassrls OR p.rolname IN('pg_read_server_files','pg_write_server_files','pg_execute_server_program')) AND pg_has_role('execution_m803_owner',p.oid,'MEMBER'))
   AND (SELECT pg_get_userbyid(nspowner)='execution_m803_owner' FROM pg_namespace WHERE nspname='execution_m803')
   AND NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE nspname IN('execution_m803','timeline_m702','highlight_m602') AND has_schema_privilege(current_user,n.oid,'CREATE'))
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('execution_m803','timeline_m702','highlight_m602') AND c.relkind IN('r','p','S') AND
    CASE WHEN c.relkind='S' THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE') ELSE has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='execution_m803' AND c.relkind IN('r','p','S') AND pg_get_userbyid(c.relowner)<>'execution_m803_owner')
   AND NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname IN('execution_m803','timeline_m702','highlight_m602') AND
    ((n.nspname='execution_m803' AND (pg_get_userbyid(f.proowner)<>'execution_m803_owner' OR (f.proconfig @> ARRAY['search_path=pg_catalog, execution_m803, pg_temp']) IS NOT TRUE OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')))
     OR (f.oid<>to_regprocedure('execution_m803.'||$2||'(text,text,text)') AND has_function_privilege(current_user,f.oid,'EXECUTE'))))
   AND has_function_privilege(current_user,'execution_m803.'||$2||'(text,text,text)','EXECUTE')
   AND (SELECT count(*)=12 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='execution_m803' AND t.tgname IN('immutable_row','immutable_truncate') AND t.tgenabled='O')
   AND (SELECT count(*)=10 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='execution_m803' AND f.prosecdef)
   AND (SELECT count(*)=2 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='execution_m803' AND t.tgname IN('immutable_source','immutable_source_truncate') AND t.tgenabled='O')
   AND EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='execution_m803' AND t.tgname='transition_complete' AND t.tgdeferrable AND t.tginitdeferred AND t.tgenabled='O') safe
   FROM pg_roles r WHERE r.rolname=current_user`,[`^m803_${action}_[a-f0-9]{16}$`,action])).rows[0];
  if(!row?.safe)reject("DATABASE_UNSAFE");
}
export function createExecutionGatewayForTest(options:{mode:"M803_DISPOSABLE_ONLY";connections:Connections;keys:Keys;authentication:Authentication;proofTtlMs?:number;catalogDiagnosticForTest?:(code:string,message:string)=>void}) {
  if(options.mode!=="M803_DISPOSABLE_ONLY")reject("DATABASE_UNSAFE");
  const configs={} as Connections,keys={} as Record<Action,Buffer>;
  for(const a of actions) {
    const c=options.connections[a];
    if(!c||typeof c.host!=="string"||!/^\/tmp\/movie-translator-storyline-m1e15-[a-zA-Z0-9]+\/socket$/.test(c.host)||typeof c.database!=="string"||!/^m1e15_db_[a-f0-9]{20}$/.test(c.database)||typeof c.user!=="string"||!new RegExp(`^m803_${a}_[a-f0-9]{16}$`).test(c.user)||typeof c.password!=="string"||!/^[a-f0-9]{64}$/.test(c.password)||!/^[a-f0-9]{64}$/.test(options.keys[a])||c.connectionString||c.ssl||c.options||!Number.isInteger(c.port)||Number(c.port)<1||Number(c.port)>65535)reject("DATABASE_UNSAFE");
    configs[a]={host:c.host,database:c.database,user:c.user,password:c.password,port:c.port,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:15000,application_name:"m803-owned-fixture"}; keys[a]=Buffer.from(options.keys[a],"hex");
    if(a!==actions[0]&&(c.host!==configs.inspect.host||c.database!==configs.inspect.database||c.port!==configs.inspect.port))reject("DATABASE_UNSAFE");
  }
  const authenticate=(a:Action,r:unknown,c:Context)=>verifyExecutionRequest(options.authentication,r,c,a);
  async function transaction<T>(action:Action,request:unknown,context:Context,work:(tx:{call:(b:Record<string,unknown>)=>Promise<unknown>;backendPid:number})=>Promise<T>,hooks:{beforeCommit?:(pid:number)=>Promise<void>;afterCommit?:()=>Promise<void>}={}) {
    if(!actions.includes(action))reject("INVALID_ACTION");
    const session=authenticate(action,request,context),c=new Client(configs[action]);let committing=false,committed=false;
    try {
      await c.connect();await c.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL search_path=pg_catalog,execution_m803,pg_temp");
      await assertExecutionDatabase(c,action);
      const backend=(await c.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text tx")).rows[0];
      const call=async(input:Record<string,unknown>)=>{
        if(!same(authenticate(action,request,context),session))reject("SESSION_INVALID");
        const b=JSON.parse(canonicalJson(input,limits.capture));
        if(b.fact) {
          const kind=({checkpoint:"checkpoint",result:"result",verify:"verification",finalize:"artifact"} as Record<string,Kind>)[b.op];
          if(!kind)reject("INVALID_FACT");parseEnvelope(kind,b.fact);
          b.factProof=createHmac("sha256",keys[action]).update(`${EXECUTION[kind]}\n${canonicalJson({...context,id:b.id,generation:b.generation,revision:b.revision,backendPid:Number(backend.pid),transactionId:backend.tx,factHash:envelopeHash(kind,b.fact)})}`).digest("hex");
        }
        const bytes=canonicalJson(b,limits.capture),now=Number((await c.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint now")).rows[0].now);
        const wire=canonicalJson({domain:EXECUTION.access,...context,sessionId:session.id,principalId:session.principalId,action,bodyHash:createHash("sha256").update(bytes).digest("hex"),nonce:randomBytes(24).toString("hex"),backendPid:Number(backend.pid),transactionId:backend.tx,expiresAtMs:now+(options.proofTtlMs??3000),origin:session.origin,csrfHash:csrfHash(session.csrf)});
        const mac=createHmac("sha256",keys[action]).update(`${EXECUTION.access}\n${wire}`).digest("hex");
        return (await c.query(`SELECT execution_m803.${action}($1,$2,$3) value`,[wire,mac,bytes])).rows[0].value;
      };
      const result=await work({call,backendPid:Number(backend.pid)});await hooks.beforeCommit?.(Number(backend.pid));
      if(!same(authenticate(action,request,context),session))reject("SESSION_INVALID");
      committing=true;await c.query("COMMIT");committed=true;await hooks.afterCommit?.();return result;
    } catch(e) {
      if(!committed)await c.query("ROLLBACK").catch(()=>{});
      if(e instanceof FakeExecutionError)throw e;
      const message=e instanceof Error?e.message:"";
      const sqlCode=String((e as {code?:string}).code??"");
      if(["42702","42703","42883","42501","42P01","42725","23505","23514","23503"].includes(sqlCode))options.catalogDiagnosticForTest?.(sqlCode,message.slice(0,200));
      if(message.startsWith("E803_"))reject(message.slice(5));
      if(committed||committing&&!(e as {code?:string}).code)throw new CommitUnknown("Original metadata outcome unknown");
      reject("TRANSACTION_FAILED");
    } finally {await c.end().catch(()=>{});}
  }
  return Object.freeze({transaction,authenticate});
}
export type ExecutionGateway=ReturnType<typeof createExecutionGatewayForTest>;
