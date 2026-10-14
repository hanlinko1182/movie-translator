import "server-only";
import { createHmac } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "../canonical";
import type { InspectedStorylineMedia } from "../media";
import { enumeration, id, integer, record } from "../validation";
import { STORY_TASK_LIMITS, STORY_TASK_STATES, type StoryTaskProfileDefinition } from "./contracts";
import { StoryTaskContractError, taskFail } from "./errors";
import { createPersistedStoryTaskSourceAccess } from "./persisted-source";
import { serviceCall, taskScope } from "./service-boundary";

type Reference = Readonly<{ taskId: string; generation: number }>;
type Task = Reference & { stateRevision: number; state: string; leaseUntil: Date | null;
  projectId: string; movieId: string; studioId: string; sourceSnapshotId: string; scriptVersionId: string | null;
  expectedStudioRevision: number; canonicalRecipe: string; recipeHash: string };
type Operation = "CLAIM" | "HEARTBEAT" | "EXECUTE" | "RETRY" | "RECOVER" | "CANCEL";
type Mutation = { stateRevision: number; state: string; owner: string | null; reasonCode: string; errorCode: string | null };
type LeaseData = { task: Task; owner: string };
const leaseBrand: unique symbol = Symbol("fake-story-task-lease");
export type FakeStoryTaskLease = { readonly [leaseBrand]: true };

export function parseFakeStoryTaskReference(value: unknown): Reference {
  const input: unknown = JSON.parse(canonicalJson(value, 1024));
  const row = record(input, ["taskId", "generation"], "worker.reference");
  return Object.freeze({ taskId: id(row.taskId, "worker.taskId"), generation: integer(row.generation, "worker.generation", STORY_TASK_LIMITS.maxGeneration) });
}

/** Pure zero-cost marker only. No narration, result publication or semantic AI
 * output. Recomputing this digest never acquires authority or sends anything. */
export function executeDeterministicStoryTaskFake(reference: Reference, recipeHash: string): string {
  const ref = parseFakeStoryTaskReference(reference);
  if (!/^[a-f0-9]{64}$/.test(recipeHash)) taskFail("STORY_TASK_INVALID", "worker.recipeHash");
  return contractHash("story-task-fake-execution-v1", { ...ref, recipeHash });
}

/** Branch predicate only; callers cannot supply a state to the worker. Actual
 * eligibility also requires the scoped SQL row, receipt, grant and live fence. */
export function fakeStoryTaskStateEligibility(value: unknown) {
  const state = enumeration(value, STORY_TASK_STATES, "worker.state");
  return Object.freeze({ claim: state === "QUEUED", recover: state === "LEASED" });
}

/** Explicit test-only composition; no default database, scheduler, provider or
 * production bootstrap. The key/profile/inspector are trusted server dependencies,
 * not request fields, spending authority or M1 source-verification credentials. */
export function createStoryTaskFakeWorker(dependencies: {
  database: PrismaClient; scope: unknown; profile: StoryTaskProfileDefinition;
  validationKey: Uint8Array; inspectMedia: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
}) {
  const access = createPersistedStoryTaskSourceAccess(dependencies.database), scope = taskScope(dependencies.scope);
  if (!(dependencies.validationKey instanceof Uint8Array) || dependencies.validationKey.byteLength !== 32)
    taskFail("STORY_TASK_CONFIRMATION_UNTRUSTED", "worker.key");
  const key = Buffer.from(dependencies.validationKey), profile = structuredClone(dependencies.profile);
  const leases = new WeakMap<object, LeaseData>();
  const transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => access.transaction(async tx => {
    const [role] = await tx.$queryRaw<Array<{ safe: boolean }>>`
      SELECT (current_user=session_user AND
        has_function_privilege(current_user,'public.story_m2_test_worker_peek(text,integer)','EXECUTE') AND
        has_function_privilege(current_user,'public.story_m2_test_worker_open(text,integer,integer,text,text)','EXECUTE') AND
        has_function_privilege(current_user,'public.story_m2_test_worker_finish(text,integer,integer,text,text,text,text)','EXECUTE') AND
        NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
          AND p.proname IN ('story_m2_test_issue_decision','story_m2_test_admit','story_m2_test_open_fence','story_m2_test_finalize',
            'story_m2_test_claim_due','story_m2_test_delivery','story_m2_test_missing_receipt','story_m2_test_status','story_m1_verification_append')
          AND has_function_privilege(current_user,p.oid,'EXECUTE')) AND
        NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
          AND c.relname IN ('StoryTask','StoryTaskDispatch','StoryPaidConfirmation','StoryAdmission','StorySpendingDecision','StoryProviderSubmission','StoryTaskResult','StoryTaskEvent',
            'StoryTestValidationKey','StoryTestWorkerAccess','StoryTestWorkerFence','StoryTestAdmissionFence','StorySyntheticAuthority','StoryTestAccess') AND
          (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
            has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE')))
      ) safe
    `;
    if (!role?.safe) taskFail("STORY_TASK_INVALID", "worker.database");
    return run(tx);
  });
  async function peek(reference: Reference): Promise<Task> {
    return transaction(async tx => {
      const rows = await tx.$queryRaw<Task[]>`SELECT * FROM public.story_m2_test_worker_peek(${reference.taskId},${reference.generation}::integer)`;
      const row = rows[0];
      if (rows.length !== 1 || row.taskId !== reference.taskId || row.generation !== reference.generation ||
        row.projectId !== scope.projectId || row.movieId !== scope.movieId || row.studioId !== scope.studioId)
        taskFail("STORY_TASK_SCOPE_MISMATCH", "worker.task");
      enumeration(row.state, STORY_TASK_STATES, "worker.state"); integer(row.stateRevision, "worker.stateRevision");
      return row;
    });
  }
  async function inspect() {
    const movie = await dependencies.database.movie.findUnique({ where: { id: scope.movieId }, select: { projectId: true, storageKey: true } });
    if (!movie || movie.projectId !== scope.projectId) taskFail("STORY_TASK_SCOPE_MISMATCH", "worker.movie");
    return dependencies.inspectMedia(movie.storageKey);
  }
  async function perform(task: Task, operation: Operation, owner: string | null) {
    const media = operation === "CANCEL" ? null : await inspect(); // outside locks
    return transaction(async tx => {
      const [opened] = await tx.$queryRaw<Array<{ challenge: string }>>`
        SELECT public.story_m2_test_worker_open(${task.taskId},${task.generation}::integer,${task.stateRevision}::integer,${owner},${operation}) challenge
      `;
      let verdict: "CURRENT" | "SOURCE_STALE" = "CURRENT";
      let executionDigest: string | null = null;
      if (media) {
        try {
          const handle = await access.load(tx, { ...scope, sourceSnapshotId: task.sourceSnapshotId, scriptVersionId: task.scriptVersionId,
            expectedStudioRevision: task.expectedStudioRevision }, media);
          const checked = await access.validateRecipe(tx, JSON.parse(task.canonicalRecipe), handle, profile);
          if (checked.canonicalRecipe !== task.canonicalRecipe || checked.recipeHash !== task.recipeHash)
            taskFail("STORY_TASK_SOURCE_STALE", "worker.recipe");
          await media.assertUnchanged();
        } catch (error) {
          if (!(error instanceof StoryTaskContractError) || error.code !== "STORY_TASK_SOURCE_STALE" || operation === "CLAIM") throw error;
          verdict = "SOURCE_STALE"; // Derived here, never accepted from a payload.
        }
      }
      const challenge = record(JSON.parse(opened.challenge), ["version", "nonce", "transactionId", "backendPid", "login", "taskId", "generation",
        "stateRevision", "operation", "owner", "projectId", "movieId", "studioId", "recipeHash"], "worker.fence");
      const [connection] = await tx.$queryRaw<Array<{ login: string; transactionId: string; backendPid: number }>>`
        SELECT session_user::text login,pg_current_xact_id()::text "transactionId",pg_backend_pid() "backendPid"
      `;
      if (challenge.version !== "disposable-worker-fence-v1" || typeof challenge.nonce !== "string" || challenge.login !== connection.login ||
        challenge.transactionId !== connection.transactionId || challenge.backendPid !== connection.backendPid ||
        challenge.taskId !== task.taskId || challenge.generation !== task.generation || challenge.stateRevision !== task.stateRevision ||
        challenge.operation !== operation || challenge.owner !== owner || challenge.projectId !== scope.projectId ||
        challenge.movieId !== scope.movieId || challenge.studioId !== scope.studioId || challenge.recipeHash !== task.recipeHash)
        taskFail("STORY_TASK_CONFIRMATION_UNTRUSTED", "worker.fence");
      if (operation === "EXECUTE" && verdict === "CURRENT")
        executionDigest = executeDeterministicStoryTaskFake({ taskId: task.taskId, generation: task.generation }, task.recipeHash);
      const proof = createHmac("sha256", key).update(opened.challenge + "\n" + verdict, "utf8").digest("hex");
      const [result] = await tx.$queryRaw<Mutation[]>`
        SELECT * FROM public.story_m2_test_worker_finish(${task.taskId},${task.generation}::integer,${task.stateRevision}::integer,${owner},${operation},${verdict},${proof})
      `;
      if (media && verdict === "CURRENT") await media.assertUnchanged(); // late failure rolls back transition/event
      enumeration(result.state, ["LEASED", "QUEUED", "FAILED", "CANCELLED"], "worker.state");
      integer(result.stateRevision, "worker.stateRevision");
      return { ...result, executionDigest: result.reasonCode === "STORY_TASK_FAKE_CHECKPOINT_UNAVAILABLE" ? executionDigest : null };
    });
  }
  function mint(task: Task, result: Mutation): FakeStoryTaskLease {
    if (result.state !== "LEASED" || !result.owner) taskFail("STORY_TASK_TRANSITION_INVALID", "worker.lease");
    const handle = Object.freeze({ toJSON() { taskFail("STORY_TASK_INVALID", "worker.serialization"); } });
    leases.set(handle, { task: { ...task, state: "LEASED", stateRevision: result.stateRevision }, owner: result.owner });
    return handle as unknown as FakeStoryTaskLease;
  }
  function resolve(value: unknown): LeaseData {
    const lease = value && typeof value === "object" ? leases.get(value) : undefined;
    if (!lease) taskFail("STORY_TASK_INVALID", "worker.lease");
    return lease;
  }
  const summary = (task: Task, result: Mutation) => Object.freeze({ taskId: task.taskId, generation: task.generation,
    state: result.state, stateRevision: result.stateRevision, reasonCode: result.reasonCode, errorCode: result.errorCode });
  const worker = {
    async claim(value: unknown) {
      return serviceCall(async () => {
        const task = await peek(parseFakeStoryTaskReference(value));
        if (!fakeStoryTaskStateEligibility(task.state).claim) return Object.freeze({ outcome: "NOT_ELIGIBLE" as const, taskId: task.taskId, generation: task.generation, state: task.state });
        const result = await perform(task, "CLAIM", null);
        return Object.freeze({ outcome: "CLAIMED" as const, lease: mint(task, result) });
      });
    },
    async heartbeat(value: unknown) {
      return serviceCall(async () => {
        const data = resolve(value), result = await perform(data.task, "HEARTBEAT", data.owner);
        leases.delete(value as object);
        return result.state === "LEASED" ? Object.freeze({ outcome: "RENEWED" as const, lease: mint(data.task, result) }) :
          Object.freeze({ outcome: "BLOCKED" as const, ...summary(data.task, result) });
      });
    },
    async execute(value: unknown) {
      return serviceCall(async () => {
        const data = resolve(value), result = await perform(data.task, "EXECUTE", data.owner);
        leases.delete(value as object);
        return Object.freeze({ outcome: result.executionDigest ? "DEFERRED_CHECKPOINT_UNAVAILABLE" : "BLOCKED",
          ...summary(data.task, result), executionDigest: result.executionDigest });
      });
    },
    async retryBeforeCheckpoint(value: unknown) {
      return serviceCall(async () => {
        const data = resolve(value), result = await perform(data.task, "RETRY", data.owner);
        leases.delete(value as object); return summary(data.task, result);
      });
    },
    async recoverReference(value: unknown) {
      return serviceCall(async () => {
        const task = await peek(parseFakeStoryTaskReference(value));
        if (!fakeStoryTaskStateEligibility(task.state).recover) return Object.freeze({ outcome: "NOT_ELIGIBLE" as const, taskId: task.taskId, generation: task.generation, state: task.state });
        const result = await perform(task, "RECOVER", null);
        return Object.freeze({ outcome: "RECOVERED" as const, ...summary(task, result) });
      });
    },
    async cancelBeforeCheckpoint(value: unknown) {
      return serviceCall(async () => {
        const row = record(value, ["taskId", "generation", "stateRevision"], "worker.cancel");
        const task = await peek(parseFakeStoryTaskReference({ taskId: row.taskId, generation: row.generation }));
        if (integer(row.stateRevision, "worker.stateRevision") !== task.stateRevision) taskFail("STORY_TASK_TRANSITION_INVALID", "worker.stateRevision");
        return summary(task, await perform(task, "CANCEL", null));
      });
    },
    async runOnce(value: unknown) {
      const claimed = await worker.claim(value);
      return claimed.outcome === "CLAIMED" ? worker.execute(claimed.lease) : claimed;
    },
  };
  return Object.freeze(worker);
}
