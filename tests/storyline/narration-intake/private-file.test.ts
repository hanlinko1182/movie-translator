import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { authorizePrivateWavInspection as authorize, NarrationIntakeError, INTAKE,
  createOfflineNarrationRegistry, noOwnerClaims, buildNarrationTimingPreview } from "../../../lib/storyline/narration-intake";
import { wav } from "./fixture";

async function fixture(t: import("node:test").TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "story-narration-intake-owned-"));
  await fs.writeFile(path.join(root, "ownership-marker"), "M10-03A synthetic fixtures only", { flag: "wx", mode: 0o600 });
  t.after(async () => {
    assert.equal(await fs.readFile(path.join(root, "ownership-marker"), "utf8"), "M10-03A synthetic fixtures only");
    await fs.rm(root, { recursive: true });
  });
  const file = path.join(root, "synthetic.wav"); await fs.writeFile(file, wav(), { flag: "wx", mode: 0o600 });
  const config = { authorization: "EXPLICIT_LOCAL_READ_ONLY" as const, authorizedPath: file, privateRoot: root, repositoryRoot: process.cwd() };
  return { root, file, config };
}
const denied = (e: unknown) => e instanceof NarrationIntakeError && !JSON.stringify(e).includes("synthetic.wav") && !e.message.includes("/");
test("explicit private read returns only metadata, readonly bytes unchanged, closure one-use", async t => {
  const f = await fixture(t), before = await fs.readFile(f.file), reader = authorize(f.config);
  const m = await reader.inspect(); assert.deepEqual(await fs.readFile(f.file), before);
  assert.equal(m.sampleFrames, 101); assert.deepEqual(reader, { inspect: reader.inspect });
  assert.equal(JSON.stringify(reader), "{}"); assert.ok(!JSON.stringify(m).includes(f.root));
  await assert.rejects(reader.inspect(), denied);
});
test("missing file and directory cannot disclose private path via error, metadata or logs", async t => {
  const f = await fixture(t); let logs = 0;
  for (const method of ["log", "error", "warn", "info"] as const) t.mock.method(console, method, () => { logs++; });
  for (const file of [path.join(f.root, "PRIVATE_PATH_MARKER"), path.join(f.root, "directory")]) {
    if (file.endsWith("directory")) await fs.mkdir(file);
    await assert.rejects(authorize({ ...f.config, authorizedPath: file }).inspect(), e => {
      assert.ok(denied(e)); assert.ok(!String(e).includes(f.root)); assert.ok(!JSON.stringify(e).includes(f.root)); return true;
    });
  }
  assert.equal(logs, 0);
});
test("path configuration rejects relative, traversal, NUL, root escape, repository path and extra claims", async t => {
  const f = await fixture(t);
  for (const config of [{ ...f.config, authorizedPath: "synthetic.wav" }, { ...f.config, authorizedPath: f.root + "/../escape.wav" },
    { ...f.config, authorizedPath: f.file + "\0" }, { ...f.config, privateRoot: "/" }, { ...f.config, authorizedPath: "/outside.wav" },
    { ...f.config, authorizedPath: path.join(process.cwd(), "tests/input.wav"), privateRoot: process.cwd() },
    { ...f.config, approval: true }]) assert.throws(() => authorize(config), denied);
});
test("leaf symlink, ancestor symlink and hardlink denied", async t => {
  const f = await fixture(t), leaf = path.join(f.root, "link.wav"), alias = path.join(f.root, "alias");
  await fs.symlink(f.file, leaf); await fs.symlink(f.root, alias);
  for (const file of [leaf, path.join(alias, "synthetic.wav")]) await assert.rejects(authorize({ ...f.config, authorizedPath: file }).inspect(), denied);
  await fs.link(f.file, path.join(f.root, "hardlink.wav")); await assert.rejects(authorize(f.config).inspect(), denied);
});
test("file-size preflight rejects oversized sparse input before capture", async t => {
  const f = await fixture(t); await fs.truncate(f.file, INTAKE.maxFileBytes + 1);
  await assert.rejects(authorize(f.config).inspect(), (e: unknown) => e instanceof NarrationIntakeError && e.code === "BYTE_LIMIT");
});
test("symlink substitution immediately before open fails closed", async t => {
  const f = await fixture(t), originalOpen = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    await fs.rename(f.file, f.file + ".original"); await fs.symlink(f.file + ".original", f.file);
    return originalOpen(...args);
  });
  await assert.rejects(authorize(f.config).inspect(), denied);
});
test("missing explicit authorization cannot create a reader", async t => {
  const f = await fixture(t);
  assert.throws(() => authorize({ ...f.config, authorization: "OWNER_REPORTED" } as unknown as typeof f.config), denied);
});
test("read errors redact native error details and close the descriptor", async t => {
  const f = await fixture(t), originalOpen = fs.open.bind(fs); let closed = false;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await originalOpen(...args), close = h.close.bind(h);
    t.mock.method(h, "read", async () => { throw Error(f.file + " PRIVATE_FAILURE_MARKER"); });
    t.mock.method(h, "close", async () => { closed = true; await close(); }); return h;
  });
  await assert.rejects(authorize(f.config).inspect(), e => { assert.ok(denied(e)); assert.doesNotMatch(String(e), /PRIVATE_FAILURE_MARKER/); return true; });
  assert.equal(closed, true);
});
test("close failure returns no successful measurement and no private error details", async t => {
  const f = await fixture(t), originalOpen = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await originalOpen(...args), close = h.close.bind(h);
    t.mock.method(h, "close", async () => { await close(); throw Error(f.file); }); return h;
  });
  await assert.rejects(authorize(f.config).inspect(), denied);
});
for (const change of ["replace", "mutate", "grow", "truncate"] as const) test(`identity fence denies ${change} during read`, async t => {
  const f = await fixture(t), originalOpen = fs.open.bind(fs); let changed = false;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...args), read = handle.read.bind(handle);
    t.mock.method(handle, "read", async (buffer: Buffer, offset: number, length: number, position: number) => {
      const result = await read(buffer, offset, length, position);
      if (!changed) {
        changed = true;
        if (change === "replace") { await fs.rename(f.file, f.file + ".old"); await fs.writeFile(f.file, wav()); }
        if (change === "mutate") { const b = wav(); b[50] ^= 1; await fs.writeFile(f.file, b); }
        if (change === "grow") await fs.appendFile(f.file, Buffer.from([0, 0]));
        if (change === "truncate") await fs.truncate(f.file, 44);
      }
      return result;
    });
    return handle;
  });
  await assert.rejects(authorize(f.config).inspect(), e => e instanceof NarrationIntakeError && e.code === "FILE_CHANGED");
  assert.equal(changed, true);
});
test("offline file-to-candidate-to-preview flow performs no fetch and exposes no paths or audio", async t => {
  const f = await fixture(t); let calls = 0;
  t.mock.method(globalThis, "fetch", () => { calls++; throw Error("OFFLINE_NETWORK_DENIED"); });
  const m = await authorize(f.config).inspect(), r = createOfflineNarrationRegistry(), c = r.register(m, noOwnerClaims);
  const p = buildNarrationTimingPreview(c); assert.equal(calls, 0);
  const safe = JSON.stringify({ metadata: c.metadata, preview: p });
  assert.ok(!safe.includes(f.root) && !safe.includes(f.file));
  assert.ok(!safe.includes('"data":') && !safe.includes('"type":"Buffer"')); assert.equal(c.metadata.providerReceipt, "UNKNOWN");
});
