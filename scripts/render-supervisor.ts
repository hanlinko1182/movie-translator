// A separate process keeps supervising FFmpeg after a worker crash. Its stdin
// is a private control pipe: EOF means the owning worker died. No secrets enter
// this process. Linux flock is inherited on fd 3 until the whole attempt exits.
import { spawn, type ChildProcess } from "node:child_process";

let child: ChildProcess | undefined;
let stopped = false;
let killTimer: NodeJS.Timeout | undefined;
let deadline: NodeJS.Timeout | undefined;
let starting = false;
let launch: (() => void) | undefined;
function stop() {
  if (stopped) return;
  stopped = true;
  // Supervisor and all descendants share this process group. Keep ourselves
  // alive through SIGTERM to reap the child; SIGKILL is the final group bound.
  try { process.kill(-process.pid, "SIGTERM"); } catch { /* already stopped */ }
  killTimer = setTimeout(() => { try { process.kill(-process.pid, "SIGKILL"); } catch { process.exit(1); } }, 2000);
}
process.on("SIGTERM", () => { if (!stopped) stop(); });
process.on("SIGINT", stop);
process.stdin.on("end", stop);
let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  if (launch && !child && chunk.trim() === "start") { const start = launch; launch = undefined; start(); return; }
  if (starting || child) { stop(); return; }
  pending += chunk;
  if (pending.length > 65536) { process.exitCode = 1; process.stdin.destroy(); return; }
  const newline = pending.indexOf("\n");
  if (newline < 0) return;
  try {
    const input = JSON.parse(pending.slice(0, newline)) as { args: string[]; cwd: string; timeoutMs: number; outputLimit: number; fontConfig: string };
    if (!Array.isArray(input.args) || input.args.some((v) => typeof v !== "string") || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 86400000 || !Number.isSafeInteger(input.outputLimit) || input.outputLimit < 1 || input.outputLimit > 34359738368) throw new Error();
    starting = true;
    const lock = spawn("flock", ["-n", "-E", "75", "3"], { shell: false, stdio: ["ignore", "ignore", "ignore", 3], env: { PATH: process.env.PATH, NODE_ENV: "production" } });
    lock.once("error", () => { process.exitCode = 1; process.stdin.destroy(); });
    lock.once("close", (lockCode) => {
      if (lockCode !== 0 || stopped) { process.exitCode = lockCode ?? 1; process.stdin.destroy(); return; }
      launch = () => {
      if (stopped) return;
      child = spawn("prlimit", ["--as=4294967296", `--fsize=${input.outputLimit}`, "--cpu=86400", "--", "ffmpeg", ...input.args], {
        shell: false, cwd: input.cwd, stdio: ["ignore", "pipe", "pipe", 3],
        env: { PATH: process.env.PATH, LANG: "C.UTF-8", FONTCONFIG_FILE: input.fontConfig, NODE_ENV: "production" },
      });
      child.stdout!.pipe(process.stdout); child.stderr!.pipe(process.stderr);
      deadline = setTimeout(stop, input.timeoutMs);
      child.once("error", () => { process.exitCode = 1; stop(); });
      child.once("close", (code) => {
        if (deadline) clearTimeout(deadline);
        if (killTimer) clearTimeout(killTimer);
        process.exitCode = stopped ? 124 : code ?? 1;
        process.stdin.destroy();
      });
      };
      process.stdout.write("RENDER_LOCK_ACQUIRED\n");
    });
  } catch { process.exitCode = 1; process.stdin.destroy(); }
});
