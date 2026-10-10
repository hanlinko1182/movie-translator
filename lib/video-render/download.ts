import "server-only";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { localStorage } from "@/lib/storage";
import { assertRenderScope } from "./api";
import { parseRenderReference } from "./job-contract";
import { validOutputKey, MAX_OUTPUT_BYTES } from "./files";
import { RenderError } from "./contracts";

export async function downloadRender(projectId: string, movieId: string, renderId: string) {
  await assertRenderScope(projectId, movieId);
  parseRenderReference({ renderJobId: renderId, generation: 0 });
  const job = await prisma.renderJob.findFirst({ where: { id: renderId, movieId, movie: { projectId } }, include: { output: true } });
  if (!job) throw new RenderError("RENDER_NOT_FOUND");
  const snapshot = job.snapshot as { recipe?: { projectId?: string } };
  if (snapshot.recipe?.projectId !== projectId) throw new RenderError("RENDER_NOT_FOUND");
  if (job.state !== "COMPLETED" || !job.output?.verifiedAt) throw new RenderError("RENDER_NOT_COMPLETED");
  const receipt = job.output;
  if (!validOutputKey(receipt.storageKey)) throw new RenderError("RENDER_OUTPUT_MISSING");
  // Hash and stream the SAME open file descriptor. GET changes no database,
  // queue or filesystem state. Never trust a stored receipt as disk existence.
  let file;
  try { file = await open(await localStorage.localPath(receipt.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch { throw new RenderError("RENDER_OUTPUT_MISSING"); }
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size <= 0 || before.size > MAX_OUTPUT_BYTES || BigInt(before.size) !== receipt.sizeBytes) throw new Error();
    const buffer = Buffer.alloc(1024 * 1024); const hash = createHash("sha256");
    let position = 0;
    while (position < before.size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, before.size - position), position);
      if (!bytesRead) throw new Error();
      position += bytesRead; hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await file.stat();
    if (hash.digest("hex") !== receipt.sha256 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error();
    const body = Readable.toWeb(file.createReadStream({ start: 0 })) as ReadableStream<Uint8Array>;
    return new Response(body, { headers: { "Content-Type": "video/mp4", "Content-Length": String(before.size),
      "Content-Disposition": `attachment; filename="translated-${renderId}.mp4"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { await file.close(); throw new RenderError("RENDER_OUTPUT_MISSING"); }
}
