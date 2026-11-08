import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { createPrivateNarrationStore, openPrivateNarrationStore, PrivateNarrationStoreError } from "../../../lib/storyline/narration-private-store";
import { fixture, wav } from "./fixture";
const denied = (e: unknown) => e instanceof PrivateNarrationStoreError;

for (const barrier of ["partial-audio", "before-manifest", "before-commit", "partial-commit", "commit-sync"] as const) {
  test(`interruption ${barrier}: no partial artifact trusted or deleted; reopening checks original evidence`, async t => {
    const f = await fixture(t), original = fs.open.bind(fs); let injected = false;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const file = String(args[0]);
      if (barrier === "before-manifest" && file.endsWith("manifest.json") || barrier === "before-commit" && file.endsWith("commit.json")) { injected = true; throw Error("INJECTED_INTERRUPTION"); }
      const h = await original(...args);
      if ((barrier === "partial-audio" && file.endsWith("audio.wav") || barrier === "partial-commit" && file.endsWith("commit.json")) && Number(args[1]) !== 0) {
        t.mock.method(h, "writeFile", async (bytes: Uint8Array) => { await h.write(bytes.subarray(0, Math.floor(bytes.length / 2))); injected = true; throw Error("INJECTED_INTERRUPTION"); });
      }
      if (barrier === "commit-sync" && file.endsWith("commit.json") && Number(args[1]) !== 0) {
        t.mock.method(h, "sync", async () => { injected = true; throw Error("LOST_DURABILITY_ACK"); });
      }
      return h;
    });
    await assert.rejects(f.import(), denied); assert.equal(injected, true); t.mock.restoreAll();
    const ids = await fs.readdir(path.join(f.config.root, "objects")); assert.equal(ids.length, 1);
    const reader = await openPrivateNarrationStore(f.config);
    if (barrier === "commit-sync") {
      // Complete bytes may be observable after a lost sync ACK; remeasure, never create a replacement.
      assert.equal((await reader.lookup(ids[0])).artifactId, ids[0]); assert.equal((await f.import()).artifactId, ids[0]);
    } else {
      await assert.rejects(reader.lookup(ids[0]), denied); await assert.rejects(f.import(), denied);
      if (barrier !== "partial-commit") assert.equal((await reader.list()).unresolved.length, 1);
      else await assert.rejects(reader.list(), denied);
    }
    assert.deepEqual(await fs.readdir(path.join(f.config.root, "objects")), ids);
  });
}
test("interrupted lock acknowledgement remains blocking; readonly reopening never clears it", async t => {
  const f = await fixture(t), original = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await original(...args);
    if (String(args[0]).endsWith(".import.lock")) t.mock.method(h, "writeFile", async () => { await h.write(Buffer.from("partial")); throw Error("LOST_LOCK_ACK"); });
    return h;
  });
  await assert.rejects(f.import(), denied); t.mock.restoreAll();
  const before = await fs.readFile(path.join(f.config.root, ".import.lock"));
  assert.deepEqual((await (await openPrivateNarrationStore(f.config)).list()).artifacts, []);
  await assert.rejects(f.import(), denied); assert.deepEqual(await fs.readFile(path.join(f.config.root, ".import.lock")), before);
});
test("interrupted root initialization is never adopted or silently reformatted", async t => {
  const f = await fixture(t), configuration = { ...f.config, root: path.join(f.parent, "interrupted-root") }, original = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]) === path.join(configuration.root, ".owner.json")) throw Error("LOST_ROOT_INITIALIZATION");
    return original(...args);
  });
  await assert.rejects(createPrivateNarrationStore(configuration), denied); t.mock.restoreAll();
  const before = await fs.readdir(configuration.root); await assert.rejects(openPrivateNarrationStore(configuration), denied);
  await assert.rejects(createPrivateNarrationStore(configuration), denied); assert.deepEqual(await fs.readdir(configuration.root), before);
});
test("exclusive no-replace creation preserves a competing destination file", async t => {
  const f = await fixture(t), original = fs.open.bind(fs); let collided = false;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const file = String(args[0]);
    if (file.endsWith("audio.wav") && !collided) { collided = true; await fs.writeFile(file, "FOREIGN_OWNED_FIXTURE", { mode: 0o400, flag: "wx" }); }
    return original(...args);
  });
  await assert.rejects(f.import(), denied); t.mock.restoreAll();
  const [id] = await fs.readdir(path.join(f.config.root, "objects"));
  assert.equal(await fs.readFile(path.join(f.dir(id), "audio.wav"), "utf8"), "FOREIGN_OWNED_FIXTURE");
  assert.equal((await f.store.list()).unresolved.length, 1);
});
test("independent copied-byte verification catches a valid PCM copy with changed content", async t => {
  const f = await fixture(t), original = fs.open.bind(fs);
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await original(...args);
    if (String(args[0]).endsWith("audio.wav")) {
      const write = h.writeFile.bind(h);
      t.mock.method(h, "writeFile", async (bytes: Uint8Array) => { const changed = Buffer.from(bytes); changed[50] ^= 1; await write(changed); });
    }
    return h;
  });
  await assert.rejects(f.import(), denied); t.mock.restoreAll();
  assert.deepEqual(await fs.readFile(f.sourcePath), wav()); assert.equal((await f.store.list()).unresolved.length, 1);
});
test("lookup denies audio mutation during its final manifest fence", async t => {
  const f = await fixture(t), m = await f.import(), original = fs.open.bind(fs); let manifests = 0;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]) === path.join(f.dir(m.artifactId), "manifest.json") && ++manifests === 2) {
      const file = path.join(f.dir(m.artifactId), "audio.wav"), changed = wav(); changed[50] ^= 1;
      await fs.chmod(file, 0o600); await fs.writeFile(file, changed); await fs.chmod(file, 0o400);
    }
    return original(...args);
  });
  await assert.rejects(f.store.lookup(m.artifactId), denied); assert.equal(manifests, 2);
});
test("two independent import owners compete on exclusive lock; no concurrent second publication", async t => {
  const f = await fixture(t), other = await openPrivateNarrationStore(f.config, "LOCAL_IMPORT"), original = fs.open.bind(fs);
  let reached!: () => void, resume!: () => void;
  const checkpoint = new Promise<void>(r => { reached = r; }), gate = new Promise<void>(r => { resume = r; }); let first = true;
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await original(...args);
    if (String(args[0]).endsWith(".import.lock") && first) { first = false; reached(); await gate; }
    return h;
  });
  const a = f.import(); await checkpoint;
  try { await assert.rejects(other.importWav(f.source, { origin: "SYNTHETIC_TEST_WAV", providerClaim: "NONE", originalScript: "UNAVAILABLE", listeningFeedback: "NOT_PROVIDED" }), denied); }
  finally { resume(); }
  const result = await a; t.mock.restoreAll(); assert.equal((await other.list()).artifacts.length, 1);
  assert.equal((await f.import()).artifactId, result.artifactId);
});
test("file and directory fsyncs precede successful registration in required order", async t => {
  const f = await fixture(t), original = fs.open.bind(fs), synced: string[] = [];
  t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const h = await original(...args), sync = h.sync.bind(h);
    t.mock.method(h, "sync", async () => { synced.push(String(args[0])); await sync(); }); return h;
  });
  const m = await f.import(), dir = f.dir(m.artifactId), a = synced.indexOf(path.join(dir, "audio.wav")), manifest = synced.indexOf(path.join(dir, "manifest.json")), commit = synced.indexOf(path.join(dir, "commit.json"));
  assert.ok(a >= 0 && manifest > a && commit > manifest); assert.ok(synced.lastIndexOf(dir) > commit);
  assert.ok(synced.lastIndexOf(path.join(f.config.root, "objects")) > commit);
});
test("read-only service-process restart recovers from disk without in-memory candidate authority", async t => {
  const f = await fixture(t), m = await f.import();
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/storyline/narration-private-store/reopen.fixture.ts"], {
    input: JSON.stringify({ config: f.config, artifactId: m.artifactId }), encoding: "utf8", timeout: 15000, maxBuffer: 65536,
    env: { NODE_ENV: "test", DATABASE_URL: "postgresql://dummy:unused@127.0.0.1:1/unreachable", NEXT_TELEMETRY_DISABLED: "1" },
  });
  const safeFailure = child.stderr.match(/READ_ONLY_FIXTURE_FAILED:[A-Z_]+|Error \[[A-Z_]+\]/)?.[0] ?? "FIXTURE_START_FAILED";
  assert.equal(child.status, 0, safeFailure); assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), m);
});
test("bounded artifact capacity refuses admission without eviction", async t => {
  const f = await fixture(t);
  for (let i = 1; i <= 16; i++) { await fs.writeFile(f.sourcePath, wav(i)); await f.import(); }
  const before = await f.store.list(); await fs.writeFile(f.sourcePath, wav(17)); await assert.rejects(f.import(), denied);
  assert.deepEqual(await f.store.list(), before);
});
