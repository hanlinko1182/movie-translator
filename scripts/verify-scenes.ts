import assert from "node:assert/strict";
import { buildSceneIntervals, assertSceneIntervals, transcriptGapCandidates } from "@/lib/scenes/boundaries";
import { sceneConfig } from "@/lib/scenes/config";
import { parseVisualCuts } from "@/lib/scenes/parse-visual-cuts";
import { SceneDetectionError } from "@/lib/scenes/types";
import { formatTimestamp } from "@/lib/format-timestamp";

function main() {
  const config = sceneConfig({});
  assert.deepEqual(config, { visualThreshold: 0.4, minDurationMs: 15000, transcriptGapMs: 8000, collapseMs: 2000 });
  assert.throws(() => sceneConfig({ SCENE_CHANGE_THRESHOLD: "0.4),movie=http://bad" }), SceneDetectionError);
  assert.throws(() => sceneConfig({ SCENE_MIN_DURATION_MS: "1" }), SceneDetectionError);
  assert.throws(() => sceneConfig({ SCENE_TRANSCRIPT_GAP_MS: "NaN" }), SceneDetectionError);
  const metadata = (time: string, score: string) => `frame:0 pts:0 pts_time:${time}\nlavfi.scene_score=${score}\n`;
  const cuts = parseVisualCuts(metadata("30", "0.5") + metadata("0", "0.9") + metadata("30.0004", "0.8") + metadata("15.1236", "0.7") + metadata("60", "1"), 60000);
  assert.deepEqual(cuts, [{ timeMs: 15124, score: 0.7 }, { timeMs: 30000, score: 0.8 }]);
  assert.deepEqual(parseVisualCuts("", 5000), []);
  for (const output of [metadata("-1", "0.5"), metadata("NaN", "0.5"), metadata("1", "Infinity"), metadata("1", "1.1"), "garbage", "frame:0 pts:0 pts_time:1\n", "lavfi.scene_score=0.5", metadata("1e999", "0.4")]) assert.throws(() => parseVisualCuts(output, 60000), SceneDetectionError);
  const noCandidates = buildSceneIntervals(42517, [], [], config);
  assert.deepEqual(noCandidates.scenes, [{ sequence: 0, startMs: 0, endMs: 42517, boundaryScore: null }]);
  assert.deepEqual(buildSceneIntervals(1000, [{ timeMs: 500, score: 0.99 }], [], config).scenes, [{ sequence: 0, startMs: 0, endMs: 1000, boundaryScore: null }]);
  const visual = [{ timeMs: 0, score: 1 }, { timeMs: 20000, score: 0.5 }, { timeMs: 20000, score: 0.9 }, { timeMs: 21000, score: 0.8 }, { timeMs: 22001, score: 0.99 }, { timeMs: 59000, score: 1 }];
  const original = JSON.stringify(visual);
  const intervals = buildSceneIntervals(60000, visual, [], config).scenes;
  assert.equal(intervals.length, 2);
  assert.equal(intervals[1].startMs, 22001);
  assert.equal(intervals[1].boundaryScore, 0.99);
  assert.equal(JSON.stringify(visual), original);
  const nearGap = buildSceneIntervals(90000, [{ timeMs: 30000, score: 0.7 }, { timeMs: 31000, score: 0.8 }], [{ startMs: 0, endMs: 26000 }, { startMs: 36000, endMs: 90000 }], config);
  assert.equal(nearGap.transcriptGapCandidateCount, 1);
  assert.deepEqual(nearGap.scenes.map((row) => [row.startMs, row.endMs]), [[0, 31000], [31000, 90000]]);
  // Overlapping transcript rows must not invent a silence gap inside longer dialogue.
  assert.deepEqual(transcriptGapCandidates([{ startMs: 0, endMs: 50000 }, { startMs: 10000, endMs: 15000 }, { startMs: 30000, endMs: 40000 }], 60000, 8000), []);
  assert.throws(() => transcriptGapCandidates([{ startMs: 1000, endMs: 999 }], 60000, 8000), SceneDetectionError);
  assert.deepEqual(transcriptGapCandidates([{ startMs: 0, endMs: 60003 }], 60000, 8000), []);
  assert.throws(() => transcriptGapCandidates([{ startMs: 0, endMs: 61001 }], 60000, 8000), SceneDetectionError);
  const long = buildSceneIntervals(7200000, [], [], config).scenes;
  assert.equal(long.length, 1); assert.equal(long[0].endMs, 7200000);
  assert.equal(formatTimestamp(7200000), "02:00:00.000");
  assertSceneIntervals(nearGap.scenes, 90000);
  assert.throws(() => assertSceneIntervals([{ sequence: 1, startMs: 0, endMs: 1, boundaryScore: null }], 1), SceneDetectionError);
  assert.throws(() => assertSceneIntervals([{ sequence: 0, startMs: 0, endMs: 0, boundaryScore: null }], 1), SceneDetectionError);
  assert.throws(() => assertSceneIntervals([{ sequence: 0, startMs: 0, endMs: 10, boundaryScore: null }, { sequence: 1, startMs: 9, endMs: 20, boundaryScore: null }], 20), SceneDetectionError);
  console.info("PASS scene thresholds, defensive FFmpeg parsing, duplicates/nearby boundaries, endpoint cuts, transcript gaps/overlaps, minimum intervals, no candidates, visual-only, long duration, full coverage and immutable inputs.");
}
main();
