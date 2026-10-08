import Link from "next/link";
import { Check, Circle, CircleAlert, ArrowUpRight, Upload, AudioLines, Languages, ShieldCheck, Sparkles, Download, Film, Clock3, LoaderCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { dateLabel, durationLabel, languageName, type WorkflowStage, type StageState, type buildOverview } from "./overview-model";
import OverviewActionButton from "./overview-action";

type Overview = ReturnType<typeof buildOverview>;
export const cardClass = "min-w-0 rounded-xl border border-white/10 bg-[#111115]";
export const linkClass = "inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 transition hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300";
const tones: Record<StageState, string> = {
  Completed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  Processing: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  "Needs Attention": "border-amber-400/20 bg-amber-400/10 text-amber-200",
  Ready: "border-indigo-400/25 bg-indigo-400/10 text-indigo-300",
  Waiting: "border-white/10 bg-white/[0.03] text-zinc-400",
  Failed: "border-rose-400/20 bg-rose-400/10 text-rose-300",
};
export function StatusBadge({ status, tone }: { status: string; tone?: StageState }) {
  const state: StageState = tone ?? (status === "Uploaded" ? "Completed" : status === "Needs Review" ? "Needs Attention" : status in tones ? status as StageState : "Waiting");
  const Icon = state === "Completed" ? Check : state === "Processing" ? LoaderCircle : state === "Failed" || state === "Needs Attention" ? CircleAlert : Circle;
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[state]}`}><Icon size={12} aria-hidden="true" className={state === "Processing" ? "animate-spin" : ""} />{status}</span>;
}
const stageIcons: Record<string, LucideIcon> = { Upload, Transcription: AudioLines, Translation: Languages, Review: ShieldCheck, Recap: Sparkles, Export: Download };
export function WorkflowPipeline({ stages }: { stages: WorkflowStage[] }) {
  return <section aria-labelledby="workflow-heading" className={`${cardClass} p-5 md:p-6`}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 id="workflow-heading" className="text-sm font-semibold">Production workflow</h2><span className="text-xs text-zinc-500">Saved outputs & current job status</span></div>
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stages.map((stage, index) => {
        const Icon = stageIcons[stage.name];
        return <li key={stage.name} className="flex min-w-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
          <div className="mb-4 flex items-center justify-between"><Icon size={19} className="text-zinc-400" aria-hidden="true" /><span className="text-[10px] font-medium text-zinc-600">{String(index + 1).padStart(2, "0")}</span></div>
          <h3 className="mb-2 text-sm font-medium">{stage.name}</h3><div><StatusBadge status={stage.state} /></div>
          <p className="mt-3 flex-1 text-xs leading-5 text-zinc-400">{stage.detail}</p>
          {stage.progress !== undefined && <div className="mt-3"><label htmlFor="audio-progress" className="text-xs text-zinc-400">Audio preparation · {stage.progress}%</label><progress id="audio-progress" max={100} value={stage.progress} className="mt-1 h-1.5 w-full accent-violet-500" /></div>}
          <Link href={stage.href} className={`${linkClass} mt-4`}>{stage.linkLabel}<ArrowUpRight size={13} aria-hidden="true" /></Link>
        </li>;
      })}
    </ol>
  </section>;
}
export function NextActionCard({ overview }: { overview: Overview }) {
  return <section aria-labelledby="next-heading" className={`${cardClass} border-violet-400/20 p-5 md:p-6`}>
    <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center"><div className="max-w-xl"><p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-violet-300">Next step</p><h2 id="next-heading" className="text-lg font-semibold tracking-tight">{overview.next.title}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{overview.next.description}</p></div><div className="shrink-0 xl:max-w-xs"><OverviewActionButton key={`${overview.next.action.href ?? overview.next.action.endpoint}`} action={overview.next.action} /></div></div>
  </section>;
}
export function MediaPreviewCard({ overview, sourceLanguage }: { overview: Overview; sourceLanguage: string }) {
  const movie = overview.movie;
  return <section aria-labelledby="media-heading" className={`${cardClass} overflow-hidden`}>
    <div className="flex aspect-video max-h-56 flex-col items-center justify-center gap-3 border-b border-white/10 bg-[#0b0b0e] px-6 text-center"><span className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><Film size={28} className="text-zinc-500" aria-hidden="true" /></span><p className="text-sm text-zinc-400">Preview unavailable</p><p className="max-w-xs text-xs leading-5 text-zinc-600">{movie?.storageKey ? "Source media is stored privately. In-app playback is not available yet." : "Upload a source movie to begin processing."}</p></div>
    <div className="p-5"><h2 id="media-heading" className="text-sm font-semibold">Source media</h2><p className="mt-2 break-all text-sm text-zinc-300">{movie?.filename ?? "No source filename"}</p><dl className="mt-4 grid grid-cols-2 gap-4 text-xs"><div><dt className="text-zinc-500">Duration</dt><dd className="mt-1 text-zinc-300">{durationLabel(movie?.durationSeconds)}</dd></div><div><dt className="text-zinc-500">Language</dt><dd className="mt-1 text-zinc-300">{languageName(sourceLanguage)}</dd></div><div className="col-span-2"><dt className="text-zinc-500">Media state</dt><dd className="mt-1 text-zinc-300">{movie ? movie.status === "UPLOADED" ? movie.storageKey ? "Upload recorded" : "Metadata only · no uploaded file" : movie.status.charAt(0) + movie.status.slice(1).toLowerCase() : "No movie"}{movie?.storageKey && overview.facts.sourceAvailable === false ? " · source file unavailable" : ""}</dd></div></dl></div>
  </section>;
}
export function ProjectOutputCard({ outputs }: { outputs: Overview["outputs"] }) {
  return <section aria-labelledby="outputs-heading" className={`${cardClass} p-5 md:p-6`}><h2 id="outputs-heading" className="text-sm font-semibold">Outputs</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Current saved text and downloadable subtitles.</p><ul className="mt-4 divide-y divide-white/[0.06]">{outputs.map((output) => <li key={output.label} className="flex min-w-0 items-center justify-between gap-3 py-3.5"><div className="min-w-0"><p className="text-sm text-zinc-200">{output.label}</p><p className="mt-1 text-xs text-zinc-500">{output.detail}</p></div>{output.available && output.href ? <Link href={output.href} className={`${linkClass} shrink-0`} aria-label={`Open ${output.label}`}>Open<ArrowUpRight size={14} aria-hidden="true" /></Link> : <Circle size={12} className="shrink-0 text-zinc-700" aria-hidden="true" />}</li>)}</ul></section>;
}
export function RecentActivity({ activities }: { activities: Overview["activities"] }) {
  return <section aria-labelledby="activity-heading" className={`${cardClass} p-5 md:p-6`}><h2 id="activity-heading" className="text-sm font-semibold">Recent activity</h2><p className="mt-1 text-xs text-zinc-500">Latest saved timestamps, not a full edit history.</p><ul className="mt-5 space-y-5">{activities.map((activity, index) => <li key={`${activity.label}-${index}`} className="flex gap-3"><Clock3 size={14} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" /><div><p className="text-sm text-zinc-300">{activity.label}</p><time dateTime={activity.date.toISOString()} className="mt-1 block text-xs text-zinc-500">{dateLabel(activity.date)}</time></div></li>)}</ul></section>;
}
