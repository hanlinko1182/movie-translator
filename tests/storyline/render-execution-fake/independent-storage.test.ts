import test from "node:test";
import assert from "node:assert/strict";
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import { attachOwnedBlobFixture, byteHash, createOwnedBlobFixture, objectVersion } from "../../../lib/storyline/render-execution-fake/storage";

const scope = { tenantId: "tenant", projectId: "project", movieId: "movie", studioId: "studio" };

test("independent review: concurrent attachments cannot exceed 32 registered versions", async () => {
  const owner = await createOwnedBlobFixture(), a = await attachOwnedBlobFixture(owner), b = await attachOwnedBlobFixture(owner);
  const context = { namespace: owner.namespace, scope };
  try {
    for (let i = 0; i < 31; i++) await a.port.register(context, objectVersion());
    const outcomes = await Promise.allSettled(Array.from({ length: 9 }, (_, i) => (i % 2 ? a : b).port.register(context, objectVersion())));
    const registered = (await readdir(`${owner.root}/objects`)).filter(n => n.endsWith(".owner"));
    assert.ok(registered.length <= 32, `registered ${registered.length} versions`);
    assert.equal(registered.length, 32);
    assert.equal(registered.length, 31 + outcomes.filter(r => r.status === "fulfilled").length);
  } finally { await a.close(); await b.close(); }
});

test("independent review: concurrent creates retain four MiB of recovery headroom", async () => {
  const owner = await createOwnedBlobFixture(), a = await attachOwnedBlobFixture(owner), b = await attachOwnedBlobFixture(owner);
  const context = { namespace: owner.namespace, scope }, versions = Array.from({ length: 29 }, () => objectVersion());
  try {
    for (const v of versions) await a.port.register(context, v);
    for (const v of versions.slice(0, 27)) await a.port.create(context, v, new Uint8Array(1048576).fill(7));
    await Promise.allSettled(versions.slice(27).map((v, i) => (i % 2 ? a : b).port.create(context, v, new Uint8Array(1048576).fill(i + 1))));
    const blobs = (await readdir(`${owner.root}/objects`)).filter(n => n.endsWith(".blob"));
    let bytes = 0;
    for (const name of blobs) bytes += (await readFile(`${owner.root}/objects/${name}`)).length;
    assert.ok(bytes <= 29360128, `ordinary payload consumed ${bytes} bytes`);
    assert.equal(bytes, 29360128);
  } finally { await a.close(); await b.close(); }
});

test("independent review: a stranded mutation fence is never reaped by a new attachment", async () => {
  const owner = await createOwnedBlobFixture(), a = await attachOwnedBlobFixture(owner), context = { namespace: owner.namespace, scope }, v = objectVersion();
  try {
    await a.port.register(context, v); await a.port.create(context, v, Uint8Array.from([31]));
    await writeFile(`${owner.root}/MUTATION_LOCK`, "owner outcome unknown", { flag: "wx", mode: 0o600 });
    const b = await attachOwnedBlobFixture(owner);
    try {
      await assert.rejects(b.port.register(context, objectVersion()), { code: "STORAGE_BUSY" });
      await assert.rejects(b.port.remove(context, v, byteHash(Uint8Array.from([31])), 1, "intent"), { code: "STORAGE_BUSY" });
      assert.deepEqual(await b.port.read(context, v), Uint8Array.from([31]));
      assert.equal(await readFile(`${owner.root}/MUTATION_LOCK`, "utf8"), "owner outcome unknown");
    } finally { await b.close(); }
  } finally { await a.close(); }
});

test("independent review: a prior tombstone cannot authorize deletion of substituted bytes", async () => {
  const owner = await createOwnedBlobFixture(), f = await attachOwnedBlobFixture(owner);
  const context = { namespace: owner.namespace, scope }, v = objectVersion(), bytes = Uint8Array.from([17, 23, 41]);
  try {
    await f.port.register(context, v); await f.port.create(context, v, bytes);
    // Owner fault injection models a crash after tombstone persistence, before unlink,
    // followed by corruption. Only fresh, owned, non-media fixture bytes are touched.
    await writeFile(`${owner.root}/objects/${v}.deleted`, JSON.stringify({ version: v, byteSha256: byteHash(bytes), byteCount: bytes.length, intent: "original-delete" }), { flag: "wx", mode: 0o400 });
    await chmod(`${owner.root}/objects/${v}.blob`, 0o600);
    await writeFile(`${owner.root}/objects/${v}.blob`, Uint8Array.from([17, 23, 42]));
    await assert.rejects(f.port.remove(context, v, byteHash(bytes), bytes.length, "original-delete"), { code: "DELETE_MISMATCH" });
    assert.deepEqual(await f.port.read(context, v), Uint8Array.from([17, 23, 42]));
  } finally { await f.close(); }
});
