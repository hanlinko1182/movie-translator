import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RecapStudioShell, { type RecapStudioContext } from "@/components/storyline/recap-studio-shell";
import { dirtySectionCount, editParagraph, originalSectionText, previewSessionKey, resetSection,
  scopedPreview, sectionDirty, sectionText, type StudioPreviewArtifact, type StudioPreviewState } from "@/components/storyline/local-script-model";
import { studioContext, recapPath } from "./navigation.fixture";

const artifact = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/storyline/ui/script-preview.fixture.ts"], { encoding: "utf8" })) as StudioPreviewArtifact;
const context = { ...studioContext, projectId: artifact.source.payload.projectId, movie: { ...studioContext.movie!, id: artifact.source.payload.movieId } };
const state = (value = artifact): StudioPreviewState => ({ status: "READY", artifact: value });
function render(previewForTest?: StudioPreviewState, workspace = "script", selectedContext: RecapStudioContext = context) {
  return renderToStaticMarkup(<RecapStudioShell context={selectedContext} recapPath={recapPath} query={`studio=${workspace}`} previewForTest={previewForTest}><p>Existing Saved Recap</p></RecapStudioShell>);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

test("production defaults remain unavailable across all Studio workspaces", () => {
  for (const workspace of ["script", "ai-review", "voice", "highlights", "export"]) {
    const html = render(undefined, workspace);
    for (const label of ["Saved Recap", "Script", "AI Review", "Voice", "Highlights", "Export"]) assert.ok(html.includes(label));
    assert.match(html, /Unavailable · Read-only shell/);
    assert.doesNotMatch(html, /Synthetic test only|<textarea|Local editor/);
  }
});

test("M4-composed Myanmar, exact provenance and provisional semantics are rendered", () => {
  const html = render(state());
  for (const text of ["Synthetic test only", "Memory-only", "Human approval: None", "Source verification: Not issued", "Voice duration: Unknown", "No local changes", "Chinese evidence", "Observed claim"]) assert.ok(html.includes(text), text);
  for (const value of [artifact.draft.draftHash, artifact.candidate.candidateHash, ...Object.values(artifact.draft.payload.source), ...Object.values(artifact.draft.payload.analysis)]) assert.ok(html.includes(String(value)), String(value));
  assert.ok(html.includes(artifact.draft.payload.beats[0].narration[0].text));
  assert.match(html, /lang="my"/); assert.match(html, /lang="zh"/);
  assert.doesNotMatch(html, /Save New Version|Approve Script|Publish|<audio/);
});

test("stale, unknown, loading, empty, error and unavailable are distinct honest states", () => {
  assert.match(render(state({ ...artifact, currentness: "STALE" })), /Stale dependencies/);
  assert.match(render(state({ ...artifact, currentness: "UNKNOWN" })), /Currentness unknown/);
  for (const [status, text] of [["LOADING", "Loading synthetic preview"], ["EMPTY", "No narration sections"], ["ERROR", "could not be loaded"], ["UNAVAILABLE", "preview unavailable"]] as const) {
    const html = render({ status }); assert.ok(html.includes(text)); assert.doesNotMatch(html, /<textarea/);
  }
  const empty = structuredClone(artifact); (empty.draft.payload.sections as unknown[]) = [];
  assert.match(render(state(empty)), /No narration sections available/);
});

test("foreign movie, project, Studio, source and candidate bindings are unavailable", () => {
  assert.match(render(state(), "script", { ...context, movie: null }), /preview unavailable/);
  assert.match(render(state(), "script", { ...context, movie: { ...context.movie, id: "other-movie" } }), /preview unavailable/);
  for (const mutate of [
    (a: StudioPreviewArtifact) => { Object.assign(a.draft.payload.source, { projectId: "foreign" }); },
    (a: StudioPreviewArtifact) => { Object.assign(a.candidate.payload.source, { studioId: "foreign" }); },
    (a: StudioPreviewArtifact) => { a.source.sourceContextHash = "changed"; },
    (a: StudioPreviewArtifact) => { Object.assign(a.draft.payload.analysis, { candidateHash: "changed" }); },
    (a: StudioPreviewArtifact) => { Object.assign(a.candidate.payload.task, { taskId: "foreign" }); },
  ]) {
    const a = structuredClone(artifact); mutate(a);
    assert.equal(scopedPreview(state(a), context.projectId, context.movie.id)?.status, "UNAVAILABLE");
    assert.doesNotMatch(render(state(a)), /<textarea|Chinese evidence/);
  }
});

test("missing Chinese evidence, characters, candidate lineage and beat references are explicit", () => {
  const a = structuredClone(artifact);
  Object.assign(a.source.payload, { transcript: { ...a.source.payload.transcript, segments: [] }, characters: [] });
  assert.match(render(state(a)), /Evidence reference unavailable/);
  assert.match(render(state(a)), /Character reference unavailable/);
  Object.assign(a.draft.payload, { claimLineage: [] });
  assert.match(render(state(a)), /Candidate lineage reference unavailable/);
  Object.assign(a.draft.payload, { beats: [] });
  assert.match(render(state(a)), /Narration beat reference unavailable/);
});

test("inferred motivations retain qualification, observed basis and contradictory references", () => {
  const a = structuredClone(artifact), sections = a.draft.payload.sections;
  // Presentation fault fixture: choose the inferred section first without editing its text/lineage.
  Object.assign(a.draft.payload, { sections: [sections[1], ...sections.filter(row => row.id !== sections[1].id)] });
  const html = render(state(a), "ai-review");
  for (const label of ["Inferred claim", "Qualification", "Observed basis", "Uncertainty: COMPETING", "Contradictory interpretations", "competing-interpretation"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /<textarea/);
  Object.assign(a.candidate.payload, { findings: a.candidate.payload.findings.filter(row => row.id !== "synthetic-observed-0" && row.id !== "competing-interpretation") });
  const missing = render(state(a), "ai-review");
  assert.match(missing, /Finding reference unavailable: synthetic-observed-0/);
  assert.match(missing, /Finding reference unavailable: competing-interpretation/);
});

test("captured observations resolve exact source owner/anchor and remain explicit when missing", () => {
  const a = structuredClone(artifact), sections = a.draft.payload.sections;
  const finding = a.candidate.payload.findings.find(row => row.evidence.some(evidence => evidence.kind === "CAPTURED_OBSERVATION"))!;
  const evidence = finding.evidence.find(row => row.kind === "CAPTURED_OBSERVATION")!;
  const claimId = a.draft.payload.claimLineage.find(row => row.candidateFindingIds.includes(finding.id))!.claimId;
  const beatId = a.draft.payload.beats.find(row => row.claims.some(claim => claim.id === claimId))!.id;
  const selected = sections.find(row => row.beatId === beatId)!;
  Object.assign(a.draft.payload, { sections: [selected, ...sections.filter(row => row.id !== selected.id)] });
  assert.ok(render(state(a)).includes(`Captured observation (${evidence.observationId})`));
  a.source.observations = a.source.observations.map(row => ({ ...row, ownerId: "foreign-character" }));
  assert.ok(render(state(a)).includes(`Captured observation reference unavailable: ${evidence.observationId}`));
});

test("editing changes only memory buffers; reset and exact-text reversion clear dirty state", () => {
  const a = deepFreeze(structuredClone(artifact)), before = JSON.stringify(a), id = a.draft.payload.sections[0].id;
  const changed = editParagraph(a, {}, id, 0, "ပြင်ဆင်ထားသော မြန်မာစာ။");
  assert.ok(changed.ok); if (!changed.ok) return;
  assert.equal(sectionDirty(a, changed.edits, id), true); assert.equal(dirtySectionCount(a, changed.edits), 1);
  assert.deepEqual(sectionText(a, changed.edits, id), ["ပြင်ဆင်ထားသော မြန်မာစာ။"]);
  const reverted = editParagraph(a, changed.edits, id, 0, originalSectionText(a, id)[0]);
  assert.ok(reverted.ok); if (reverted.ok) assert.equal(sectionDirty(a, reverted.edits, id), false);
  assert.equal(dirtySectionCount(a, resetSection(changed.edits, id)), 0);
  assert.equal(JSON.stringify(a), before);
});

test("Unicode and total script bounds reject excess without truncating or mutating buffers", () => {
  const id = artifact.draft.payload.sections[0].id;
  const atLimit = editParagraph(artifact, {}, id, 0, "က".repeat(1200)); assert.ok(atLimit.ok);
  if (!atLimit.ok) return;
  for (const text of ["က".repeat(1201), "\ud800", "bad\u202etext", "bad\0text"]) {
    assert.equal(editParagraph(artifact, atLimit.edits, id, 0, text).ok, false);
    assert.equal(sectionText(artifact, atLimit.edits, id)[0].length, 1200);
  }
  assert.equal(editParagraph(artifact, {}, id, -1, "x").ok, false);
  assert.equal(editParagraph(artifact, {}, "missing", 0, "x").ok, false);
  const multi = structuredClone(artifact);
  Object.assign(multi.draft.payload.beats[0], { narration: [{ text: "က".repeat(600), claimIds: [] }, { text: "က".repeat(600), claimIds: [] }] });
  assert.equal(editParagraph(multi, {}, id, 1, "က".repeat(601)).ok, false);
  const astral = editParagraph(artifact, {}, id, 0, "😀".repeat(1200));
  assert.equal(astral.ok, true, "limits count Unicode characters, not UTF-16 code units");
  const a = structuredClone(artifact), beat = a.draft.payload.beats[0], section = a.draft.payload.sections[0];
  Object.assign(a.draft.payload, {
    sections: Array.from({ length: 31 }, (_, i) => ({ ...section, id: `s-${i}`, beatId: `b-${i}` })),
    beats: Array.from({ length: 31 }, (_, i) => ({ ...beat, id: `b-${i}`, narration: [{ text: "က".repeat(1200), claimIds: [] }] })),
  });
  assert.equal(editParagraph(a, {}, "s-0", 0, "က".repeat(1200)).ok, false);
});

test("session identity includes movie, original artifact, parent, Studio revision and every source/candidate binding", () => {
  const key = previewSessionKey(context.projectId, context.movie.id, state());
  assert.equal(key, previewSessionKey(context.projectId, context.movie.id, state(structuredClone(artifact))));
  for (const mutate of [
    (a: StudioPreviewArtifact) => { Object.assign(a.draft, { draftHash: "new" }); },
    (a: StudioPreviewArtifact) => { Object.assign(a.draft.payload, { id: "new" }); },
    (a: StudioPreviewArtifact) => { Object.assign(a.draft.payload.source, { contextHash: "new" }); },
    (a: StudioPreviewArtifact) => { Object.assign(a.draft.payload.source, { expectedStudioRevision: 9 }); },
    (a: StudioPreviewArtifact) => { Object.assign(a.draft.payload.analysis, { candidateId: "new" }); },
    (a: StudioPreviewArtifact) => { Object.assign(a.draft.payload, { parentDraft: { id: "new", hash: "new" } }); },
  ]) {
    const a = structuredClone(artifact); mutate(a); assert.notEqual(key, previewSessionKey(context.projectId, context.movie.id, state(a)));
  }
  assert.notEqual(key, previewSessionKey(context.projectId, "other-movie", state()));
});

test("recovered UI imports no services, persistence, providers, browser storage or network clients", async () => {
  for (const path of ["components/storyline/local-script-model.ts", "components/storyline/script-preview.tsx", "components/storyline/recap-studio-shell.tsx"]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|lib\/(?:prisma|queue)|narration-integration|verification-service|process\.env/);
  }
  const page = await readFile("app/projects/[id]/recap/page.tsx", "utf8");
  assert.doesNotMatch(page, /previewForTest|script-preview.fixture/);
});
