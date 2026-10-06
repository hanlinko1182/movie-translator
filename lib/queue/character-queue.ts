import { log } from "@/lib/logger";
import "server-only";
import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "./connection";
import { loadCharacterSource } from "@/lib/character-analysis/source";
import { getCharacterProvider } from "@/lib/character-analysis";
import { CharacterAnalysisError, type AnalysisReceipt } from "@/lib/character-analysis/types";

export const CHARACTER_QUEUE_NAME = "movie-character-analysis";
export const CHARACTER_JOB_NAME = "analyze-characters";
export type CharacterJobData = { movieId: string; sourceHash: string };
export function characterJobId(movieId: string, sourceHash: string) { return `character-analysis-${encodeURIComponent(movieId)}-${sourceHash}`; }
export function createCharacterQueue() {
  const queue = new Queue<CharacterJobData, AnalysisReceipt, typeof CHARACTER_JOB_NAME>(CHARACTER_QUEUE_NAME, { connection: redisConnection("producer"), defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } } });
  queue.on("error", () => log("error", "queue_character_queue_diagnostic"));
  return queue;
}
export async function enqueueCharacterAnalysis(movieId: string) {
  const source = await loadCharacterSource(movieId);
  getCharacterProvider(); // Validate configuration without contacting the provider.
  const queue = createCharacterQueue();
  const jobId = characterJobId(movieId, source.sourceHash);
  try {
    await queue.waitUntilReady();
    const existing = await queue.getJob(jobId);
    if (existing && await existing.getState() === "failed") throw new CharacterAnalysisError("CHARACTER_JOB_FAILED");
    const job = existing ?? await queue.add(CHARACTER_JOB_NAME, { movieId, sourceHash: source.sourceHash }, { jobId });
    return { movieId, jobId, state: await job.getState() };
  } finally { await queue.close().catch(() => log("error", "queue_character_queue_diagnostic")); }
}
export async function getCharacterJob(movieId: string, requestedId?: string | null) {
  if (!await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } })) throw new CharacterAnalysisError("MOVIE_NOT_FOUND");
  let jobId = requestedId;
  if (jobId) {
    const prefix = `character-analysis-${encodeURIComponent(movieId)}-`;
    if (!jobId.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(jobId.slice(prefix.length))) throw new CharacterAnalysisError("CHARACTER_JOB_INVALID");
  } else jobId = characterJobId(movieId, (await loadCharacterSource(movieId)).sourceHash);
  const queue = createCharacterQueue();
  try {
    await queue.waitUntilReady();
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    const receipt = job.returnvalue;
    return { jobId: job.id!, state, attemptsMade: job.attemptsMade,
      ...(state === "completed" && receipt ? { result: { movieId: receipt.movieId, analysisRunId: receipt.analysisRunId, characterCount: receipt.characterCount, relationshipCount: receipt.relationshipCount, evidenceCount: receipt.evidenceCount, provider: receipt.provider, model: receipt.model, runtimeMs: receipt.runtimeMs, modelCalls: receipt.modelCalls, usage: receipt.usage } } : {}),
      ...(state === "failed" ? { error: "Character analysis failed. Inspect worker configuration and source data." } : {}),
    };
  } finally { await queue.close().catch(() => log("error", "queue_character_queue_diagnostic")); }
}
export type CharacterJobStatus = Awaited<ReturnType<typeof getCharacterJob>>;
