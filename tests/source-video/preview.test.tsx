import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import SourceVideoPreview from "@/components/media/source-video-preview";

test("preview uses native controls and exactly the selected movie, with saved timing", () => {
  const html = renderToStaticMarkup(<SourceVideoPreview projectId="project" movie={{ id: "older-movie", title: "Source", sourceRecorded: true }} timing={{ startMs: 1200, endMs: 2400 }} />);
  assert.match(html, /<video/);
  assert.match(html, /controls=""/);
  assert.match(html, /preload="metadata"/);
  assert.match(html, /\/api\/projects\/project\/movies\/older-movie\/source/);
  assert.match(html, /Selected/);
  assert.doesNotMatch(html, /autoPlay|storageKey|poster=|waveform/);
});

test("no movie or metadata-only movie retains an honest fallback without requesting video", () => {
  for (const movie of [null, { id: "metadata", title: "Metadata only", sourceRecorded: false }]) {
    const html = renderToStaticMarkup(<SourceVideoPreview projectId="project" movie={movie} />);
    assert.match(html, /Source playback unavailable/);
    assert.doesNotMatch(html, /<video|\/api\//);
  }
});
