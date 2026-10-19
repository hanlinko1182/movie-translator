import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import TimelineWorkspace, { TimelinePlanReview, timelineWorkspaceKey } from "@/components/storyline/timeline-workspace";
import { TimelineVersionSession, type SyntheticTimelineAdapter } from "@/components/storyline/timeline-version-session";
import type { RecapTimelinePlan } from "@/lib/storyline/studio-timeline-types";
import { studioContext } from "../ui/navigation.fixture";
const fixture: { plan: RecapTimelinePlan; target: SyntheticTimelineAdapter["target"] } = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/storyline/timeline-studio/presentation.fixture.ts", "print-timeline"], { encoding: "utf8" }));
const fail = async (): Promise<never> => assert.fail("Render cannot access service");
const adapter: SyntheticTimelineAdapter = { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: "synthetic", target: fixture.target, prepareTimeline: fail, saveVersion: fail, readHead: fail, readVersion: fail, listHistory: fail, readOperation: fail };
const context = { ...studioContext, projectId: adapter.target.input.scope.projectId, movie: { ...studioContext.movie!, id: adapter.target.input.scope.movieId } };
test("M7-03 Export default unavailable, explicitly matching injected Timeline only, all six destinations", () => {
  const render = (a?: SyntheticTimelineAdapter) => renderToStaticMarkup(<RecapStudioShell context={context} recapPath="/projects/test/recap" query="studio=export" timelineAdapterForTest={a}><p>Saved Recap</p></RecapStudioShell>);
  assert.match(render(), /No recap video output/); assert.doesNotMatch(render(), /Prepare Timeline Plan/);
  const html = render(adapter);
  for (const name of ["Saved Recap", "Script", "AI Review", "Voice", "Highlights", "Export", "Prepare Timeline Plan", "Human Approved: No"]) assert.ok(html.includes(name));
  assert.match(html, /disabled=""[^>]*>Save New Timeline Version/);
  const wrong = structuredClone(adapter.target); wrong.input.scope.movieId = "wrong"; assert.doesNotMatch(render({ ...adapter, target: wrong }), /Prepare Timeline Plan/);
});
test("M7-03 exact source/output text, proportional bars, nonchronological orders and evidence", () => {
  const html = renderToStaticMarkup(<TimelinePlanReview value={fixture.plan} selected={fixture.plan.plan.segments[0].id} />);
  for (const text of ["Source Chronology", "Recap Presentation Order", "Presentation order differs", "Selected", "OBSERVED", "INFERRED", "CUT_ONLY", "NOT_RENDERED", "Uncertainty", "Supporting Chinese", "Intentional source omissions", "Scene", "Transcript"]) assert.ok(html.includes(text), text);
  assert.ok(new Set(fixture.plan.plan.segments.map(s => s.durationMs)).size > 1, "Valid planner fixture has unequal durations");
  for (const s of fixture.plan.plan.segments) {
    assert.ok(html.includes(`${s.outputStartMs} ms`)); assert.ok(html.includes(`${s.outputEndMs} ms`)); assert.ok(html.includes(`${s.durationMs} ms`));
    assert.ok(html.includes(`width:${s.durationMs / fixture.plan.plan.totalOutputMs * 100}%`)); assert.ok(html.includes(s.candidate.id));
  }
  assert.doesNotMatch(html, /<video|<audio|draggable=|autoplay/); assert.match(html, /行为/);
});
test("M7-03 unavailable evidence remains explicit, never fabricated", () => {
  const p = JSON.parse(JSON.stringify(fixture.plan)); p.plan.segments[0].candidate.evidence = [];
  assert.match(renderToStaticMarkup(<TimelinePlanReview value={p} />), /Supporting evidence unavailable/);
  assert.match(renderToStaticMarkup(<TimelineWorkspace controller={new TimelineVersionSession(adapter)} />), /memory only/);
});
test("M7-03 full timeline target/session identity changes independently of Script and Highlights", () => {
  const key = timelineWorkspaceKey(adapter);
  const mutations = [
    (t: SyntheticTimelineAdapter["target"]) => { t.input.scope.tenantId += "-new"; },
    (t: SyntheticTimelineAdapter["target"]) => { t.input.scope.projectId += "-new"; },
    (t: SyntheticTimelineAdapter["target"]) => { t.input.scope.movieId += "-new"; },
    (t: SyntheticTimelineAdapter["target"]) => { t.input.scope.studioId += "-new"; },
    (t: SyntheticTimelineAdapter["target"]) => { t.input.selected.id += "-new"; },
    (t: SyntheticTimelineAdapter["target"]) => { t.input.selected.version++; },
    (t: SyntheticTimelineAdapter["target"]) => { t.input.selected.recordHash = "f".repeat(64); },
    (t: SyntheticTimelineAdapter["target"]) => { t.input.selected.planHash = "f".repeat(64); },
    (t: SyntheticTimelineAdapter["target"]) => { t.source.currentness.sourceRevision++; },
    (t: SyntheticTimelineAdapter["target"]) => { t.source.media.sha256 = "f".repeat(64); },
    (t: SyntheticTimelineAdapter["target"]) => { t.source.narration.artifact.hash = "f".repeat(64); },
    (t: SyntheticTimelineAdapter["target"]) => { t.dependency.hash = "f".repeat(64); },
  ];
  for (const mutate of mutations) { const target = structuredClone(adapter.target); mutate(target); assert.notEqual(timelineWorkspaceKey({ ...adapter, target }), key); }
  assert.notEqual(timelineWorkspaceKey({ ...adapter, identityKey: "new" }), key);
});
