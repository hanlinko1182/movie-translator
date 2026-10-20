"use client";

import { useState } from "react";
import { primaryButtonClass, secondaryButtonClass, focusClass } from "@/components/ui/styles";
import { ScriptVersionSession, scriptSections, versionBufferDirty, type VersionState } from "./script-version-session";
import type { useScriptPreviewSession } from "./script-preview";

export default function ScriptVersionPanel({ controller, state, session }: {
  controller: ScriptVersionSession; state: VersionState; session: ReturnType<typeof useScriptPreviewSession>;
}) {
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);
  if (!session.artifact) return null;
  const sections = scriptSections(session.artifact, session.edits), dirty = versionBufferDirty(state, sections);
  const busy = state.phase === "LOADING" || state.phase === "SAVING";
  const stale = state.observed?.currentness === "STALE_DEPENDENCIES" || state.base?.currentness === "STALE_DEPENDENCIES" || state.history?.currentness === "STALE_DEPENDENCIES";
  function loadSelected() {
    const edits = controller.useSelectedInEditor();
    if (edits) session.replaceEdits(edits);
    setConfirmLoad(null);
  }
  return <section aria-label="Synthetic immutable version saving" className="space-y-3 border-t border-white/10 pt-4">
    <h3 className="text-sm font-semibold text-zinc-100">Immutable script versions · Disposable test only</h3>
    <p className="text-xs leading-6 text-zinc-400">Unsaved Draft: {dirty ? "Yes · memory only" : "No"} · Saved Version: {state.selected ? `v${state.selected.version}` : "None selected"} · Human Approved: No</p>
    <p className="text-xs leading-6 text-zinc-400">Source verification: Not issued · TTS eligibility: No · Publication: No. Evidence references belong to the original draft and do not approve edited prose.</p>
    <p role={state.phase === "ERROR" || state.phase === "CONFLICT" ? "alert" : "status"} className="text-sm text-amber-200">{state.message}</p>
    {stale && <p role="alert" className="text-sm text-amber-200">Stale authoritative source · Saving unavailable.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void controller.refresh()}>{state.base ? "Refresh version history" : "Load saved versions"}</button>
      <button type="button" className={primaryButtonClass} disabled={busy || !state.base || !!state.pending || !dirty || stale} onClick={() => void controller.save(sections)}>Save New Version</button>
      {state.pending && <p className="w-full text-xs leading-6 text-zinc-400">A retry submits the captured request, including its original text. Further editor changes remain unsaved.</p>}
      {state.pending && <button type="button" className={secondaryButtonClass} disabled={busy || stale} onClick={() => void controller.retry()}>Retry same save request</button>}
      {state.observed && (state.pending || state.base?.latestRevision !== state.observed.latestRevision) && <button type="button" className={secondaryButtonClass} disabled={busy || stale || !state.canReconcile} onClick={() => void controller.acceptObservedHead()}>Use refreshed history head</button>}
    </div>
    <p className="break-all text-xs leading-6 text-zinc-400">Original M4 durable ID: {state.base?.binding.original.id ?? "Awaiting authorized read"}<br />Expected history revision: {state.base?.latestRevision ?? "Unknown"} · Latest observed revision: {state.observed?.latestRevision ?? "Unknown"}</p>
    <section aria-label="Version history" className="space-y-2">
      <h4 className="text-sm text-zinc-200">Version history</h4>
      {state.history && <p className="text-xs text-zinc-400">History currentness: {state.history.currentness}</p>}
      {state.history && !state.history.versions.length && <p className="text-xs text-zinc-400">No saved edited versions.</p>}
      {state.history?.versions.map(v => <div key={v.id} className="space-y-1 border-l border-white/10 pl-3">
        <button type="button" className={secondaryButtonClass} aria-pressed={state.selected?.id === v.id} disabled={busy} onClick={() => { setConfirmLoad(null); void controller.preview(v.id); }}>Preview saved version {v.version}</button>
        <p className="break-all text-xs leading-6 text-zinc-400">{v.id} · {v.contentHash} · {v.createdAt} · Editor {v.editor.principalId}</p>
      </div>)}
      {state.history?.nextAfterVersion !== null && state.history?.nextAfterVersion !== undefined && <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void controller.refresh(true)}>Load more versions</button>}
    </section>
    {state.selected && <section aria-label="Selected saved version" className="space-y-3">
      <h4 className="text-sm text-zinc-200">Saved Version {state.selected.version} · Human Approved: No</h4>
      <p className="break-all text-xs leading-6 text-zinc-400">Saved ID: {state.selected.id}<br />Canonical content hash: {state.selected.contentHash}<br />Previous version: {state.selected.previousVersion?.id ?? "None"}<br />Currentness: {state.selected.currentness}</p>
      <div role="region" aria-label="Saved version text" tabIndex={0} className={`max-h-80 space-y-3 overflow-y-auto ${focusClass}`}>
        {state.selected.sections.flatMap(s => s.paragraphs.map((text, i) => <p key={`${s.sectionId}-${i}`} lang="my" className="whitespace-pre-wrap break-words text-sm leading-8 text-zinc-200">{text}</p>))}
      </div>
      <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => dirty ? setConfirmLoad(state.selected!.id) : loadSelected()}>Load selected version into editor</button>
      {confirmLoad === state.selected.id && <div role="group" aria-label="Confirm version switch" className="space-y-2">
        <p className="text-sm text-amber-200">Discard unsaved editor text and load this saved version? Previewing alone keeps your text.</p>
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={loadSelected}>Discard unsaved text and load version</button>{" "}
        <button type="button" className={secondaryButtonClass} onClick={() => setConfirmLoad(null)}>Keep unsaved text</button>
      </div>}
    </section>}
  </section>;
}
