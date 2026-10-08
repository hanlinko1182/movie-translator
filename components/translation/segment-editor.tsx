"use client";

import { Check, Save, Undo2 } from "lucide-react";
import { StatusBadge, cardClass } from "@/app/projects/[id]/overview-components";
import { formatTimestamp } from "@/lib/format-timestamp";
import type { ReviewRow, ReviewStatus } from "@/lib/translation-qc/types";
import { activeIssues, buttonClass, primaryClass, provenance } from "./workspace-model";

export type Draft = { text: string; version: string };
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <StatusBadge status={status === "APPROVED" ? "Approved" : status === "NEEDS_REVIEW" ? "Needs Review" : "Unreviewed"} tone={status === "APPROVED" ? "Completed" : status === "NEEDS_REVIEW" ? "Needs Attention" : "Waiting"} />;
}
export function QcIssueList({ row, scanned }: { row: ReviewRow; scanned: boolean }) {
  const issues = activeIssues(row);
  return <div className="space-y-3">
    <p className="text-xs leading-5 text-zinc-500">{issues.length ? `${issues.length} unresolved QC findings` : scanned || row.editedAt ? "No local QC findings" : "Local QC has not run"}. Human review remains a separate decision.</p>
    {!!issues.length && <ul className="space-y-3">{issues.map((issue) => <li key={issue.id} className="rounded-lg border border-amber-400/15 bg-amber-400/[0.03] p-3 text-xs leading-5"><p className="font-medium text-amber-200">{issue.category.replaceAll("_", " ")} · {issue.severity}</p><p className="mt-1 break-words text-zinc-400">{issue.message}</p><p className="mt-2 text-[10px] text-zinc-500">{issue.source}</p></li>)}</ul>}
    {row.issues.some((issue) => issue.resolvedAt) && <details className="text-xs text-zinc-500"><summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-violet-300">Previous findings</summary>{row.issues.filter((issue) => issue.resolvedAt).map((issue) => <p key={issue.id} className="mt-2 break-words leading-5">{issue.category.replaceAll("_", " ")}: {issue.resolution}</p>)}</details>}
  </div>;
}
export default function SegmentEditor({ row, draft, busy, saving, feedback, sourceLanguage, scanned, onDraft, onCancel, onKeep, onSave, onReview }: {
  row: ReviewRow | null; draft?: Draft; busy: boolean; saving: boolean; feedback: string;
  sourceLanguage: string; scanned: boolean; onDraft: (text: string) => void; onCancel: () => void;
  onKeep: () => void; onSave: () => void; onReview: (status: ReviewStatus) => void;
}) {
  const dirty = !!row && !!draft && draft.text !== row.text;
  const stale = dirty && draft.version !== row?.version;
  return <section id="segment-editor" aria-labelledby="editor-heading" className={`${cardClass} scroll-mt-6 p-5`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="editor-heading" tabIndex={-1} className="rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-violet-300">Segment editor</h2>{row && <ReviewBadge status={row.reviewStatus} />}</div>
    {!row ? <p className="mt-4 text-sm leading-6 text-zinc-400">Select a saved, aligned translation row to edit its Myanmar text. Source text and timestamps stay read-only.</p> : <div className="mt-5 space-y-5">
      <div><p className="text-xs text-zinc-500">Segment #{row.sequence + 1}</p><p className="mt-1 break-words font-mono text-[11px] text-zinc-400">{formatTimestamp(row.startMs)} → {formatTimestamp(row.endMs)}</p></div>
      <div><h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Chinese source · read only</h3><p lang={sourceLanguage} tabIndex={0} aria-label="Read-only Chinese source" className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded text-sm leading-7 text-zinc-300 focus-visible:outline-2 focus-visible:outline-violet-300 [overflow-wrap:anywhere]">{row.sourceText}</p></div>
      <div>
        <label htmlFor={`target-${row.sequence}`} className="mb-2 block text-xs font-medium text-zinc-300">Myanmar translation · segment #{row.sequence + 1}</label>
        <textarea id={`target-${row.sequence}`} lang="my" rows={7} maxLength={32000} value={draft?.text ?? row.text} disabled={busy} onChange={(event) => onDraft(event.target.value)} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-8 text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-300" />
        <p role="status" className={`mt-2 text-xs leading-5 ${dirty ? "text-amber-200" : "text-zinc-500"}`}>{dirty ? `Unsaved changes${feedback ? ` · ${feedback}` : ""}` : feedback || "Current saved text"}</p>
      </div>
      {stale && <div role="alert" className="space-y-3 rounded-lg border border-amber-400/20 p-3 text-xs leading-5 text-amber-200"><p>The saved version changed. Compare the current saved text before keeping your draft:</p><p lang="my" className="whitespace-pre-wrap break-words text-zinc-300 [overflow-wrap:anywhere]">{row.text}</p><button type="button" disabled={busy} className={buttonClass} onClick={onKeep}>Reviewed latest · keep draft</button></div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${primaryClass} w-full`} disabled={busy || !dirty || !draft?.text.trim() || stale} onClick={onSave}><Save size={15} aria-hidden="true" />{saving ? "Saving…" : "Save Changes"}</button>
        {dirty && <button type="button" disabled={busy} className={`${buttonClass} w-full`} onClick={onCancel}><Undo2 size={14} aria-hidden="true" />Cancel changes</button>}
        <button type="button" className={`${buttonClass} flex-1 text-emerald-300`} disabled={busy || dirty || row.reviewStatus === "APPROVED"} onClick={() => onReview("APPROVED")}><Check size={14} aria-hidden="true" />Approve</button>
        <button type="button" className={`${buttonClass} flex-1`} disabled={busy || dirty || row.reviewStatus === "NEEDS_REVIEW"} onClick={() => onReview("NEEDS_REVIEW")}>Mark Needs Review</button>
      </div>
      <p className="text-xs leading-5 text-zinc-500">Save changed text before approving. Saving makes no paid AI request and refreshes local QC.</p>
      <div className="space-y-2 border-t border-white/10 pt-4"><p className="text-xs font-medium text-zinc-300">{provenance(row)}</p><p className="break-all text-xs text-zinc-500">{row.origin === "MANUAL" ? "Previous automation" : "Saved provider / model"}: {row.provider ?? "Not recorded"} · {row.model ?? "Not recorded"}</p>{row.editedAt && <p className="text-[11px] text-zinc-500">Edited {dateLabel(row.editedAt)}</p>}{row.reviewedAt && <p className="text-[11px] text-zinc-500">Reviewed {dateLabel(row.reviewedAt)}</p>}</div>
      <p className="border-t border-white/10 pt-4 text-xs leading-5 text-zinc-500">{activeIssues(row).length ? `${activeIssues(row).length} unresolved QC findings. Inspect QC Issues below.` : scanned || row.editedAt ? "No local QC findings. Human review remains separate." : "Local QC has not run yet."}</p>
    </div>}
  </section>;
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}
