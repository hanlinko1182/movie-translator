import "server-only";
import fs from "node:fs/promises";
import { constants as C, type BigIntStats } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { deny, exact, safe, VideoSourceIntakeError, VIDEO_SOURCE_INTAKE as V, type SourceInspectionConfiguration } from "./contracts";
import { issueCompletedInspection } from "./measurement";

const within = (root: string, file: string) => root === file || file.startsWith(root + path.sep);
const identityFields = ["dev", "ino", "size", "mtimeNs", "ctimeNs", "mode", "nlink", "uid", "gid"] as const;
const same = (a: BigIntStats, b: BigIntStats) => identityFields.every(k => a[k] === b[k]);
function validStats(s: BigIntStats) {
  if (identityFields.some(k => typeof s[k] !== "bigint") || s.dev < BigInt(0) || s.ino <= BigInt(0) || s.size < BigInt(0) ||
    s.uid < BigInt(0) || s.gid < BigInt(0) || s.nlink < BigInt(1) || s.mode < BigInt(0) || s.mode > BigInt(0xffffffff)) deny("INVALID_FILE_METADATA");
}
function regular(s: BigIntStats) {
  validStats(s);
  if (!s.isFile() || s.nlink !== BigInt(1)) deny("NOT_SINGLE_LINK_REGULAR_FILE");
  if (s.uid !== BigInt(process.geteuid!()) || ![0o400, 0o600].includes(Number(s.mode & BigInt(0o7777)))) deny("FILE_OWNERSHIP_OR_PERMISSIONS");
  if (s.size <= BigInt(0) || s.size > BigInt(V.maxFileBytes)) deny("BYTE_LIMIT");
}
function configuration(value: SourceInspectionConfiguration) {
  const c = exact(value, ["authorization", "privateRoot", "repositoryRoot", "authorizedPath", "provenance"]);
  if (c.authorization !== "EXPLICIT_LOCAL_READ_ONLY" || c.provenance !== "OWNER_REPORTED_SOURCE") deny("LOCAL_AUTHORIZATION_REQUIRED");
  for (const k of ["privateRoot", "repositoryRoot", "authorizedPath"] as const) {
    const p = c[k]; if (typeof p !== "string" || p.length > 4096 || p.includes("\0") || !path.isAbsolute(p) || path.normalize(p) !== p || path.resolve(p) !== p) deny("INVALID_PRIVATE_PATH");
  }
  const result = c as SourceInspectionConfiguration;
  if (result.privateRoot === path.parse(result.privateRoot).root || result.repositoryRoot === path.parse(result.repositoryRoot).root ||
    within(result.privateRoot, result.repositoryRoot) || within(result.repositoryRoot, result.privateRoot) ||
    !within(result.privateRoot, result.authorizedPath) || result.authorizedPath === result.privateRoot) deny("ROOT_OR_PATH_OVERLAP");
  if (!C.O_NOFOLLOW || !C.O_NONBLOCK || typeof process.geteuid !== "function") deny("UNSUPPORTED_FILE_SAFETY");
  return result;
}
async function noLinks(file: string) {
  let p = path.parse(file).root;
  for (const part of file.slice(p.length).split(path.sep)) { p = path.join(p, part); if ((await fs.lstat(p)).isSymbolicLink()) deny("SYMLINK_DENIED"); }
}
async function privateDirectories(c: SourceInspectionConfiguration) {
  await noLinks(c.authorizedPath); await noLinks(c.repositoryRoot);
  if (!(await fs.lstat(c.repositoryRoot)).isDirectory()) deny("INVALID_REPOSITORY_ROOT");
  const result = new Map<string, BigIntStats>(); let p = c.privateRoot;
  const parts = path.relative(c.privateRoot, path.dirname(c.authorizedPath)).split(path.sep).filter(Boolean);
  for (let i = 0; i <= parts.length; i++) {
    const s = await fs.lstat(p, { bigint: true }); validStats(s);
    if (!s.isDirectory() || s.uid !== BigInt(process.geteuid!()) || Number(s.mode & BigInt(0o7777)) !== 0o700) deny("DIRECTORY_OWNERSHIP_OR_PERMISSIONS");
    result.set(p, s); if (i < parts.length) p = path.join(p, parts[i]);
  }
  return result;
}
async function fenceDirectories(c: SourceInspectionConfiguration, original: Map<string, BigIntStats>) {
  const now = await privateDirectories(c);
  for (const [p, s] of original) {
    const n = now.get(p); if (!n || ["dev", "ino", "uid", "gid", "mode"].some(k => n[k as keyof BigIntStats] !== s[k as keyof BigIntStats])) deny("DIRECTORY_CHANGED");
  }
}
/** Trusted local operator composition only. The literal is not authentication. Authorization captures
 * actual private FS identity, never client-supplied stats/hash; inspect burns the closure before awaiting. */
export function authorizePrivateVideoSourceInspection(value: SourceInspectionConfiguration) {
  return safe(async () => {
    const c = configuration(value), directories = await privateDirectories(c), authorized = await fs.lstat(c.authorizedPath, { bigint: true });
    regular(authorized); let consumed = false;
    return Object.freeze({ inspect() {
      if (consumed) return Promise.reject(new VideoSourceIntakeError("INSPECTION_CONSUMED"));
      consumed = true;
      return safe(async () => {
        await fenceDirectories(c, directories); const beforePath = await fs.lstat(c.authorizedPath, { bigint: true }); regular(beforePath);
        if (!same(authorized, beforePath)) deny("AUTHORIZED_IDENTITY_CHANGED");
        const h = await fs.open(c.authorizedPath, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
        let digest: string, count = 0;
        try {
          const before = await h.stat({ bigint: true }); regular(before);
          if (!same(authorized, before)) deny("FILE_CHANGED");
          const hash = createHash("sha256"), chunk = Buffer.alloc(V.chunkBytes); let calls = 0;
          while (true) {
            if (++calls > V.maxReadCalls) deny("READ_OPERATION_LIMIT");
            const wanted = Math.min(chunk.length, Number(before.size) - count + 1);
            const r = await h.read(chunk, 0, wanted, count);
            if (!Number.isSafeInteger(r.bytesRead) || r.bytesRead < 0 || r.bytesRead > wanted) deny("INVALID_READ_RESULT");
            if (!r.bytesRead) break;
            count += r.bytesRead;
            if (count > Number(before.size) || count > V.maxFileBytes) deny("FILE_GREW");
            hash.update(chunk.subarray(0, r.bytesRead));
          }
          if (count !== Number(before.size)) deny("FILE_TRUNCATED");
          const after = await h.stat({ bigint: true }); regular(after);
          if (!same(before, after)) deny("FILE_CHANGED");
          await fenceDirectories(c, directories); const afterPath = await fs.lstat(c.authorizedPath, { bigint: true }); regular(afterPath);
          if (!same(before, afterPath)) deny("FILE_CHANGED"); digest = hash.digest("hex");
        } finally { await h.close(); }
        await fenceDirectories(c, directories); const finalPath = await fs.lstat(c.authorizedPath, { bigint: true }); regular(finalPath);
        if (!same(authorized, finalPath)) deny("FILE_CHANGED");
        return issueCompletedInspection(digest, count);
      });
    } });
  });
}
