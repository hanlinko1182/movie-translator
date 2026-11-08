import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { constants as C } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { authorizePrivateVideoSourceInspection as authorize, verifyVideoSourceMetadata, VIDEO_SOURCE_INTAKE as V } from "../../../lib/storyline/video-source-intake";
import { fixture, bytes, denied, changedStat } from "./fixture";

test("bounded complete SHA-256 inspection uses readonly no-follow streaming and preserves original bytes", async t => {
  const f = await fixture(t), before = await fs.stat(f.file, { bigint: true }), open = fs.open.bind(fs); let reads = 0, maxRead = 0, closed = false;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    assert.equal(args[0], f.file); assert.equal(args[1], C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    const h = await open(...args), read = h.read.bind(h), close = h.close.bind(h);
    t.mock.method(h, "read", async (buffer: Buffer, offset: number, length: number, position: number) => { reads++; maxRead = Math.max(maxRead, length); return read(buffer, offset, length, position); });
    t.mock.method(h, "close", async () => { closed = true; await close(); }); return h;
  });
  const source = await f.inspect(); t.mock.restoreAll();
  assert.equal(source.metadata.sha256, createHash("sha256").update(f.content).digest("hex")); assert.equal(source.metadata.byteCount, f.content.length);
  assert.ok(reads >= 4 && maxRead <= V.chunkBytes); assert.equal(closed, true);
  assert.deepEqual(await fs.readFile(f.file), f.content); const after = await fs.stat(f.file, { bigint: true });
  for (const k of ["size", "ino", "mtimeNs", "ctimeNs", "mode"] as const) assert.equal(after[k], before[k]);
  assert.equal(source.metadata.version, 1); assert.match(source.metadata.candidateSourceId, /^vsrc-[a-f0-9-]{36}$/);
  assert.equal(verifyVideoSourceMetadata(source, JSON.parse(JSON.stringify(source.metadata))), source.metadata);
});
test("partial positive reads are accumulated exactly; no full-file allocation or truncation", async t => {
  const f = await fixture(t, 521), open = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await open(...args), read = h.read.bind(h);
    t.mock.method(h, "read", (buffer: Buffer, offset: number, length: number, position: number) => read(buffer, offset, Math.min(length, 17), position)); return h;
  });
  assert.equal((await f.inspect()).metadata.sha256, createHash("sha256").update(f.content).digest("hex"));
});
test("one-use closure is consumed before awaiting, including concurrent calls and failed reads", async t => {
  const f = await fixture(t), permit = await authorize(f.config), a = permit.inspect(), b = permit.inspect();
  await assert.rejects(b, denied); await a; await assert.rejects(permit.inspect(), denied);
  const broken = await authorize(f.config); await fs.unlink(f.file); await assert.rejects(broken.inspect(), denied); await assert.rejects(broken.inspect(), denied);
  assert.equal(JSON.stringify(permit), "{}");
});
test("authorization binds actual original identity and rejects replacement before inspection", async t => {
  const f = await fixture(t), permit = await authorize(f.config);
  await fs.rename(f.file, f.file + ".original"); await fs.writeFile(f.file, f.content, { mode: 0o600 });
  await assert.rejects(permit.inspect(), denied);
});
test("configuration is snapshotted before asynchronous authorization; caller mutation cannot select another path", async t => {
  const f = await fixture(t), input = { ...f.config }, operation = authorize(input);
  input.authorizedPath = path.join(f.root, "PRIVATE_MISSING_MARKER");
  assert.equal((await (await operation).inspect()).metadata.sha256, createHash("sha256").update(f.content).digest("hex"));
});
for (const kind of ["truncate", "grow", "modify", "replace", "unlink", "permissions", "root-replace"] as const) {
  test(`changed source ${kind} during streaming fails and closes descriptor`, async t => {
    const f = await fixture(t), permit = await authorize(f.config), open = fs.open.bind(fs); let changed = false, closed = false;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const h = await open(...args), read = h.read.bind(h), close = h.close.bind(h);
      t.mock.method(h, "read", async (buffer: Buffer, offset: number, length: number, position: number) => {
        const result = await read(buffer, offset, length, position);
        if (!changed) {
          changed = true;
          if (kind === "truncate") await fs.truncate(f.file, 1);
          if (kind === "grow") await fs.appendFile(f.file, Buffer.from([1]));
          if (kind === "modify") { const b = bytes(f.content.length); b[0] ^= 1; await fs.writeFile(f.file, b); }
          if (kind === "replace") { await fs.rename(f.file, f.file + ".old"); await fs.writeFile(f.file, f.content, { mode: 0o600 }); }
          if (kind === "unlink") await fs.unlink(f.file);
          if (kind === "permissions") await fs.chmod(f.file, 0o644);
          if (kind === "root-replace") { await fs.rename(f.root, f.root + ".old"); await fs.mkdir(f.root, { mode: 0o700 }); await fs.writeFile(f.file, f.content, { mode: 0o600 }); }
        }
        return result;
      });
      t.mock.method(h, "close", async () => { closed = true; await close(); }); return h;
    });
    await assert.rejects(permit.inspect(), denied); assert.equal(changed, true); assert.equal(closed, true);
  });
}
test("mutation during close is rejected by the final path fence", async t => {
  const f = await fixture(t), open = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await open(...args), close = h.close.bind(h);
    t.mock.method(h, "close", async () => { await close(); const b = bytes(f.content.length); b[0] ^= 1; await fs.writeFile(f.file, b); }); return h;
  });
  await assert.rejects(f.inspect(), denied);
});
for (const kind of ["read-error", "close-error", "early-eof", "invalid-result", "too-many-reads"] as const) {
  test(`fault ${kind} returns no metadata or native diagnostic and closes`, async t => {
    const f = await fixture(t), open = fs.open.bind(fs); let closed = false;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const h = await open(...args), read = h.read.bind(h), close = h.close.bind(h);
      if (kind === "read-error") t.mock.method(h, "read", async () => { throw Error(f.file + " PRIVATE_NATIVE_ERROR"); });
      if (kind === "early-eof") t.mock.method(h, "read", async () => ({ bytesRead: 0 }));
      if (kind === "invalid-result") t.mock.method(h, "read", async () => ({ bytesRead: -1 }));
      if (kind === "too-many-reads") t.mock.method(h, "read", (buffer: Buffer, offset: number, _length: number, position: number) => read(buffer, offset, 1, position));
      t.mock.method(h, "close", async () => { await close(); closed = true; if (kind === "close-error") throw Error(f.file + " PRIVATE_NATIVE_ERROR"); }); return h;
    });
    await assert.rejects(f.inspect(), e => { assert.ok(denied(e)); assert.doesNotMatch(String(e) + JSON.stringify(e), /PRIVATE_NATIVE_ERROR|non-media-source/); return true; });
    assert.equal(closed, true);
  });
}
test("exact 64-MiB pilot ceiling hashes completely in chunks; empty/ceiling+1 files denied", async t => {
  const f = await fixture(t, 1); await fs.truncate(f.file, V.maxFileBytes);
  // Expected bytes are one authored first byte followed by synthetic sparse zeros, independently hashed.
  const hash = createHash("sha256").update(f.content), zero = Buffer.alloc(32768); let remaining = V.maxFileBytes - 1;
  while (remaining) { const n = Math.min(remaining, zero.length); hash.update(zero.subarray(0, n)); remaining -= n; }
  const m = await f.inspect(); assert.equal(m.metadata.byteCount, V.maxFileBytes); assert.equal(m.metadata.sha256, hash.digest("hex"));
  await fs.truncate(f.file, V.maxFileBytes + 1); await assert.rejects(f.inspect(), denied);
  await fs.truncate(f.file, 0); await assert.rejects(f.inspect(), denied);
});
for (const kind of ["file-owner", "directory-owner", "fd-owner", "fd-identity", "fd-not-regular", "fd-invalid-mode", "invalid-stats"] as const) {
  test(`ownership/identity negative ${kind} denied with no privileged OS change`, async t => {
    const f = await fixture(t), lstat = fs.lstat.bind(fs), open = fs.open.bind(fs);
    if (["file-owner", "directory-owner"].includes(kind)) t.mock.method(fs, "lstat", async (...args: Parameters<typeof fs.lstat>) => {
      const s = await lstat(...args);
      if (args[1] && (String(args[0]) === (kind === "file-owner" ? f.file : f.root))) return changedStat(s as import("node:fs").BigIntStats, { uid: BigInt(process.geteuid!()) + BigInt(1) });
      return s;
    });
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const h = await open(...args), stat = h.stat.bind(h);
      if (kind.startsWith("fd-") || kind === "invalid-stats") t.mock.method(h, "stat", async () => {
        const s = await stat({ bigint: true });
        return changedStat(s, kind === "fd-owner" ? { uid: s.uid + BigInt(1) } : kind === "fd-identity" ? { ino: s.ino + BigInt(1) } : kind === "fd-not-regular" ? { mode: BigInt(0o010600) } : kind === "fd-invalid-mode" ? { mode: BigInt(-1) } : { mtimeNs: undefined });
      }); return h;
    });
    await assert.rejects(f.inspect(), denied);
  });
}
