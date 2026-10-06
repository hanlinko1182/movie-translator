import { SceneDetectionError, type VisualCut } from "./types";
import { validMs } from "./boundaries";

// metadata=print writes only selected-frame headers and their raw scene scores.
export function parseVisualCuts(output: string, durationMs: number): VisualCut[] {
  if (!validMs(durationMs) || !durationMs) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
  const cuts = new Map<number, number>();
  let pending: number | null = null;
  for (const line of output.split(/\r?\n/).filter((line) => line.trim())) {
    const frame = /^frame:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([-+\d.eE]+)\s*$/.exec(line);
    if (frame) {
      if (pending !== null) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
      const seconds = Number(frame[1]);
      if (!Number.isFinite(seconds) || seconds < 0) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
      pending = Math.round(seconds * 1000);
      if (!validMs(pending)) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
      continue;
    }
    const score = /^lavfi\.scene_score=([-+\d.eE]+)\s*$/.exec(line);
    if (!score || pending === null) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
    const value = Number(score[1]);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
    if (pending > 0 && pending < durationMs) cuts.set(pending, Math.max(cuts.get(pending) ?? 0, value));
    pending = null;
  }
  if (pending !== null) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
  return [...cuts].sort(([a], [b]) => a - b).map(([timeMs, score]) => ({ timeMs, score }));
}
