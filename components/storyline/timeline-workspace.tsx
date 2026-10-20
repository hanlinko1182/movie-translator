"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { badgeClass, badgeTones, cardClass, focusClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/styles";
import type { RecapTimelinePlan, TimelineRecordView } from "@/lib/storyline/studio-timeline-types";
import { TimelineVersionSession, timelineUnsaved, sameTimeline, type SyntheticTimelineAdapter } from "./timeline-version-session";

export function timelineWorkspaceKey(adapter?: SyntheticTimelineAdapter) {
  return adapter ? JSON.stringify([adapter.identityKey, adapter.target]) : "unavailable";
}
const ms = (value: number) => `${value} ms`;
function Identity({ view }: { view: TimelineRecordView }) {
  const r = view.record;
  return <dl className="space-y-1 break-all text-xs leading-6">
    <div><dt>Saved Version</dt><dd>v{r.version} · {r.id}</dd></div>
    <div><dt>Immutable record hash</dt><dd>{view.recordHash}</dd></div>
    <div><dt>Timeline plan hash</dt><dd>{r.plan.planHash}</dd></div>
    <div><dt>Selected M6 record / version / hashes</dt><dd>{JSON.stringify(r.plan.plan.input.selected)}</dd></div>
    <div><dt>Source binding</dt><dd>{JSON.stringify(r.plan.plan.source)}</dd></div>
    <div><dt>Saved time / Authorized editor</dt><dd>{r.createdAt} · {r.editor.principalId} · {r.editor.sessionId}</dd></div>
    <div><dt>Previous version</dt><dd>{r.previous ? `v${r.previous.version} · ${r.previous.id} · ${r.previous.recordHash} · ${r.previous.planHash}` : "None"}</dd></div>
    <div><dt>Dependency currentness</dt><dd>{view.currentness} · observation at read; not a processing lease</dd></div>
  </dl>;
}
export function TimelinePlanReview({ value, expanded, onDisclosure, selected, onSelect }: {
  value: RecapTimelinePlan; expanded?: readonly string[]; onDisclosure?: (id: string, open: boolean) => void;
  selected?: string | null; onSelect?: (id: string) => void;
}) {
  const p = value.plan;
  return <section aria-label="Reviewed timeline plan" className="min-w-0 space-y-4 break-words text-sm leading-6 text-zinc-300">
    <p>SYNTHETIC_ONLY · NOT_RENDERED · Human Approved: No · Publication: Not eligible · Original movie audio: EXCLUDED · Voice Synchronization: Unsupported</p>
    <dl className="space-y-2 break-all text-xs">
      <div><dt>Selected saved M6 identity</dt><dd>{JSON.stringify(p.input.selected)}</dd></div>
      <div><dt>Source/media/narration bindings</dt><dd><details><summary className={focusClass}>Inspect source provenance</summary>{JSON.stringify(p.source)}</details></dd></div>
      <div><dt>Dependency observation</dt><dd>{p.dependency.id} · {p.dependency.hash} · M6 head revision {p.headRevision}. Preparation observation only; saving rechecks currentness.</dd></div>
      <div><dt>Timeline plan hash</dt><dd>{value.planHash}</dd></div>
      <div><dt>Timeline planning policy</dt><dd>{JSON.stringify(p.input.policy)}</dd></div>
    </dl>
    <p>{p.segments.length} segments · Planned total output duration: {ms(p.totalOutputMs)}. Half-open integer-millisecond intervals, original speed 1:1, CUT_ONLY. Metadata only.</p>
    {p.audio && <p>Fake audio reference {p.audio.artifactId}: REFERENCE_ONLY · speech NOT_VERIFIED. No voice timing is inferred.</p>}
    <section aria-label="Read-only output timeline" className="space-y-2">
      <h3>Recap output timeline · NOT_RENDERED</h3>
      <p>Each bar uses the same scale: segment duration divided by total output duration. Exact times and keyboard inspection follow below.</p>
      <div className="flex h-5 w-full overflow-hidden rounded border border-white/10" aria-hidden="true">{p.segments.map(s => <span key={s.id} className={`h-full border-r border-zinc-500 ${selected === s.id ? "bg-violet-400" : "bg-zinc-600"}`} style={{ width: `${s.durationMs / p.totalOutputMs * 100}%` }} />)}</div>
      <ol className="space-y-2">{p.segments.map((s, i) => <li key={s.id}><button type="button" className={`${secondaryButtonClass} w-full whitespace-normal text-left`} aria-pressed={selected === s.id} disabled={!onSelect} onClick={() => onSelect?.(s.id)}>Inspect segment {i + 1}: Output {ms(s.outputStartMs)} → {ms(s.outputEndMs)} · duration {ms(s.durationMs)}{selected === s.id ? " · Selected" : ""}</button></li>)}</ol>
    </section>
    <section aria-label="Separate segment orders" className="space-y-2">
      <p>{sameTimeline(p.sourceOrder, p.presentationOrder) ? "Presentation order matches source chronology." : "Presentation order differs from source chronology. Output follows the saved M6 recap presentation; source chronology is unchanged."}</p>
      {([["Source Chronology", p.sourceOrder], ["Recap Presentation Order", p.presentationOrder]] as const).map(([label, ids]) => <div key={label}><h3>{label}</h3><ol className="list-inside list-decimal break-all">{ids.map(id => <li key={id}>{id}</li>)}</ol></div>)}
      <h3>Intentional source omissions · metadata only</h3>
      {p.omissions.length ? p.omissions.map((g, i) => <p key={i}>{g.kind} · {ms(g.startMs)} → {ms(g.endMs)}. Adds zero output; no filler.</p>) : <p>No between-clip omissions recorded.</p>}
    </section>
    <section aria-label="Timeline segment evidence" className="space-y-3">
      {p.segments.map(s => { const c = s.candidate; return <details key={s.id} open={expanded?.includes(s.id)} onToggle={e => onDisclosure?.(s.id, e.currentTarget.open)} className="min-w-0 rounded-lg border border-white/10 p-3">
        <summary className={`cursor-pointer break-words ${focusClass}`}>Segment {s.presentationIndex + 1} · {c.classification} · {c.characterIds.join(", ")} · {s.id}</summary>
        <div className="mt-3 space-y-2 break-words">
          <p>M6 candidate: {c.id} · M3 finding: {c.findingId} · Claims: {c.claimIds.join(", ") || "Missing claim reference"}</p>
          <p>Character: {c.characterIds.join(", ")} · Relationship: {c.relationshipId ?? "None supplied"}</p>
          <p lang={c.classification === "INFERRED" ? "my" : "zh"}>{c.statement}</p>
          <p>{c.classification === "INFERRED" ? "Interpretation, not a proven psychological fact." : "Observed basis; no extra psychological conclusion established."}</p>
          <p>Confidence: {c.confidence} · Uncertainty: {c.uncertainty} · Qualification: {c.qualification ?? "None supplied"}</p>
          <p>Observed basis references: {c.observedBasisIds.join(", ") || "None supplied"}. Resolve full basis through exact saved M6 identity; absent statements are not invented.</p>
          <p>Source: {ms(s.sourceStartMs)} → {ms(s.sourceEndMs)} · Output: {ms(s.outputStartMs)} → {ms(s.outputEndMs)} · Duration: {ms(s.durationMs)}</p>
          <p>Presentation index: {s.presentationIndex} · Source chronology index: {p.sourceOrder.indexOf(s.id)} · CUT_ONLY</p>
          <h4>Supporting Chinese source evidence</h4>{c.evidence.length ? c.evidence.map((e, i) => <div key={i}><p lang="zh">{e.sourceText || "Chinese source text unavailable"}</p><p>Scene {e.reference.sceneId} · Transcript {e.reference.segmentId} · {ms(e.startMs)} → {ms(e.endMs)}</p><p>{JSON.stringify(e.reference)}</p></div>) : <p>Supporting evidence unavailable. No reference invented.</p>}
          <h4>Contradictory evidence references</h4>{c.contradictions.length ? c.contradictions.map((v, i) => <p key={i}>{v.findingId}: {v.explanation}. Full reference remains in the bound M6 artifact.</p>) : <p>No contradictory references supplied; this does not establish absence of contradiction.</p>}
        </div>
      </details>; })}
    </section>
  </section>;
}
export default function TimelineWorkspace({ controller }: { controller: TimelineVersionSession }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [confirmation, setConfirmation] = useState<"prepare" | "load" | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null), prepareRef = useRef<HTMLButtonElement>(null), loadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmation) confirmRef.current?.focus(); }, [confirmation]);
  const unsaved = timelineUnsaved(state), unresolved = !!state.pending && !state.needsAcceptance && state.phase !== "STALE";
  function request(action: "prepare" | "load") {
    if (unsaved) setConfirmation(action); else if (action === "prepare") void controller.prepare(); else controller.loadPreview();
  }
  function closeConfirm(discard: boolean) { const action = confirmation; setConfirmation(null); if (discard) { if (action === "prepare") void controller.prepare(); else controller.loadPreview(); } (action === "prepare" ? prepareRef : loadRef).current?.focus(); }
  return <section aria-label="Synthetic Timeline workspace" className={`${cardClass} min-w-0 space-y-4 p-5 text-sm leading-6 text-zinc-300`} aria-busy={state.busy}>
    <h2 className="font-semibold text-zinc-100">Timeline metadata review</h2>
    <p className="break-all text-xs">Selected saved M6 (requires authorized preparation): {JSON.stringify(controller.adapter.target.input.selected)}</p>
    <span className={`${badgeClass} ${badgeTones.amber}`}>SYNTHETIC_ONLY · Isolated test adapter</span>
    <p>Human Approved: No · SOURCE_VERIFIED: No · Real TTS eligibility: No · Publication eligibility: No. Original movie audio excluded; voice synchronization unsupported.</p>
    <p>Prepared plans remain in memory only until explicitly saved. Tab switching preserves this workspace. Identity changes or leaving this page clears memory; no autosave.</p>
    <p role={state.phase === "ERROR" || state.phase === "UNAUTHORIZED" ? "alert" : "status"} aria-live="polite">{state.message}</p>
    {state.busy && <p role="status">Operation in progress. Waiting for the authorized service response…</p>}
    <p>Workspace state: {state.phase} · Unsaved plan: {unsaved ? "Yes" : "No"}</p>
    {state.pending && <p className="break-all text-xs">Original operation key: {state.pending.idempotencyKey} · Proposal hash: {state.pendingHash}</p>}
    <div className="flex flex-wrap gap-2">
      <button ref={prepareRef} type="button" className={secondaryButtonClass} disabled={state.busy || unresolved || state.needsAcceptance} onClick={() => request("prepare")}>Prepare Timeline Plan</button>
      <button type="button" className={primaryButtonClass} disabled={state.busy || state.phase !== "PREPARED" || !!state.pending} onClick={() => void controller.save()}>Save New Timeline Version</button>
      <button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.refresh()}>Refresh head and history</button>
      {state.phase === "CONFLICT" && <button type="button" className={secondaryButtonClass} disabled={state.busy || !state.observed} onClick={() => controller.acceptHead()}>Accept refreshed head</button>}
      {unresolved && <button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.recover()}>Recover Original Operation</button>}
    </div>
    {confirmation && <div role="alertdialog" aria-modal="false" aria-label="Replace unsaved timeline plan" className="space-y-3 rounded-lg border border-amber-400/30 p-3"><p>Replace the prepared unsaved plan? The reviewed plan will be replaced only after successful preparation or explicit historical loading.</p><div className="flex flex-wrap gap-2"><button type="button" ref={confirmRef} className={secondaryButtonClass} onClick={() => closeConfirm(false)}>Keep unsaved plan</button><button type="button" className={secondaryButtonClass} onClick={() => closeConfirm(true)}>Discard unsaved plan and continue</button></div></div>}
    {state.observed && <section aria-label="Authorized repository head"><h3>Observed repository head: revision {state.observed.revision}</h3>{state.observed.head ? <Identity view={state.observed.head} /> : <p>No saved head.</p>}<p>This observation does not rebase the prepared plan.</p></section>}
    {state.saved && <section aria-label="Loaded saved identity"><Identity view={state.saved} /></section>}
    {state.plan && <TimelinePlanReview value={state.plan} expanded={state.expanded} onDisclosure={controller.disclosure} selected={state.selected} onSelect={controller.select} />}
    <section aria-label="Timeline version history" className="space-y-3"><h3 className="font-semibold text-zinc-100">Immutable version history</h3>
      {state.history ? (state.history.entries.length ? state.history.entries.map(v => <article key={v.record.id} className="space-y-2 rounded-lg border border-white/10 p-3"><Identity view={v} /><button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.preview(v.record.id)}>Preview timeline version {v.record.version}</button></article>) : <p>No saved versions in this scope.</p>) : <p>History not loaded.</p>}
      {state.history?.nextAfterVersion !== null && state.history?.nextAfterVersion !== undefined && <button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.refresh(true)}>Next history page</button>}
      <p>Pages contain at most 5 versions. Refresh returns to the first page.</p>
    </section>
    {state.preview && <section aria-label="Historical timeline preview" className="min-w-0 space-y-3"><h3>Read-only historical preview</h3><Identity view={state.preview} /><TimelinePlanReview value={state.preview.record.plan} /><button ref={loadRef} type="button" className={secondaryButtonClass} disabled={state.busy || !!state.pending} onClick={() => request("load")}>Load historical version</button><p>Preview leaves the reviewed plan unchanged. Loading changes only this memory workspace, never the repository head.</p></section>}
  </section>;
}
