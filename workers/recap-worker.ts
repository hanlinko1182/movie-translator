import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection, RedisConfigurationError } from "@/lib/queue/connection";
import { RECAP_JOB_NAME, RECAP_QUEUE_NAME, recapJobId, type RecapJobData } from "@/lib/queue/recap-queue";
import { generateMovieRecap } from "@/lib/recap/generate-recap";
import { persistRecap } from "@/lib/recap/persist-recap";
import { recoverRecapReceipt } from "@/lib/recap/read-recap";
import { recapModel } from "@/lib/recap";
import { RecapError, type RecapReceipt } from "@/lib/recap/types";

async function main() {
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
  worker.on("active", (job) => console.info("Recap job active:", job.id));
  worker.on("completed", (job) => console.info("Recap job completed:", job.id));
  worker.on("failed", (job) => { if (job) console.error("Recap job failed:", job.id, "attempts:", job.attemptsMade); });
  worker.on("stalled", (id) => console.warn("Recap job stalled; recovery scheduled:", id));
  worker.on("error", () => console.error("Recap worker connection/lifecycle error; check Redis connectivity."));
  let closing = false;
  async function close() { if (closing) return; closing = true; await worker.close(); await prisma.$disconnect(); }
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void close().catch(() => { console.error("Recap worker shutdown failed."); process.exitCode = 1; }); });
  await worker.waitUntilReady();
  console.info("Recap worker ready:", RECAP_QUEUE_NAME);
}
void main().catch((error: unknown) => { console.error(error instanceof RedisConfigurationError ? error.message : "Recap worker failed to start."); process.exitCode = 1; });
