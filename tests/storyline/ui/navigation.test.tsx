import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import { recapExperienceHref, selectedStudioWorkspace, studioWorkspaces } from "@/components/storyline/navigation";
import RecapControls from "@/app/projects/[id]/recap/RecapControls";
import { recapProps, movieId } from "../../recap/recovery.fixture";
import { studioContext, recapPath } from "./navigation.fixture";

function render(query = "", context = studioContext) {
  return renderToStaticMarkup(<RecapStudioShell context={context} recapPath={recapPath} query={query}><RecapControls {...recapProps} /></RecapStudioShell>);
}

test("Saved Recap defaults to the existing viewer with five legacy tabs and paid retry gate", () => {
  const html = render();
  assert.match(html, /aria-current="page"[^>]*>Saved Recap/);
  for (const label of ["Recap Script", "Characters", "Relationships", "Evidence", "Scene List"]) assert.ok(html.includes(label));
  assert.match(html, /Retry Generation/); assert.match(html, /paid API tokens/); assert.match(html, /Refresh Status/);
  assert.doesNotMatch(html, /role="tablist" aria-label="Storyline Studio workspaces"/);
});

test("unknown, empty and duplicate workspace queries safely select Saved Recap", () => {
  for (const query of ["", "studio=", "studio=unknown", "studio=voice&studio=script", "view=review"]) {
    assert.equal(selectedStudioWorkspace(query), null); assert.match(render(query), /Retry Generation/);
  }
});

test("experience links pin the displayed older movie and preserve query and hash context", () => {
  const href = recapExperienceHref(recapPath, "view=review&extra=a&extra=b&movieId=newest&studio=voice", movieId, "ai-review", "#recap-tab-evidence");
  const url = new URL(href, "http://local.invalid");
  assert.equal(url.searchParams.get("movieId"), movieId);
  assert.equal(url.searchParams.get("studio"), "ai-review");
  assert.equal(url.searchParams.get("view"), "review"); assert.deepEqual(url.searchParams.getAll("extra"), ["a", "b"]);
  assert.equal(url.hash, "#recap-tab-evidence");
  assert.equal(new URL(recapExperienceHref(recapPath, url.search, movieId, null, url.hash), url).searchParams.has("studio"), false);
  assert.match(render(), new RegExp(`studio=script[^>]*|movieId=${movieId}`));
});

for (const { id, label } of studioWorkspaces) test(`${label} has scoped read-only context, accessible tabs and honest unavailable state`, () => {
  const html = render(`studio=${id}&movieId=${movieId}`);
  assert.match(html, new RegExp(`id="studio-tab-${id}"[^>]*aria-selected="true"`));
  assert.match(html, new RegExp(`role="tabpanel" aria-labelledby="studio-tab-${id}"`));
  assert.match(html, /12 saved segments/); assert.match(html, /1 saved intervals/); assert.match(html, /Current · advisory/);
  assert.ok(html.includes(movieId)); assert.match(html, /Older selected movie/);
  assert.match(html, /Unavailable · Read-only shell/);
  assert.doesNotMatch(html, /Retry Generation|<textarea|<select|<form|type="checkbox"/);
});

test("each Studio capability is unavailable without simulated artifacts or approval", () => {
  for (const [id, missing] of [["script", "No persisted source snapshot"], ["script", "No Storyline script version"], ["ai-review", "No AI review receipt"], ["voice", "No configured TTS"], ["highlights", "No highlight plan"], ["export", "No recap video output"]]) assert.ok(render(`studio=${id}`).includes(missing));
  assert.match(render("studio=ai-review"), /ALL_CURRENT/);
  assert.match(render("studio=highlights"), /Source playback unavailable/);
  assert.doesNotMatch(render("studio=voice"), /<audio/);
  assert.doesNotMatch(render("studio=export"), /Download|Start Render|<video/);
});

test("missing movie and unavailable analysis never fabricate context", () => {
  const html = render("studio=script", { ...studioContext, movie: null, transcriptState: "MISSING", transcriptSegmentCount: 0, sceneCount: 0, characterState: "UNAVAILABLE" });
  assert.match(html, /No movie selected/); assert.match(html, /No transcript available/); assert.match(html, /No scene intervals available/);
  assert.match(html, /Currentness unavailable/); assert.match(html, /Open Project Overview/);
  assert.match(html, /Studio prerequisites incomplete/);
});

test("source preview uses only the selected project and older movie's existing secure endpoint", () => {
  const html = render("studio=highlights", { ...studioContext, movie: { ...studioContext.movie!, sourceRecorded: true } });
  assert.match(html, /src="\/api\/projects\/synthetic-project\/movies\/older-selected-movie\/source"/);
  assert.match(html, /Original source video/); assert.match(html, /controls=""/);
});

test("stale or absent character analysis blocks Studio prerequisites without changing Saved Recap", () => {
  for (const characterState of ["STALE", "ABSENT", "UNAVAILABLE"] as const) {
    assert.match(render("studio=script", { ...studioContext, characterState }), /Studio prerequisites incomplete/);
    assert.match(render("", { ...studioContext, characterState }), /Retry Generation/);
  }
});

test("navigation shell does not import preparation, API clients, providers or task services", async () => {
  const source = await readFile("components/storyline/recap-studio-shell.tsx", "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|prepareStorylineSource|lib\/queue|lib\/prisma|lib\/recap\/client|openrouter|ffmpeg/i);
  assert.match(source, /prefetch=\{false\}/);
});
