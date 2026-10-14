import "server-only";
import { array, record, unique } from "../validation";
import { type createStoryTaskDispatch, dispatchObservation } from "./dispatch";
import { boundedBatch, serviceCall, taskScope } from "./service-boundary";

/** No timer, bootstrap hook or read path. Each explicit call makes at most ten
 * missing-receipt observations and one bounded claim batch. Observation tokens
 * are CAS hints only; PostgreSQL decides eligibility and owns the retry ceiling. */
export function createStoryTaskReconciler(dispatch: ReturnType<typeof createStoryTaskDispatch>) {
  return Object.freeze({
    async reconcileOnce(value: unknown) {
      return serviceCall(async () => {
        const request = record(value, ["scope", "batchSize", "missingReceipts"], "reconcile");
        const scope = taskScope(request.scope), batch = boundedBatch(request.batchSize, 10);
        const observations = array(request.missingReceipts, 10, "reconcile.missingReceipts").map(dispatchObservation);
        unique(observations, row => row.taskId, "reconcile.missingReceipts");
        const recoveries = [];
        for (const observation of observations) {
          const rearmed = await dispatch.recoverMissing(scope, observation);
          recoveries.push(Object.freeze({ ...observation, rearmed }));
        }
        const deliveries = await dispatch.dispatchDue(scope, batch);
        return Object.freeze({ recoveries: Object.freeze(recoveries), deliveries });
      });
    },
  });
}
