// Isolated disposable Redis server, never the configured application Redis/DB.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Queue, Worker, UnrecoverableError } from "bullmq";
import { createRecapQueue, recapJobId, RECAP_JOB_NAME, type RecapJobData } from "@/lib/queue/recap-queue";
import { retryRecapAtomically } from "@/lib/queue/recap-recovery";
import { recapFailureToken } from "@/lib/recap/recovery";
import type { RecapReceipt } from "@/lib/recap/types";

test("BullMQ atomic retry: duplicate, stale failure, pause, budget, logs and completion fencing", { timeout: 20000 }, async () => {
  const directory = await mkdtemp("/tmp/recap-recovery-test-");
  const socket = join(directory, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no", "--dir", directory], { stdio: ["ignore", "pipe", "ignore"] });
  let queue: ReturnType<typeof createRecapQueue> | undefined;
  let worker: Worker | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Isolated Redis startup timed out")), 5000);
      server.on("error", (error) => { clearTimeout(timer); reject(error); });
      server.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Isolated Redis startup exited: ${code}`)); });
      server.stdout.on("data", (data: Buffer) => { if (/ready to accept connections/i.test(data.toString())) { clearTimeout(timer); resolve(); } });
    });
    const connection = { path: socket, maxRetriesPerRequest: null };
    const name = "isolated-recap-recovery";
    queue = new Queue<RecapJobData, RecapReceipt, typeof RECAP_JOB_NAME>(name, { connection, defaultJobOptions: { attempts: 3, removeOnComplete: false, removeOnFail: false } });
    const id = recapJobId("synthetic-movie", "a".repeat(64));
    await queue.add(RECAP_JOB_NAME, { movieId: "synthetic-movie", sourceHash: "a".repeat(64) }, { jobId: id });
    let executions = 0;
    worker = new Worker(name, async (job) => {
      executions++;
      await job.log(JSON.stringify({ event: "recap_response_validation_failed", errorCode: "RECAP_INVALID_RESPONSE", stage: "OUTPUT_VALIDATION", rule: "TEXT_TOO_LONG" }));
      if (executions <= 2) throw new UnrecoverableError("RECAP_INVALID_RESPONSE");
      return { synthetic: true };
    }, { connection, concurrency: 1 });
    worker.on("error", () => {});
    async function state(expected: string) {
      for (let i = 0; i < 200; i++) {
        const job = await queue!.getJob(id);
        if (job && await job.getState() === expected) return (await queue!.getJob(id))!;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`Expected isolated job state ${expected}`);
    }
    const first = await state("failed");
    await worker.pause(); await queue.pause();
    const token = recapFailureToken(first)!;
    assert.ok(token);
    const results = await Promise.all(Array.from({ length: 12 }, () => retryRecapAtomically(queue!, id, token)));
    assert.equal(results.filter((result) => result === 1).length, 1);
    assert.equal(results.filter((result) => result === 0).length, 11);
    // BullMQ 6 leaves waiting jobs in wait while a globally paused queue gates
    // consumption (paused-list jobs are legacy migration state).
    assert.equal(await queue.isPaused(), true);
    const paused = await state("waiting");
    assert.equal(paused.attemptsMade, 0); assert.equal(paused.attemptsStarted, first.attemptsStarted);
    assert.equal((await queue.getJobLogs(id)).count, 1);
    await queue.resume(); worker.resume();
    const second = await state("failed");
    await worker.pause();
    const newToken = recapFailureToken(second)!;
    assert.notEqual(token, newToken);
    assert.equal(await retryRecapAtomically(queue, id, token), -4);
    assert.equal(await (await queue.getJob(id))!.getState(), "failed");
    assert.equal(executions, 2);
    assert.equal((await queue.getJobLogs(id)).count, 2);
    assert.equal(await retryRecapAtomically(queue, id, newToken), 1);
    await state("waiting"); worker.resume(); await state("completed");
    assert.equal(await retryRecapAtomically(queue, id, newToken), 0);
    assert.equal(executions, 3);
    assert.equal((await queue.getJobLogs(id)).count, 3);
  } finally {
    await worker?.close(true); await queue?.close();
    if (server.exitCode === null) { const exited = new Promise((resolve) => server.once("exit", resolve)); server.kill("SIGTERM"); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
});
