import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import type { StudioPreviewArtifact } from "@/components/storyline/local-script-model";
import type { SyntheticScriptVersionAdapter } from "@/components/storyline/script-version-session";
import { studioContext } from "../ui/navigation.fixture";

const artifact: StudioPreviewArtifact = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/storyline/ui/script-preview.fixture.ts"], { encoding: "utf8" }));
const context = { ...studioContext, projectId: artifact.source.payload.projectId, movie: { ...studioContext.movie!, id: artifact.source.payload.movieId } };
const fail = async (): Promise<never> => assert.fail("Rendering must not read, save or start a provider");
const adapter: SyntheticScriptVersionAdapter = { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: "synthetic-realm", target: { scope: { projectId: context.projectId, movieId: context.movie.id, studioId: artifact.draft.payload.source.studioId }, original: { id: "synthetic-durable-original", draftHash: artifact.draft.draftHash } }, readOriginal: fail, readVersion: fail, listVersions: fail, saveVersion: fail };

test("M9-05 production/default and local-only shells never render saving capabilities or call adapters", () => {
  for (const previewForTest of [undefined, { status: "READY" as const, artifact }]) {
    const html = renderToStaticMarkup(<RecapStudioShell context={context} recapPath="/projects/fixture-project/recap" query="studio=script" previewForTest={previewForTest}><p>Saved Recap</p></RecapStudioShell>);
    assert.doesNotMatch(html, /Save New Version|Load saved versions|Canonical content hash/);
    if (!previewForTest) assert.match(html, /No Storyline script version/);
  }
});
test("M9-05 adapter must be explicitly injected; initial save disabled, approval separate, render remains read-only", () => {
  const html = renderToStaticMarkup(<RecapStudioShell context={context} recapPath="/projects/fixture-project/recap" query="studio=script" previewForTest={{ status: "READY", artifact }} versionAdapterForTest={adapter}><p>Saved Recap</p></RecapStudioShell>);
  assert.match(html, /Load saved versions/); assert.match(html, /disabled=""[^>]*>Save New Version/);
  assert.match(html, /Human Approved: No/); assert.match(html, /TTS eligibility: No/); assert.match(html, /Unsaved Draft:/);
  for (const label of ["Saved Recap", "Script", "AI Review", "Voice", "Highlights", "Export"]) assert.ok(html.includes(label));
});
