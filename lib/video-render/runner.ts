import "server-only";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve, join } from "node:path";
import { localStorage } from "@/lib/storage";
import { RenderError } from "./contracts";
import { MAX_RUNTIME_MS, renderDirectories } from "./files";

export function progressPercent(line: string, durationMs: number) {
  const match = /^out_time_us=(\d{1,16})$/.exec(line);
  if (!match || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.min(99, Math.max(0, Math.floor(Number(match[1]) / 1000 / durationMs * 100)));
}
export async function runSupervised(options: { args: string[]; cwd: string; fontConfig: string; outputLimit: number; durationMs: number;
  signal: AbortSignal; timeoutMs?: number; progress?: (percent: number) => void; authorize?: () => Promise<boolean> }) {
  await renderDirectories();
  const lock = await open(join(localStorage.root, "render-attempts", "cpu.lock"), constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  if (!(await lock.stat()).isFile()) { await lock.close(); throw new RenderError("STORAGE_UNAVAILABLE"); }
  try {
    return await new Promise<{ stderr: string }>((resolvePromise, reject) => {
      if (options.signal.aborted) { reject(new RenderError("RENDER_FAILED")); return; }
      const child = spawn(process.execPath, ["--import", "tsx", resolve("scripts/render-supervisor.ts")], {
        shell: false, detached: true, stdio: ["pipe", "pipe", "pipe", lock.fd],
        env: { PATH: process.env.PATH, LANG: "C.UTF-8", NODE_ENV: process.env.NODE_ENV ?? "development" },
      });
      let stderr = ""; let pending = ""; let timedOut = false; let authorizationDenied = false;
      let escalation: NodeJS.Timeout | undefined;
      const stop = () => {
        child.stdin!.end();
        if (!escalation) escalation = setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* exited */ } } }, 4000);
      };
      const timeout = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs ?? MAX_RUNTIME_MS);
      options.signal.addEventListener("abort", stop, { once: true });
      child.stdin!.on("error", () => {});
      child.stdin!.write(JSON.stringify({ args: options.args, cwd: options.cwd, fontConfig: options.fontConfig,
        outputLimit: options.outputLimit, timeoutMs: options.timeoutMs ?? MAX_RUNTIME_MS }) + "\n");
      child.stderr!.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-16384); });
      child.stdout!.on("data", (chunk: Buffer) => {
        pending += chunk.toString("utf8");
        if (pending.length > 16384) { pending = ""; stop(); return; }
        let newline;
        while ((newline = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
          if (line === "RENDER_LOCK_ACQUIRED") {
            void Promise.resolve().then(() => options.authorize?.() ?? true).then((allowed) => {
              if (allowed && !options.signal.aborted) child.stdin!.write("start\n"); else { authorizationDenied = !allowed; stop(); }
            }).catch(() => { authorizationDenied = true; stop(); });
          }
          const percent = progressPercent(line, options.durationMs);
          if (percent !== null) options.progress?.(percent);
        }
      });
      child.once("error", () => { stop(); });
      child.once("close", (code) => {
        clearTimeout(timeout); if (escalation) clearTimeout(escalation);
        options.signal.removeEventListener("abort", stop);
        if (options.signal.aborted || authorizationDenied) reject(new RenderError("RENDER_FAILED"));
        else if (timedOut || code === 124) reject(new RenderError("RENDER_TIMEOUT"));
        else if (code === 75) reject(new RenderError("RENDER_RESOURCE_LIMIT"));
        else if (code !== 0 || options.signal.aborted) reject(new RenderError("RENDER_FAILED"));
        else resolvePromise({ stderr });
      });
    });
  } finally { await lock.close(); }
}

// Obtain the same inherited file-description lock without launching FFmpeg.
// Used to make cancellation terminal only after encoder quiescence. An old
// process acquiring it later must pass the post-lock database start handshake.
export async function withRenderCpuLock<T>(action: () => Promise<T>, drainWaitMs = 0): Promise<T | null> {
  if (!Number.isInteger(drainWaitMs) || drainWaitMs < 0 || drainWaitMs > 2000) throw new RenderError("RENDER_RESOURCE_LIMIT");
  await renderDirectories();
  const lock = await open(join(localStorage.root, "render-attempts", "cpu.lock"), constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    if (!(await lock.stat()).isFile()) throw new RenderError("STORAGE_UNAVAILABLE");
    const acquired = await new Promise<boolean>((resolveLock, reject) => {
      const child = spawn("flock", [...(drainWaitMs ? ["-w", String(drainWaitMs / 1000)] : ["-n"]), "-E", "75", "3"], { shell: false, stdio: ["ignore", "ignore", "ignore", lock.fd], env: { PATH: process.env.PATH, NODE_ENV: "production" } });
      child.once("error", reject); child.once("close", (code) => { if (code === 0 || code === 75) resolveLock(code === 0); else reject(new RenderError("RENDER_RESOURCE_LIMIT")); });
    });
    return acquired ? await action() : null;
  } finally { await lock.close(); }
}
