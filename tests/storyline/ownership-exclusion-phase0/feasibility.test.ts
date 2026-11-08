import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rename, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { ownershipFixture } from "./supervisor.fixture";
import { ceilings, parsePhase0, phase0Domains, phase0Hash, phase0Record, phase0Restrictions, scope, type Kind } from "./contracts.fixture";
import { createFakeProcessOwnerForTest } from "../../../lib/storyline/render-execution-fake/process";

const hash = "a".repeat(64), id = "synthetic-id";
const samples: Record<Kind, unknown> = {
  root: { id, incarnation: id, supervisor: id, bootHash: hash, device: "1", inode: "2" },
  owner: { id, incarnation: id, rootHash: hash, supervisor: id, bootHash: hash, processStart: "12", pid: "123", generation: 1, descriptorPolicy: "NO_TRANSFER_CLOEXEC" },
  guard: { rootHash: hash, device: "1", inode: "2", registered: true },
  mutation: { id, ownerHash: hash, version: id, intentHash: hash, generation: 1, revision: 0, state: "UNKNOWN" },
  "writer-closure": { mutationHash: hash, ownerHash: hash, guardHash: hash, allDescriptorsClosed: true, noFutureIO: true, quiescent: true },
  reader: { id, ownerHash: hash, version: id, ticketHash: hash, generation: 1, state: "UNKNOWN" },
  "reader-closure": { readerHash: hash, ownerHash: hash, allDescriptorsClosed: true, noFutureOpen: true, quiescent: true },
  decision: { id, action: "QUALIFY_SUCCESSOR", expectedGeneration: 1, expectedRevision: 0, evidence: [hash], outcome: "BLOCKED" },
  incident: { id, targetHash: hash, code: "CLOSURE" }, health: { state: "BLOCKED", registeredOwners: 1, closedOwners: 0, pending: 1 },
  authority: { principal: id, grants: ["OBSERVE"], generation: 1 }, audit: { decisionHash: hash, previousHash: hash, sequence: 0, actor: id },
};
let originalFetch: typeof globalThis.fetch;
before(() => { originalFetch = globalThis.fetch; globalThis.fetch = () => { throw Error("PHASE0_NETWORK_FORBIDDEN"); }; });
after(() => { globalThis.fetch = originalFetch; });

for (const kind of Object.keys(samples) as Kind[]) test(`contract ${kind}: strict fake domain, exact fields and immutable canonical record`, () => {
  const record = phase0Record(kind, samples[kind]);
  assert.equal(new Set(Object.values(phase0Domains)).size, 12);
  assert.ok(Object.isFrozen(record) && Object.isFrozen(record.body));
  assert.equal(phase0Hash(kind, record), phase0Hash(kind, structuredClone(record)));
  for (const forged of [
    { ...record, role: "administrator" }, { ...record, scope: { ...scope, tenantId: "foreign" } },
    { ...record, schemaVersion: "story-recap-execution-result-v1" },
    { ...record, restrictions: { ...phase0Restrictions, publicationEligibility: true } },
    { ...record, body: { ...(record.body as object), sourcePath: "/untrusted" } },
  ]) assert.throws(() => parsePhase0(kind, forged));
});
test("contracts reject incomplete closure, invalid numbers, authority promotion and serialization traps", () => {
  for (const patch of [{ quiescent: null }, { noFutureIO: false }, { allDescriptorsClosed: undefined }]) {
    assert.throws(() => phase0Record("writer-closure", { ...(samples["writer-closure"] as object), ...patch }));
  }
  for (const value of [-0, 1.5, Number.MAX_SAFE_INTEGER, null, "1"]) {
    assert.throws(() => phase0Record("decision", { ...(samples.decision as object), expectedGeneration: value }));
  }
  for (const grants of [["EXECUTE"], ["QUARANTINE"], ["INSPECT_SOURCE"], [null], ["OBSERVE", "OBSERVE"]])
    assert.throws(() => phase0Record("authority", { principal: id, grants, generation: 1 }));
  assert.throws(() => phase0Record("incident", { id: "x".repeat(ceilings.envelope + 1), targetHash: hash, code: "UNKNOWN" }));
  const getter = Object.defineProperty({}, "id", { enumerable: true, get() { assert.fail("getter must never execute"); } });
  assert.throws(() => phase0Record("root", getter));
});

test("A01: independent attachments cannot overlap a live writer's pinned guard", async () => {
  const f = await ownershipFixture();
  try {
    await assert.rejects(ownershipFixture(), /ROOT_LIMIT/);
    const w = await f.launch(), observer = await f.launch();
    assert.equal((await w.command("lock")).locked, true); await w.command("write");
    await assert.rejects(observer.command("lock"), /BUSY/);
    await assert.rejects(f.qualifySuccessor("no-evidence", {} as never, observer, 1, 0), /CLOSURE_REQUIRED/);
    const bytes = await readFile(join(f.root, `${w.ownerId}.blob`));
    assert.match(bytes.toString(), /NON-MEDIA/);
    const closure = await w.seal();
    await observer.command("lock");
    assert.deepEqual(await f.qualifySuccessor("original-decision", closure, observer, 1, 0), { generation: 2, revision: 1 });
    assert.deepEqual(await readFile(join(f.root, `${w.ownerId}.blob`)), bytes);
  } finally { await f.close(); }
});

test("A03: stale generation and queued callback cannot reopen or write after qualification", async () => {
  const f = await ownershipFixture();
  try {
    const w = await f.launch(); await w.command("lock"); await w.command("write");
    await assert.rejects(w.command("write", 2), /STALE_GENERATION/);
    const queued = () => w.command("write");
    const before = await readFile(join(f.root, `${w.ownerId}.blob`));
    const closure = await w.seal(), observer = await f.launch(); await observer.command("lock");
    await f.qualifySuccessor("takeover-observation", closure, observer, 1, 0);
    await assert.rejects(queued(), /STALE_OR_SEALED/);
    assert.deepEqual(await readFile(join(f.root, `${w.ownerId}.blob`)), before);
    await assert.rejects(f.qualifySuccessor("stale-cas", closure, observer, 1, 0), /CAS_CONFLICT/);
  } finally { await f.close(); }
});

for (const cut of ["write-no-ack", "seal-no-ack"] as const) test(`A04/G02: SIGKILL at ${cut}, original child closure and zero replacement fake starts`, async () => {
  const f = await ownershipFixture(), processOwner = createFakeProcessOwnerForTest();
  const context = { namespace: `fixture-${f.id}`, scope: { tenantId: scope.tenantId, projectId: scope.projectId, movieId: scope.movieId, studioId: scope.studioId } };
  await processOwner.invoke(processOwner.arm(context, `original-${cut}`, "submission", hash, 1), 1);
  try {
    const w = await f.launch(); await w.command("lock");
    if (cut === "seal-no-ack") await w.command("write");
    const uncertain = assert.rejects(w.command(cut), /ACK_UNKNOWN/);
    await w.waitForCut(cut);
    // A missing ACK is not closure authority, even when a child says it closed.
    assert.equal(f.closureRecognized({ quiescent: true, noFutureIO: true }), false);
    const closure = await w.killAndReap(); await uncertain;
    const original = await readFile(join(f.root, `${w.ownerId}.blob`));
    const observer = await f.launch(); await observer.command("lock");
    const result = await f.qualifySuccessor("lost-observation-ack", closure, observer, 1, 0);
    assert.deepEqual(await f.qualifySuccessor("lost-observation-ack", closure, observer, 1, 0), result);
    await assert.rejects(f.qualifySuccessor("lost-observation-ack", closure, observer, 2, 1), /DECISION_CONFLICT/);
    assert.deepEqual(await readFile(join(f.root, `${w.ownerId}.blob`)), original);
    assert.equal(processOwner.starts(), 1);
    assert.equal("invoke" in f, false); assert.equal("arm" in f, false);
    assert.equal("releaseHold" in f, false); assert.equal("remove" in f, false);
    assert.equal(createFakeProcessOwnerForTest().starts(), 0);
  } finally { await f.close(); }
});

test("A06: legacy fence, foreign marker and fake closure remain blocked without mutation", async () => {
  const f = await ownershipFixture();
  try {
    await writeFile(join(f.root, "MUTATION_LOCK"), "legacy ownership unknown", { flag: "wx", mode: 0o600 });
    await assert.rejects(f.launch({ marker: { ...f.marker, incarnation: "foreign" } }), /MARKER/);
    const observer = await f.launch(); await observer.command("lock");
    await assert.rejects(f.qualifySuccessor("legacy", {} as never, observer, 1, 0), /CLOSURE_REQUIRED/);
    assert.equal(await readFile(join(f.root, "MUTATION_LOCK"), "utf8"), "legacy ownership unknown");
    assert.deepEqual(f.revision(), { generation: 1, revision: 0 });
  } finally { await f.close(); }
});

test("A07: replacing the guard inode cannot create an accepted competing exclusion domain", async () => {
  const f = await ownershipFixture();
  try {
    const original = await f.launch(); await original.command("lock");
    await rename(join(f.root, "GUARD"), join(f.root, "ORIGINAL_GUARD"));
    const replacement = await open(join(f.root, "GUARD"), "wx", 0o600); await replacement.close();
    await assert.rejects(f.launch(), /GUARD_IDENTITY/);
    await assert.rejects(original.command("write"), /GUARD_IDENTITY/);
    assert.equal((await stat(join(f.root, "ORIGINAL_GUARD"), { bigint: true })).ino.toString(), f.guard.inode);
    // Original cleanup closes descriptors; it neither unlinks nor replaces a guard.
    await original.seal();
    assert.notEqual((await stat(join(f.root, "GUARD"), { bigint: true })).ino.toString(), f.guard.inode);
    assert.ok(await stat(join(f.root, "ORIGINAL_GUARD")));
  } finally { await f.close(); }
});

test("B02: revocation with an open reader descriptor is not quiescence or a release receipt", async () => {
  const f = await ownershipFixture();
  try {
    const reader = await f.launch(); await reader.command("read");
    const blob = await stat(join(f.root, "fixture.blob"), { bigint: true });
    reader.revoke();
    const actual = await reader.descriptorObservation();
    assert.ok(actual.some(fd => fd.inode === blob.ino.toString() && fd.device === blob.dev.toString()));
    assert.equal(reader.isClosed(), false); assert.equal(reader.deliveryAllowed(), false);
    assert.equal(f.closureRecognized({ expired: true, revoked: true }), false);
    await assert.rejects(reader.command("read"), /REVOKED/);
    const closure = await reader.seal(); assert.equal(f.closureRecognized(closure), true);
    assert.ok((await reader.descriptorObservation()).every(fd => Number(fd.fd) <= 2));
  } finally { await f.close(); }
});

test("A07: guard replacement after acquisition denies the successor observation itself", async () => {
  const f = await ownershipFixture();
  try {
    const old = await f.launch(), closure = await old.seal(), observer = await f.launch();
    await observer.command("lock");
    await rename(join(f.root, "GUARD"), join(f.root, "ORIGINAL_GUARD"));
    const replacement = await open(join(f.root, "GUARD"), "wx", 0o600); await replacement.close();
    await assert.rejects(f.qualifySuccessor("late-replacement", closure, observer, 1, 0), /GUARD_IDENTITY/);
    assert.deepEqual(f.revision(), { generation: 1, revision: 0 });
    assert.ok(await stat(join(f.root, "GUARD"))); assert.ok(await stat(join(f.root, "ORIGINAL_GUARD")));
  } finally { await f.close(); }
});

test("B05: CLOEXEC prevents fixed probe inheriting root, guard and reader descriptors", async () => {
  const f = await ownershipFixture();
  try {
    const reader = await f.launch(); await reader.command("lock"); await reader.command("read");
    const { probe, fds } = await reader.command("probe");
    assert.ok(fds && fds.filter(fd => fd.fd > 2).length === 3);
    assert.ok(fds.filter(fd => fd.fd > 2).every(fd => fd.cloexec));
    assert.ok(probe && probe.fds.every(fd => fd.fd <= 2));
    assert.equal(probe.identity.ppid, reader.identity.pid);
    await assert.rejects(reader.command("probe"), /NO_PROBE_TICKET/);
    await assert.rejects(reader.command("export-descriptor"), /UNSUPPORTED_COMMAND/);
    const closure = await reader.seal();
    assert.throws(() => JSON.stringify(closure), /NON_SERIALIZABLE/);
    assert.equal(f.closureRecognized({ ...closure }), false);
    assert.equal(f.closureRecognized(phase0Record("reader-closure", samples["reader-closure"])), false);
    await assert.rejects(reader.command("read"), /STALE_OR_SEALED/);
  } finally { await f.close(); }
});

test("B05: one-use reader ticket cannot be reopened even while its owner remains alive", async () => {
  const f = await ownershipFixture();
  try {
    const r = await f.launch(); await r.command("read");
    await assert.rejects(r.command("read"), /NO_READ_TICKET/);
    await r.seal(); await assert.rejects(r.command("read"), /STALE_OR_SEALED/);
    const final = await r.command("status"); assert.equal(final.sealed, true); assert.equal(final.locked, false);
  } finally { await f.close(); }
});

test("B05: uncertain descendant observation remains BLOCKED even after owner reaping and free guard", async () => {
  const f = await ownershipFixture();
  try {
    const owner = await f.launch(); await owner.command("lock");
    const pending = assert.rejects(owner.command("probe-no-ack"), /ACK_UNKNOWN/);
    await owner.waitForCut("probe-no-ack");
    await assert.rejects(owner.killAndReap(), /DESCENDANT_QUIESCENCE_UNKNOWN/); await pending;
    await assert.rejects(owner.killAndReap(), /DESCENDANT_QUIESCENCE_UNKNOWN/);
    assert.equal(owner.isClosed(), false);
    const closed = await f.launch(), receipt = await closed.seal(), observer = await f.launch();
    await observer.command("lock");
    await assert.rejects(f.qualifySuccessor("no-descendant-proof", receipt, observer, 1, 0), /OWNER_NOT_QUIESCENT/);
    assert.deepEqual(f.revision(), { generation: 1, revision: 0 });
  } finally { await f.close(); }
});

test("A01/G02: guard acquisition alone cannot substitute for unclosed registered owners", async () => {
  const f = await ownershipFixture();
  try {
    const closed = await f.launch(), strandedReader = await f.launch(), observer = await f.launch();
    const closure = await closed.seal(); await strandedReader.command("read"); await observer.command("lock");
    await assert.rejects(f.qualifySuccessor("not-fully-closed", closure, observer, 1, 0), /OWNER_NOT_QUIESCENT/);
    assert.deepEqual(f.revision(), { generation: 1, revision: 0 });
    await strandedReader.seal();
    assert.deepEqual(await f.qualifySuccessor("fully-closed", closure, observer, 1, 0), { generation: 2, revision: 1 });
  } finally { await f.close(); }
});

test("G02: fake UNKNOWN with zero or one start remains unchanged by ownership observation", async () => {
  for (const fault of ["BEFORE_START", "UNKNOWN"] as const) {
    const f = await ownershipFixture(), p = createFakeProcessOwnerForTest();
    const context = { namespace: `fixture-${f.id}`, scope: { tenantId: scope.tenantId, projectId: scope.projectId, movieId: scope.movieId, studioId: scope.studioId } };
    try {
      await assert.rejects(p.invoke(p.arm(context, `original-${f.id}`, `submission-${f.id}`, hash, 1), 1, fault));
      const before = p.starts(), owner = await f.launch(); await owner.command("lock");
      const receipt = await owner.killAndReap(), observer = await f.launch(); await observer.command("lock");
      await f.qualifySuccessor("observe-only", receipt, observer, 1, 0);
      assert.equal(p.starts(), before); assert.equal(p.originalResult(`original-${f.id}`), null);
      assert.equal(f.closureRecognized({ toJSON: () => ({ receipt: true }) }), false);
    } finally { await f.close(); }
  }
});

test("source boundary: fixed enumerated child, no arbitrary subprocess path or operational release", async () => {
  const child = await readFile(new URL("./owner-child.fixture.py", import.meta.url), "utf8");
  const supervisor = await readFile(new URL("./supervisor.fixture.ts", import.meta.url), "utf8");
  assert.equal((child.match(/subprocess\.run\(/g) ?? []).length, 1);
  assert.match(child, /sys\.executable, "-I", "-S", "-B", __file__, "--descriptor-probe"/);
  assert.match(supervisor, /spawn\("\/usr\/bin\/python3"/);
  assert.equal((supervisor.match(/spawn\(/g) ?? []).length, 1);
  for (const source of [child, supervisor]) assert.doesNotMatch(source, /ffmpeg|ffprobe|child_process.*exec|SCM_RIGHTS|os\.fork|os\.dup|os\.unlink|unlink\(|prisma|bullmq|openrouter/i);
});
