import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { date, enumeration, id, integer, nullable, record } from "../validation";
import { STORY_TASK_ERROR_CODES, STORY_TASK_KINDS, STORY_TASK_LIMITS, STORY_TASK_STATES } from "./contracts";
import { taskFail } from "./errors";
import { boundedBatch, restrictedTransactions, serviceCall, taskScope } from "./service-boundary";

// The reviewed reader gateway deliberately does not return profile metadata or
// live source currentness. Do not fabricate them to fill the larger pure DTO.
function safeStatus(value: unknown) {
  const row = record(value, ["taskId", "kind", "state", "generation", "createdAt", "stateChangedAt", "errorCode",
    "candidateAvailable", "usageClass", "inputTokens", "outputTokens", "costUsdMicros"], "read.status");
  if (typeof row.candidateAvailable !== "boolean") taskFail("STORY_TASK_INVALID", "read.candidateAvailable");
  const classification = enumeration(row.usageClass, ["UNKNOWN", "PARTIAL", "REPORTED"], "read.usageClass");
  const inputTokens = nullable(row.inputTokens, v => integer(v, "read.inputTokens", STORY_TASK_LIMITS.maxTokens));
  const outputTokens = nullable(row.outputTokens, v => integer(v, "read.outputTokens", STORY_TASK_LIMITS.maxTokens));
  const costUsdMicros = nullable(row.costUsdMicros, v => integer(typeof v === "bigint" ? Number(v) : v, "read.costUsdMicros", STORY_TASK_LIMITS.maxReportedUsdMicros));
  const count = [inputTokens, outputTokens, costUsdMicros].filter(v => v !== null).length;
  if (classification === "UNKNOWN" && count !== 0 || classification === "REPORTED" && count !== 3 ||
    classification === "PARTIAL" && (count === 0 || count === 3)) taskFail("STORY_TASK_INVALID", "read.usage");
  const createdAt = date(row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt, "read.createdAt");
  const stateChangedAt = date(row.stateChangedAt instanceof Date ? row.stateChangedAt.toISOString() : row.stateChangedAt, "read.stateChangedAt");
  if (stateChangedAt < createdAt) taskFail("STORY_TASK_INVALID", "read.stateChangedAt");
  return Object.freeze({ taskId: id(row.taskId, "read.taskId"), kind: enumeration(row.kind, STORY_TASK_KINDS, "read.kind"),
    state: enumeration(row.state, STORY_TASK_STATES, "read.state"), generation: integer(row.generation, "read.generation", STORY_TASK_LIMITS.maxGeneration),
    createdAt, stateChangedAt, errorCode: nullable(row.errorCode, v => enumeration(v, STORY_TASK_ERROR_CODES, "read.errorCode")),
    candidateAvailable: row.candidateAvailable, usage: Object.freeze({ classification, inputTokens, outputTokens, costUsdMicros }) });
}
export type StoryTaskReadStatus = ReturnType<typeof safeStatus>;

export function createStoryTaskReader(database: PrismaClient) {
  const transaction = restrictedTransactions(database, "READER");
  return Object.freeze({
    async list(value: unknown) {
      return serviceCall(async () => {
        const input = record(value, ["scope", "afterTaskId", "limit"], "read");
        const scope = taskScope(input.scope), after = nullable(input.afterTaskId, v => id(v, "read.afterTaskId")), limit = boundedBatch(input.limit, 50);
        const items = await transaction(async tx => {
          const rows = await tx.$queryRaw<unknown[]>`
            SELECT * FROM public.story_m2_test_status(${scope.projectId},${scope.movieId},${scope.studioId},${after},${limit}::integer)
          `;
          if (rows.length > limit) taskFail("STORY_TASK_INVALID", "read.limit");
          return rows.map(safeStatus);
        });
        return Object.freeze({ items: Object.freeze(items), nextAfterTaskId: items.length === limit ? items.at(-1)!.taskId : null });
      });
    },
  });
}
