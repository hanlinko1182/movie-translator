import "server-only";
import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "./connection";
import { assertSceneMediaReady } from "@/lib/scenes/detect-scenes";
import { SceneDetectionError, type SceneJobStatus, type SceneReceipt } from "@/lib/scenes/types";

export const SCENE_QUEUE_NAME = "movie-scene-detection";
export const SCENE_JOB_NAME = "detect-scenes";
export type SceneJobData = { movieId: string };
export function sceneJobId(movieId: string) { return `scene-detection-${encodeURIComponent(movieId)}`; }
export function createSceneQueue() {
  const queue = new Queue<SceneJobData, SceneReceipt, typeof SCENE_JOB_NAME>(SCENE_QUEUE_NAME, {
    connection: redisConnection("producer"),
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: { count: 1_000 }, removeOnFail: { count: 1_000 } },
  });
  queue.on("error", () => console.error("Scene queue Redis connection failed."));
  return queue;
}
export async function enqueueSceneDetection(movieId: string) {
  await assertSceneMediaReady(movieId);
  const queue = createSceneQueue();
  const jobId = sceneJobId(movieId);
  try {
    await queue.waitUntilReady();
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "failed") throw new SceneDetectionError("SCENE_JOB_FAILED");
      return { movieId, jobId, state };
    }
    const job = await queue.add(SCENE_JOB_NAME, { movieId }, { jobId });
    return { movieId, jobId, state: await job.getState() };
  } finally { await queue.close().catch(() => console.error("Scene queue connection could not close.")); }
}
export async function getSceneDetectionJob(movieId: string): Promise<SceneJobStatus | null> {
  if (!await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } })) throw new SceneDetectionError("MOVIE_NOT_FOUND");
  const queue = createSceneQueue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(sceneJobId(movieId));
    if (!job) return null;
    const state = await job.getState();
    const receipt = job.returnvalue;
    return { jobId: job.id!, state, attemptsMade: job.attemptsMade,
      ...(state === "completed" && receipt ? { result: { movieId: receipt.movieId, sceneCount: receipt.sceneCount, durationMs: receipt.durationMs, visualCandidateCount: receipt.visualCandidateCount, transcriptGapCandidateCount: receipt.transcriptGapCandidateCount } } : {}),
      ...(state === "failed" ? { error: "Scene detection failed. Inspect worker configuration or source media." } : {}),
    };
  } finally { await queue.close().catch(() => console.error("Scene queue connection could not close.")); }
}
