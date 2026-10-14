import "server-only";
import { createHmac } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { canonicalJson } from "../canonical";
import type { InspectedStorylineMedia } from "../media";
import { readStorylineSource } from "../read-source";
import { id, record } from "../validation";
import { STORY_TASK_LIMITS, type StoryTaskProfileDefinition, type StoryTaskRecipeIdentity } from "./contracts";
import { taskFail } from "./errors";
import { createPersistedStoryTaskSourceAccess } from "./persisted-source";
import { serviceCall } from "./service-boundary";

/** Uninstalled server service. The connection, fixed profile, inspector and key
 * come from trusted bootstrap. No operator authority or decision is issued here.
 * Only tests compose it with the disposable synthetic authority SQL. */
export function createStoryTaskAdmission(dependencies: {
  database: PrismaClient;
  profile: StoryTaskProfileDefinition;
  inspectMedia: (storageKey: string | null) => Promise<InspectedStorylineMedia>;
  validationKey: Uint8Array;
}) {
  const access = createPersistedStoryTaskSourceAccess(dependencies.database);
  if (!(dependencies.validationKey instanceof Uint8Array) || dependencies.validationKey.byteLength !== 32)
    taskFail("STORY_TASK_CONFIRMATION_UNTRUSTED", "admission.key");
  const key = Buffer.from(dependencies.validationKey);
  // Do not retain mutable bootstrap profile objects across requests.
  const profile = structuredClone(dependencies.profile);
  return Object.freeze({
    async admit(value: unknown): Promise<Readonly<{ taskId: string; generation: 0 }>> {
      return serviceCall(async () => {
        // Bound and capture caller input before awaits. No mutable JSON object
        // can change selection or canonical identity during media inspection.
        const captured: unknown = JSON.parse(canonicalJson(value, STORY_TASK_LIMITS.recipeBytes * 2 + 4096));
        const input = record(captured, ["decisionId", "selection", "identity"], "admission");
        const decisionId = id(input.decisionId, "admission.decisionId");
        const selection = record(input.selection, ["projectId", "movieId", "studioId", "sourceSnapshotId", "scriptVersionId", "expectedStudioRevision"], "admission.selection");
        const projectId = id(selection.projectId, "admission.projectId"), movieId = id(selection.movieId, "admission.movieId"),
          studioId = id(selection.studioId, "admission.studioId");
        const identity = record(input.identity, ["recipe", "canonicalRecipe", "recipeHash", "logicalTaskKey"], "admission.identity");
        const source = await readStorylineSource({ projectId, movieId }, dependencies.database);
        const media = await dependencies.inspectMedia(source.storageKey); // outside locks
        const taskId = await access.transaction(async tx => {
          const [opened] = await tx.$queryRaw<Array<{ challenge: string }>>`
            SELECT public.story_m2_test_open_fence(${decisionId},${projectId},${movieId},${studioId}) challenge
          `;
          const handle = await access.load(tx, selection, media);
          const checked: StoryTaskRecipeIdentity = await access.validateRecipe(tx, identity.recipe, handle, profile);
          if (identity.canonicalRecipe !== checked.canonicalRecipe || identity.recipeHash !== checked.recipeHash ||
            identity.logicalTaskKey !== checked.logicalTaskKey) taskFail("STORY_TASK_INVALID", "admission.identity");
          const challenge = record(JSON.parse(opened.challenge), ["version", "nonce", "transactionId", "backendPid", "login", "decisionId",
            "projectId", "movieId", "studioId", "recipeHash", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash", "studioRevision"], "admission.fence");
          const [connection] = await tx.$queryRaw<Array<{ login: string; transactionId: string; backendPid: number }>>`
            SELECT session_user::text login,pg_current_xact_id()::text "transactionId",pg_backend_pid() "backendPid"
          `;
          const recipe = checked.recipe;
          if (challenge.version !== "disposable-source-fence-v1" || typeof challenge.nonce !== "string" ||
            challenge.login !== connection.login || challenge.transactionId !== connection.transactionId || challenge.backendPid !== connection.backendPid ||
            challenge.decisionId !== decisionId || challenge.projectId !== projectId || challenge.movieId !== movieId || challenge.studioId !== studioId ||
            challenge.recipeHash !== checked.recipeHash || challenge.sourceSnapshotId !== recipe.source.snapshotId ||
            challenge.sourceContentHash !== recipe.source.contentHash || challenge.sourceContextHash !== recipe.source.contextHash ||
            challenge.scriptHash !== (recipe.script?.hash ?? null) || challenge.studioRevision !== recipe.expectedStudioRevision)
            taskFail("STORY_TASK_CONFIRMATION_UNTRUSTED", "admission.fence");
          await media.assertUnchanged();
          const proof = createHmac("sha256", key).update(opened.challenge, "utf8").digest("hex");
          const [saved] = await tx.$queryRaw<Array<{ taskId: string }>>`
            SELECT public.story_m2_test_finalize(${decisionId},${proof},0,0) "taskId"
          `;
          await media.assertUnchanged(); // late failure must roll back all writes
          return id(saved.taskId, "admission.taskId");
        });
        // Only returned after acknowledged commit. No queue call on any failure
        // or uncertain acknowledgement; explicit outbox recovery is separate.
        return Object.freeze({ taskId, generation: 0 as const });
      });
    },
  });
}
