import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { MediaProcessingError } from "@/lib/media";
import { redisConnection } from "@/lib/queue/connection";
import { SCENE_JOB_NAME, SCENE_QUEUE_NAME, type SceneJobData } from "@/lib/queue/scene-queue";
import { detectMovieScenes } from "@/lib/scenes/detect-scenes";
import { persistScenes } from "@/lib/scenes/persist-scenes";
import { SceneDetectionError, type SceneReceipt } from "@/lib/scenes/types";

export async function main() {
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
  await workerLifecycle(worker, "scene");
}
