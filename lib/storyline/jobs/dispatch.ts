import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { id, integer, record } from "../validation";
import { STORY_TASK_LIMITS } from "./contracts";
import { taskFail } from "./errors";
import { boundedBatch, restrictedTransactions, serviceCall, taskScope } from "./service-boundary";

export type StoryTaskReference = Readonly<{ taskId: string; generation: number }>;
export type StoryDispatchObservation = StoryTaskReference & Readonly<{ stateRevision: number }>;
export type StoryDispatchClaim = StoryDispatchObservation & Readonly<{ owner: string }>;
/** Trusted bootstrap port. This milestone supplies only a test-owned Map adapter,
 * never Redis, BullMQ, provider transport or application startup composition. */
export type StoryFakeDelivery = {
  publish: (delivery: Readonly<{ id: string; payload: StoryTaskReference }>) => Promise<string>;
  has: (deliveryId: string) => Promise<boolean>;
};
export type StoryDeliveryResult = StoryDispatchObservation & Readonly<{
  outcome: "ACKNOWLEDGED" | "DELIVERY_FAILED" | "ACK_UNCONFIRMED";
}>;

export function dispatchObservation(value: unknown): StoryDispatchObservation {
  const r = record(value, ["taskId", "generation", "stateRevision"], "dispatch.observation");
  return Object.freeze({ taskId: id(r.taskId, "dispatch.taskId"), generation: integer(r.generation, "dispatch.generation", STORY_TASK_LIMITS.maxGeneration),
    stateRevision: integer(r.stateRevision, "dispatch.stateRevision") });
}
function dispatchClaim(value: unknown): StoryDispatchClaim {
  const r = record(value, ["taskId", "generation", "stateRevision", "owner"], "dispatch.claim");
  return Object.freeze({ ...dispatchObservation({ taskId: r.taskId, generation: r.generation, stateRevision: r.stateRevision }), owner: id(r.owner, "dispatch.owner") });
}
export function storyDeliveryId(reference: StoryTaskReference): string {
  const taskId = id(reference.taskId, "dispatch.taskId"), generation = integer(reference.generation, "dispatch.generation", STORY_TASK_LIMITS.maxGeneration);
  return `story-text-${taskId}-g${generation}`;
}

export function createStoryTaskDispatch(dependencies: { database: PrismaClient; delivery: StoryFakeDelivery; scope: unknown }) {
  const transaction = restrictedTransactions(dependencies.database, "OUTBOX");
  const boundScope = taskScope(dependencies.scope);
  const checkScope = (value: unknown) => {
    const scope = taskScope(value);
    if (scope.projectId !== boundScope.projectId || scope.movieId !== boundScope.movieId || scope.studioId !== boundScope.studioId)
      taskFail("STORY_TASK_SCOPE_MISMATCH", "dispatch.scope");
    return scope;
  };
  const acknowledge = (claim: StoryDispatchClaim, succeeded: boolean) => transaction(async tx => {
    const [row] = await tx.$queryRaw<Array<{ acknowledged: boolean }>>`
      SELECT public.story_m2_test_delivery(${claim.taskId},${claim.generation}::integer,${claim.stateRevision}::integer,${claim.owner},${succeeded}) acknowledged
    `;
    if (typeof row?.acknowledged !== "boolean") taskFail("STORY_TASK_INVALID", "dispatch.acknowledgement");
    return row.acknowledged;
  });
  return Object.freeze({
    /** Explicit bounded operation; a claim is committed before fake delivery. */
    async dispatchDue(scopeValue: unknown, batchValue: unknown = 10): Promise<readonly StoryDeliveryResult[]> {
      return serviceCall(async () => {
        const scope = checkScope(scopeValue), batch = boundedBatch(batchValue, 10);
        const claims = await transaction(async tx => {
          const rows = await tx.$queryRaw<StoryDispatchClaim[]>`
            SELECT * FROM public.story_m2_test_claim_due(${scope.projectId},${scope.movieId},${scope.studioId},${batch}::integer)
          `;
          if (rows.length > batch) taskFail("STORY_TASK_INVALID", "dispatch.batch");
          return rows.map(dispatchClaim);
        });
        const results: StoryDeliveryResult[] = [];
        for (const claim of claims) {
          const observation = dispatchObservation({ taskId: claim.taskId, generation: claim.generation, stateRevision: claim.stateRevision });
          let delivered = false;
          try {
            const deliveryId = storyDeliveryId(claim);
            delivered = await dependencies.delivery.publish(Object.freeze({ id: deliveryId,
              payload: Object.freeze({ taskId: claim.taskId, generation: claim.generation }) })) === deliveryId;
          } catch { /* Delivery ambiguity cannot authorize a provider request. */ }
          try {
            await acknowledge(claim, delivered);
            results.push(Object.freeze({ ...observation, outcome: delivered ? "ACKNOWLEDGED" : "DELIVERY_FAILED" }));
          } catch {
            // A failed/uncertain acknowledgement is not reported as success and
            // is not immediately overwritten with a contradictory failure ack.
            results.push(Object.freeze({ ...observation, outcome: "ACK_UNCONFIRMED" }));
          }
        }
        return Object.freeze(results);
      });
    },
    /** Server-only CAS operation; supplied values never grant ownership. */
    async acknowledge(value: unknown, succeeded: boolean): Promise<boolean> {
      return serviceCall(async () => {
        if (typeof succeeded !== "boolean") taskFail("STORY_TASK_INVALID", "dispatch.succeeded");
        return acknowledge(dispatchClaim(value), succeeded);
      });
    },
    /** Explicit observation, checked against fake delivery AND PostgreSQL. The
     * database enforces scope, generation/revision, grant expiry and no checkpoint. */
    async recoverMissing(scopeValue: unknown, value: unknown): Promise<boolean> {
      return serviceCall(async () => {
        checkScope(scopeValue);
        const observation = dispatchObservation(value), receipt = storyDeliveryId(observation);
        // Scope is fixed by trusted bootstrap and the SQL function independently
        // binds task/project/movie/Studio to the restricted login's private map.
        if (await dependencies.delivery.has(receipt)) return false;
        return transaction(async tx => {
          const [row] = await tx.$queryRaw<Array<{ recovered: boolean }>>`
            SELECT public.story_m2_test_missing_receipt(${observation.taskId},${observation.generation}::integer,${observation.stateRevision}::integer,${receipt}) recovered
          `;
          if (typeof row?.recovered !== "boolean") taskFail("STORY_TASK_INVALID", "dispatch.recovery");
          return row.recovered;
        });
      });
    },
  });
}
