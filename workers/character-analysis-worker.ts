import { workerLifecycle } from "@/lib/worker-runtime";
import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "@/lib/queue/connection";
import { CHARACTER_JOB_NAME, CHARACTER_QUEUE_NAME, characterJobId, type CharacterJobData } from "@/lib/queue/character-queue";
import { analyzeMovieCharacters } from "@/lib/character-analysis/analyze-movie";
import { persistCharacterAnalysis } from "@/lib/character-analysis/persist-analysis";
import { recoverCharacterReceipt } from "@/lib/character-analysis/read-analysis";
import { characterModel } from "@/lib/character-analysis";
import { CharacterAnalysisError, type AnalysisReceipt } from "@/lib/character-analysis/types";

export async function main() {
  const worker = new Worker<CharacterJobData, AnalysisReceipt, typeof CHARACTER_JOB_NAME>(CHARACTER_QUEUE_NAME, async (job) => {
    if (job.name !== CHARACTER_JOB_NAME || typeof job.data?.movieId !== "string" || !job.data.movieId || !/^[a-f0-9]{64}$/.test(job.data?.sourceHash ?? "") || job.id !== characterJobId(job.data.movieId, job.data.sourceHash)) throw new UnrecoverableError("CHARACTER_JOB_INVALID");
    try {
      const receipt = await recoverCharacterReceipt(job.data.movieId, job.data.sourceHash, characterModel());
      if (receipt) return receipt;
      const { result, source } = await analyzeMovieCharacters(job.data.movieId, job.data.sourceHash);
      return await persistCharacterAnalysis(result, source);
    } catch (error) {
      const code = error instanceof CharacterAnalysisError ? error.code : "CHARACTER_PROCESSING_FAILED";
      if (error instanceof CharacterAnalysisError && error.code !== "CHARACTER_PROVIDER_ERROR") throw new UnrecoverableError(code);
      throw new Error(code);
    }
  }, { connection: redisConnection("worker"), concurrency: 1, maxStalledCount: 1, stalledInterval: 30_000 });
  await workerLifecycle(worker, "character");
}
