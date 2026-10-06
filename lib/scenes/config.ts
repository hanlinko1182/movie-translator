import { SceneDetectionError } from "./types";

export type SceneConfig = { visualThreshold: number; minDurationMs: number; transcriptGapMs: number; collapseMs: number };
export function sceneConfig(env: Record<string, string | undefined> = process.env): SceneConfig {
  function number(name: string, fallback: number, min: number, max: number, integer = true) {
    const raw = env[name]?.trim();
    if (raw && !/^\d+(?:\.\d+)?$/.test(raw)) throw new SceneDetectionError("INVALID_SCENE_CONFIGURATION");
    const value = raw ? Number(raw) : fallback;
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new SceneDetectionError("INVALID_SCENE_CONFIGURATION");
    return value;
  }
  return {
    visualThreshold: number("SCENE_CHANGE_THRESHOLD", 0.4, 0.01, 1, false),
    minDurationMs: number("SCENE_MIN_DURATION_MS", 15_000, 5_000, 300_000),
    transcriptGapMs: number("SCENE_TRANSCRIPT_GAP_MS", 8_000, 3_000, 300_000),
    collapseMs: 2_000,
  };
}
