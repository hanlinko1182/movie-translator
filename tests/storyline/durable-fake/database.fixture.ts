import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client, type ClientConfig } from "pg";
import { DisposableStorylinePostgres } from "../disposable-postgres";
import { expectedRequest, type Context } from "@/lib/storyline/voice/durable-fake/contracts";
import type { VoicePlan } from "@/lib/storyline/voice/foundation/contracts";

export const actions = ["create", "observe", "validate", "finalize", "replay", "recovery", "gc"] as const;
export type Action = typeof actions[number];
export type Connections = Record<Action, ClientConfig>;
export async function createDurableDatabaseFixture(context: Context, plan: VoicePlan) {
  const database = await DisposableStorylinePostgres.start();
  const admin = await database.securityAdministrator();
  const connections = {} as Connections, keys = {} as Record<Action, string>;
  try {
    await admin.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
    await admin.query(`REVOKE TEMPORARY ON DATABASE "${database.name}" FROM PUBLIC`);
    for (const action of actions) {
      const group = `voice_m505_${action}`, login = `m505_${action}_${randomBytes(8).toString("hex")}`, password = randomBytes(32).toString("hex");
      await admin.query(`CREATE ROLE ${group} NOLOGIN; CREATE ROLE ${login} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE ${group} PASSWORD '${password}'`);
      await admin.query(`GRANT USAGE ON SCHEMA voice_m505 TO ${group}; SET ROLE voice_m505_owner;
        CREATE FUNCTION voice_m505.${action}(w text,m text,p text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,voice_m505,pg_temp AS 'SELECT voice_m505.gateway(''${action}'',w,m,p)';
        REVOKE ALL ON FUNCTION voice_m505.${action}(text,text,text) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION voice_m505.${action}(text,text,text) TO ${group}; RESET ROLE`);
      connections[action] = { ...database.prismaAdapterConfig(), user: login, password, application_name: "m505-owned-fixture" };
      keys[action] = randomBytes(32).toString("hex");
      await admin.query("INSERT INTO voice_m505.proof_key VALUES($1,decode($2,'hex'),true)", [action, keys[action]]);
    }
    await admin.query("INSERT INTO voice_m505.namespace(id) VALUES($1)", [context.namespace]);
    await admin.query("INSERT INTO voice_m505.context(namespace,tenant,project,movie,studio,expected) VALUES($1,$2,$3,$4,$5,$6)",
      [context.namespace,context.tenantId,context.scope.projectId,context.scope.movieId,context.scope.studioId,JSON.stringify({ scope: context.scope, plan, anchors: plan.plan.chunks.map((_,i) => { const e=expectedRequest(context,plan,i,"anchor-only"); return {bindingHash:e.request.body.bindingHash,recipeHash:e.request.body.recipeHash}; }) })]);
    return { database, connections, keys, async admin() { return database.securityAdministrator(); }, async stop() { await database.stop(); } };
  } catch (e) { await database.stop(); throw e; }
  finally { await admin.end(); }
}
export async function connect(config: ClientConfig) { const c = new Client(config); await c.connect(); return c; }
