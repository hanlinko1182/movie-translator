import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import { HighlightPlanReview, highlightWorkspaceKey } from "@/components/storyline/highlights-workspace";
import { HighlightVersionSession, type SyntheticHighlightAdapter } from "@/components/storyline/highlight-version-session";
import HighlightsWorkspace from "@/components/storyline/highlights-workspace";
import { studioContext } from "../ui/navigation.fixture";
import type { HighlightPlan } from "@/lib/storyline/highlights/contracts";
const fixture: { plan: HighlightPlan; target: SyntheticHighlightAdapter["target"] } = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/storyline/highlights-studio/presentation.fixture.ts", "print"], { encoding: "utf8" }));
const fail = async (): Promise<never> => assert.fail("Render cannot access a service");
const adapter: SyntheticHighlightAdapter = { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: "synthetic", target: fixture.target, preparePlan: fail, saveVersion: fail, readHead: fail, readVersion: fail, listHistory: fail, readOperation: fail };
const context = { ...studioContext, projectId: adapter.target.scope.projectId, movie: { ...studioContext.movie!, id: adapter.target.scope.movieId } };
test("M6-03 default remains unavailable; explicit matching seam only; render makes zero calls", () => {
  const render = (a?: SyntheticHighlightAdapter) => renderToStaticMarkup(<RecapStudioShell context={context} recapPath="/projects/test/recap" query="studio=highlights" highlightsAdapterForTest={a}><p>Saved Recap</p></RecapStudioShell>);
  assert.match(render(), /No highlight plan/); assert.doesNotMatch(render(), /Prepare Highlight Plan/);
  const html = render(adapter); for (const name of ["Saved Recap", "Script", "AI Review", "Voice", "Highlights", "Export", "Prepare Highlight Plan", "Human Approved: No"]) assert.ok(html.includes(name));
  assert.match(html, /disabled=""[^>]*>Save New Highlight Version/);
  const wrong = { ...adapter, target: { ...adapter.target, scope: { ...adapter.target.scope, movieId: "wrong" } } };
  assert.doesNotMatch(render(wrong), /Prepare Highlight Plan/);
});
test("M6-03 readable candidate evidence, distinctions, score factors and separate orders", () => {
  const html = renderToStaticMarkup(<HighlightPlanReview value={fixture.plan} />);
  for (const text of ["OBSERVED", "INFERRED", "Confidence", "Uncertainty", "Supporting Chinese", "Contradictory evidence", "Deterministic factor", "Canonical source interval", "Selected presentation", "CUT_ONLY", "Intentional source omissions", "SELECTED", "EXCLUDED", "Exact reason"]) assert.ok(html.includes(text), text);
  assert.match(html, /character-a/); assert.match(html, /source-0/); assert.match(html, /行为/); assert.match(html, /စိုးရိမ်မှု/);
});
test("M6-03 missing references and fake audio are honestly labeled", () => {
  const value = structuredClone(fixture.plan); const p = value.plan as unknown as { candidates: { evidence: unknown[]; contradictions: unknown[]; observedBasisIds: string[] }[]; input: { audio: unknown } };
  p.candidates[0].evidence = []; p.candidates[0].contradictions = [{ findingId: "missing", explanation: "uncertain" }]; p.candidates[0].observedBasisIds = ["missing"];
  p.input.audio = { artifactId: "fake" }; // Presentation robustness only; cannot pass the service validator.
  const html = renderToStaticMarkup(<HighlightPlanReview value={value} />);
  assert.match(html, /Supporting evidence unavailable/); assert.match(html, /Contradictory reference unavailable/); assert.match(html, /Referenced basis unavailable/); assert.match(html, /speech NOT_VERIFIED/);
});
test("M6-03 full target/session key changes for every isolation dimension", () => {
  const key = highlightWorkspaceKey(adapter);
  for (const field of ["tenantId", "projectId", "movieId", "studioId"] as const) { const a = structuredClone(adapter.target); a.scope[field] += "-new"; assert.notEqual(highlightWorkspaceKey({ ...adapter, target: a }), key); }
  assert.notEqual(highlightWorkspaceKey({ ...adapter, identityKey: "new" }), key);
  for (const mutate of [
    (t: SyntheticHighlightAdapter["target"]) => { t.source.currentness.narrationRevision++; },
    (t: SyntheticHighlightAdapter["target"]) => { t.source.media.sha256 = "f".repeat(64); },
    (t: SyntheticHighlightAdapter["target"]) => { t.source.narration.original.hash = "f".repeat(64); },
    (t: SyntheticHighlightAdapter["target"]) => { t.source.narration.artifact.hash = "f".repeat(64); },
    (t: SyntheticHighlightAdapter["target"]) => { t.source.narration.analysis.candidateHash = "f".repeat(64); },
    (t: SyntheticHighlightAdapter["target"]) => { t.source.narration.source.snapshotId = "changed"; },
  ]) { const target = structuredClone(adapter.target); mutate(target); assert.notEqual(highlightWorkspaceKey({ ...adapter, target }), key); }
  const html = renderToStaticMarkup(<HighlightsWorkspace controller={new HighlightVersionSession(adapter)} />); assert.match(html, /memory only/); assert.doesNotMatch(html, /<audio|<video/);
});
