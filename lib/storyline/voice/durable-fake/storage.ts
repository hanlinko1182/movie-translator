import "server-only";
import { constants } from "node:fs";
import { mkdir, mkdtemp, open, realpath, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { capturePcmBytes } from "../audio-verification/wav";
import { AUDIO_VERIFICATION } from "../audio-verification/contracts";

const prefix = "movie-translator-m505-audio-", marker = "OWNED_M505.json";
export type StorageIdentity = { root: string; nonce: string; namespace: string; ownerPid: number };
export type WriteFault = "NONE" | "INTERRUPTED" | "ACK_LOST";
export interface ImmutableAudioPort {
  create(version: string, bytes: Uint8Array, fault?: WriteFault): Promise<void>;
  read(version: string): Promise<Uint8Array>;
  remove(version: string, expectedHash: string, expectedBytes: number, ackLost?: boolean): Promise<void>;
  inventory(): Promise<string[]>;
}
const valid = (s: string) => { if (!/^[a-f0-9]{32}$/.test(s)) throw new Error("STORAGE_VERSION"); return s; };
export const newObjectVersion = () => randomBytes(16).toString("hex");
export const audioHash = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
export async function createOwnedAudioFixture() {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const identity: StorageIdentity = { root, nonce: randomBytes(32).toString("hex"), namespace: `fixture-${newObjectVersion()}`, ownerPid: process.pid };
  await mkdir(join(root, "objects"), { mode: 0o700 });
  const f = await open(join(root, marker), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await f.writeFile(JSON.stringify(identity)); await f.sync(); } finally { await f.close(); }
  return identity;
}
/** Linux fixture: pinned directory descriptors avoid parent-path substitution.
 * Same-UID administrators are outside this scratch ownership threat boundary. */
export async function attachOwnedAudioFixture(identity: StorageIdentity) {
  if (resolve(identity.root) !== identity.root || !identity.root.startsWith(`${tmpdir()}/`) || !basename(identity.root).startsWith(prefix) || await realpath(identity.root) !== identity.root) throw new Error("STORAGE_OWNER");
  const root = await open(identity.root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const rootPath = `/proc/self/fd/${root.fd}`;
  let dir: Awaited<ReturnType<typeof open>>;
  try {
    const f = await open(`${rootPath}/${marker}`, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await f.stat(); if (!stat.isFile() || stat.size > 1024 || stat.nlink !== 1) throw new Error("STORAGE_OWNER");
      const actual = JSON.parse(await f.readFile("utf8"));
      if (JSON.stringify(actual) !== JSON.stringify(identity)) throw new Error("STORAGE_OWNER");
    } finally { await f.close(); }
    dir = await open(`${rootPath}/objects`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  } catch (e) { await root.close(); throw e; }
  const path = (v: string) => `/proc/self/fd/${dir.fd}/${valid(v)}`;
  async function boundedRead(v: string) {
    const f = await open(path(v), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await f.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > AUDIO_VERIFICATION.maxAudioBytes) throw new Error("STORAGE_BYTES");
      const bytes = Buffer.alloc(stat.size); let offset = 0;
      while (offset < bytes.length) { const r = await f.read(bytes, offset, bytes.length - offset, offset); if (!r.bytesRead) throw new Error("STORAGE_TRUNCATED"); offset += r.bytesRead; }
      const after = await f.stat();
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || after.ino !== stat.ino) throw new Error("STORAGE_CHANGED");
      return Uint8Array.from(bytes);
    } finally { await f.close(); }
  }
  const port: ImmutableAudioPort = {
    async create(version, value, fault = "NONE") {
      const bytes = capturePcmBytes(value); if (!bytes.length || bytes.length > AUDIO_VERIFICATION.maxAudioBytes) throw new Error("STORAGE_BYTES");
      const tombstone = await lstat(`${path(version)}.deleted`).then(() => true, e => { if (e.code !== "ENOENT") throw e; return false; });
      if (tombstone) throw new Error("STORAGE_TOMBSTONE");
      const f = await open(path(version), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await f.writeFile(fault === "INTERRUPTED" ? bytes.subarray(0, 13) : bytes); await f.sync(); await f.chmod(0o400); }
      finally { await f.close(); }
      await dir.sync();
      if (fault !== "NONE") throw new Error(`STORAGE_${fault}`);
    },
    read: boundedRead,
    async remove(version, expectedHash, expectedBytes, ackLost = false) {
      const target = path(version);
      let bytes: Uint8Array;
      try { bytes = await boundedRead(version); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT" && await lstat(`${target}.deleted`).then(() => true, () => false)) return; throw e; }
      if (bytes.length !== expectedBytes || audioHash(bytes) !== expectedHash) throw new Error("STORAGE_DELETE_MISMATCH");
      const t = await open(`${target}.deleted`, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400).catch(async e => { if (e.code !== "EEXIST") throw e; return null; });
      if (t) { await t.sync(); await t.close(); }
      await rm(target); await dir.sync(); if (ackLost) throw new Error("STORAGE_DELETE_ACK_LOST");
    },
    async inventory() {
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(`/proc/self/fd/${dir.fd}`);
      if (files.length > 2880) throw new Error("STORAGE_INVENTORY_QUOTA");
      return files.filter(f => /^[a-f0-9]{32}$/.test(f)).sort();
    },
  };
  return { port, close: async () => { await dir.close(); await root.close(); } };
}
export async function cleanupOwnedAudioFixture(identity: StorageIdentity) {
  if (identity.ownerPid !== process.pid) throw new Error("STORAGE_CLEANUP_OWNER");
  const attached = await attachOwnedAudioFixture(identity); await attached.close();
  await rm(identity.root, { recursive: true });
}

/** Deterministic conformance fake. This adapter deliberately makes no restart
 * claim; actual crash acceptance always uses the marked filesystem adapter. */
export function createMemoryImmutableAudioPortForTest(): ImmutableAudioPort {
  const objects=new Map<string,Uint8Array>(),tombstones=new Set<string>();let occupied=0;
  return Object.freeze({
    async create(version:string,value:Uint8Array,fault:WriteFault="NONE") {
      valid(version);if(objects.has(version)||tombstones.has(version))throw new Error("STORAGE_EXISTS");
      const bytes=capturePcmBytes(value);
      if(!bytes.length||bytes.length>AUDIO_VERIFICATION.maxAudioBytes||occupied+bytes.length>16777216||objects.size+tombstones.size>=1440)throw new Error("STORAGE_BYTES");
      const actual=Uint8Array.from(fault==="INTERRUPTED"?bytes.subarray(0,13):bytes);objects.set(version,actual);occupied+=actual.length;
      if(fault!=="NONE")throw new Error(`STORAGE_${fault}`);
    },
    async read(version:string){const bytes=objects.get(valid(version));if(!bytes)throw new Error("STORAGE_MISSING");return Uint8Array.from(bytes);},
    async remove(version:string,expectedHash:string,expectedBytes:number,ackLost=false){
      valid(version);const bytes=objects.get(version);if(!bytes){if(tombstones.has(version))return;throw new Error("STORAGE_MISSING");}
      if(bytes.length!==expectedBytes||audioHash(bytes)!==expectedHash)throw new Error("STORAGE_DELETE_MISMATCH");
      tombstones.add(version);objects.delete(version);occupied-=bytes.length;if(ackLost)throw new Error("STORAGE_DELETE_ACK_LOST");
    },
    async inventory(){return [...objects.keys()].sort();},
  });
}
