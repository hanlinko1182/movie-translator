import Link from "next/link";
import { Download, LoaderCircle } from "lucide-react";
import { badgeClass, badgeTones, secondaryButtonClass } from "@/components/ui/styles";
import { renderActions, renderDownloadUrl, type RenderItem } from "./render-model";

export function RenderDownload({ base, job }: { base: string; job: RenderItem }) {
  const url = renderDownloadUrl(base, job);
  return url ? <Link href={url} download prefetch={false} className={secondaryButtonClass} aria-label="Download historical burn-in MP4"><Download size={13} aria-hidden="true" />Download</Link> : null;
}

export default function RenderHistory({ items, base, loading, error, notice, busy, hasMovie, reload, operate }: {
  items: RenderItem[]; base: string; loading: boolean; error: string; notice: string; busy: string; hasMovie: boolean;
  reload: () => void; operate: (job: RenderItem, operation: "retry" | "cancel") => void;
}) {
  return <>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="export-queue-heading" className="text-sm font-semibold text-zinc-100">Export Queue</h2><p className="mt-1 text-xs text-zinc-500">Selected movie · latest 50 render recipes</p></div><button type="button" className={secondaryButtonClass} disabled={!hasMovie || !!busy || loading} onClick={reload}>Refresh status</button></div>
    <div aria-live="polite" className="mt-3 space-y-2 text-xs leading-5">
      {loading && <p className="flex items-center gap-2 text-zinc-400"><LoaderCircle size={14} className="animate-spin" aria-hidden="true" />Loading render history…</p>}
      {error && <p role="alert" className="break-words text-amber-200">{error}</p>}
      {notice && <p className="break-words text-zinc-300">{notice}</p>}
      {!loading && !error && !items.length && <p className="rounded-lg border border-dashed border-white/10 bg-black/10 p-4 text-zinc-400">{hasMovie ? "No render jobs. Choose Burn-in Video and start a render explicitly." : "Upload a project movie before rendering."}</p>}
    </div>
    <ul className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto">
      {items.map((job) => {
        const actions = renderActions(job);
        const tone = job.state === "COMPLETED" ? "green" : job.state === "FAILED" ? "red" : job.execution === "DEFERRED" ? "amber" : job.state === "ACTIVE" ? "violet" : "neutral";
        return <li key={job.id} className="min-w-0 rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-medium text-zinc-200">Burn-in MP4</p><span className={`${badgeClass} ${badgeTones[tone]}`}>{job.execution === "DEFERRED" ? "DEFERRED" : job.state}</span></div>
          <p className="mt-2 text-[11px] leading-5 text-zinc-400">{job.exportMode === "APPROVED_ONLY" ? "Approved Only" : "All Current"} · {job.createdAt.replace("T", " ").slice(0, 16)} UTC</p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500">Historical snapshot · current subtitle match not verified</p>
          {job.state === "ACTIVE" && <p className="mt-2 text-xs text-violet-200">{job.phase ?? "Processing"}{job.progressPercent !== null ? ` · ${job.progressPercent}%` : " · progress unavailable"}</p>}
          {job.state === "QUEUED" && job.execution !== "DEFERRED" && <p className="mt-2 text-xs text-zinc-400">Waiting for the render worker. No ETA available.</p>}
          {job.execution === "DEFERRED" && <p className="mt-2 text-xs text-amber-200">Legacy deferred job. Resume explicitly to render its frozen subtitles.</p>}
          {job.cancelRequestedAt && job.state !== "CANCELLED" && <p className="mt-2 text-xs text-amber-200">Cancellation requested · waiting for safe shutdown</p>}
          {job.state === "FAILED" && <p className="mt-2 break-words text-xs text-rose-200">Render failed{job.errorCode ? ` · ${job.errorCode}` : ""}. Retry keeps the same snapshot.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.retry && <button type="button" disabled={!!busy} className={secondaryButtonClass} onClick={() => operate(job, "retry")}>{busy === job.id ? "Updating…" : job.execution === "DEFERRED" ? "Resume" : "Retry"}</button>}
            {actions.cancel && <button type="button" disabled={!!busy} className={`${secondaryButtonClass} text-rose-200`} onClick={() => operate(job, "cancel")}>{busy === job.id ? "Updating…" : "Cancel"}</button>}
            <RenderDownload base={base} job={job} />
          </div>
        </li>;
      })}
    </ul>
    {items.some((job) => job.state === "COMPLETED") && <p className="mt-3 text-[11px] leading-5 text-zinc-500">Downloads recheck the saved file on disk. Missing or corrupt outputs are rejected by the server.</p>}
  </>;
}
