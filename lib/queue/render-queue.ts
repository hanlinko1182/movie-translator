import "server-only";
import { Queue } from "bullmq";
import { log } from "@/lib/logger";
import { RENDER_ATTEMPT_LIMIT, RENDER_JOB_NAME, RENDER_QUEUE_NAME, parseRenderReference, renderQueueJobId, type RenderJobReference, type RenderTransportReceipt } from "@/lib/video-render/job-contract";
import { redisConnection } from "./connection";

export function createRenderQueue(prefix?: string) {
  const queue = new Queue<RenderJobReference, RenderTransportReceipt, typeof RENDER_JOB_NAME>(RENDER_QUEUE_NAME, {
    connection: redisConnection("producer"), ...(prefix ? { prefix } : {}), defaultJobOptions: {
      attempts: RENDER_ATTEMPT_LIMIT, backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 },
    },
  });
  queue.on("error", () => log("error", "render_queue_unavailable"));
  return queue;
}
export interface RenderTransport {
  publish(reference: RenderJobReference): Promise<"PUBLISHED" | "TERMINAL">;
  close(): Promise<void>;
}
export function createRenderTransport(prefix?: string): RenderTransport {
  const queue = createRenderQueue(prefix);
  let ready: Promise<unknown> | undefined;
  return {
    async publish(value) {
      const reference = parseRenderReference(value);
      ready ??= queue.waitUntilReady().then(() => queue.setGlobalConcurrency(1));
      await ready;
      const jobId = renderQueueJobId(reference);
      const existing = await queue.getJob(jobId);
      if (existing) {
        let saved: RenderJobReference;
        try { saved = parseRenderReference(existing.data); } catch { return "TERMINAL"; }
        if (existing.name !== RENDER_JOB_NAME || saved.renderJobId !== reference.renderJobId || saved.generation !== reference.generation) return "TERMINAL";
        const state = await existing.getState();
        if (state === "failed" || state === "completed") return "TERMINAL";
        if (state !== "unknown") return "PUBLISHED";
      }
      await queue.add(RENDER_JOB_NAME, reference, { jobId });
      return "PUBLISHED";
    },
    async close() { await queue.close().catch(() => log("error", "render_queue_close_failed")); },
  };
}
