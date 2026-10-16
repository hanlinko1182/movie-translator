import "server-only";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { assertAuthoritativeStorylineSource } from "../authoritative-source";
import { canonicalJson } from "../canonical";
import type { StorySourceSnapshot, StoryScriptVersion } from "../contracts";
import type { InspectedStorylineMedia } from "../media";
import { captureStorylineSourceInTransaction } from "../read-source";
import { validateScriptPayload } from "../script";
import { validateSourceSnapshot } from "../source";
import { id, integer, nullable, record } from "../validation";
import type { StoryTaskRecipeIdentity, StoryTaskStudioBinding } from "./contracts";
import { StoryTaskContractError, taskFail } from "./errors";
import { createStoryTaskRecipe, validateStoryTaskRecipe } from "./recipe";

const sourceHandle: unique symbol = Symbol("persisted-story-task-source");
/** An in-process, transaction-owned observation, never a JSON persistence claim.
 * It grants no human verification, spending permission, source lock or send permit. */
export type PersistedStoryTaskSource = { readonly [sourceHandle]: true };
type Selection = { projectId: string; movieId: string; studioId: string; sourceSnapshotId: string;
  scriptVersionId: string | null; expectedStudioRevision: number };
type Context = { source: StorySourceSnapshot; script: StoryScriptVersion | null; studio: StoryTaskStudioBinding };
type Entry = { tx: Prisma.TransactionClient; selection: Selection; media: InspectedStorylineMedia };

function selection(value: unknown): Selection {
  const p="persistedSource",r=record(value,["projectId","movieId","studioId","sourceSnapshotId","scriptVersionId","expectedStudioRevision"],p);
  return Object.freeze({projectId:id(r.projectId,`${p}.projectId`),movieId:id(r.movieId,`${p}.movieId`),studioId:id(r.studioId,`${p}.studioId`),
    sourceSnapshotId:id(r.sourceSnapshotId,`${p}.sourceSnapshotId`),scriptVersionId:nullable(r.scriptVersionId,v=>id(v,`${p}.scriptVersionId`)),
    expectedStudioRevision:integer(r.expectedStudioRevision,`${p}.expectedStudioRevision`)});
}

/** Existing privileged identities are fixture/migration administrators, never
 * this reader's runtime. Check the actual transaction, not a caller role label. */
async function databaseBoundary(tx: Prisma.TransactionClient) {
  const [row]=await tx.$queryRaw<Array<{safe:boolean}>>`
    SELECT (
      NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolbypassrls AND NOT r.rolreplication AND
      NOT s.rolsuper AND NOT s.rolcreatedb AND NOT s.rolcreaterole AND NOT s.rolbypassrls AND NOT s.rolreplication AND
      NOT EXISTS (SELECT 1 FROM pg_roles privileged WHERE
        (privileged.rolsuper OR privileged.rolcreatedb OR privileged.rolcreaterole OR privileged.rolbypassrls OR privileged.rolreplication) AND
        (pg_has_role(current_user,privileged.oid,'MEMBER') OR pg_has_role(session_user,privileged.oid,'MEMBER'))) AND
      NOT pg_has_role(current_user,c.relowner,'MEMBER') AND NOT pg_has_role(session_user,c.relowner,'MEMBER') AND
      NOT has_schema_privilege(current_user,'public','CREATE') AND current_setting('session_replication_role')='origin' AND
      NOT EXISTS (SELECT 1 FROM pg_class paid JOIN pg_namespace n ON n.oid=paid.relnamespace WHERE n.nspname='public' AND
        paid.relname IN ('StoryTask','StoryTaskDispatch','StoryPaidConfirmation','StoryProviderSubmission','StoryTaskResult','StoryTaskEvent',
          'StoryAdmission','StorySpendingDecision','StorySourceVerification') AND
        (has_table_privilege(current_user,paid.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
          has_any_column_privilege(current_user,paid.oid,'INSERT,UPDATE')))
    ) safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,pg_roles r,pg_roles s
    WHERE n.nspname='public' AND c.relname='StorySourceSnapshot' AND r.rolname=current_user AND s.rolname=session_user
  `;
  if(!row?.safe) taskFail("STORY_TASK_INVALID","persistedSource.database");
}

/** Explicit trusted-server construction only; no default datasource, bootstrap,
 * issuer, write operation or provider. The supplied Prisma connection and media
 * inspector are trusted server dependencies, never request/provider payloads. */
export function createPersistedStoryTaskSourceAccess(database: PrismaClient) {
  // Prisma 7 returns an Object.prototype proxy, so instanceof is false for a
  // genuine client. This rejects JSON/ordinary adapter proposals; the actual
  // connection remains a trusted bootstrap dependency, checked in PostgreSQL.
  if(!database || database.constructor!==PrismaClient || typeof database.$transaction!=="function")
    taskFail("STORY_TASK_INVALID","persistedSource.database");
  const active=new WeakSet<object>();
  const handles=new WeakMap<object,Entry>();
  const requireTransaction=(tx:Prisma.TransactionClient) => {
    if(!active.has(tx)) taskFail("STORY_TASK_INVALID","persistedSource.transaction");
  };
  async function read(tx:Prisma.TransactionClient,request:Selection,media:InspectedStorylineMedia):Promise<Context> {
    requireTransaction(tx);
    try {
      const scope={projectId:request.projectId,movieId:request.movieId};
      const studio=await tx.storylineStudio.findUnique({where:{id:request.studioId}});
      const stored=await tx.storySourceSnapshot.findUnique({where:{id:request.sourceSnapshotId}});
      if(!studio || studio.projectId!==request.projectId || studio.movieId!==request.movieId ||
        !stored || stored.studioId!==studio.id || stored.projectId!==request.projectId || stored.movieId!==request.movieId)
        taskFail("STORY_TASK_SCOPE_MISMATCH","persistedSource.record");
      if(studio.revision!==request.expectedStudioRevision || studio.currentSnapshotId!==stored.id ||
        request.scriptVersionId!==null && studio.currentScriptVersionId!==request.scriptVersionId)
        taskFail("STORY_TASK_SOURCE_STALE","persistedSource.currentness");
      const source=validateSourceSnapshot(JSON.parse(stored.canonicalPayload),scope),p=source.payload,prep=p.preparation;
      if(!prep || p.id!==stored.id || canonicalJson(p)!==stored.canonicalPayload ||
        source.sourceContentHash!==stored.sourceContentHash || source.sourceContextHash!==stored.sourceContextHash ||
        prep.dependencyHash!==stored.dependencyHash || prep.sourceBindingHash!==stored.sourceBindingHash ||
        p.media.sha256!==stored.sourceSha256 || BigInt(p.media.bytes)!==stored.sourceBytes || p.media.durationMs!==stored.sourceDurationMs ||
        p.capturedAt!==stored.capturedAt.toISOString()) taskFail("STORY_TASK_SOURCE_STALE","persistedSource.content");
      const fresh=await captureStorylineSourceInTransaction(scope,tx);
      await media.assertUnchanged();
      assertAuthoritativeStorylineSource(source,fresh,media);
      let script:StoryScriptVersion|null=null;
      if(request.scriptVersionId!==null) {
        const row=await tx.storyScriptVersion.findUnique({where:{id:request.scriptVersionId}});
        if(!row || row.studioId!==studio.id || row.sourceSnapshotId!==stored.id || row.sourceContentHash!==source.sourceContentHash ||
          row.sourceContextHash!==source.sourceContextHash) taskFail("STORY_TASK_SCOPE_MISMATCH","persistedSource.script");
        script=validateScriptPayload(JSON.parse(row.canonicalPayload),source);
        if(script.payload.id!==row.id || script.scriptHash!==row.scriptHash || canonicalJson(script.payload)!==row.canonicalPayload ||
          script.payload.version!==row.version || script.payload.parentVersionId!==row.parentVersionId || script.payload.origin!==row.origin)
          taskFail("STORY_TASK_SOURCE_STALE","persistedSource.script");
      }
      await media.assertUnchanged();
      return {source,script,studio:{id:studio.id,projectId:studio.projectId,movieId:studio.movieId,revision:studio.revision,
        currentSourceSnapshotId:stored.id,currentScriptVersionId:studio.currentScriptVersionId}};
    } catch(error) {
      if(error instanceof StoryTaskContractError) throw error;
      taskFail("STORY_TASK_SOURCE_STALE","persistedSource.read");
    }
  }
  async function resolve(tx:Prisma.TransactionClient,handle:unknown):Promise<Context> {
    requireTransaction(tx);
    const entry=handle!==null && typeof handle==="object" ? handles.get(handle) : undefined;
    if(!entry || entry.tx!==tx) taskFail("STORY_TASK_INVALID","persistedSource.handle");
    // Re-read before every construction/validation. A handle is not a future
    // freshness lease; admission must additionally hold its cooperating locks.
    return read(tx,entry.selection,entry.media);
  }
  return Object.freeze({
    async transaction<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>,options?:{readOnly?:boolean}):Promise<T> {
      try {return await database.$transaction(async tx=>{
        if(options?.readOnly) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await databaseBoundary(tx); active.add(tx);
        try {return await work(tx);} finally {active.delete(tx);}
      },{isolationLevel:"ReadCommitted",maxWait:5000,timeout:20000});}
      catch(error) {if(error instanceof StoryTaskContractError) throw error; taskFail("STORY_TASK_INVALID","persistedSource.transaction");}
    },
    async load(tx:Prisma.TransactionClient,value:unknown,media:InspectedStorylineMedia):Promise<PersistedStoryTaskSource> {
      const request=selection(value); await read(tx,request,media);
      const handle=Object.freeze({toJSON(){taskFail("STORY_TASK_INVALID","persistedSource.serialization");}});
      handles.set(handle,{tx,selection:request,media});
      return handle as unknown as PersistedStoryTaskSource;
    },
    /** Server-only current source inspection for provisional downstream analysis.
     * The handle remains bound to this transaction; this is not a freshness lease. */
    async inspect(tx:Prisma.TransactionClient,handle:unknown):Promise<Context> {
      return resolve(tx,handle);
    },
    async createRecipe(tx:Prisma.TransactionClient,input:unknown,handle:unknown,profile:unknown):Promise<StoryTaskRecipeIdentity> {
      const c=await resolve(tx,handle);
      try {return createStoryTaskRecipe(input,c.source,profile,c.script,c.studio);}
      catch(error) {if(error instanceof StoryTaskContractError) throw error; taskFail("STORY_TASK_INVALID","persistedSource.recipe");}
    },
    async validateRecipe(tx:Prisma.TransactionClient,value:unknown,handle:unknown,profile:unknown):Promise<StoryTaskRecipeIdentity> {
      const c=await resolve(tx,handle);
      try {return validateStoryTaskRecipe(value,c.source,profile,c.script,c.studio);}
      catch(error) {if(error instanceof StoryTaskContractError) throw error; taskFail("STORY_TASK_INVALID","persistedSource.recipe");}
    },
  });
}
