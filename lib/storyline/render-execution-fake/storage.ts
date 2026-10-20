import "server-only";
import { constants } from "node:fs";
import { mkdir, mkdtemp, open, realpath, readdir, unlink } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { limits, reject, same, type Context } from "./contracts";

export const byteHash = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
export const objectVersion = () => randomBytes(16).toString("hex");
export function captureBytes(v: Uint8Array): Uint8Array {
  if (!(v instanceof Uint8Array) || v.byteLength < 1 || v.byteLength > limits.blob) reject("BLOB_LIMIT");
  return Uint8Array.from(v);
}
export type StorageIdentity = { root: string; namespace: string; nonce: string; ownerPid: number };
export interface PrivateBlobPort {
  register(context: Context, version: string): Promise<void>;
  create(context: Context, version: string, bytes: Uint8Array, fault?: "NONE" | "ACK_LOST" | "PARTIAL"): Promise<void>;
  read(context: Context, version: string): Promise<Uint8Array>;
  remove(context: Context, version: string, hash: string, count: number, intent: string, ackLost?: boolean): Promise<void>;
}
const prefix = "movie-translator-m803-blobs-";
export async function createOwnedBlobFixture() {
  const root = await mkdtemp(`${tmpdir()}/${prefix}`);
  const identity = { root, namespace: `fixture-${objectVersion()}`, nonce: randomBytes(32).toString("hex"), ownerPid: process.pid };
  await mkdir(`${root}/objects`, { mode: 0o700 });
  const marker = await open(`${root}/OWNED_M803.json`, "wx", 0o600);
  try { await marker.writeFile(JSON.stringify(identity)); await marker.sync(); } finally { await marker.close(); }
  return identity;
}
/** Synthetic fixture owner is trusted; this is not a sandbox against a same-UID administrator. */
export async function attachOwnedBlobFixture(identity: StorageIdentity) {
  if (resolve(identity.root) !== identity.root || !identity.root.startsWith(`${tmpdir()}/`) || !basename(identity.root).startsWith(prefix) || await realpath(identity.root) !== identity.root) reject("STORAGE_OWNER");
  const root = await open(identity.root, constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_RDONLY);
  const marker = await open(`/proc/self/fd/${root.fd}/OWNED_M803.json`, constants.O_NOFOLLOW | constants.O_RDONLY);
  try { const s = await marker.stat(); if (!s.isFile() || s.nlink !== 1 || s.size > 1024 || !same(JSON.parse(await marker.readFile("utf8")), identity)) reject("STORAGE_OWNER"); }
  catch (e) { await root.close(); throw e; } finally { await marker.close(); }
  const dir = await open(`/proc/self/fd/${root.fd}/objects`, constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_RDONLY);
  const path = (v: string, suffix: string) => { if (!/^[a-f0-9]{32}$/.test(v)) reject("INVALID_VERSION"); return `/proc/self/fd/${dir.fd}/${v}.${suffix}`; };
  async function smallRead(v: string, suffix: string, max: number) {
    const f = await open(path(v, suffix), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await f.stat(); if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > max) reject("BLOB_LIMIT");
      const out = Buffer.alloc(before.size); let offset = 0;
      while (offset < out.length) { const r = await f.read(out, offset, out.length-offset, offset); if (!r.bytesRead) reject("TRUNCATED"); offset += r.bytesRead; }
      const after = await f.stat(); if (before.ino !== after.ino || before.size !== after.size || before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs) reject("BLOB_CHANGED");
      return Uint8Array.from(out);
    } finally { await f.close(); }
  }
  async function authorized(c: Context, v: string) {
    if (c.namespace !== identity.namespace) reject("STORAGE_SCOPE");
    const registered = JSON.parse(Buffer.from(await smallRead(v, "owner", 4096)).toString("utf8"));
    if (!same(registered, c)) reject("STORAGE_SCOPE");
  }
  async function exists(v: string, suffix: string) {
    try { await smallRead(v, suffix, 4096); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; }
  }
  async function exclusive(v: string, suffix: string, bytes: Uint8Array) {
    const f = await open(path(v,suffix), constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY, 0o600);
    try { await f.writeFile(bytes); await f.sync(); await f.chmod(0o400); } finally { await f.close(); }
    await dir.sync();
  }
  // All attachments/processes share this exclusive mutation fence. A crash leaves
  // it in place: a clock deadline is never authority to reap a possibly live owner.
  async function mutate<T>(work: () => Promise<T>): Promise<T> {
    const lockPath = `/proc/self/fd/${root.fd}/MUTATION_LOCK`;
    const lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY, 0o600)
      .catch(e => { if (e.code === "EEXIST") reject("STORAGE_BUSY"); throw e; });
    try { return await work(); }
    finally { await lock.close(); await unlink(lockPath); await root.sync(); }
  }
  const port: PrivateBlobPort = Object.freeze({
    async register(c:Context, v:string) {
      return mutate(async () => {
      if (c.namespace !== identity.namespace) reject("STORAGE_SCOPE");
      const names = await readdir(`/proc/self/fd/${dir.fd}`); if (names.length > limits.versions*3) reject("STORAGE_QUOTA");
      if (await exists(v,"owner")) { await authorized(c,v); return; }
      if (names.filter(n=>n.endsWith(".owner")).length >= limits.versions) reject("STORAGE_QUOTA");
      await exclusive(v,"owner", Buffer.from(JSON.stringify(c)));
      });
    },
    async create(c:Context,v:string,value:Uint8Array,fault:"NONE"|"ACK_LOST"|"PARTIAL"="NONE") {
      const captured = captureBytes(value);
      return mutate(async () => {
      await authorized(c,v); if (await exists(v,"deleted")) reject("STORAGE_TOMBSTONE");
      const bytes = captured, names = await readdir(`/proc/self/fd/${dir.fd}`); let used = 0;
      for (const name of names.filter(n=>/^[a-f0-9]{32}\.blob$/.test(n))) used += (await smallRead(name.slice(0,32),"blob",limits.blob)).length;
      if (used + bytes.length > limits.total-limits.reserve) reject("STORAGE_QUOTA");
      await exclusive(v,"blob",fault === "PARTIAL" ? bytes.subarray(0,1) : bytes);
      if (fault !== "NONE") reject(`STORAGE_${fault}`);
      });
    },
    async read(c:Context,v:string) { await authorized(c,v); return smallRead(v,"blob",limits.blob); },
    async remove(c:Context,v:string,hash:string,count:number,intent:string,ackLost=false) {
      return mutate(async () => {
      await authorized(c,v);
      const tombstone = { version:v, byteSha256:hash, byteCount:count, intent };
      if (await exists(v,"deleted")) {
        if (!same(JSON.parse(Buffer.from(await smallRead(v,"deleted",4096)).toString()),tombstone)) reject("DELETE_MISMATCH");
        // A matching intent acknowledges absence only. Surviving bytes still
        // require the original exact hash/length before conditional removal.
        try {
          const bytes = await smallRead(v,"blob",limits.blob);
          if (byteHash(bytes)!==hash || bytes.length!==count) reject("DELETE_MISMATCH");
        } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      } else {
        const bytes = await smallRead(v,"blob",limits.blob); if (byteHash(bytes)!==hash || bytes.length!==count) reject("DELETE_MISMATCH");
        await exclusive(v,"deleted",Buffer.from(JSON.stringify(tombstone)));
      }
      // A tombstone proves the same conditional delete intent, not generic absence.
      await unlink(path(v,"blob")).catch(e=>{ if(e.code!=="ENOENT") throw e; }); await dir.sync();
      if (ackLost) reject("DELETE_ACK_LOST");
      });
    },
  });
  return { port, close: async()=>{ await dir.close(); await root.close(); } };
}
