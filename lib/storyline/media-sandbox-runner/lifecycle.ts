import "server-only";
import type { ChildProcess } from "node:child_process";
import { SANDBOX_POLICY, type RunOutcome } from "./contracts";

type Limits = Readonly<{ wallMs: number; cleanupMs: number; stdoutBytes: number; stderrBytes: number }>;
type Result = Readonly<{ outcome: RunOutcome; code: number | null; signal: string | null; stdout: string; stderrBytes: number }>;

export async function observeChild(
  child: ChildProcess,
  cleanup: (deadline: number, terminateBootstrap: () => void) => Promise<boolean>,
  limits: Limits = SANDBOX_POLICY,
): Promise<Result> {
  let code: number | null = null;
  let signal: string | null = null;
  let stderrBytes = 0;
  let stdoutBytes = 0;
  const output: Buffer[] = [];
  let closed = false;
  let closeChild: () => void;
  const closeEvent = new Promise<void>(resolve => { closeChild = resolve; });
  let settle: (outcome: RunOutcome) => void;
  const terminal = new Promise<RunOutcome>(resolve => { settle = resolve; });
  child.once("error", () => settle("START_FAILED"));
  child.once("close", (status, sig) => {
    code = status;
    signal = sig;
    closed = true;
    closeChild();
    settle("EXITED");
  });
  child.stdout?.on("error", () => settle("START_FAILED"));
  child.stderr?.on("error", () => settle("START_FAILED"));
  child.stdout?.on("data", (bytes: Buffer) => {
    stdoutBytes += bytes.length;
    if (stdoutBytes > limits.stdoutBytes) {
      settle("STDOUT_LIMIT");
      child.stdout?.destroy();
    } else {
      output.push(bytes);
    }
  });
  child.stderr?.on("data", (bytes: Buffer) => {
    stderrBytes += bytes.length;
    if (stderrBytes > limits.stderrBytes) {
      settle("STDERR_LIMIT");
      child.stderr?.destroy();
    }
  });
  const wall = setTimeout(() => settle("TIMEOUT"), limits.wallMs);
  const outcome = await terminal;
  clearTimeout(wall);

  // Only the bootstrap can run before cgroup enrollment. It has no descendants at that point.
  const terminateBootstrap = () => {
    if (!closed && child.exitCode === null && child.signalCode === null) {
      try { child.kill("SIGKILL"); } catch { /* The scoped cleanup still has to run. */ }
    }
  };
  let timer: NodeJS.Timeout | undefined;
  const deadline = performance.now() + limits.cleanupMs;
  const scopedCleanup = Promise.resolve().then(() => cleanup(deadline, terminateBootstrap))
    .catch(() => false).finally(terminateBootstrap);
  const cleaned = await Promise.race([
    Promise.all([scopedCleanup, closeEvent]).then(([result]) => result),
    new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), limits.cleanupMs); }),
  ]).finally(() => clearTimeout(timer));
  if (!cleaned) {
    terminateBootstrap();
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  }
  return {
    outcome: cleaned ? outcome : "CLEANUP_FAILED",
    code,
    signal,
    stdout: outcome === "EXITED" || outcome === "TIMEOUT" ? Buffer.concat(output).toString("utf8") : "",
    stderrBytes,
  };
}
