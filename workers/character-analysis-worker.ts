import "dotenv/config";
import "server-only";
import { UnrecoverableError, Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection, RedisConfigurationError } from "@/lib/queue/connection";
import { CHARACTER_JOB_NAME, CHARACTER_QUEUE_NAME, characterJobId, type CharacterJobData } from "@/lib/queue/character-queue";
import { analyzeMovieCharacters } from "@/lib/character-analysis/analyze-movie";
import { persistCharacterAnalysis } from "@/lib/character-analysis/persist-analysis";
import { recoverCharacterReceipt } from "@/lib/character-analysis/read-analysis";
import { characterModel } from "@/lib/character-analysis";
import { CharacterAnalysisError, type AnalysisReceipt } from "@/lib/character-analysis/types";

async function main() {
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
  worker.on("active", (job) => console.info("Character job active:", job.id));
  worker.on("completed", (job) => console.info("Character job completed:", job.id));
  worker.on("failed", (job) => { if (job) console.error("Character job failed:", job.id, "attempts:", job.attemptsMade); });
  worker.on("stalled", (id) => console.warn("Character job stalled; recovery scheduled:", id));
  worker.on("error", () => console.error("Character worker connection/lifecycle error; check Redis connectivity."));
  let closing = false;
  async function close() { if (closing) return; closing = true; await worker.close(); await prisma.$disconnect(); }
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void close().catch(() => { console.error("Character worker shutdown failed."); process.exitCode = 1; }); });
  await worker.waitUntilReady();
  console.info("Character worker ready:", CHARACTER_QUEUE_NAME);
}
void main().catch((error: unknown) => { console.error(error instanceof RedisConfigurationError ? error.message : "Character worker failed to start."); process.exitCode = 1; });
