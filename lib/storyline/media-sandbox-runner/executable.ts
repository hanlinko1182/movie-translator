import "server-only";
import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { sha256 } from "./contracts";

export type ReviewedExecutable = Readonly<{
  path: string;
  sha256: string;
  version: string;
  dependencyPolicy: "STATIC_ELF_LINUX_X64";
  ownerUid: number;
}>;

const denied = () => new Error("EXECUTABLE_IDENTITY_DENIED");
const maxExecutable = 32 * 1024 * 1024;

function staticElf(bytes: Buffer) {
  if (bytes.length < 64 || bytes.subarray(0, 7).toString("hex") !== "7f454c46020101" ||
      bytes.readUInt16LE(16) !== 2 || bytes.readUInt16LE(18) !== 62 ||
      bytes.readUInt32LE(20) !== 1 || bytes.readUInt16LE(54) !== 56) return false;
  const offset = Number(bytes.readBigUInt64LE(32));
  const count = bytes.readUInt16LE(56);
  if (offset < 64 || count < 1 || count > 64 || offset + count * 56 > bytes.length) return false;
  const entry = bytes.readBigUInt64LE(24);
  let executableEntry = false;
  for (let i = 0; i < count; i++) {
    const header = offset + i * 56;
    const type = bytes.readUInt32LE(header);
    const flags = bytes.readUInt32LE(header + 4);
    const fileOffset = bytes.readBigUInt64LE(header + 8);
    const addr = bytes.readBigUInt64LE(header + 16);
    const size = bytes.readBigUInt64LE(header + 32);
    if (type === 2 || type === 3 || (type === 0x6474e551 && (flags & 1))) return false;
    if (type === 1) {
      if (fileOffset + size > BigInt(bytes.length) || (flags & 3) === 3) return false;
      if ((flags & 1) && addr <= entry && entry < addr + size) executableEntry = true;
    }
  }
  return executableEntry;
}

export async function verifyReviewedExecutable(pin: ReviewedExecutable) {
  if (!Object.isFrozen(pin) || Reflect.ownKeys(pin).length !== 5 ||
      typeof pin.path !== "string" || !isAbsolute(pin.path) || normalize(pin.path) !== pin.path ||
      !/^\/[a-zA-Z0-9._/-]{1,1023}$/.test(pin.path) ||
      typeof pin.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pin.sha256) ||
      typeof pin.version !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(pin.version) ||
      pin.dependencyPolicy !== "STATIC_ELF_LINUX_X64" ||
      !Number.isSafeInteger(pin.ownerUid) || pin.ownerUid < 0) throw denied();

  let file: FileHandle | undefined;
  try {
    if (await realpath(pin.path) !== pin.path) throw denied();
    file = await open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const handle = file;
    const original = await handle.stat({ bigint: true });
    const same = (stat: typeof original) =>
      stat.dev === original.dev && stat.ino === original.ino && stat.ctimeNs === original.ctimeNs &&
      stat.mtimeNs === original.mtimeNs && stat.size === original.size && stat.mode === original.mode &&
      stat.uid === original.uid && stat.nlink === original.nlink;
    const recheck = async () => {
      try {
        const current = await handle.stat({ bigint: true });
        if (!current.isFile() || current.uid !== BigInt(pin.ownerUid) || current.nlink !== BigInt(1) ||
            (current.mode & BigInt(0o7777)) !== BigInt(0o500) || !same(current) ||
            current.size < BigInt(64) || current.size > BigInt(maxExecutable) ||
            await realpath(pin.path) !== pin.path || !same(await lstat(pin.path, { bigint: true }))) throw denied();
        const bytes = Buffer.alloc(Number(current.size));
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead !== bytes.length || !staticElf(bytes) || sha256(bytes) !== pin.sha256 ||
            !same(await handle.stat({ bigint: true })) || !same(await lstat(pin.path, { bigint: true }))) throw denied();
      } catch {
        throw denied();
      }
    };
    await recheck();
    return Object.freeze({ descriptor: handle.fd, recheck, close: () => handle.close() });
  } catch {
    await file?.close().catch(() => undefined);
    throw denied();
  }
}
