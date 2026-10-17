import "server-only";
import { freeze } from "../validation";
import { createNarrationContextRunner } from "./context-access";

/** Explicit disposable-only preparation; never persists a narration draft. */
export function createPersistedNarrationPreparation(dependencies: Parameters<typeof createNarrationContextRunner>[0]) {
  const runner = createNarrationContextRunner(dependencies);
  return Object.freeze({
    async prepare(value: unknown) {
      return runner.run(value, async (_tx, context, draft) => freeze({
        persisted: false, trust: "PROVISIONAL_SYNTHETIC_DRAFT", humanApproval: "NONE", sourceVerified: false,
        currentness: "CURRENT_AT_VALIDATION", candidate: { id: context.record.candidateId, hash: context.record.candidateHash,
          taskId: context.record.taskId, generation: context.record.generation, resultId: context.record.resultId,
          resultHash: context.record.resultHash }, draft,
      }));
    },
  });
}
