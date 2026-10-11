// Opt-in browser QA using copies of two existing authorized uploads. No queues,
// encoding or provider calls. Send "cleanup" on stdin when browser checks finish.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { prisma, disconnectPrisma } from "@/lib/prisma";
import { createMovieStorageKey, localStorage } from "@/lib/storage";

async function main() {
  if (process.env.SOURCE_VIDEO_BROWSER_FIXTURE !== "1") return;
  const sourceIds = process.argv.slice(2);
  if (sourceIds.length !== 2) throw new Error("Pass two existing authorized movie IDs.");
  const id = `source-preview-${randomUUID()}`;
  const keys: string[] = [];
  try {
    const sources = await Promise.all(sourceIds.map((sourceId) => prisma.movie.findUniqueOrThrow({ where: { id: sourceId } })));
    if (sources.some((source) => !source.storageKey?.endsWith(".mp4"))) throw new Error("Both sources must be recorded MP4 uploads.");
    for (const source of sources) {
      const key = createMovieStorageKey(".mp4"); keys.push(key);
      await localStorage.put(key, await localStorage.open(source.storageKey!));
    }
    const missingKey = createMovieStorageKey(".mp4"); keys.push(missingKey);
    await prisma.project.create({ data: { id, slug: id, name: "Disposable source preview QA" } });
    const movies = [];
    for (const [index, key] of keys.entries()) {
      movies.push(await prisma.movie.create({ data: {
        projectId: id, title: ["Older selected source", "Newer source", "Missing source file"][index],
        filename: "preview-qa.mp4", storageKey: key,
        createdAt: new Date(`2020-01-0${index + 1}`),
      }, select: { id: true, title: true } }));
    }
    const renderCount = await prisma.renderJob.count({ where: { movie: { projectId: id } } });
    console.log(JSON.stringify({ projectId: id, movies, url: `http://127.0.0.1:3000/projects/${id}/subtitles?movieId=${movies[0].id}` }));
    const input = createInterface({ input: process.stdin });
    for await (const line of input) { if (line.trim() === "cleanup") { input.close(); break; } }
    if (await prisma.renderJob.count({ where: { movie: { projectId: id } } }) !== renderCount) throw new Error("Render job count changed during read-only browser QA.");
  } finally {
    try {
      await prisma.movie.deleteMany({ where: { projectId: id } });
      await prisma.project.deleteMany({ where: { id } });
    } finally {
      try { for (const key of keys) await localStorage.delete(key); }
      finally { await disconnectPrisma(); }
    }
    console.log("Disposable source-preview records/files cleaned up.");
  }
}

main().catch(() => { console.error("Source-preview browser fixture failed."); process.exitCode = 1; });
