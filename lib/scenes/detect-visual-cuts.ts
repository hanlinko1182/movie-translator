import "server-only";
import { execFile } from "node:child_process";
import { localInputArgs } from "@/lib/media";
import { parseVisualCuts } from "./parse-visual-cuts";
import { SceneDetectionError } from "./types";

export async function detectVisualCuts(source: string, durationMs: number, threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0.01 || threshold > 1) throw new SceneDetectionError("INVALID_SCENE_CONFIGURATION");
  const filter = `setpts=PTS-STARTPTS,select=gt(scene\\,${threshold}),metadata=mode=print:key=lavfi.scene_score:file=-`;
  const output = await new Promise<string>((resolve, reject) => {
    execFile("ffmpeg", [
      "-nostdin", "-hide_banner", "-v", "error", "-xerror", "-threads", "2", "-filter_threads", "1",
      ...localInputArgs(source), "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", filter,
      "-fps_mode", "vfr", "-f", "null", "-",
    ], { encoding: "utf8", shell: false, windowsHide: true, timeout: Math.min(6 * 60 * 60_000, Math.max(5 * 60_000, durationMs * 4)), killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (!error) { resolve(stdout); return; }
      // Never persist/log raw stderr or source paths in a job failure.
      const code = error.code;
      reject(new SceneDetectionError(code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "INVALID_SCENE_OUTPUT" : error.killed ? "SCENE_PROCESS_TIMEOUT" : code === "EAGAIN" || code === "EACCES" || code === "ENOENT" ? "SCENE_PROCESS_UNAVAILABLE" : "SCENE_MEDIA_INVALID"));
    });
  });
  return parseVisualCuts(output, durationMs);
}
