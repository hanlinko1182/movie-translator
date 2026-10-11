import "server-only";
import type { createRecapQueue } from "./recap-queue";
import { reprocessJob } from "bullmq/dist/esm/scripts/reprocessJob-7";

// Reuse BullMQ 6's own failed -> waiting script, with an atomic precondition.
// Job.retry alone cannot fence a delayed request against a subsequent failure.
// Keep this adapter covered by the isolated Redis test when updating BullMQ.
const guardedRetry = `
if redis.call("EXISTS", KEYS[1]) == 0 then return -1 end
if not redis.call("ZSCORE", KEYS[3], ARGV[1]) then return 0 end
local values = redis.call("HMGET", KEYS[1], "finishedOn", "ats", "atm")
local token = (values[1] or "") .. ":" .. (values[2] or "0") .. ":" .. (values[3] or "0")
if token ~= ARGV[7] then return -4 end
if redis.call("EXISTS", KEYS[1] .. ":lock") == 1 then return -5 end
` + reprocessJob.content;

export async function retryRecapAtomically(queue: ReturnType<typeof createRecapQueue>, jobId: string, failureToken: string): Promise<number> {
  const client = await queue.getBackend().client;
  const name = "recapRetryFailedV1";
  client.defineCommand(name, { numberOfKeys: reprocessJob.keys, lua: guardedRetry });
  // Recap jobs are FIFO. Reset the bounded retry budget, retain attemptsStarted
  // as a monotonic fence and retain the job's structured diagnostic logs.
  return client.runCommand(name, [queue.toKey(jobId), queue.keys.events, queue.toKey("failed"), queue.keys.wait,
    queue.keys.meta, queue.keys.active, queue.keys.marker,
    jobId, "LPUSH", "failedReason", "failed", "1", "0", failureToken]);
}
