import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { test, type TestContext } from "node:test";
import {
  buildMediaSandboxHandoff, qualifyLinuxSandboxHost, SANDBOX_POLICY, SANDBOX_POLICY_SHA256,
} from "../../../lib/storyline/media-sandbox-runner";
import { QUALIFICATION_CASES, sha256 } from "../../../lib/storyline/media-sandbox-runner/contracts";
import { qualification } from "../../../lib/storyline/media-sandbox-runner/evidence";
import { verifyReviewedExecutable } from "../../../lib/storyline/media-sandbox-runner/executable";
import { checkMountInfo } from "../../../lib/storyline/media-sandbox-runner/isolation";
import { observeChild } from "../../../lib/storyline/media-sandbox-runner/lifecycle";
import { checkObservation } from "../../../lib/storyline/media-sandbox-runner/runner";

function elf() {
  // Parser fixture only. The synthetic payload is never executed.
  const bytes = Buffer.alloc(121);
  Buffer.from("7f454c46020101", "hex").copy(bytes);
  bytes.writeUInt16LE(2, 16);
  bytes.writeUInt16LE(62, 18);
  bytes.writeUInt32LE(1, 20);
  bytes.writeBigUInt64LE(BigInt(0x400078), 24);
  bytes.writeBigUInt64LE(BigInt(64), 32);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(1, 56);
  bytes.writeUInt32LE(1, 64);
  bytes.writeUInt32LE(5, 68);
  bytes.writeBigUInt64LE(BigInt(0x400000), 80);
  bytes.writeBigUInt64LE(BigInt(bytes.length), 96);
  return bytes;
}

async function executableFixture(t: TestContext, bytes = elf()) {
  const dir = await mkdtemp("/tmp/mtelf-");
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = dir + "/fixture";
  await writeFile(path, bytes, { mode: 0o500, flag: "wx" });
  return Object.freeze({ path, sha256: sha256(bytes), version: "reviewed-1",
    dependencyPolicy: "STATIC_ELF_LINUX_X64", ownerUid: process.getuid!() } as const);
}

test("policy is fixed, bounded, hash-bound, and local-descriptor-only", () => {
  assert.ok(Object.isFrozen(SANDBOX_POLICY));
  assert.equal(SANDBOX_POLICY_SHA256, sha256(JSON.stringify(SANDBOX_POLICY)));
  assert.equal(SANDBOX_POLICY.protocols, "LOCAL_SYNTHETIC_DESCRIPTOR_ONLY");
  assert.equal(SANDBOX_POLICY.uid, 65_534);
  assert.ok(SANDBOX_POLICY.memoryBytes < SANDBOX_POLICY.addressSpaceBytes);
  assert.equal(SANDBOX_POLICY.pids, 4);
});

for (const [name, mount, expected] of [
  ["no cgroup2", "1 0 0:1 / /sys/fs/cgroup rw - tmpfs tmpfs rw", "CGROUP_V2_UNAVAILABLE"],
  ["read-only mount", "1 0 0:1 / /sys/fs/cgroup ro - cgroup2 cgroup2 rw", "CGROUP_MOUNT_READ_ONLY"],
  ["read-only superblock", "1 0 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup2 ro", "CGROUP_MOUNT_READ_ONLY"],
  ["ambiguous mount", "1 0 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup2 rw\n2 0 0:2 / /sys/fs/cgroup rw - cgroup2 cgroup2 rw", "CGROUP_V2_UNAVAILABLE"],
  ["malformed mount", "1 0 0:1 / /sys/fs/cgroup rw", "CGROUP_V2_UNAVAILABLE"],
  ["mount availability only", "1 0 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup2 rw", undefined],
] as const) {
  test(name, () => assert.equal(checkMountInfo(mount), expected));
}

test("qualification has no default launch", async () => {
  assert.deepEqual(await qualifyLinuxSandboxHost(), {
    status: "HOST_ENFORCEMENT_NOT_RUN", checks: [], qualificationScope: "HARMLESS_FIXTURE_ONLY",
  });
});

for (const bad of [null, {}, { optIn: false }, { optIn: true, executable: "/untrusted" },
  { optIn: true, command: "anything" }, { optIn: true, args: ["--escape"] },
  { optIn: true, env: { PLACEHOLDER_SECRET: "never-propagate" } }, { optIn: true, receipt: {} }]) {
  test("arbitrary command, credential, receipt or malformed opt-in is rejected " + JSON.stringify(bad), async () => {
    await assert.rejects(qualifyLinuxSandboxHost(bad as never), { message: "FORBIDDEN_QUALIFICATION_OPTIONS" });
  });
}

test("inherited opt-in and accessor credentials cannot enter the qualification command", async () => {
  await assert.rejects(qualifyLinuxSandboxHost(Object.create({ optIn: true })), { message: "FORBIDDEN_QUALIFICATION_OPTIONS" });
  await assert.rejects(qualifyLinuxSandboxHost({
    optIn: true,
    get delegation(): never { return assert.fail("untrusted getter executed"); },
  }), { message: "FORBIDDEN_QUALIFICATION_OPTIONS" });
});

test("conflicting qualification cannot reserve a second launch and no delegation can be inferred", async () => {
  const first = qualifyLinuxSandboxHost({ optIn: true });
  const second = await qualifyLinuxSandboxHost({ optIn: true });
  assert.equal(second.blocker, "QUALIFICATION_BUSY");
  const result = await first;
  assert.equal(result.status, "HOST_ENFORCEMENT_BLOCKED");
  assert.deepEqual(result.checks, []);
});

test("exact reviewed immutable pin and live descriptor validation", async t => {
  const pin = await executableFixture(t);
  const handle = await verifyReviewedExecutable(pin);
  try {
    assert.ok(handle.descriptor >= 0);
    await handle.recheck();
  } finally {
    await handle.close();
  }
  await assert.rejects(handle.recheck(), { message: "EXECUTABLE_IDENTITY_DENIED" });
});

test("wrong SHA, owner, version, permissions, mutable pin or surplus fields are rejected", async t => {
  const pin = await executableFixture(t);
  for (const wrong of [Object.freeze({ ...pin, sha256: "0".repeat(64) }),
    Object.freeze({ ...pin, ownerUid: pin.ownerUid + 1 }), Object.freeze({ ...pin, version: "bad version" }),
    Object.freeze({ ...pin, extra: true }), { ...pin }]) {
    await assert.rejects(verifyReviewedExecutable(wrong), { message: "EXECUTABLE_IDENTITY_DENIED" });
  }
  for (const mode of [0o700, 0o555, 0o4500]) {
    await chmod(pin.path, mode);
    await assert.rejects(verifyReviewedExecutable(pin), { message: "EXECUTABLE_IDENTITY_DENIED" });
  }
});

test("wrong executable class or dynamic dependency is rejected even when rehashed", async t => {
  for (const header of [2, 3, 0x6474e551]) {
    const bytes = elf();
    bytes.writeUInt32LE(header, 64);
    const pin = await executableFixture(t, bytes);
    await assert.rejects(verifyReviewedExecutable(pin), { message: "EXECUTABLE_IDENTITY_DENIED" });
  }
});

test("path replacement with the same bytes fails immediately before launch", async t => {
  const pin = await executableFixture(t);
  const handle = await verifyReviewedExecutable(pin);
  try {
    await rename(pin.path, pin.path + "-old");
    await writeFile(pin.path, elf(), { mode: 0o500, flag: "wx" });
    await assert.rejects(handle.recheck(), { message: "EXECUTABLE_IDENTITY_DENIED" });
  } finally {
    await handle.close();
  }
});

test("final and ancestor symlinks fail without path disclosure", async t => {
  const pin = await executableFixture(t);
  const dir = pin.path.slice(0, pin.path.lastIndexOf("/"));
  await mkdir(dir + "/links");
  await symlink(dir, dir + "/links/ancestor");
  await symlink(pin.path, dir + "/links/file");
  for (const path of [dir + "/links/ancestor/fixture", dir + "/links/file", dir + "/../fixture"]) {
    await assert.rejects(verifyReviewedExecutable(Object.freeze({ ...pin, path })), { message: "EXECUTABLE_IDENTITY_DENIED" });
  }
});

class MockChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode = null;
  signalCode = null;
  kills = 0;
  unreferenced = false;
  asChild() { return this as unknown as ChildProcess; }
  kill() { this.kills++; this.emit("close", null, "SIGKILL"); return true; }
  unref() { this.unreferenced = true; }
}
const small = { wallMs: 30, cleanupMs: 25, stdoutBytes: 8, stderrBytes: 4 };

for (const [stream, expected] of [["stdout", "STDOUT_LIMIT"], ["stderr", "STDERR_LIMIT"]] as const) {
  test(stream + " overflow kills the child and invokes scoped cleanup without retaining output", async () => {
    const child = new MockChild();
    let cleanups = 0;
    const result = observeChild(child.asChild(), async () => { cleanups++; return true; }, small);
    child[stream].write(Buffer.from("fixture-only-overflow"));
    const outcome = await result;
    assert.equal(outcome.outcome, expected);
    assert.equal(outcome.stdout, "");
    assert.equal(child.kills, 1);
    assert.equal(cleanups, 1);
  });
}

test("timeout kills bootstrap and requires cgroup cleanup before returning", async () => {
  const child = new MockChild();
  const result = await observeChild(child.asChild(), async (deadline, terminateBootstrap) => {
    assert.equal(child.kills, 0);
    terminateBootstrap();
    return deadline >= performance.now();
  }, small);
  assert.equal(result.outcome, "TIMEOUT");
  assert.equal(child.kills, 1);
});

test("cleanup failure dominates a nominal child success", async () => {
  const child = new MockChild();
  const result = observeChild(child.asChild(), async () => false, small);
  child.emit("close", 0, null);
  assert.equal((await result).outcome, "CLEANUP_FAILED");
  assert.equal(child.unreferenced, true);
});

test("stuck cleanup is bounded and cannot leave a passing observation", async () => {
  const child = new MockChild();
  const result = observeChild(child.asChild(), () => new Promise(() => {}), small);
  child.emit("close", 0, null);
  assert.equal((await result).outcome, "CLEANUP_FAILED");
});

test("spawn failure and unexpected nonzero exit are separate and redacted", async () => {
  const child = new MockChild();
  const started = observeChild(child.asChild(), async () => true, small);
  child.emit("error", new Error("fixture-only-path-or-secret"));
  assert.equal((await started).outcome, "START_FAILED");
  const exited = new MockChild();
  const result = observeChild(exited.asChild(), async () => true, small);
  exited.emit("close", 125, null);
  assert.equal(checkObservation("isolation", await result).passed, false);
});

test("kernel control counter and marker are both needed for resource and timeout evidence", () => {
  const run = { outcome: "EXITED", code: 74, signal: null, stdout: "CPU_READY\n", stderrBytes: 0 } as const;
  const counters = { oomKilled: false, cpuThrottled: false, cpuLimitReached: false, pidLimitHit: false, descendantsPresent: false, emptyBeforeCleanup: false };
  assert.equal(checkObservation("cpu", run, counters).passed, false);
  assert.equal(checkObservation("cpu", run, { ...counters, cpuThrottled: true }).passed, false);
  assert.equal(checkObservation("cpu", run, { ...counters, cpuThrottled: true, cpuLimitReached: true }).passed, true);
  assert.equal(checkObservation("cpu", { ...run, outcome: "CLEANUP_FAILED" }, { ...counters, cpuThrottled: true }).passed, false);
  const timeout = { ...run, outcome: "TIMEOUT", stdout: "DESCENDANT_READY\n" } as const;
  assert.equal(checkObservation("timeout", timeout, counters).passed, false);
  assert.equal(checkObservation("timeout", timeout, { ...counters, descendantsPresent: true }).passed, true);
  const watchdog = { ...timeout, outcome: "EXITED", signal: "SIGALRM" } as const;
  assert.equal(checkObservation("watchdog", watchdog, counters).passed, false);
  assert.equal(checkObservation("watchdog", watchdog, { ...counters, emptyBeforeCleanup: true }).passed, true);
});

test("network, mount, syscall and privilege fixture checks cannot pass on arbitrary output", () => {
  for (const stdout of ["SOCKET_OPENED\n", "HOST_FILE_READ\n", "SETUID_OK\n", "SECCOMP_MISSING\n", "fixture-only-private-path"]) {
    const check = checkObservation("isolation", { outcome: "EXITED", code: 0, signal: null, stdout, stderrBytes: 0 });
    assert.deepEqual(check, { case: "isolation", passed: false, detail: "EXITED" });
  }
});

test("partial and reordered evidence cannot qualify and forged or M8 evidence grants no authority", () => {
  const checks = QUALIFICATION_CASES.map(name => ({ case: name, passed: true, detail: "synthetic" }));
  assert.equal(qualification(checks).status, "HOST_ENFORCEMENT_NOT_RUN");
  const id = { host: "x", implementation: "x", fixture: "x", policy: SANDBOX_POLICY_SHA256 };
  assert.equal(qualification(checks, undefined, id).status, "HOST_ENFORCEMENT_NOT_RUN");
  assert.equal(qualification(checks.slice(1), undefined, id).status, "HOST_ENFORCEMENT_NOT_RUN");
  assert.equal(qualification([...checks].reverse(), undefined, id).status, "HOST_ENFORCEMENT_NOT_RUN");
  for (const forged of [{ status: "HOST_ENFORCEMENT_VERIFIED", checks, identity: id },
    { status: "SANDBOX_QUALIFIED" }, { kind: "M8_FAKE_EXECUTION", realMediaVerified: true }]) {
    assert.throws(() => buildMediaSandboxHandoff(forged as never), { message: "UNSUPPORTED_PROBE_AUTHORITY" });
  }
  const handoff = buildMediaSandboxHandoff();
  for (const flag of ["probeExecutionAuthorized", "realMediaVerified", "sourceRightsVerified", "clipsExtracted",
    "narrationSyncVerified", "rendered", "productionEligible"] as const) assert.equal(handoff[flag], false);
});
