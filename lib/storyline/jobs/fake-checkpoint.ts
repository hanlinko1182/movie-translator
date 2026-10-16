import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "../canonical";
import type { InspectedStorylineMedia } from "../media";
import { enumeration, id, integer, record } from "../validation";
import { type StoryTaskProfileDefinition, STORY_TASK_STATES } from "./contracts";
import { taskFail, StoryTaskContractError } from "./errors";
import { type createStoryTaskFakeWorker, parseFakeStoryTaskReference } from "./fake-worker";
import { invokeStoryFakeWire, parseStoryFakeResult, type FakeWireRequest } from "./fake-transport";
import { createPersistedStoryTaskSourceAccess } from "./persisted-source";
import { parseStoryTaskProfile } from "./recipe";
import { serviceCall, taskScope } from "./service-boundary";

type Task = { taskId: string; generation: number; stateRevision: number; state: string; projectId: string; movieId: string; studioId: string;
  sourceSnapshotId: string; scriptVersionId: string | null; expectedStudioRevision: number; canonicalRecipe: string; recipeHash: string;
  submissionId: string | null; requestHash: string | null; owner: string | null; submissionState: string | null };
type Summary = Readonly<{ submissionId: string; state: string; stateRevision: number }>;
type Operation = "CHECKPOINT" | "PRE_SEND" | "RESULT" | "UNKNOWN" | "RECOVER" | "CANCEL";
type Binding = { task: Task; owner: string; request: FakeWireRequest; deadline: number };
const permitBrand: unique symbol = Symbol("fake-send-permit"), resultBrand: unique symbol = Symbol("fake-result-receipt");
export type StoryFakeSendPermit = { readonly [permitBrand]: true };
export type StoryFakeResultReceipt = { readonly [resultBrand]: true };

/** Exact approved disposable profile, not a live model/cost approval. */
function syntheticProfile(value: StoryTaskProfileDefinition) {
  const parsed = parseStoryTaskProfile(value);
  if (!["s1", "story-evidence-candidate-v1"].includes(parsed.responseSchemaVersion))
    taskFail("STORY_TASK_PROFILE_INVALID", "checkpoint.profile");
  const expected = { id: "synthetic-text", version: "v1", kind: parsed.kind, execution: "PAID_TEXT", providerId: "synthetic", modelId: "synthetic/model",
    promptVersion: "p1", responseSchemaVersion: parsed.responseSchemaVersion, validatorVersion: "v1", policyVersion: "policy-v1",
    limits: { requestBytes: 100000, responseBytes: 50000, inputTokens: 1000, outputTokens: 500, timeoutMs: 1000 },
    costPolicy: { id: "synthetic-quote", version: "v1", maxEstimatedUsdMicros: 10000 } };
  if (canonicalJson(parsed) !== canonicalJson(expected)) taskFail("STORY_TASK_PROFILE_INVALID", "checkpoint.profile");
  return parsed;
}

/** Uninstalled fake-only service. No default datasource, live transport, issuer
 * or environment flag. DROP_AFTER_COMMIT can only withhold a known commit ack;
 * it can never manufacture acknowledgement or authorize a speculative send. */
export function createStoryTaskFakeCheckpoint(dependencies: {
  database: PrismaClient; worker: ReturnType<typeof createStoryTaskFakeWorker>; scope: unknown;
  profile: StoryTaskProfileDefinition; validationKey: Uint8Array;
  inspectMedia: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
  acknowledgementFault?: "DROP_AFTER_COMMIT";
}) {
  const access = createPersistedStoryTaskSourceAccess(dependencies.database), scope = taskScope(dependencies.scope), profile = syntheticProfile(dependencies.profile);
  if (!(dependencies.validationKey instanceof Uint8Array) || dependencies.validationKey.byteLength !== 32)
    taskFail("STORY_TASK_CONFIRMATION_UNTRUSTED", "checkpoint.key");
  const key = Buffer.from(dependencies.validationKey);
  const permits = new WeakMap<object, Binding>();
  const receipts = new WeakMap<object, Binding & { canonical: string }>();
  const transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => access.transaction(async tx => {
    const [role] = await tx.$queryRaw<Array<{ safe: boolean }>>`
      SELECT (current_user=session_user AND
        has_function_privilege(current_user,'public.story_m2_test_checkpoint_peek(text,integer)','EXECUTE') AND
        has_function_privilege(current_user,'public.story_m2_test_checkpoint_open(text,integer,integer,text,text,text)','EXECUTE') AND
        has_function_privilege(current_user,'public.story_m2_test_checkpoint_finish(text,integer,integer,text,text,text,text,text,text)','EXECUTE') AND
        NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
          ('story_m2_test_worker_open','story_m2_test_worker_finish','story_m2_test_issue_decision','story_m2_test_admit','story_m2_test_open_fence',
            'story_m2_test_finalize','story_m2_test_claim_due','story_m2_test_delivery','story_m2_test_missing_receipt','story_m2_test_status','story_m1_verification_append')
          AND has_function_privilege(current_user,p.oid,'EXECUTE')) AND
        NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND
          c.relname IN ('StoryTask','StoryTaskDispatch','StoryPaidConfirmation','StoryAdmission','StorySpendingDecision','StoryProviderSubmission','StoryTaskResult',
            'StoryTaskEvent','StoryTestValidationKey','StoryTestWorkerAccess','StoryTestWorkerFence','StoryTestAdmissionFence','StorySyntheticAuthority','StoryTestAccess',
            'StoryTestCheckpointAccess','StoryTestCheckpointFence') AND
          (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE')))
      ) safe
    `;
    if (!role?.safe) taskFail("STORY_TASK_INVALID", "checkpoint.database");
    return run(tx);
  });
  async function peek(value: unknown): Promise<Task> {
    const ref = parseFakeStoryTaskReference(value);
    return transaction(async tx => {
      const [row] = await tx.$queryRaw<Array<{ task: Task }>>`SELECT public.story_m2_test_checkpoint_peek(${ref.taskId},${ref.generation}::integer) task`;
      const task = row.task;
      if (task.taskId !== ref.taskId || task.generation !== ref.generation || task.projectId !== scope.projectId || task.movieId !== scope.movieId || task.studioId !== scope.studioId)
        taskFail("STORY_TASK_SCOPE_MISMATCH", "checkpoint.task");
      enumeration(task.state, STORY_TASK_STATES, "checkpoint.state"); integer(task.stateRevision, "checkpoint.revision");
      return task;
    });
  }
  async function operate(task: Task, operation: Operation, owner: string | null, requestHash: string, data = ""): Promise<Summary> {
    let media: InspectedStorylineMedia | null = null;
    if (["CHECKPOINT", "PRE_SEND", "RESULT"].includes(operation)) {
      const movie = await dependencies.database.movie.findUnique({ where: { id: scope.movieId }, select: { projectId: true, storageKey: true } });
      if (!movie || movie.projectId !== scope.projectId) taskFail("STORY_TASK_SCOPE_MISMATCH", "checkpoint.movie");
      media = await dependencies.inspectMedia(movie.storageKey);
    }
    return transaction(async tx => {
      const [opened] = await tx.$queryRaw<Array<{ challenge: string }>>`
        SELECT public.story_m2_test_checkpoint_open(${task.taskId},${task.generation}::integer,${task.stateRevision}::integer,${owner},${operation},${requestHash}) challenge
      `;
      let verdict = "CURRENT";
      if (media) {
        try {
          const handle = await access.load(tx, { ...scope, sourceSnapshotId: task.sourceSnapshotId, scriptVersionId: task.scriptVersionId,
            expectedStudioRevision: task.expectedStudioRevision }, media);
          const checked = await access.validateRecipe(tx, JSON.parse(task.canonicalRecipe), handle, profile);
          if (checked.canonicalRecipe !== task.canonicalRecipe || checked.recipeHash !== task.recipeHash) taskFail("STORY_TASK_SOURCE_STALE", "checkpoint.recipe");
          await media.assertUnchanged();
        } catch (error) {
          if (operation !== "RESULT" || !(error instanceof StoryTaskContractError) || error.code !== "STORY_TASK_SOURCE_STALE") throw error;
          verdict = "SOURCE_STALE";
        }
      }
      const challenge = record(JSON.parse(opened.challenge), ["version", "nonce", "transactionId", "backendPid", "login", "taskId", "generation", "stateRevision",
        "owner", "operation", "requestHash", "projectId", "movieId", "studioId", "recipeHash"], "checkpoint.fence");
      const [connection] = await tx.$queryRaw<Array<{ login: string; transactionId: string; backendPid: number }>>`
        SELECT session_user::text login,pg_current_xact_id()::text "transactionId",pg_backend_pid() "backendPid"
      `;
      if (challenge.version !== "disposable-checkpoint-fence-v1" || typeof challenge.nonce !== "string" || challenge.login !== connection.login ||
        challenge.transactionId !== connection.transactionId || challenge.backendPid !== connection.backendPid || challenge.taskId !== task.taskId ||
        challenge.generation !== task.generation || challenge.stateRevision !== task.stateRevision || challenge.owner !== owner || challenge.operation !== operation ||
        challenge.requestHash !== requestHash || challenge.projectId !== scope.projectId || challenge.movieId !== scope.movieId || challenge.studioId !== scope.studioId ||
        challenge.recipeHash !== task.recipeHash) taskFail("STORY_TASK_CONFIRMATION_UNTRUSTED", "checkpoint.fence");
      const proof = createHmac("sha256", key).update(opened.challenge + "\n" + verdict + "\n" + createHash("sha256").update(data, "utf8").digest("hex"), "utf8").digest("hex");
      const [saved] = await tx.$queryRaw<Array<{ result: Summary }>>`
        SELECT public.story_m2_test_checkpoint_finish(${task.taskId},${task.generation}::integer,${task.stateRevision}::integer,${owner},${operation},${requestHash},${verdict},${data},${proof}) result
      `;
      if (media && verdict === "CURRENT") await media.assertUnchanged();
      return Object.freeze({ submissionId: id(saved.result.submissionId, "checkpoint.submissionId"),
        state: enumeration(saved.result.state, STORY_TASK_STATES, "checkpoint.state"), stateRevision: integer(saved.result.stateRevision, "checkpoint.revision") });
    });
  }
  function opaque(path: string) { return Object.freeze({ toJSON() { taskFail("STORY_TASK_INVALID", path); } }); }
  async function unknown(binding: Binding): Promise<Summary> {
    const task = await peek({ taskId: binding.task.taskId, generation: binding.task.generation });
    if (task.submissionId !== binding.request.submissionId || task.requestHash !== binding.request.requestHash || task.owner !== binding.owner)
      taskFail("STORY_TASK_SCOPE_MISMATCH", "checkpoint.original");
    if (task.state === "UNKNOWN") return Object.freeze({ submissionId: binding.request.submissionId, state: task.state, stateRevision: task.stateRevision });
    return operate(task, "UNKNOWN", binding.owner, binding.request.requestHash);
  }
  const service = {
    async checkpoint(lease: unknown): Promise<StoryFakeSendPermit> {
      return serviceCall(() => dependencies.worker.withCheckpointLease(lease, async owned => {
        const started = performance.now(), ref = { taskId: owned.task.taskId, generation: owned.task.generation }, task = await peek(ref);
        if (task.stateRevision !== owned.task.stateRevision) taskFail("STORY_TASK_TRANSITION_INVALID", "checkpoint.revision");
        const request = { schemaVersion: "story-fake-request-v1", synthetic: true, ...ref, recipeHash: task.recipeHash };
        const bytes = canonicalJson(request, profile.limits.requestBytes), requestHash = contractHash("story-fake-request-v1", request);
        const committed = await operate(task, "CHECKPOINT", owned.owner, requestHash, bytes);
        // No callback can manufacture commit acknowledgement. This test fault
        // only discards one after the actual PostgreSQL transaction has resolved.
        if (dependencies.acknowledgementFault === "DROP_AFTER_COMMIT") taskFail("STORY_TASK_PROVIDER_OUTCOME_UNKNOWN", "checkpoint.acknowledgement");
        const permit = opaque("checkpoint.permitSerialization");
        permits.set(permit, { task: { ...task, state: "SUBMITTED", stateRevision: committed.stateRevision }, owner: owned.owner,
          request: { ...ref, submissionId: committed.submissionId, requestHash }, deadline: started + profile.limits.timeoutMs });
        return permit as unknown as StoryFakeSendPermit;
      }));
    },
    async send(value: unknown, wire: unknown) {
      return serviceCall(async () => {
        const binding = value && typeof value === "object" ? permits.get(value) : undefined;
        if (!binding) taskFail("STORY_TASK_INVALID", "checkpoint.permit");
        permits.delete(value as object); // Burn before ANY await; never replay.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        try {
          if (performance.now() >= binding.deadline) taskFail("STORY_TASK_CONFIRMATION_STALE", "checkpoint.permitExpiry");
          await operate(binding.task, "PRE_SEND", binding.owner, binding.request.requestHash);
          if (performance.now() >= binding.deadline) taskFail("STORY_TASK_CONFIRMATION_STALE", "checkpoint.permitExpiry");
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error("Synthetic transport deadline")); }, profile.limits.timeoutMs);
          });
          const bytes = await Promise.race([invokeStoryFakeWire(wire, binding.request, controller.signal), timeout]);
          const result = parseStoryFakeResult(bytes, binding.request, profile.limits.responseBytes);
          const receipt = opaque("checkpoint.resultSerialization");
          receipts.set(receipt, { ...binding, canonical: result.canonical });
          return Object.freeze({ outcome: "DEFINITIVE" as const, receipt: receipt as unknown as StoryFakeResultReceipt });
        } catch {
          return Object.freeze({ outcome: "UNKNOWN" as const, ...await unknown(binding) });
        } finally { if (timer) clearTimeout(timer); controller.abort(); }
      });
    },
    async recordResult(value: unknown) {
      return serviceCall(async () => {
        const binding = value && typeof value === "object" ? receipts.get(value) : undefined;
        if (!binding) taskFail("STORY_TASK_INVALID", "checkpoint.resultReceipt");
        const task = await peek({ taskId: binding.task.taskId, generation: binding.task.generation });
        if (task.submissionId !== binding.request.submissionId || task.requestHash !== binding.request.requestHash || task.owner !== binding.owner)
          taskFail("STORY_TASK_SCOPE_MISMATCH", "checkpoint.original");
        return operate(task, "RESULT", binding.owner, binding.request.requestHash, binding.canonical);
      });
    },
    async recoverAfterCheckpoint(value: unknown) {
      return serviceCall(async () => {
        const task = await peek(value);
        if (task.state !== "SUBMITTED") return Object.freeze({ outcome: "NOT_ELIGIBLE", state: task.state });
        if (!task.requestHash) taskFail("STORY_TASK_INVALID", "checkpoint.missing");
        return operate(task, "RECOVER", null, task.requestHash);
      });
    },
    async cancelAfterCheckpoint(value: unknown) {
      return serviceCall(async () => {
        const row = record(value, ["taskId", "generation", "stateRevision"], "checkpoint.cancel"), task = await peek({ taskId: row.taskId, generation: row.generation });
        if (task.stateRevision !== integer(row.stateRevision, "checkpoint.revision") || !task.requestHash) taskFail("STORY_TASK_TRANSITION_INVALID", "checkpoint.revision");
        return operate(task, "CANCEL", null, task.requestHash);
      });
    },
    async runOnce(lease: unknown, wire: unknown) {
      const sent = await service.send(await service.checkpoint(lease), wire);
      return sent.outcome === "DEFINITIVE" ? service.recordResult(sent.receipt) : sent;
    },
  };
  return Object.freeze(service);
}
