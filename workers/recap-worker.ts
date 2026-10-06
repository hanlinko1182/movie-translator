import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";
import { RECAP_JOB_NAME, RECAP_QUEUE_NAME, recapJobId, type RecapJobData } from "@/lib/queue/recap-queue";
import { generateMovieRecap } from "@/lib/recap/generate-recap";
import { persistRecap } from "@/lib/recap/persist-recap";
import { recoverRecapReceipt } from "@/lib/recap/read-recap";
import { recapModel } from "@/lib/recap";
import { RecapError, type RecapReceipt } from "@/lib/recap/types";

export async function main() {
  const worker = new Worker<RecapJobData, RecapReceipt, typeof RECAP_JOB_NAME>(RECAP_QUEUE_NAME, async (job) => {
    if (job.name !== RECAP_JOB_NAME || typeof job.data?.movieId !== "string" || !job.data.movieId || !/^[a-f0-9]{64}$/.test(job.data?.sourceHash ?? "") || job.id !== recapJobId(job.data.movieId, job.data.sourceHash)) throw new UnrecoverableError("RECAP_JOB_INVALID");
    try {
      const receipt = await recoverRecapReceipt(job.data.movieId, job.data.sourceHash, recapModel());
      if (receipt) return receipt;
      const { result, source } = await generateMovieRecap(job.data.movieId, job.data.sourceHash);
      return await persistRecap(result, source);
    } catch (error) {
      const code = error instanceof RecapError ? error.code : "RECAP_PROCESSING_FAILED";
      if (error instanceof RecapError && error.code !== "RECAP_PROVIDER_ERROR") throw new UnrecoverableError(code);
      throw new Error(code);
    }
  }, { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 });
  await workerLifecycle(worker, "recap");
}
