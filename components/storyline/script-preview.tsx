"use client";

import { useState } from "react";
import type { Immutable } from "@/lib/storyline/contracts";
import type { CandidateEvidence, CandidateSubject } from "@/lib/storyline/evidence-analysis/contracts";
import { badgeClass, badgeTones, cardClass, controlClass, focusClass, secondaryButtonClass } from "@/components/ui/styles";
import { dirtySectionCount, editParagraph, resetSection, sectionDirty, sectionText,
  type LocalScript, type StudioPreviewArtifact, type StudioPreviewState } from "./local-script-model";

/** Owned above workspace branching so tab switches retain memory-only edits. */
export function useScriptPreviewSession(state?: StudioPreviewState) {
  const artifact = state?.status === "READY" ? state.artifact : undefined;
  const [edits, setEdits] = useState<LocalScript>({});
  const [selected, setSelected] = useState(artifact?.draft.payload.sections[0]?.id ?? "");
  const [expanded, setExpanded] = useState<readonly string[]>(selected ? [selected] : []);
  const [findingId, setFindingId] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [error, setError] = useState("");
  function select(id: string) {
    setSelected(id); setFindingId(null); setResetPending(false); setError("");
  }
  function edit(index: number, text: string) {
    if (!artifact) return;
    const result = editParagraph(artifact, edits, selected, index, text);
    if (result.ok) { setEdits(result.edits); setError(""); setResetPending(false); }
    else setError(result.error);
  }
  return { artifact, edits, selected, expanded, findingId, resetPending, error, select, edit,
    toggle(id: string) { setExpanded(rows => rows.includes(id) ? rows.filter(row => row !== id) : [...rows, id]); },
    inspect(id: string) { setFindingId(id); },
    requestReset() { setResetPending(true); }, cancelReset() { setResetPending(false); },
    confirmReset() { setEdits(rows => resetSection(rows, selected)); setResetPending(false); setError(""); },
  };
}
type Session = ReturnType<typeof useScriptPreviewSession>;
const missingClass = "text-sm leading-6 text-amber-200";

function Evidence({ artifact, evidence, subject }: { artifact: StudioPreviewArtifact; evidence: Immutable<CandidateEvidence>; subject: Immutable<CandidateSubject> }) {
  const { payload: source } = artifact.source, a = evidence.anchor;
  const scene = source.scenes.find(row => row.sequence === a.sceneSequence && row.id === evidence.sceneId && row.movieId === a.movieId);
  const segment = source.transcript.segments.find(row => row.sequence === a.segmentSequence && row.id === evidence.segmentId && row.transcriptId === a.transcriptId);
  if (a.movieId !== source.movieId || a.transcriptId !== source.transcript.id || !scene || !segment ||
      segment.startMs < scene.startMs || segment.endMs > scene.endMs ||
      (evidence.kind === "CHINESE_QUOTE" && !segment.text.includes(evidence.quote)))
    return <p className={missingClass}>Evidence reference unavailable: {evidence.segmentId} / {evidence.sceneId}</p>;
  const observation = evidence.kind === "CAPTURED_OBSERVATION" ? artifact.source.observations.find(row => row.id === evidence.observationId &&
    row.sceneId === evidence.sceneId && row.transcriptSegmentId === evidence.segmentId &&
    row.anchor.movieId === a.movieId && row.anchor.transcriptId === a.transcriptId &&
    row.anchor.sceneSequence === a.sceneSequence && row.anchor.segmentSequence === a.segmentSequence &&
    (subject.relationshipId ? row.ownerKind === "RELATIONSHIP" && row.ownerId === subject.relationshipId
      : row.ownerKind === "CHARACTER" && subject.characterIds.includes(row.ownerId))) : null;
  return <div className="space-y-2 border-l border-white/10 pl-3 text-sm">
    <p className="break-all text-xs text-zinc-400">Chinese evidence · Movie {a.movieId} · Transcript {a.transcriptId} · Scene {a.sceneSequence} ({scene.id}) · Segment {a.segmentSequence} ({segment.id})</p>
    <p className="text-xs text-zinc-400">Source interval: {segment.startMs}–{segment.endMs} ms · No playback action</p>
    <p lang="zh" className="whitespace-pre-wrap break-words text-zinc-200">{segment.text}</p>
    {evidence.kind === "CHINESE_QUOTE" ? <p lang="zh" className="break-words text-zinc-300">Quoted excerpt: {evidence.quote}</p>
      : observation ? <p lang="zh" className="break-words text-zinc-300">Captured observation ({observation.id}): {observation.evidenceText}</p>
        : <p className={missingClass}>Captured observation reference unavailable: {evidence.observationId}</p>}
  </div>;
}

function Analysis({ artifact, session }: { artifact: StudioPreviewArtifact; session: Session }) {
  const { draft, candidate, source } = artifact;
  const section = draft.payload.sections.find(row => row.id === session.selected);
  const beat = draft.payload.beats.find(row => row.id === section?.beatId);
  const refs = draft.payload.claimLineage.filter(row => beat?.claims.some(claim => claim.id === row.claimId)).flatMap(row => row.candidateFindingIds);
  const findings = [...new Set(refs)];
  const selected = session.findingId ?? findings[0];
  const finding = candidate.payload.findings.find(row => row.id === selected);
  const characterLabel = (id: string) => {
    const character = source.payload.characters.find(row => row.id === id && row.projectId === source.payload.projectId && row.movieId === source.payload.movieId);
    return character ? `${character.name} (${id}${character.uncertain ? ", identity uncertain" : ""})` : `Character reference unavailable: ${id}`;
  };
  const referenceButton = (id: string) => {
    const ref = candidate.payload.findings.find(row => row.id === id);
    return ref ? <button type="button" className={secondaryButtonClass} onClick={() => session.inspect(id)}>{id} · {ref.classification === "OBSERVED" ? "Observed" : "Inferred"}</button>
      : <span className={missingClass}>Finding reference unavailable: {id}</span>;
  };
  return <section aria-label="Evidence inspection" className="space-y-4 border-t border-white/10 pt-4">
    <h3 className="text-sm font-semibold text-zinc-100">Character-linked analysis · Provisional</h3>
    <p className="text-xs leading-6 text-zinc-400">Read-only evidence comparison. Observed material is structurally grounded; inferred psychology remains qualified. Local text edits have not been reviewed against these references.</p>
    {!beat && <p className={missingClass}>Narration beat reference unavailable.</p>}
    {beat?.claims.map(claim => <div key={claim.id} className="space-y-2 text-sm leading-6">
      <p className="break-words text-zinc-200">{claim.kind === "OBSERVED" ? "Observed claim" : "Inferred claim"} · {claim.id}: {claim.statement}</p>
      <p className="break-words text-zinc-400">Characters: {claim.characterRefs.map(characterLabel).join(", ") || "No character reference"}</p>
      {claim.relationshipRef && <p className="break-words text-zinc-400">Relationship: {source.payload.relationships.find(row => row.id === claim.relationshipRef && row.projectId === source.payload.projectId && row.movieId === source.payload.movieId)?.summary ?? `Relationship reference unavailable: ${claim.relationshipRef}`}</p>}
      {claim.kind === "INFERRED" && <><p lang="my" className="text-zinc-300">Qualification: {claim.qualification}</p><p className="break-all text-zinc-400">Observed claim basis: {claim.inferenceBasisClaimIds.map(id => draft.payload.beats.flatMap(row => row.claims).some(row => row.id === id && row.kind === "OBSERVED") ? id : `Observed claim reference unavailable: ${id}`).join(", ")}</p></>}
      {!draft.payload.claimLineage.some(row => row.claimId === claim.id) && <p className={missingClass}>Candidate lineage reference unavailable: {claim.id}</p>}
    </div>)}
    <div className="flex flex-wrap gap-2" aria-label="Section findings">{findings.map(id => <div key={id}>{referenceButton(id)}</div>)}</div>
    {!findings.length && <p className={missingClass}>No candidate finding references for this section.</p>}
    {selected && !finding && <p className={missingClass}>Finding reference unavailable: {selected}</p>}
    {finding && <section className="space-y-3 text-sm leading-6" aria-label="Selected finding">
      <h4 className="break-all font-medium text-zinc-100">{finding.id} · {finding.classification === "OBSERVED" ? "Observed" : "Inferred"}</h4>
      <p className="break-words text-zinc-200">{finding.statement}</p>
      <p className="text-zinc-400">Uncertainty: {finding.uncertainty} · Confidence: {finding.confidence} · {finding.category}</p>
      <p className="break-words text-zinc-400">Characters: {finding.subject.characterIds.map(characterLabel).join(", ") || "None"}</p>
      {finding.qualification && <p lang="my">Qualification: {finding.qualification}</p>}
      {finding.classification === "INFERRED" && <div className="space-y-2"><p className="text-zinc-400">Observed basis</p><div className="flex flex-wrap gap-2">{finding.observedBasisIds.map(id => <div key={id}>{referenceButton(id)}</div>)}</div>{!finding.observedBasisIds.length && <p className={missingClass}>Observed basis reference unavailable.</p>}</div>}
      {!finding.evidence.length && <p className={missingClass}>No evidence references for this finding.</p>}
      {finding.evidence.map((evidence, index) => <Evidence key={index} artifact={artifact} evidence={evidence} subject={finding.subject} />)}
      <div className="space-y-2"><p className="text-zinc-400">Contradictory interpretations</p>
        {candidate.payload.contradictions.filter(row => row.firstFindingId === finding.id || row.secondFindingId === finding.id).map((row, index) => <div key={index} className="space-y-2"><p lang="my" className="break-words">{row.explanation}</p>{referenceButton(row.firstFindingId === finding.id ? row.secondFindingId : row.firstFindingId)}</div>)}
        {!candidate.payload.contradictions.some(row => row.firstFindingId === finding.id || row.secondFindingId === finding.id) && <p className="text-zinc-400">No contradictory references recorded. This does not establish certainty.</p>}
      </div>
    </section>}
  </section>;
}

export default function ScriptPreview({ state, session, review }: { state: StudioPreviewState; session: Session; review: boolean }) {
  if (state.status !== "READY" || !session.artifact) {
    const messages = { LOADING: "Loading synthetic preview…", EMPTY: "No narration sections available", ERROR: "Synthetic preview could not be loaded", UNAVAILABLE: "Storyline preview unavailable for the selected source" };
    return <section className={`${cardClass} p-5`}><h2 className="text-sm font-semibold text-zinc-100">Storyline preview</h2><p role={state.status === "ERROR" ? "alert" : "status"} className="mt-3 text-sm text-zinc-400">{state.status === "READY" ? messages.UNAVAILABLE : messages[state.status]}</p><p className="mt-3 text-xs text-zinc-400">Production Storyline reads are disabled. No request is made by this panel.</p></section>;
  }
  const artifact = session.artifact, { draft } = artifact;
  const sections = draft.payload.sections;
  const selected = sections.find(row => row.id === session.selected);
  const paragraphs = selected ? sectionText(artifact, session.edits, selected.id) : [];
  const dirty = dirtySectionCount(artifact, session.edits);
  return <section aria-label="Synthetic Storyline preview" className={`${cardClass} space-y-4 p-5`}>
    <h2 className="text-sm font-semibold text-zinc-100">{review ? "Evidence review" : "Myanmar script preview"}</h2>
    <div className="flex flex-wrap gap-2"><span className={`${badgeClass} ${badgeTones.amber}`}>Synthetic test only · Provisional</span><span className={`${badgeClass} ${artifact.currentness === "CURRENT_AT_READ" ? badgeTones.neutral : badgeTones.amber}`}>{artifact.currentness === "STALE" ? "Stale dependencies" : artifact.currentness === "UNKNOWN" ? "Currentness unknown" : "Current at fixture read"}</span></div>
    <p className="text-sm leading-6 text-zinc-400">Memory-only local preview. Changes are lost on reload or movie/source/artifact change. Production reads, saving and publication are disabled.</p>
    <p className="text-xs leading-6 text-zinc-400">Human approval: None · Source verification: Not issued · Voice duration: Unknown · No TTS authorization</p>
    <p role="status" className="text-sm text-amber-200">{dirty ? `Unsaved local changes · ${dirty} section${dirty === 1 ? "" : "s"}` : "No local changes"}</p>
    <details className="text-xs leading-6 text-zinc-400"><summary className="cursor-pointer text-zinc-200">Exact source and candidate provenance</summary>
      <dl className="mt-2 space-y-2">{Object.entries({ draftId: draft.payload.id, draftHash: draft.draftHash, originalVersion: draft.payload.version,
        parentDraftId: draft.payload.parentDraft?.id ?? "None", parentDraftHash: draft.payload.parentDraft?.hash ?? "None",
        ...draft.payload.source, ...draft.payload.analysis }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="break-all text-zinc-200">{value}</dd></div>)}</dl>
      <p>Identity labels describe the injected artifact, not an authenticated production read or a saved local edit.</p>
    </details>
    {!sections.length && <p className="text-sm text-zinc-400">No narration sections available</p>}
    <div className="space-y-3" aria-label="Narration sections">{sections.map((section, index) => {
      const open = session.expanded.includes(section.id);
      return <section key={section.id} className={`min-w-0 rounded-lg border p-3 ${session.selected === section.id ? "border-violet-400/30 bg-violet-400/5" : "border-white/10"}`}>
        <div className="flex flex-wrap items-center gap-2"><button type="button" aria-pressed={session.selected === section.id} onClick={() => session.select(section.id)} className={`${secondaryButtonClass} max-w-full break-words text-left`}><span lang="my">Select section {index + 1}: {section.heading}</span></button>
          <button type="button" className={secondaryButtonClass} aria-expanded={open} aria-controls={`narration-${section.id}`} onClick={() => session.toggle(section.id)}>{open ? "Collapse" : "Expand"} section {index + 1}</button>
          {sectionDirty(artifact, session.edits, section.id) && <span className="text-xs text-amber-200">Locally edited</span>}
        </div>
        <div id={`narration-${section.id}`} hidden={!open} role="region" aria-label={`Narration section ${index + 1} text`} tabIndex={0} className={`mt-3 max-h-80 space-y-3 overflow-y-auto ${focusClass}`}>{sectionText(artifact, session.edits, section.id).map((text, i) => <p key={i} lang="my" className="whitespace-pre-wrap break-words text-sm leading-8 text-zinc-200">{text || "Empty local paragraph"}</p>)}
          {!sectionText(artifact, session.edits, section.id).length && <p className={missingClass}>Narration beat reference unavailable.</p>}
        </div>
      </section>;
    })}</div>
    {!review && selected && <section aria-label="Local Myanmar editor" className="space-y-3 border-t border-white/10 pt-4">
      <h3 className="break-words text-sm font-semibold text-zinc-100" lang="my">Local editor: {selected.heading}</h3>
      <p id="local-editor-limit" className="text-xs leading-6 text-zinc-400">Up to 1,200 Unicode characters per section and 36,000 per script. Edits do not update claims or evidence. An edited preview has no new version identity.</p>
      {paragraphs.map((text, index) => <div key={index} className="space-y-2"><label className="block text-xs text-zinc-400" htmlFor={`local-paragraph-${index}`}>Myanmar paragraph {index + 1}</label><textarea id={`local-paragraph-${index}`} lang="my" aria-describedby="local-editor-limit" aria-invalid={!!session.error} value={text} rows={6} onChange={event => session.edit(index, event.target.value)} className={`${controlClass} w-full resize-y leading-8`} /></div>)}
      {session.error && <p role="alert" className="text-sm text-amber-200">{session.error}</p>}
      <button type="button" className={secondaryButtonClass} disabled={!sectionDirty(artifact, session.edits, selected.id)} onClick={session.requestReset}>Reset selected section</button>
      {session.resetPending && <div role="group" aria-label="Confirm local reset" className="space-y-3"><p className="text-sm text-amber-200">Discard local edits to this section and restore the original draft text?</p><div className="flex flex-wrap gap-2"><button type="button" className={secondaryButtonClass} onClick={session.confirmReset}>Discard local edits</button><button type="button" className={secondaryButtonClass} onClick={session.cancelReset}>Keep editing</button></div></div>}
      <h3 className="text-sm font-semibold text-zinc-100">Local preview · Unsaved</h3>
      <div role="region" aria-label="Local preview text" tabIndex={0} className={`max-h-80 space-y-3 overflow-y-auto ${focusClass}`}>{paragraphs.map((text, index) => <p key={index} lang="my" className="whitespace-pre-wrap break-words text-sm leading-8 text-zinc-200">{text || "Empty local paragraph"}</p>)}</div>
    </section>}
    {selected && <Analysis artifact={artifact} session={session} />}
  </section>;
}
