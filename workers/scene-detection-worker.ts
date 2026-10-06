import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { MediaProcessingError } from "@/lib/media";
import { redisConnection, RedisConfigurationError } from "@/lib/queue/connection";
import { SCENE_JOB_NAME, SCENE_QUEUE_NAME, type SceneJobData } from "@/lib/queue/scene-queue";
import { detectMovieScenes } from "@/lib/scenes/detect-scenes";
import { persistScenes } from "@/lib/scenes/persist-scenes";
import { SceneDetectionError, type SceneReceipt } from "@/lib/scenes/types";

async function main() {
  const worker = new Worker<SceneJobData, SceneReceipt, typeof SCENE_JOB_NAME>(SCENE_QUEUE_NAME, async (job) => {
    if (job.name !== SCENE_JOB_NAME || typeof job.data?.movieId !== "string" || !job.data.movieId) throw new UnrecoverableError("INVALID_SCENE_JOB");
    try {
      const { result, source } = await detectMovieScenes(job.data.movieId);
      return await persistScenes(result, source);
    } catch (error) {
      const known = error instanceof SceneDetectionError || error instanceof MediaProcessingError;
      const code = known ? error.code : "SCENE_PROCESSING_FAILED";
      // Missing/corrupt media, malformed evidence, stale source and invalid config are permanent.
      // Timeouts/process availability and unknown DB failures have bounded retries.
      if (known && code !== "SCENE_PROCESS_TIMEOUT" && code !== "SCENE_PROCESS_UNAVAILABLE") throw new UnrecoverableError(code);
      throw new Error(code);
    }
  }, { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 });
  worker.on("active", (job) => console.info("Scene job active:", job.id));
  worker.on("completed", (job) => console.info("Scene job completed:", job.id));
  worker.on("failed", (job) => { if (job) console.error("Scene job failed:", job.id, "attempts:", job.attemptsMade); });
  worker.on("stalled", (id) => console.warn("Scene job stalled; recovery scheduled:", id));
  worker.on("error", () => console.error("Scene worker connection/lifecycle error; check Redis connectivity."));
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await worker.close();
    await prisma.$disconnect();
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void close().catch(() => { console.error("Scene worker shutdown failed."); process.exitCode = 1; }); });
  await worker.waitUntilReady();
  console.info("Scene worker ready:", SCENE_QUEUE_NAME);
}
void main().catch((error: unknown) => {
  console.error(error instanceof RedisConfigurationError ? error.message : "Scene worker failed to start.");
  process.exitCode = 1;
});
