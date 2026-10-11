import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RecapControls from "@/app/projects/[id]/recap/RecapControls";
import { recapProps } from "./recovery.fixture";

test("Failed exposes Retry Generation, disabled until confirmation, plus read-only Refresh Status", () => {
  const html = renderToStaticMarkup(<RecapControls {...recapProps} />);
  assert.match(html, /Retry Generation/); assert.match(html, /Refresh Status/);
  assert.match(html, /retrying.*paid API tokens/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[^]*?Retry Generation/);
  for (const label of ["Recap Script", "Characters", "Relationships", "Evidence", "Scene List"]) assert.ok(html.includes(label), label);
  assert.match(html, /selected movie shown above/); assert.doesNotMatch(html, /newest movie/);
});
test("failed job without safe attempt metadata is honestly unavailable; prerequisites remain visible", () => {
  const html = renderToStaticMarkup(<RecapControls {...recapProps} initialJob={{ ...recapProps.initialJob!, failureToken: null }} />);
  assert.match(html, /Retry is unavailable/); assert.match(html, /Refresh Status/);
  assert.match(renderToStaticMarkup(<RecapControls {...recapProps} transcriptState="MISSING" sourceReason="Transcript required" />), /Open Transcription/);
  assert.match(renderToStaticMarkup(<RecapControls {...recapProps} model={null} />), /provider is not configured/);
});
