import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";
import { REFINEMENT_JOB_NAME, REFINEMENT_QUEUE_NAME } from "@/lib/queue/refinement-queue";
import { retranslateSegmentsWithSol, type RefinementJobData } from "@/lib/translation-refinement/service";
import type { RefinementReceipt } from "@/lib/translation-qc/types";
import { TranslationError } from "@/lib/translation/types";

export async function main() {
  const worker = new Worker<RefinementJobData, RefinementReceipt, typeof REFINEMENT_JOB_NAME>(REFINEMENT_QUEUE_NAME, async (job) => {
    if (job.name !== REFINEMENT_JOB_NAME || typeof job.data?.movieId !== "string" || typeof job.data.snapshotHash !== "string" || typeof job.data.translationId !== "string" || !Number.isInteger(job.data.revision)) throw new UnrecoverableError("INVALID_REFINEMENT_JOB");
    try { return await retranslateSegmentsWithSol(job.data, job.id!); }
    catch (error) {
      const code = error instanceof TranslationError ? error.code : "REFINEMENT_PROCESSING_FAILED";
      if (error instanceof TranslationError && error.code !== "TRANSLATION_PROVIDER_ERROR") throw new UnrecoverableError(code);
      throw new Error(code);
    }
  }, { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 });
  await workerLifecycle(worker, "refinement");
}
