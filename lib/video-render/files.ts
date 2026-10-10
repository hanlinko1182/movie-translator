import "server-only";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, mkdtemp, rm, readdir, statfs } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { localStorage } from "@/lib/storage";
import { RenderError } from "./contracts";

export const MAX_SOURCE_BYTES = 8 * 1024 ** 3;
export const MAX_OUTPUT_BYTES = 32 * 1024 ** 3;
export const MAX_RUNTIME_MS = 24 * 60 * 60 * 1000;
export async function renderDirectories() {
  await localStorage.check();
  for (const name of ["renders", "render-attempts"]) {
    const path = join(localStorage.root, name);
    await mkdir(path, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw new RenderError("STORAGE_UNAVAILABLE");
    await chmod(path, 0o700);
  }
  return { attempts: join(localStorage.root, "render-attempts"), outputs: join(localStorage.root, "renders") };
}
export async function createAttemptDirectory() {
  const { attempts } = await renderDirectories();
  return mkdtemp(join(attempts, "attempt-"));
}
export function newOutputKey() { return `renders/${randomUUID()}.mp4`; }
export function validOutputKey(key: unknown): key is string {
  return typeof key === "string" && /^renders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/.test(key);
}
export async function hashFile(path: string, maxBytes = MAX_OUTPUT_BYTES) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size <= BigInt(0) || before.size > BigInt(maxBytes)) throw new RenderError("OUTPUT_INVALID");
    const hash = createHash("sha256"); const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (position < Number(before.size)) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, Number(before.size) - position), position);
      if (!bytesRead) throw new RenderError("OUTPUT_INVALID");
      hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if ([after, current].some((item) => !item.isFile() || item.ino !== before.ino || item.dev !== before.dev || item.size !== before.size || item.mtimeNs !== before.mtimeNs || item.ctimeNs !== before.ctimeNs)) throw new RenderError("OUTPUT_INVALID");
    return { sha256: hash.digest("hex"), sizeBytes: position };
  } finally { await file.close(); }
}
export async function assertDiskBudget(sourceBytes: number) {
  const stats = await statfs(localStorage.root);
  const outputLimit = Math.min(MAX_OUTPUT_BYTES, Math.max(256 * 1024 ** 2, sourceBytes * 4));
  if (stats.bavail * stats.bsize < sourceBytes + outputLimit + 64 * 1024 ** 2) throw new RenderError("RENDER_RESOURCE_LIMIT");
  return outputLimit;
}
// Only old private scratch directories are removed. Never infer output retention
// from Redis receipts; durable output/candidate keys are reconciled separately.
export async function cleanOldAttempts() {
  const { attempts } = await renderDirectories();
  const entries = (await readdir(attempts, { withFileTypes: true })).slice(0, 100);
  for (const entry of entries) {
    if (!/^attempt-[a-zA-Z0-9]{6}$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const path = join(attempts, entry.name);
    if ((await lstat(path)).mtimeMs < Date.now() - MAX_RUNTIME_MS - 60 * 60 * 1000) await rm(path, { recursive: true, force: true });
  }
}
