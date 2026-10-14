import "server-only";
import { array, unique } from "../validation";
import { type createStoryTaskFakeWorker, parseFakeStoryTaskReference } from "./fake-worker";
import { serviceCall } from "./service-boundary";

/** Explicit bounded recovery only. No timers, queue consumption, grant issuance,
 * automatic delivery or SUBMITTED/UNKNOWN transition. Reuse M2-03 reconcileOnce
 * separately to publish references after recovery has committed. */
export function createStoryTaskFakeRecovery(worker: ReturnType<typeof createStoryTaskFakeWorker>) {
  return Object.freeze({
    async recoverOnce(value: unknown) {
      return serviceCall(async () => {
        const references = array(value, 10, "recovery.references").map(parseFakeStoryTaskReference);
        unique(references, row => row.taskId, "recovery.references");
        const results = [];
        for (const reference of references) results.push(await worker.recoverReference(reference));
        return Object.freeze(results);
      });
    },
  });
}
