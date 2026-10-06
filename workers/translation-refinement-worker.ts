import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import { REFINEMENT_JOB_NAME, REFINEMENT_QUEUE_NAME } from "@/lib/queue/refinement-queue";
import { retranslateSegmentsWithSol, type RefinementJobData } from "@/lib/translation-refinement/service";
import type { RefinementReceipt } from "@/lib/translation-qc/types";
import { TranslationError } from "@/lib/translation/types";

async function main() {
  const worker = new Worker<RefinementJobData, RefinementReceipt, typeof REFINEMENT_JOB_NAME>(REFINEMENT_QUEUE_NAME, async (job) => {
    if (job.name !== REFINEMENT_JOB_NAME || typeof job.data?.movieId !== "string" || typeof job.data.snapshotHash !== "string" || typeof job.data.translationId !== "string" || !Number.isInteger(job.data.revision)) throw new UnrecoverableError("INVALID_REFINEMENT_JOB");
    try { return await retranslateSegmentsWithSol(job.data, job.id!); }
    catch (error) {
      const code = error instanceof TranslationError ? error.code : "REFINEMENT_PROCESSING_FAILED";
      if (error instanceof TranslationError && error.code !== "TRANSLATION_PROVIDER_ERROR") throw new UnrecoverableError(code);
      throw new Error(code);
    }
  }, { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 });
  worker.on("active", (job) => console.info("Refinement job active:", job.id));
  worker.on("completed", (job) => console.info("Refinement job completed:", job.id));
  worker.on("failed", (job) => { if (job) console.error("Refinement job failed:", job.id, "attempts:", job.attemptsMade); });
  worker.on("error", () => console.error("Refinement worker connection/lifecycle error."));
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
    if (closing) return; closing = true;
    void worker.close().then(() => prisma.$disconnect()).catch(() => { console.error("Refinement worker shutdown failed."); process.exitCode = 1; });
  });
  await worker.waitUntilReady();
  console.info("Refinement worker ready:", REFINEMENT_QUEUE_NAME);
}
void main().catch(() => { console.error("Refinement worker could not start; check configuration and connectivity."); process.exitCode = 1; });
