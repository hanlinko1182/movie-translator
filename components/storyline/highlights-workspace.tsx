"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { badgeClass, badgeTones, cardClass, focusClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/styles";
import type { HighlightPlan } from "@/lib/storyline/studio-highlight-types";
import type { HighlightRecordView } from "@/lib/storyline/studio-highlight-types";
import { HighlightVersionSession, highlightUnsaved, sameHighlight, type SyntheticHighlightAdapter } from "./highlight-version-session";

export function highlightWorkspaceKey(adapter?: SyntheticHighlightAdapter) {
  return adapter ? JSON.stringify([adapter.identityKey, adapter.target]) : "unavailable";
}
const ms = (value: number) => `${value} ms`;
function Identity({ view }: { view: HighlightRecordView }) {
  const r = view.record;
  return <dl className="space-y-1 break-all text-xs leading-6">
    <div><dt>Saved Version</dt><dd>v{r.version} · {r.id}</dd></div>
    <div><dt>Immutable record hash</dt><dd>{view.recordHash}</dd></div>
    <div><dt>M6-01 plan hash</dt><dd>{r.plan.planHash}</dd></div>
    <div><dt>Saved time / Authorized editor</dt><dd>{r.createdAt} · {r.editor.principalId} · {r.editor.sessionId}</dd></div>
    <div><dt>Original narration domain</dt><dd>{r.plan.plan.input.source.narration.original.hashDomain}</dd></div>
    <div><dt>Previous version</dt><dd>{r.previous ? `v${r.previous.version} · ${r.previous.id} · ${r.previous.recordHash} · ${r.previous.planHash}` : "None"}</dd></div>
    <div><dt>Source currentness</dt><dd>{view.currentness} · observed at read; historical integrity is separate</dd></div>
    <div><dt>Selected clips / source duration</dt><dd>{r.plan.plan.sourceOrder.length} · {ms(r.plan.plan.totalSourceMs)}</dd></div>
  </dl>;
}
export function HighlightPlanReview({ value, expanded, onDisclosure }: { value: HighlightPlan; expanded?: readonly string[]; onDisclosure?: (id: string, open: boolean) => void }) {
  const p = value.plan, s = p.input.source, policy = p.input.policy;
  const byId = (id: string) => p.candidates.find(c => c.id === id);
  return <section aria-label="Reviewed highlight plan" className="min-w-0 space-y-4 break-words text-sm leading-6 text-zinc-300">
    <h3 className="font-semibold text-zinc-100">Plan status: {p.status}</h3>
    <dl className="space-y-2 break-all text-xs">
      <div><dt>Selected narration identity</dt><dd>{s.narration.artifact.kind} · {s.narration.artifact.id} · {s.narration.artifact.hashDomain} · {s.narration.artifact.hash}</dd></div>
      <div><dt>Original M4 / source / M3 candidate provenance</dt><dd><details open={expanded?.includes("bindings")} onToggle={event => onDisclosure?.("bindings", event.currentTarget.open)}><summary className={`cursor-pointer ${focusClass}`}>Inspect exact parent, source and analysis bindings</summary>{JSON.stringify({ original: s.narration.original, source: s.narration.source, analysis: s.narration.analysis })}</details></dd></div>
      <div><dt>Source media reference</dt><dd>SHA-256 {s.media.sha256} · {s.media.bytes} bytes · {s.media.durationMs === null ? "Unknown duration" : ms(s.media.durationMs)}</dd></div>
      <div><dt>Source revision observation</dt><dd>{JSON.stringify(s.currentness)} · Preparation observation only; saving rechecks currentness.</dd></div>
      <div><dt>Plan hash</dt><dd>{value.planHash}</dd></div>
      <div><dt>Policy and selection budget</dt><dd>{policy.schemaVersion} · {policy.rubricVersion} · max {policy.maxClips} clips / {ms(policy.maxTotalSourceMs)} · per clip {ms(policy.minClipMs)}–{ms(policy.maxClipMs)} · overlap {policy.overlap} · {policy.transition}</dd></div>
    </dl>
    <p>{p.candidates.length} candidates · {p.sourceOrder.length} selected · {p.decisions.filter(d => d.status === "EXCLUDED").length} excluded · Total selected source duration: {ms(p.totalSourceMs)}</p>
    {p.input.audio && <p className="text-amber-200">Fake audio reference: {p.input.audio.artifactId} · speech NOT_VERIFIED · REFERENCE_ONLY. Silent fixture duration is not spoken Myanmar narration.</p>}
    <section aria-label="Clip orders" className="space-y-2">
      <h3 className="font-semibold text-zinc-100">Source chronology and recap presentation</h3>
      <p>{sameHighlight(p.sourceOrder, p.presentationOrder) ? "Presentation order matches source chronology." : "Presentation order differs from source chronology."} CUT_ONLY. No clips extracted or rendered.</p>
      {([ ["Canonical source interval order", p.sourceOrder], ["Selected presentation order", p.presentationOrder] ] as const).map(([label, ids]) => <div key={label}><h4>{label}</h4><ol className="list-inside list-decimal">{ids.map(id => { const c = byId(id); return <li key={id} className="break-all">{id} · {c ? `${ms(c.startMs)} → ${ms(c.endMs)} · duration ${ms(c.endMs - c.startMs)}` : "Source interval unavailable"}</li>; })}</ol></div>)}
      <h4>Intentional source omissions</h4>
      {p.gaps.length ? p.gaps.map(g => <p key={`${g.afterCandidateId}-${g.beforeCandidateId}`}>{g.kind} · {ms(g.startMs)} → {ms(g.endMs)}</p>) : <p>No between-clip omissions recorded. Unselected source remains omitted.</p>}
      <p className="break-all">Character/relationship coverage: {JSON.stringify(p.coverage)}</p>
    </section>
    <section aria-label="Highlight candidates" className="space-y-3">
      <h3 className="font-semibold text-zinc-100">Candidates, evidence and deterministic scores</h3>
      {!p.candidates.length && <p>No candidates available. Evidence and source intervals are unavailable.</p>}
      {p.candidates.map(c => { const d = p.decisions.find(d => d.candidateId === c.id); return <details key={c.id} open={expanded?.includes(c.id)} onToggle={event => onDisclosure?.(c.id, event.currentTarget.open)} className="min-w-0 rounded-lg border border-white/10 p-3">
        <summary className={`cursor-pointer break-words ${focusClass}`}>{c.classification} · {c.characterIds.join(", ")} {c.relationshipId ?? ""} · Score {c.totalScore} · {d?.status ?? "Decision unavailable"} · {c.id}</summary>
        <div className="mt-3 min-w-0 space-y-3 break-words">
          <p>{c.statement}</p><p>Confidence: {c.confidence} · Uncertainty: {c.uncertainty} · Qualification: {c.qualification ?? "None supplied"}</p>
          <p>{c.classification === "INFERRED" ? "Interpretation, not a proven psychological fact." : "Observed basis; no additional psychological conclusion established."}</p>
          <p className="break-all">M3 finding: {c.findingId} · Claims: {c.claimIds.join(", ") || "Missing narration claim reference"}</p>
          <p>Source interval: {ms(c.startMs)} → {ms(c.endMs)} · duration {ms(c.endMs - c.startMs)} · {c.intervalPolicy}</p>
          <h4>Observed basis</h4>{c.observedBasisIds.length ? c.observedBasisIds.map(id => <p key={id}>{id} · {p.candidates.find(other => other.findingId === id)?.statement ?? "Referenced basis unavailable in candidate view"}</p>) : <p>No observed-basis references supplied.</p>}
          <section aria-label={`Supporting evidence ${c.id}`} className="space-y-2"><h4>Supporting Chinese source evidence</h4>
            {c.evidence.length ? c.evidence.map((e, i) => <div key={i} className="break-all rounded-lg bg-white/[0.03] p-2"><p lang="zh">{e.sourceText || "Chinese source text unavailable"}</p><p>{ms(e.startMs)} → {ms(e.endMs)} · Scene {e.reference.sceneId} · Transcript {e.reference.segmentId}</p><p>{JSON.stringify(e.reference)}</p></div>) : <p>Supporting evidence unavailable. No reference invented.</p>}
          </section>
          <section aria-label={`Contradictory evidence ${c.id}`}><h4>Contradictory evidence references</h4>{c.contradictions.length ? c.contradictions.map((v, i) => <p key={i}>{v.findingId}: {v.explanation} · {p.candidates.find(other => other.findingId === v.findingId)?.statement ?? "Contradictory reference unavailable in candidate view"}</p>) : <p>No contradictory references supplied; this does not prove absence of contradiction.</p>}</section>
          <h4>Deterministic factor breakdown</h4><dl>{Object.entries(c.factors).map(([factor, score]) => <div key={factor}><dt className="inline">{factor}: </dt><dd className="inline">{score} × {p.rubric.weights[factor as keyof typeof c.factors]}</dd></div>)}</dl>
          <ul className="list-inside list-disc">{c.explanations.map((text, i) => <li key={i}>{text}</li>)}</ul>
          <p>Selection: {d?.status ?? "Unavailable"} · Exact reason: {d?.reason ?? "Unavailable"}</p>
        </div>
      </details>; })}
    </section>
  </section>;
}
export default function HighlightsWorkspace({ controller }: { controller: HighlightVersionSession }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [confirmation, setConfirmation] = useState<"prepare" | "load" | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null), prepareRef = useRef<HTMLButtonElement>(null), loadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmation) confirmRef.current?.focus(); }, [confirmation]);
  const unsaved = highlightUnsaved(state), unresolved = !!state.pending && !["CONFLICT", "STALE"].includes(state.phase);
  function request(action: "prepare" | "load") {
    if (unsaved) setConfirmation(action); else if (action === "prepare") void controller.prepare(); else controller.loadPreview();
  }
  function closeConfirm(discard: boolean) { const action = confirmation; setConfirmation(null); if (discard) { if (action === "prepare") void controller.prepare(); else controller.loadPreview(); } (action === "prepare" ? prepareRef : loadRef).current?.focus(); }
  return <section aria-label="Synthetic Highlights workspace" className={`${cardClass} min-w-0 space-y-4 p-5 text-sm leading-6 text-zinc-300`} aria-busy={state.busy}>
    <h2 className="font-semibold text-zinc-100">Highlights plan review</h2>
    <span className={`${badgeClass} ${badgeTones.amber}`}>SYNTHETIC_ONLY · Isolated test adapter</span>
    <p>Human Approved: No · SOURCE_VERIFIED: No · Real TTS eligibility: No · Publication eligibility: No. Original movie audio excluded; voice synchronization unsupported.</p>
    <p>Prepared plans remain in memory only until explicitly saved. Tab switching preserves this workspace. Identity changes or leaving this page clears memory; no autosave.</p>
    <p role={state.phase === "ERROR" || state.phase === "UNAUTHORIZED" ? "alert" : "status"} aria-live="polite">{state.message}</p>
    {state.busy && <p role="status">Operation in progress. Waiting for the authorized service response…</p>}
    <p>Workspace state: {state.phase} · Unsaved plan: {unsaved ? "Yes" : "No"}</p>
    {state.pending && <p className="break-all text-xs">Original operation key: {state.pending.idempotencyKey} · Proposal hash: {state.pendingHash}</p>}
    <div className="flex flex-wrap gap-2">
      <button ref={prepareRef} type="button" className={secondaryButtonClass} disabled={state.busy || unresolved || state.needsAcceptance} onClick={() => request("prepare")}>Prepare Highlight Plan</button>
      <button type="button" className={primaryButtonClass} disabled={state.busy || state.phase !== "PREPARED" || !!state.pending} onClick={() => void controller.save()}>Save New Highlight Version</button>
      <button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.refresh()}>Refresh head and history</button>
      {state.phase === "CONFLICT" && <button type="button" className={secondaryButtonClass} disabled={state.busy || !state.observed} onClick={() => controller.acceptHead()}>Accept refreshed head</button>}
      {unresolved && <button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.recover()}>Recover Original Operation</button>}
    </div>
    {confirmation && <div role="alertdialog" aria-modal="false" aria-label="Replace unsaved highlight plan" className="space-y-3 rounded-lg border border-amber-400/30 p-3"><p>Replace the prepared unsaved plan? The reviewed plan will be replaced only after successful preparation or explicit historical loading.</p><div className="flex flex-wrap gap-2"><button type="button" ref={confirmRef} className={secondaryButtonClass} onClick={() => closeConfirm(false)}>Keep unsaved plan</button><button type="button" className={secondaryButtonClass} onClick={() => closeConfirm(true)}>Discard unsaved plan and continue</button></div></div>}
    {state.observed && <section aria-label="Authorized repository head"><h3>Observed repository head: revision {state.observed.revision}</h3>{state.observed.head ? <Identity view={state.observed.head} /> : <p>No saved head.</p>}<p>This observation does not rebase the prepared plan.</p></section>}
    {state.saved && <section aria-label="Loaded saved identity"><Identity view={state.saved} /></section>}
    {state.plan && <HighlightPlanReview value={state.plan} expanded={state.expanded} onDisclosure={controller.disclosure} />}
    <section aria-label="Highlight version history" className="space-y-3"><h3 className="font-semibold text-zinc-100">Immutable version history</h3>
      {state.history ? (state.history.entries.length ? state.history.entries.map(v => <article key={v.record.id} className="space-y-2 rounded-lg border border-white/10 p-3"><Identity view={v} /><button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.preview(v.record.id)}>Preview highlight version {v.record.version}</button></article>) : <p>No saved versions in this scope.</p>) : <p>History not loaded.</p>}
      {state.history?.nextAfterVersion !== null && state.history?.nextAfterVersion !== undefined && <button type="button" className={secondaryButtonClass} disabled={state.busy} onClick={() => void controller.refresh(true)}>Next history page</button>}
      <p>Pages contain at most 5 versions. Refresh returns to the first page.</p>
    </section>
    {state.preview && <section aria-label="Historical highlight preview" className="min-w-0 space-y-3"><h3>Read-only historical preview</h3><Identity view={state.preview} /><HighlightPlanReview value={state.preview.record.plan} /><button ref={loadRef} type="button" className={secondaryButtonClass} disabled={state.busy || !!state.pending} onClick={() => request("load")}>Load historical version</button><p>Preview leaves the reviewed plan unchanged. Loading changes only this memory workspace, never the repository head.</p></section>}
  </section>;
}
