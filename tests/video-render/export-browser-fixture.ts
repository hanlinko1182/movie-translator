// Opt-in disposable browser QA fixture. No provider calls. Commands on stdin:
// render = process only this fixture's explicitly submitted jobs; cleanup = exit.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { prisma, disconnectPrisma } from "@/lib/prisma";
import { createMovieStorageKey, localStorage } from "@/lib/storage";
import { createRenderQueue, createRenderTransport } from "@/lib/queue/render-queue";
import { createRenderWorker } from "@/workers/render-worker";
import { renderQueueJobId } from "@/lib/video-render/job-contract";
import { sourceTextHash } from "@/lib/translation-memory/hash";

async function main() {
  if (process.env.RUN_EXPORT_BROWSER_FIXTURE !== "1") return;
  const id = `export-browser-${randomUUID()}`;
  const sourceKey = createMovieStorageKey(".mp4");
  const directory = await mkdtemp("/tmp/movie-translator-export-browser-");
  const queue = createRenderQueue(id);
  const productionQueue = createRenderQueue();
  let worker: ReturnType<typeof createRenderWorker> | undefined;
  try {
    await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=0x183044:s=640x360:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6", "-c:v", "libx264", "-preset", "ultrafast", "-threads:v", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-threads:a", "1", join(directory, "source.mp4")], { timeout: 30000 });
    await localStorage.put(sourceKey, Readable.from(await readFile(join(directory, "source.mp4"))));
    await prisma.project.create({ data: { id, slug: id, name: "Disposable Export browser QA" } });
    const movie = await prisma.movie.create({ data: { projectId: id, title: "Older selected six-second movie", filename: "browser-fixture.mp4", storageKey: sourceKey, durationSeconds: 6, createdAt: new Date("2026-01-01") } });
    const newer = await prisma.movie.create({ data: { projectId: id, title: "Newer movie without translation" } });
    const transcript = await prisma.transcript.create({ data: { movieId: movie.id, provider: "fixture", model: "fixture", text: "你好\n谢谢", segments: { create: [{ sequence: 0, startMs: 0, endMs: 1500, text: "你好" }, { sequence: 1, startMs: 4000, endMs: 5800, text: "谢谢" }] } } });
    await prisma.translation.create({ data: { movieId: movie.id, sourceTranscriptId: transcript.id, provider: "fixture", model: "fixture", sourceLanguage: "zh", targetLanguage: "my", segments: { create: [{ sequence: 0, startMs: 0, endMs: 1500, text: "မင်္ဂလာပါ။", origin: "MANUAL", manualSourceHash: sourceTextHash("你好"), reviewStatus: "APPROVED" }, { sequence: 1, startMs: 4000, endMs: 5800, text: "ကျေးဇူးတင်ပါတယ်။", reviewStatus: "NEEDS_REVIEW" }] } } });
    console.log(JSON.stringify({ projectId: id, olderMovieId: movie.id, newerMovieId: newer.id, url: `http://127.0.0.1:3000/projects/${id}/export?movieId=${movie.id}` }));
    const input = createInterface({ input: process.stdin });
    for await (const line of input) {
      if (line.trim() === "cleanup") {
        input.close(); break;
      }
      assert.equal(await prisma.renderJob.count({ where: { movieId: newer.id } }), 0, "GET/newer movie navigation must not create jobs");
      if (line.trim() !== "render") continue;
      const jobs = await prisma.renderJob.findMany({ where: { movieId: movie.id, state: "QUEUED", dispatch: { deferredAt: null } }, select: { id: true, generation: true } });
      const transport = createRenderTransport(id);
      for (const job of jobs) await transport.publish({ renderJobId: job.id, generation: job.generation });
      await transport.close();
      worker = createRenderWorker(id); worker.on("error", () => {}); await worker.waitUntilReady();
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && await prisma.renderJob.count({ where: { id: { in: jobs.map((job) => job.id) }, state: { in: ["QUEUED", "ACTIVE"] } } })) await new Promise((resolve) => setTimeout(resolve, 100));
      await worker.close(); worker = undefined;
      console.log(JSON.stringify({ results: await prisma.renderJob.findMany({ where: { movieId: movie.id }, select: { id: true, state: true, scope: true, generation: true } }) }));
    }
  } finally {
    if (worker) await worker.close();
    const jobs = await prisma.renderJob.findMany({ where: { movie: { projectId: id } }, include: { output: true } });
    for (const job of jobs) {
      for (let generation = 0; generation <= job.generation; generation++) {
        const receipt = await productionQueue.getJob(renderQueueJobId({ renderJobId: job.id, generation }));
        if (receipt) await receipt.remove();
      }
      if (job.output) await localStorage.delete(job.output.storageKey);
    }
    await queue.obliterate(); await Promise.all([queue.close(), productionQueue.close()]);
    await prisma.movie.deleteMany({ where: { projectId: id } }); await prisma.project.deleteMany({ where: { id } });
    await localStorage.delete(sourceKey); await rm(directory, { recursive: true }); await disconnectPrisma();
    console.log("Disposable browser fixture cleaned up.");
  }
}
main().catch(() => { console.error("Browser fixture failed; inspect its temporary project before retrying."); process.exitCode = 1; });
