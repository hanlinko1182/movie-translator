import "server-only";
import fs from "node:fs/promises";
import { constants, type BigIntStats } from "node:fs";
import path from "node:path";
import { deny, exact, INTAKE, NarrationIntakeError } from "./contracts";
import { measureNarrationWav } from "./wav";

export type PrivateFileAuthorization = Readonly<{ authorization: "EXPLICIT_LOCAL_READ_ONLY";
  authorizedPath: string; privateRoot: string; repositoryRoot: string }>;
const within = (root: string, file: string) => file === root || file.startsWith(root + path.sep);
const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
  a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.mode === b.mode && a.nlink === b.nlink;
async function noLinks(file: string) {
  let current = path.parse(file).root;
  for (const part of file.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) deny("SYMLINK_DENIED");
  }
}
/** Privileged LOCAL composition seam only. The trusted caller must obtain explicit owner authorization
 * before constructing this closure. No HTTP/session auth, environment lookup or path-returning API. */
export function authorizePrivateWavInspection(configuration: PrivateFileAuthorization) {
  const c = exact(configuration, ["authorization", "authorizedPath", "privateRoot", "repositoryRoot"]);
  if (c.authorization !== "EXPLICIT_LOCAL_READ_ONLY") deny("PATH_AUTHORIZATION_REQUIRED");
  for (const key of ["authorizedPath", "privateRoot", "repositoryRoot"] as const) {
    const value = c[key];
    if (typeof value !== "string" || value.length > 4096 || value.includes("\0") || !path.isAbsolute(value) ||
      path.normalize(value) !== value || value.split(path.sep).some(p => p === "." || p === "..")) deny("INVALID_PRIVATE_PATH");
  }
  const file = c.authorizedPath as string, root = c.privateRoot as string, repository = c.repositoryRoot as string;
  if (root === path.parse(root).root || file === root || !within(root, file) || within(repository, file) ||
    within(repository, root) || within(root, repository)) deny("INVALID_PRIVATE_PATH");
  let consumed = false;
  return Object.freeze({ async inspect() {
    if (consumed) deny("INSPECTION_CONSUMED"); consumed = true;
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      await noLinks(file); await noLinks(repository);
      const beforePath = await fs.lstat(file, { bigint: true });
      if (!beforePath.isFile() || beforePath.nlink !== BigInt(1)) deny("NOT_PRIVATE_REGULAR_FILE");
      // O_NOFOLLOW is mandatory. Unsupported platforms fail closed, never drop it.
      if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK) deny("UNSUPPORTED_FILE_SAFETY");
      handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || !same(before, beforePath)) deny("FILE_CHANGED");
      if (before.size < BigInt(46) || before.size > BigInt(INTAKE.maxFileBytes)) deny("BYTE_LIMIT");
      const bytes = Buffer.alloc(Number(before.size) + 1); let count = 0;
      while (count < bytes.length) {
        const read = await handle.read(bytes, count, bytes.length - count, count);
        if (!read.bytesRead) break; count += read.bytesRead;
      }
      const after = await handle.stat({ bigint: true });
      await noLinks(file);
      const afterPath = await fs.lstat(file, { bigint: true });
      if (count !== Number(before.size) || !same(before, after) || !same(before, afterPath)) deny("FILE_CHANGED");
      return measureNarrationWav(bytes.subarray(0, count));
    } catch (error) {
      if (error instanceof NarrationIntakeError) throw error;
      return deny("PRIVATE_FILE_UNAVAILABLE");
    } finally {
      if (handle) { try { await handle.close(); } catch { deny("PRIVATE_FILE_UNAVAILABLE"); } }
    }
  } });
}
