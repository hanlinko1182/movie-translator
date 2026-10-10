import "server-only";
import { readdir, lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { localStorage } from "@/lib/storage";
import { cleanOldAttempts, MAX_RUNTIME_MS, renderDirectories, validOutputKey } from "./files";

export async function cleanupTerminalPublication(id: string) {
  const key = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RenderJob" WHERE id = ${id} FOR UPDATE`;
    const job = await tx.renderJob.findUnique({ where: { id }, include: { dispatch: true } });
    if (!job || !["FAILED", "CANCELLED"].includes(job.state)) return null;
    const candidate = job.dispatch?.publication as { storageKey?: string } | null;
    if (!candidate || !validOutputKey(candidate.storageKey)) return null;
    await tx.renderDispatch.update({ where: { renderJobId: id }, data: { publication: Prisma.DbNull } });
    return candidate.storageKey;
  });
  if (key) await localStorage.delete(key);
}
let outputOffset = 0;
export async function cleanupRenderStorage() {
  const terminal = await prisma.renderDispatch.findMany({ where: { renderJob: { state: { in: ["FAILED", "CANCELLED"] } }, publication: { not: Prisma.DbNull } }, select: { renderJobId: true }, take: 20 });
  for (const row of terminal) await cleanupTerminalPublication(row.renderJobId);
  await cleanOldAttempts();
  const { outputs } = await renderDirectories();
  const entries = await readdir(outputs, { withFileTypes: true });
  if (outputOffset >= entries.length) outputOffset = 0;
  const batch = entries.slice(outputOffset, outputOffset + 50); outputOffset += batch.length;
  for (const entry of batch) {
    const path = join(outputs, entry.name);
    if ((await lstat(path)).mtimeMs > Date.now() - MAX_RUNTIME_MS - 3600000) continue;
    if (entry.isDirectory() && !entry.isSymbolicLink() && /^\.upload-[a-zA-Z0-9]{6}$/.test(entry.name)) {
      await rm(path, { recursive: true, force: true }); continue;
    }
    const key = `renders/${entry.name}`;
    if (!validOutputKey(key) || !entry.isFile() || entry.isSymbolicLink()) continue;
    if (await prisma.renderOutput.count({ where: { storageKey: key } }) || await prisma.renderDispatch.count({ where: { publication: { path: ["storageKey"], equals: key } } })) continue;
    await localStorage.delete(key);
  }
}
