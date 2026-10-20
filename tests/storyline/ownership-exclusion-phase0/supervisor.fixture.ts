// Phase 0 supervisor only. There is deliberately no fence unlink, hold release, GC or launch port.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, open, readFile, readdir, stat, lstat, appendFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { ceilings, phase0Hash, phase0Record } from "./contracts.fixture";

type Fd = { fd: number; device: string; inode: string; cloexec: boolean; regular: boolean };
type Identity = { pid: number; ppid: number; bootHash: string; start: string };
type Value = { fds?: Fd[]; locked?: boolean; sealed?: boolean; closed?: boolean; noFutureIO?: boolean; probe?: { identity: Identity; fds: Fd[] } };
type Reply = { id?: number; event?: string; ok?: boolean; code?: string; value?: Value; identity?: Identity; fds?: Fd[] };
type CloseReceipt = Readonly<{ toJSON(): never }>;
const receipts = new WeakMap<CloseReceipt, { fixture: string; owner: string; method: "SEALED" | "REAPED"; identity: Identity }>();
const childFile = fileURLToPath(new URL("./owner-child.fixture.py", import.meta.url));
let activeRoots = 0;
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
async function processIdentity(pid: number) {
  const start = (await readFile(`/proc/${pid}/stat`, "utf8")).split(")").slice(1).join(")").trim().split(/\s+/)[19];
  const bootHash = digest((await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim());
  return { start, bootHash };
}

export async function ownershipFixture() {
  if (process.platform !== "linux" || tmpdir() !== "/tmp") throw Error("UNSUPPORTED_HOST");
  if (activeRoots >= ceilings.activeRoots) throw Error("ROOT_LIMIT");
  activeRoots++;
  const root = await mkdtemp(join(tmpdir(), "movie-translator-m806p0-"));
  const id = randomUUID(), incarnation = randomUUID(), supervisor = randomUUID();
  const parentIdentity = await processIdentity(process.pid);
  const marker = { id, incarnation, supervisor, phase: "DISPOSABLE_FAKE_ONLY_PHASE0" };
  for (const [name, bytes] of [["OWNED.json", JSON.stringify(marker)], ["GUARD", ""], ["fixture.blob", "arbitrary Phase 0 non-media bytes\n"]]) {
    const file = await open(join(root, name), "wx", 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  }
  const directory = await open(root, "r"); try { await directory.sync(); } finally { await directory.close(); }
  const rootStat = await stat(root, { bigint: true }), guardStat = await stat(join(root, "GUARD"), { bigint: true });
  const rootIdentity = { device: String(rootStat.dev), inode: String(rootStat.ino) };
  const guard = { device: String(guardStat.dev), inode: String(guardStat.ino) };
  const registration = phase0Record("root", { id, incarnation, supervisor, bootHash: parentIdentity.bootHash, ...rootIdentity });
  const owners = new Map<string, Owner>();
  const decisions = new Map<string, { binding: string; result: { generation: number; revision: number } }>();
  let generation = 1, revision = 0, rootClosed = false;
  const observations: unknown[] = [{ event: "fixture", root, marker, registration, guard, parent: { pid: process.pid, ...parentIdentity } }];
  let children = 0;
  async function log(value: unknown) {
    observations.push(value);
    const base = process.env.PHASE0_RECEIPTS;
    if (base) {
      const folder = resolve(base);
      if (!folder.startsWith(resolve("coverage") + "/m8-06-phase0-")) throw Error("RECEIPT_PATH");
      await mkdir(folder, { recursive: true });
      await appendFile(join(folder, `${id}.jsonl`), JSON.stringify(value) + "\n", { mode: 0o600 });
    }
  }
  await log(observations[0]);
  async function launch(overrides: Record<string, unknown> = {}) {
    if (rootClosed) throw Error("ROOT_CLOSED");
    if (++children > ceilings.children) throw Error("CHILD_LIMIT");
    const ownerId = "owner-" + randomUUID();
    const child = spawn("/usr/bin/python3", ["-I", "-S", "-B", childFile], {
      shell: false, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"],
    });
    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(done => child.once("exit", (code, signal) => done({ code, signal })));
    const closed = new Promise<void>(done => child.once("close", () => done()));
    let pending: { resolve: (v: Reply) => void; reject: (e: Error) => void } | undefined;
    let readyResolve!: (v: Reply) => void, readyReject!: (e: Error) => void;
    const ready = new Promise<Reply>((done, reject) => { readyResolve = done; readyReject = reject; });
    let bytes = 0, sequence = 0, sealed = false, reaped = false, guardHeld = false, busy = false, revoked = false, closureProven = false;
    let activeOp: string | undefined;
    let descendantUnknown = false;
    const cuts = new Map<string, Reply>(), cutWaiters = new Map<string, (r: Reply) => void>();
    const gen = generation;
    const timer = setTimeout(() => child.kill("SIGKILL"), ceilings.lifetimeMs);
    const lines = createInterface({ input: child.stdout });
    child.stderr.on("data", chunk => { bytes += chunk.length; if (bytes > ceilings.diagnosticBytes) child.kill("SIGKILL"); });
    lines.on("line", line => {
      bytes += Buffer.byteLength(line); if (bytes > ceilings.diagnosticBytes || line.length > ceilings.envelope) { child.kill("SIGKILL"); return; }
      try {
        const reply: Reply = JSON.parse(line);
        if (reply.event === "ready") readyResolve(reply);
        else if (reply.event === "blocked") readyReject(Error(reply.code ?? "BLOCKED"));
        else if (reply.event === "cut" && reply.code) { cuts.set(reply.code, reply); cutWaiters.get(reply.code)?.(reply); }
        else if (reply.id === sequence && pending) { const p = pending; pending = undefined; p.resolve(reply); }
        else throw Error("UNEXPECTED_REPLY");
      } catch (error) { readyReject(error as Error); pending?.reject(error as Error); child.kill("SIGKILL"); }
    });
    child.once("error", error => { readyReject(error); pending?.reject(error); });
    child.once("exit", () => { readyReject(Error("CHILD_EXIT")); pending?.reject(Error("ACK_UNKNOWN")); pending = undefined; });
    child.stdin.write(JSON.stringify({ root, rootIdentity, guard, marker, owner: ownerId, generation: gen, ...overrides }) + "\n");
    let hello: Reply;
    try { hello = await ready; } catch (error) {
      const result = await exit; await closed; clearTimeout(timer);
      await log({ event: "registration-denied", ownerId, result, code: error instanceof Error ? error.message : "BLOCKED" });
      throw error;
    }
    if (!hello.identity || hello.identity.pid !== child.pid || hello.identity.ppid !== process.pid) throw Error("CHILD_IDENTITY");
    const independent = await processIdentity(child.pid!);
    if (hello.identity.start !== independent.start || hello.identity.bootHash !== parentIdentity.bootHash) throw Error("CHILD_IDENTITY");
    const identity = hello.identity;
    const ownerRecord = phase0Record("owner", { id: ownerId, incarnation: ownerId, rootHash: phase0Hash("root", registration),
      supervisor, bootHash: identity.bootHash, processStart: identity.start, pid: String(identity.pid), generation: gen, descriptorPolicy: "NO_TRANSFER_CLOEXEC" });
    await log({ event: "registered-child", ownerId, generation: gen, identity, independent, ownerRecord, fds: hello.fds });
    async function command(op: string, requestedGeneration = gen): Promise<Value> {
      if (busy || reaped) throw Error("OWNER_UNAVAILABLE");
      if (["lock", "write", "write-no-ack", "read", "probe", "probe-no-ack"].includes(op) && (sealed || gen !== generation)) throw Error("STALE_OR_SEALED");
      if (revoked && ["lock", "write", "write-no-ack", "read"].includes(op)) throw Error("REVOKED");
      if (["probe", "probe-no-ack"].includes(op) && ++children > ceilings.children) throw Error("CHILD_LIMIT");
      if (++sequence > ceilings.commands) throw Error("COMMAND_LIMIT");
      busy = true;
      activeOp = op;
      try {
        const response = new Promise<Reply>((done, reject) => { pending = { resolve: done, reject }; });
        const wire = JSON.stringify({ id: sequence, op, generation: requestedGeneration }) + "\n";
        if (Buffer.byteLength(wire) > ceilings.commandBytes) throw Error("COMMAND_LIMIT");
        child.stdin.write(wire);
        const reply = await response;
        await log({ event: "command", ownerId, op, generation: requestedGeneration, reply });
        if (!reply.ok) throw Error(reply.code ?? "DENIED");
        if (op === "lock") guardHeld = true;
        if (op === "seal") { sealed = true; guardHeld = false; }
        return reply.value ?? {};
      } finally { busy = false; activeOp = undefined; }
    }
    async function descriptorObservation() {
      const fds: { fd: string; device: string; inode: string; target: string }[] = [];
      for (const fd of await readdir(`/proc/${child.pid}/fd`)) {
        const target = `/proc/${child.pid}/fd/${fd}`;
        const s = await stat(target, { bigint: true });
        fds.push({ fd, device: String(s.dev), inode: String(s.ino), target });
      }
      await log({ event: "independent-descriptors", ownerId, fds });
      return fds;
    }
    function receipt(method: "SEALED" | "REAPED") {
      const cap = Object.freeze({ toJSON(): never { throw Error("NON_SERIALIZABLE_CLOSURE"); } });
      receipts.set(cap, { fixture: id, owner: ownerId, method, identity });
      closureProven = true;
      return cap;
    }
    const owner = {
      ownerId, generation: gen, identity, hello, command, descriptorObservation,
      isClosed: () => closureProven, holdsGuard: () => guardHeld,
      revoke: () => { revoked = true; }, deliveryAllowed: () => !revoked && !sealed && !reaped,
      async waitForCut(op: string) {
        const reply = cuts.has(op) ? cuts.get(op)! : await new Promise<Reply>(done => cutWaiters.set(op, done));
        await log({ event: "crash-barrier", ownerId, op, reply });
        return reply;
      },
      async seal() {
        const value = await command("seal");
        if (!value.closed || !value.noFutureIO || value.fds?.some(fd => fd.fd > 2)) throw Error("INCOMPLETE_CLOSURE");
        const actual = await descriptorObservation();
        if (actual.some(fd => Number(fd.fd) > 2)) throw Error("INCOMPLETE_CLOSURE");
        await log({ event: "closure", ownerId, method: "SEALED", identity, actual });
        return receipt("SEALED");
      },
      async killAndReap() {
        descendantUnknown ||= activeOp === "probe" || activeOp === "probe-no-ack";
        if (!reaped) {
          child.kill("SIGKILL");
          const result = await exit; await closed; reaped = true; guardHeld = false; clearTimeout(timer);
          await log({ event: "reaped", ownerId, identity, result });
          if (result.signal !== "SIGKILL") throw Error("TERMINATION_NOT_PROVEN");
        }
        if (descendantUnknown) throw Error("DESCENDANT_QUIESCENCE_UNKNOWN");
        return receipt("REAPED");
      },
      async stop() {
        if (!reaped) {
          if (busy) await owner.killAndReap();
          else { await command("exit"); await exit; await closed; reaped = true; guardHeld = false; clearTimeout(timer); }
        }
        lines.close();
      },
    };
    Object.freeze(owner);
    owners.set(ownerId, owner);
    return owner;
  }
  type Owner = Awaited<ReturnType<typeof launch>>;
  async function qualifySuccessor(decisionId: string, closure: CloseReceipt, observer: Owner, expectedGeneration: number, expectedRevision: number) {
    if (rootClosed) throw Error("ROOT_CLOSED");
    const original = receipts.get(closure);
    if (!original || original.fixture !== id || !owners.get(original.owner)?.isClosed()) throw Error("CLOSURE_REQUIRED");
    const binding = JSON.stringify({ owner: original.owner, observer: observer.ownerId, expectedGeneration, expectedRevision });
    const prior = decisions.get(decisionId);
    if (prior) { if (prior.binding !== binding) throw Error("DECISION_CONFLICT"); return prior.result; }
    if (generation !== expectedGeneration || revision !== expectedRevision) throw Error("CAS_CONFLICT");
    if (owners.get(observer.ownerId) !== observer || !observer.holdsGuard()
      || [...owners.values()].some(o => o !== observer && !o.isClosed())) throw Error("OWNER_NOT_QUIESCENT");
    const status = await observer.command("status");
    if (!status.locked) throw Error("GUARD_REQUIRED");
    const currentGuard = await lstat(join(root, "GUARD"), { bigint: true }), currentRoot = await lstat(root, { bigint: true });
    if (!currentGuard.isFile() || String(currentGuard.nlink) !== "1" || String(currentGuard.ino) !== guard.inode || String(currentGuard.dev) !== guard.device
      || !currentRoot.isDirectory() || String(currentRoot.ino) !== rootIdentity.inode || String(currentRoot.dev) !== rootIdentity.device) throw Error("GUARD_IDENTITY");
    if (generation !== expectedGeneration || revision !== expectedRevision) throw Error("CAS_CONFLICT");
    // In-memory feasibility CAS only. No fence/hold removal or operational outcome change.
    const result = Object.freeze({ generation: ++generation, revision: ++revision });
    decisions.set(decisionId, { binding, result });
    await log({ event: "qualified-for-future-phase1-only", decisionId, binding, result });
    return result;
  }
  return { root, id, marker, rootIdentity, guard, registration, launch, qualifySuccessor,
    observations: () => structuredClone(observations), revision: () => ({ generation, revision }),
    closureRecognized: (value: unknown) => typeof value === "object" && value !== null && receipts.has(value as CloseReceipt),
    async close() {
      if (rootClosed) return;
      rootClosed = true;
      for (const owner of owners.values()) await owner.stop();
      await log({ event: "fixture-closed", id }); activeRoots--;
    },
  };
}
