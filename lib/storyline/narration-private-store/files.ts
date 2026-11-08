import "server-only";
import fs from "node:fs/promises";
import { constants as C, type BigIntStats } from "node:fs";
import path from "node:path";
import { INTAKE } from "../narration-intake";
import { deny, exact, type StoreConfiguration } from "./contracts";

export const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
  a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.mode === b.mode && a.nlink === b.nlink && a.uid === b.uid;
export const inside = (root: string, file: string) => root === file || file.startsWith(root + path.sep);
export function config(value: StoreConfiguration): StoreConfiguration {
  const c = exact(value, ["root", "repositoryRoot", "trust"]);
  if (c.trust !== "TRUSTED_LOCAL_OPERATOR") deny("TRUST_REQUIRED");
  for (const k of ["root", "repositoryRoot"] as const) {
    const v = c[k]; if (typeof v !== "string" || v.length > 4096 || v.includes("\0") || !path.isAbsolute(v) || path.normalize(v) !== v || path.resolve(v) !== v) deny("INVALID_ROOT");
  }
  const root = c.root as string, repositoryRoot = c.repositoryRoot as string;
  if (root === path.parse(root).root || repositoryRoot === path.parse(repositoryRoot).root || inside(root, repositoryRoot) || inside(repositoryRoot, root)) deny("ROOT_OVERLAP");
  if (!C.O_NOFOLLOW || !C.O_NONBLOCK || !C.O_DIRECTORY || typeof process.geteuid !== "function") deny("UNSUPPORTED_FILESYSTEM");
  return Object.freeze({ root, repositoryRoot, trust: "TRUSTED_LOCAL_OPERATOR" });
}
export async function noLinks(file: string) {
  let p = path.parse(file).root;
  for (const part of file.slice(p.length).split(path.sep)) {
    p = path.join(p, part); if ((await fs.lstat(p)).isSymbolicLink()) deny("SYMLINK_DENIED");
  }
}
export async function directory(file: string): Promise<BigIntStats> {
  await noLinks(file); const s = await fs.lstat(file, { bigint: true });
  if (!s.isDirectory() || Number(s.mode & BigInt(0o7777)) !== 0o700 || s.uid !== BigInt(process.geteuid!())) deny("DIRECTORY_PERMISSIONS");
  return s;
}
export async function entries(file: string, max: number): Promise<string[]> {
  await directory(file); const result: string[] = [];
  for await (const e of await fs.opendir(file)) { if (result.length >= max) deny("ENTRY_LIMIT"); result.push(e.name); }
  return result.sort();
}
export async function syncDirectory(file: string) {
  await noLinks(file);
  const h = await fs.open(file, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
  try { await h.sync(); } finally { await h.close(); }
}
/** Internal only. Read exact bounded snapshot, never return bytes through public store APIs. */
export async function readPrivate(file: string, max: number, permissions: readonly number[] = [0o400]): Promise<Buffer> {
  await noLinks(file); const beforePath = await fs.lstat(file, { bigint: true });
  const valid = (s: BigIntStats) => s.isFile() && s.nlink === BigInt(1) && s.uid === BigInt(process.geteuid!()) && permissions.includes(Number(s.mode & BigInt(0o7777)));
  if (!valid(beforePath) || beforePath.size <= BigInt(0) || beforePath.size > BigInt(max)) deny("FILE_POLICY");
  const h = await fs.open(file, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
  try {
    const before = await h.stat({ bigint: true }); if (!same(before, beforePath) || !valid(before)) deny("FILE_CHANGED");
    const b = Buffer.alloc(Number(before.size) + 1); let count = 0;
    while (count < b.length) { const r = await h.read(b, count, b.length - count, count); if (!r.bytesRead) break; count += r.bytesRead; }
    const after = await h.stat({ bigint: true }); await noLinks(file); const afterPath = await fs.lstat(file, { bigint: true });
    if (count !== Number(before.size) || !same(before, after) || !same(before, afterPath)) deny("FILE_CHANGED");
    return b.subarray(0, count);
  } finally { await h.close(); }
}
/** Exclusive create only; failed/partial files are retained for explicit operator investigation. */
export async function writeExclusive(file: string, bytes: Buffer) {
  if (!bytes.length || bytes.length > INTAKE.maxFileBytes) deny("WRITE_LIMIT");
  await noLinks(path.dirname(file));
  const h = await fs.open(file, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW | C.O_NONBLOCK, 0o600);
  try {
    await h.writeFile(bytes); await h.chmod(0o400); await h.sync();
    const s = await h.stat({ bigint: true }); if (!s.isFile() || s.nlink !== BigInt(1) || s.size !== BigInt(bytes.length)) deny("WRITE_CHANGED");
  } finally { await h.close(); }
}
