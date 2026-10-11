import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { log } from "@/lib/logger";
import { redisConnection } from "@/lib/queue/connection";
import { RECAP_JOB_NAME, RECAP_QUEUE_NAME, recapJobId, type RecapJobData } from "@/lib/queue/recap-queue";
import { generateMovieRecap } from "@/lib/recap/generate-recap";
import { persistRecap } from "@/lib/recap/persist-recap";
import { recoverRecapReceipt } from "@/lib/recap/read-recap";
import { recapModel } from "@/lib/recap";
import { RecapError, type RecapReceipt } from "@/lib/recap/types";
import { RecapResponseValidationError, recapValidationLog } from "@/lib/recap/diagnostics";

type RecapWorkerJob = Pick<Job<RecapJobData, RecapReceipt, typeof RECAP_JOB_NAME>, "name" | "data" | "id" | "log">;
type Dependencies = { recover: typeof recoverRecapReceipt; model: typeof recapModel; generate: typeof generateMovieRecap; persist: typeof persistRecap };
const dependencies: Dependencies = { recover: recoverRecapReceipt, model: recapModel, generate: generateMovieRecap, persist: persistRecap };

export async function processRecapJob(job: RecapWorkerJob, deps: Dependencies = dependencies): Promise<RecapReceipt> {
  if (job.name !== RECAP_JOB_NAME || typeof job.data?.movieId !== "string" || !job.data.movieId || !/^[a-f0-9]{64}$/.test(job.data?.sourceHash ?? "") || job.id !== recapJobId(job.data.movieId, job.data.sourceHash)) throw new UnrecoverableError("RECAP_JOB_INVALID");
  try {
    const receipt = await deps.recover(job.data.movieId, job.data.sourceHash, deps.model());
    if (receipt) return receipt;
    const { result, source } = await deps.generate(job.data.movieId, job.data.sourceHash);
    return await deps.persist(result, source);
  } catch (error) {
    const code = error instanceof RecapError ? error.code : "RECAP_PROCESSING_FAILED";
    if (error instanceof RecapError && error.code === "RECAP_INVALID_RESPONSE") {
      const diagnostic = error instanceof RecapResponseValidationError ? error.diagnostic : { stage: "WORKER", rule: "UNSPECIFIED_VALIDATION_FAILURE" } as const;
      const entry = recapValidationLog(diagnostic, job.id);
      // Do not retain the original error/cause: SDK errors may include secrets.
      console.error(JSON.stringify(entry));
      await job.log(JSON.stringify(entry)).catch(() => log("error", "recap_diagnostic_persistence_failed", { jobId: entry.jobId }));
      const terminal = Object.assign(new UnrecoverableError(code), { diagnostic: entry });
      // BullMQ persists stacktrace automatically; keep private source paths out.
      terminal.stack = `UnrecoverableError: ${code}`;
      throw terminal;
    }
    if (error instanceof RecapError && error.code !== "RECAP_PROVIDER_ERROR") throw new UnrecoverableError(code);
    throw new Error(code);
  }
}

export async function main() {
  const worker = new Worker<RecapJobData, RecapReceipt, typeof RECAP_JOB_NAME>(RECAP_QUEUE_NAME, (job) => processRecapJob(job), { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 });
  await workerLifecycle(worker, "recap");
}
