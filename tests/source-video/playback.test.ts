import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_SOURCE_PLAYBACK, observeSourcePlayback, readSourcePlayback, seekSourceVideo, sourcePlaybackTimeLabel, type SourcePlayback } from "@/lib/source-video/playback";

class Video extends EventTarget {
  readyState = 0;
  duration = NaN;
  currentTime = 0;
  error: MediaError | null = null;
}

test("display uses actual media seconds rounded to milliseconds, with distinct loading/unavailable labels", () => {
  assert.equal(sourcePlaybackTimeLabel({ current: 11.0100001, duration: 42.513991, metadataReady: true }), "00:11.010 / 00:42.514");
  assert.equal(sourcePlaybackTimeLabel(EMPTY_SOURCE_PLAYBACK), "00:00.000 / Loading duration…");
  assert.equal(sourcePlaybackTimeLabel({ current: 0, duration: null, metadataReady: true }), "00:00.000 / Duration unavailable");
});

test("initial load synchronizes when metadata arrives, without inventing a duration", () => {
  const video = new Video(); const values: SourcePlayback[] = [];
  const stop = observeSourcePlayback(video, (state) => values.push(state), () => assert.fail("unexpected error"));
  assert.deepEqual(values.at(-1), EMPTY_SOURCE_PLAYBACK);
  video.readyState = 1; video.duration = 42.513991;
  video.dispatchEvent(new Event("loadedmetadata"));
  assert.deepEqual(values.at(-1), { current: 0, duration: 42.513991, metadataReady: true });
  stop();
});

test("metadata loaded before listener attachment is read immediately", () => {
  const video = new Video();
  video.readyState = 4; video.duration = 6.016; video.currentTime = 1.2;
  video.dispatchEvent(new Event("loadedmetadata")); // No observer exists yet.
  let current: SourcePlayback | undefined;
  const stop = observeSourcePlayback(video, (state) => { current = state; }, () => {});
  assert.deepEqual(current, { current: 1.2, duration: 6.016, metadataReady: true });
  stop();
});

test("durationchange refreshes valid duration and reports unavailable metadata honestly", () => {
  const video = new Video(); let current = EMPTY_SOURCE_PLAYBACK;
  const stop = observeSourcePlayback(video, (state) => { current = state; }, () => {});
  video.readyState = 1;
  for (const duration of [Infinity, NaN, 0, -1]) {
    video.duration = duration; video.dispatchEvent(new Event("durationchange"));
    assert.deepEqual(current, { current: 0, duration: null, metadataReady: true });
  }
  video.duration = 12.5; video.dispatchEvent(new Event("durationchange")); assert.equal(current.duration, 12.5);
  video.duration = 13; video.dispatchEvent(new Event("durationchange")); assert.equal(current.duration, 13);
  video.readyState = 0; video.dispatchEvent(new Event("emptied")); assert.deepEqual(current, EMPTY_SOURCE_PLAYBACK);
  stop();
});

test("native seeking/time updates and pending transcript seek use saved milliseconds", () => {
  const video = new Video(); let pending: number | null = 11010; let current = EMPTY_SOURCE_PLAYBACK;
  const stop = observeSourcePlayback(video, (state) => {
    current = state;
    if (pending !== null && seekSourceVideo(video, pending)) pending = null;
  }, () => {});
  assert.equal(pending, 11010);
  video.readyState = 1; video.duration = 42.513991; video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(pending, null); assert.equal(video.currentTime, 11.01);
  video.dispatchEvent(new Event("seeked")); assert.equal(current.current, 11.01);
  video.currentTime = 12.5; video.dispatchEvent(new Event("timeupdate")); assert.equal(current.current, 12.5);
  assert.equal(seekSourceVideo(video, 38210), true); assert.equal(video.currentTime, 38.21);
  stop();
});

test("selection/navigation cleanup removes listeners and never carries old source state", () => {
  const old = new Video(); old.readyState = 4; old.duration = 42.513991; old.currentTime = 20;
  let oldUpdates = 0;
  const stopOld = observeSourcePlayback(old, () => { oldUpdates++; }, () => assert.fail("stale error"));
  stopOld();
  old.dispatchEvent(new Event("timeupdate")); old.dispatchEvent(new Event("error"));
  assert.equal(oldUpdates, 1);
  const next = new Video(); let state = readSourcePlayback(old);
  const stopNext = observeSourcePlayback(next, (value) => { state = value; }, () => {});
  assert.deepEqual(state, EMPTY_SOURCE_PLAYBACK);
  next.readyState = 1; next.duration = 6; next.dispatchEvent(new Event("loadedmetadata"));
  assert.deepEqual(state, { current: 0, duration: 6, metadataReady: true });
  stopNext();
  const back = observeSourcePlayback(old, (value) => { state = value; }, () => {});
  assert.deepEqual(state, { current: 20, duration: 42.513991, metadataReady: true }); back();
});

test("existing or later native decode/loading errors are observed, including before hydration", () => {
  const video = new Video(); const errors: (number | undefined)[] = [];
  video.error = { code: 4 } as MediaError;
  const stop = observeSourcePlayback(video, () => {}, (code) => errors.push(code));
  assert.deepEqual(errors, [4]);
  video.error = { code: 2 } as MediaError; video.dispatchEvent(new Event("error")); assert.deepEqual(errors, [4, 2]);
  stop(); video.dispatchEvent(new Event("error")); assert.deepEqual(errors, [4, 2]);
});

test("a browser refusing an early seek does not throw or clear the pending request", () => {
  const video = { readyState: 1, duration: 6, get currentTime() { return 0; }, set currentTime(_value: number) { throw new Error("not seekable yet"); } };
  assert.equal(seekSourceVideo(video, 1200), false);
});
