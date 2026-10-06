import { SceneDetectionError, type SceneCandidate, type TranscriptTiming, type VisualCut } from "./types";
import type { SceneConfig } from "./config";

export function validMs(value: number) { return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647; }
export function transcriptGapCandidates(rows: readonly TranscriptTiming[], durationMs: number, gapMs: number): number[] {
  let previousStart = -1;
  let coveredEnd = 0;
  const gaps: number[] = [];
  for (const [index, row] of rows.entries()) {
    // Container/STT duration rounding may differ by up to one second. Clip only
    // the local evidence window; never modify persisted transcript timestamps.
    if (!validMs(row.startMs) || !validMs(row.endMs) || row.endMs < row.startMs || row.startMs < previousStart || row.endMs > durationMs + 1000) throw new SceneDetectionError("INVALID_TRANSCRIPT_TIMING");
    previousStart = row.startMs;
    if (row.startMs >= durationMs) continue;
    // Use the union of earlier dialogue intervals, not just a possibly overlapping row.
    if (index && row.startMs - coveredEnd >= gapMs) gaps.push(Math.floor((coveredEnd + row.startMs) / 2));
    coveredEnd = Math.max(coveredEnd, Math.min(row.endMs, durationMs));
  }
  return gaps;
}

export function buildSceneIntervals(durationMs: number, visual: readonly VisualCut[], transcript: readonly TranscriptTiming[], config: SceneConfig) {
  if (!validMs(durationMs) || !durationMs) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
  const gaps = transcriptGapCandidates(transcript, durationMs, config.transcriptGapMs);
  const byTime = new Map<number, { timeMs: number; score: number | null; gap: boolean }>();
  for (const cut of visual) {
    if (!validMs(cut.timeMs) || !Number.isFinite(cut.score) || cut.score < 0 || cut.score > 1) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
    if (cut.timeMs <= 0 || cut.timeMs >= durationMs) continue;
    const previous = byTime.get(cut.timeMs);
    byTime.set(cut.timeMs, { timeMs: cut.timeMs, score: Math.max(previous?.score ?? 0, cut.score), gap: false });
  }
  for (const timeMs of gaps) {
    const previous = byTime.get(timeMs);
    byTime.set(timeMs, { timeMs, score: previous?.score ?? null, gap: true });
  }
  const sorted = [...byTime.values()].sort((a, b) => a.timeMs - b.timeMs);
  const collapsed: typeof sorted = [];
  for (let index = 0; index < sorted.length;) {
    const first = sorted[index];
    const cluster = [];
    while (index < sorted.length && sorted[index].timeMs - first.timeMs <= config.collapseMs) cluster.push(sorted[index++]);
    // Fixed anchor prevents a chain of cuts from collapsing an arbitrarily long interval.
    const strongest = cluster.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.timeMs - b.timeMs)[0];
    collapsed.push({ ...strongest, gap: cluster.some((candidate) => candidate.gap) });
  }
  // Prioritize timing-gap evidence, then raw visual strength, then earliest time.
  // Insert only if both adjacent intervals meet the minimum. No forced long-scene split.
  const accepted = [{ timeMs: 0, score: null as number | null }, { timeMs: durationMs, score: null as number | null }];
  for (const candidate of collapsed.sort((a, b) => Number(b.gap) - Number(a.gap) || (b.score ?? -1) - (a.score ?? -1) || a.timeMs - b.timeMs)) {
    const rightIndex = accepted.findIndex((boundary) => boundary.timeMs > candidate.timeMs);
    if (rightIndex > 0 && candidate.timeMs - accepted[rightIndex - 1].timeMs >= config.minDurationMs && accepted[rightIndex].timeMs - candidate.timeMs >= config.minDurationMs) accepted.splice(rightIndex, 0, candidate);
  }
  const scenes = accepted.slice(0, -1).map((boundary, sequence) => ({ sequence, startMs: boundary.timeMs, endMs: accepted[sequence + 1].timeMs, boundaryScore: boundary.score }));
  assertSceneIntervals(scenes, durationMs);
  return { scenes, transcriptGapCandidateCount: gaps.length };
}

export function assertSceneIntervals(scenes: readonly SceneCandidate[], durationMs: number) {
  if (!validMs(durationMs) || !durationMs || !Array.isArray(scenes) || !scenes.length) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
  let end = 0;
  scenes.forEach((scene, sequence) => {
    if (scene.sequence !== sequence || !validMs(scene.startMs) || !validMs(scene.endMs) || scene.startMs !== end || scene.endMs <= scene.startMs || scene.endMs > durationMs || (scene.boundaryScore !== null && (!Number.isFinite(scene.boundaryScore) || scene.boundaryScore < 0 || scene.boundaryScore > 1))) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
    end = scene.endMs;
  });
  if (end !== durationMs) throw new SceneDetectionError("INVALID_SCENE_OUTPUT");
}
