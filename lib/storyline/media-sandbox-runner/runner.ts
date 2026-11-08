import "server-only";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readlink, rmdir, unlink, writeFile } from "node:fs/promises";
import { release } from "node:os";
import { QUALIFICATION_CASES, SANDBOX_POLICY, SANDBOX_POLICY_SHA256, sha256, type FixtureCase } from "./contracts";
import { qualification, type Check, type HostIdentity, type Qualification } from "./evidence";
import { verifyReviewedExecutable } from "./executable";
import { preflight, reserveCgroup } from "./isolation";
import { observeChild } from "./lifecycle";

const fixtureSourceHash = "4e27c48cae45bb2aea86ba79ddc718f26a9e1c50adcbe98eb85a02a3b3b26e43";
const fixtureSource = "qualification-fixture.c";
const sourceFiles = Object.freeze([
  "contracts.ts", "evidence.ts", "executable.ts", "index.ts", "isolation.ts", "lifecycle.ts", fixtureSource, "runner.ts",
]);
const canary = "M10-04D harmless descriptor canary\n";
// The application augments ProcessEnv with NODE_ENV. The fixture intentionally receives no variables.
// Node otherwise copies NODE_V8_COVERAGE even for an explicit environment.
const emptyEnvironment = Object.freeze(Object.assign({} as NodeJS.ProcessEnv, { NODE_V8_COVERAGE: undefined }));
const compilerEnvironment = Object.freeze({ ...emptyEnvironment, PATH: "/usr/bin:/bin" });
const isolationControls = Object.freeze([
  "NAMESPACES_OK", "NON_ROOT_NO_NEW_PRIVS_OK", "NETWORK_DENIED", "SYSCALL_DENIED",
  "FILESYSTEM_ALLOWLIST_OK", "ADDRESS_SPACE_LIMIT_OK",
]);
const isolationOutput = isolationControls.join("\n") + "\n";
let qualifying = false;

type Options = Readonly<{ optIn: true; delegation?: string }>;
type Run = Awaited<ReturnType<typeof observeChild>>;
type Counters = Awaited<ReturnType<Awaited<ReturnType<typeof reserveCgroup>>["measure"]>>;

export function checkObservation(name: FixtureCase, run: Run, counters?: Counters): Check {
  const exited = run.outcome === "EXITED" && run.signal === null;
  const quiet = run.stderrBytes === 0;
  const passed = quiet && (name === "isolation" && exited && run.code === 0 && run.stdout === isolationOutput ||
    name === "pids" && exited && run.code === 0 && run.stdout === "PID_LIMIT_OK\n" && counters?.pidLimitHit ||
    name === "cpu" && exited && run.code === 74 && run.stdout === "CPU_READY\n" &&
      counters?.cpuThrottled && counters.cpuLimitReached && !counters.oomKilled ||
    name === "memory" && run.outcome === "EXITED" && run.signal === "SIGKILL" &&
      run.stdout === "MEMORY_READY\n" && counters?.oomKilled ||
    name === "stdout" && run.outcome === "STDOUT_LIMIT" ||
    name === "timeout" && run.outcome === "TIMEOUT" && run.stdout === "DESCENDANT_READY\n" && counters?.descendantsPresent ||
    name === "watchdog" && run.outcome === "EXITED" && run.signal === "SIGALRM" &&
      run.stdout === "DESCENDANT_READY\n" && counters?.emptyBeforeCleanup ||
    name === "exit" && exited && run.code === 73 && run.stdout === "") ||
    name === "stderr" && run.outcome === "STDERR_LIMIT";
  // Capture is private to this module. Never include fixture output or exception text in evidence.
  return { case: name, passed: !!passed, detail: passed ? "EXPECTED_ENFORCEMENT_OBSERVED" : run.outcome,
    ...(passed && name === "isolation" && { controls: isolationControls }),
  };
}

async function runCase(
  name: FixtureCase,
  delegation: string,
  root: string,
  inputPath: string,
  executable: Awaited<ReturnType<typeof verifyReviewedExecutable>>,
): Promise<Check> {
  if (!QUALIFICATION_CASES.includes(name)) throw new Error("FORBIDDEN_FIXTURE_CASE");
  const group = await reserveCgroup(delegation);
  let counters: Counters | undefined;
  let result: Run | undefined;
  try {
    const input = await open(inputPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      await executable.recheck();
      const child = spawn("/proc/self/fd/3", [name, root], {
        shell: false, detached: true, env: { ...emptyEnvironment }, cwd: "/",
        stdio: ["ignore", "pipe", "pipe", executable.descriptor, group.enroll.fd, input.fd],
      });
      const limits = name === "watchdog"
        ? { ...SANDBOX_POLICY, wallMs: SANDBOX_POLICY.watchdogObservationMs }
        : SANDBOX_POLICY;
      result = await observeChild(child, async (deadline, terminateBootstrap) => {
        counters = await group.measure().catch(() => undefined);
        terminateBootstrap();
        return group.killAndRemove(deadline);
      }, limits);
    } finally {
      await input.close();
    }
  } finally {
    await group.enroll.close();
    if (!result && !await group.killAndRemove(performance.now() + 2_000).catch(() => false)) {
      throw new Error("CGROUP_CLEANUP_UNPROVEN");
    }
  }
  return checkObservation(name, result, counters);
}

async function hostFingerprint(delegation: string) {
  const paths = ["user", "mnt", "net", "pid", "ipc", "uts", "cgroup"];
  const namespaces = await Promise.all(paths.map(name => readlink("/proc/self/ns/" + name)));
  const [bootId, kernel, status] = await Promise.all([
    readFile("/proc/sys/kernel/random/boot_id", "utf8"), readFile("/proc/version", "utf8"),
    readFile("/proc/self/status", "utf8"),
  ]);
  const boot = bootId.trim();
  const security = status.split("\n").filter(line => /^(Cap\w+|NoNewPrivs|Seccomp(?:_filters)?):/.test(line));
  if (!/^[a-f0-9-]{36}$/.test(boot)) throw new Error("HOST_IDENTITY_UNAVAILABLE");
  const group = await lstat(delegation, { bigint: true });
  return sha256(JSON.stringify([process.platform, process.arch, release(), process.version, boot,
    process.getuid?.(), process.getgid?.(), namespaces, kernel, security, String(group.dev), String(group.ino)]));
}

export async function qualifyLinuxSandboxHost(options?: Options): Promise<Qualification> {
  if (options === undefined) return qualification([]);
  if (!options || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).some(key => key !== "optIn" && key !== "delegation")) {
    throw new Error("FORBIDDEN_QUALIFICATION_OPTIONS");
  }
  const optIn = Object.getOwnPropertyDescriptor(options, "optIn");
  const scope = Object.getOwnPropertyDescriptor(options, "delegation");
  if (optIn?.value !== true || scope && (!("value" in scope) || scope.value !== undefined && typeof scope.value !== "string")) {
    throw new Error("FORBIDDEN_QUALIFICATION_OPTIONS");
  }
  if (qualifying) return qualification([], "QUALIFICATION_BUSY");
  qualifying = true;
  const delegation = scope?.value as string | undefined;
  let work: string | undefined;
  let executable: Awaited<ReturnType<typeof verifyReviewedExecutable>> | undefined;
  const checks: Check[] = [];
  let result: Qualification;
  let identity: HostIdentity | undefined;
  try {
    const blocked = await preflight(delegation);
    if (blocked) return qualification(checks, blocked);
    const host = await hostFingerprint(delegation!).catch(() => undefined);
    if (!host) return qualification(checks, "HOST_IDENTITY_UNAVAILABLE");
    const sources = await Promise.all(sourceFiles.map(name => readFile(new URL(name, import.meta.url))));
    const bytes = sources[sourceFiles.indexOf(fixtureSource)];
    if (sha256(bytes) !== fixtureSourceHash) return qualification(checks, "FIXTURE_IDENTITY_DENIED");

    work = await mkdtemp("/tmp/mtsandbox-");
    const root = work + "/root";
    const source = work + "/fixture.c";
    const binary = work + "/fixture";
    const input = work + "/source";
    await mkdir(root, { mode: 0o700 });
    await writeFile(source, bytes, { flag: "wx", mode: 0o400 });
    await writeFile(input, canary, { flag: "wx", mode: 0o400 });
    // Trusted installed compiler only. Source and arguments are fixed. No fixture is launched here.
    const compiler = spawn("/usr/bin/cc", ["-static", "-no-pie", "-O2", "-Wall", "-Wextra", "-Werror", source, "-o", binary], {
      shell: false, detached: true, env: { ...compilerEnvironment }, cwd: work,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const built = await observeChild(compiler, async (_deadline, terminateBootstrap) => {
      terminateBootstrap();
      if (!compiler.pid) return true;
      try {
        process.kill(-compiler.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
      }
      return true;
    }, { wallMs: 10_000, cleanupMs: 2_000, stdoutBytes: 8192, stderrBytes: 8192 });
    if (built.outcome !== "EXITED" || built.code !== 0 || built.stderrBytes !== 0 || built.stdout !== "") {
      throw new Error(built.outcome === "CLEANUP_FAILED" ? "CGROUP_CLEANUP_UNPROVEN" : "FIXTURE_BUILD_FAILED");
    }
    const compiled = await lstat(binary);
    if (!compiled.isFile() || compiled.size > 32 * 1024 * 1024) throw new Error("EXECUTABLE_IDENTITY_DENIED");
    await chmod(binary, 0o500);
    const fixture = sha256(await readFile(binary));
    executable = await verifyReviewedExecutable(Object.freeze({
      path: binary, sha256: fixture, version: "m10-04d-harmless-fixture-v1",
      dependencyPolicy: "STATIC_ELF_LINUX_X64", ownerUid: process.getuid!(),
    }));
    identity = { host, fixture, policy: SANDBOX_POLICY_SHA256,
      implementation: sha256(JSON.stringify(sources.map(sha256))) };
    for (const name of QUALIFICATION_CASES) {
      const check = await runCase(name, delegation!, root, input, executable);
      checks.push(check);
      if (!check.passed) break;
    }
    const complete = checks.length === QUALIFICATION_CASES.length && checks.every(check => check.passed);
    if (complete) {
      result = Object.freeze({ ...qualification(checks, undefined, identity), status: "HOST_ENFORCEMENT_VERIFIED" });
    } else {
      result = qualification(checks, checks.at(-1)?.detail === "CLEANUP_FAILED" ? "CLEANUP_UNPROVEN" :
        "ISOLATION_CHECK_FAILED", identity);
    }
  } catch (error) {
    const reason = (error as Error)?.message;
    result = qualification(checks, reason === "CGROUP_CLEANUP_UNPROVEN" ? "CLEANUP_UNPROVEN" :
      reason === "CGROUP_CONTROLS_UNAVAILABLE" ? "DELEGATION_UNAVAILABLE" :
        reason === "EXECUTABLE_IDENTITY_DENIED" ? "FIXTURE_IDENTITY_DENIED" :
          reason === "FIXTURE_BUILD_FAILED" ? reason : "ISOLATION_CHECK_FAILED", identity);
  } finally {
    let clean = true;
    await executable?.close().catch(() => { clean = false; });
    if (work) {
      for (const name of ["fixture", "fixture.c", "source"]) {
        try {
          await unlink(work + "/" + name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") clean = false;
        }
      }
      for (const dir of [work + "/root", work]) {
        try {
          await rmdir(dir);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") clean = false;
        }
      }
    }
    if (!clean) result = qualification(checks, "CLEANUP_UNPROVEN", identity);
    qualifying = false;
  }
  return result;
}
