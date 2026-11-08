import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { BigIntStats } from "node:fs";
import type { TestContext } from "node:test";
import { authorizePrivateVideoSourceInspection, VIDEO_SOURCE_INTAKE as V, VideoSourceIntakeError } from "../../../lib/storyline/video-source-intake";

/** Newly authored arbitrary NON-MEDIA bytes, never a movie/audio fixture. */
export function bytes(length = V.chunkBytes * 2 + 317) {
  const b = Buffer.alloc(length); for (let i = 0; i < b.length; i++) b[i] = (i * 29 + 53) % 251; return b;
}
export async function fixture(t: TestContext, length?: number) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "story-video-intake-owned-"));
  await fs.writeFile(path.join(parent, "ownership-marker"), "M10-04B synthetic non-media only", { flag: "wx", mode: 0o600 });
  t.after(async () => { assert.equal(await fs.readFile(path.join(parent, "ownership-marker"), "utf8"), "M10-04B synthetic non-media only"); await fs.rm(parent, { recursive: true }); });
  const root = path.join(parent, "private"); await fs.mkdir(root, { mode: 0o700 });
  const file = path.join(root, "non-media-source.blob"), content = bytes(length); await fs.writeFile(file, content, { flag: "wx", mode: 0o600 });
  const config = { authorization: "EXPLICIT_LOCAL_READ_ONLY" as const, privateRoot: root, repositoryRoot: process.cwd(), authorizedPath: file, provenance: "OWNER_REPORTED_SOURCE" as const };
  return { parent, root, file, content, config, inspect: async () => (await authorizePrivateVideoSourceInspection(config)).inspect() };
}
export const denied = (e: unknown) => e instanceof VideoSourceIntakeError && !String(e).includes("/");
export function changedStat(original: BigIntStats, fields: Record<string, unknown>): BigIntStats {
  const result = Object.create(original); for (const [key, value] of Object.entries(fields)) Object.defineProperty(result, key, { value, enumerable: true }); return result;
}
