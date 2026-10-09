import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ArrowUpRight, Check, CircleAlert, LockKeyhole, ShieldCheck } from "lucide-react";
import packageInfo from "@/package.json";
import { ALLOWED_MOVIE_EXTENSIONS, MAX_MOVIE_UPLOAD_LABEL } from "@/lib/movie-upload-policy";
import { RECAP_LANGUAGE } from "@/lib/recap/types";
import { readSettingsConfiguration } from "./settings-config";
import SettingsWorkspace, { RuntimeReadiness } from "./settings-workspace";

const cardClass = "min-w-0 rounded-xl border border-white/10 bg-[#111115]";

export default async function SettingsPage() {
  await connection();
  const config = readSettingsConfiguration();
  const models = [
    ["Transcription", config.models.transcription, "Speech to Chinese transcript"],
    ["Translation", config.models.translation, "Normal subtitle translation"],
    ["Refinement", config.models.refinement, "Explicit, selective AI refinement"],
    ["Character analysis", config.models.character, "Evidence-based character observations"],
    ["Recap", config.models.recap, "Scene-grounded recap generation"],
  ];

  const panels = [
    { id: "general", label: "General", description: "Application defaults and the starting point for a new project.", content: <>
      <Card title="Project defaults" description="Defaults used by the New Project form. Language choices belong to each project."><dl><Row label="Default source language" value="Chinese" detail="zh" /><Row label="Default target language" value="Myanmar" detail="my" /><Row label="New project behavior" value="Upload a source movie" detail="Create a project and attach its source media from New Project." /></dl><Link href="/projects/new" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300">New Project<ArrowUpRight size={14} aria-hidden="true" /></Link></Card>
      <div className="grid gap-4 sm:grid-cols-2"><Card title="Source media" description="Current upload support"><p className="text-sm text-zinc-200">{ALLOWED_MOVIE_EXTENSIONS.map((extension) => extension.slice(1).toUpperCase()).join(" · ")}</p><p className="mt-2 text-xs text-zinc-500">Maximum upload: {MAX_MOVIE_UPLOAD_LABEL}</p></Card><Card title="Appearance" description="Application visual system"><p className="text-sm text-zinc-200">Dark cinematic</p><p className="mt-2 text-xs leading-5 text-zinc-500">The application uses a shared dark theme. No saved theme preference is available.</p></Card></div>
      <Note>User preferences are not stored by the application. These are current defaults, not personal settings.</Note>
    </> },
    { id: "models", label: "AI Models", description: "Current model roles. Configuration is managed by the environment.", content: <>
      <section className={`${cardClass} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.providerConfigured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}><ShieldCheck size={19} aria-hidden="true" /></span><div><h3 className="text-sm font-semibold">OpenRouter</h3><p className="mt-1 text-xs text-zinc-500">Managed by environment</p></div></div><span className={`rounded-md border px-2.5 py-1 text-xs ${config.providerConfigured ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>{config.providerConfigured ? "Configured" : "Not configured"}</span></div><p className="mt-4 text-xs leading-5 text-zinc-400">{config.providerConfigured ? "Local configuration is valid. This does not verify credentials, model access or provider availability." : "OpenRouter configuration is missing or invalid. AI actions are unavailable until valid configuration is provided."}</p></section>
      <Card title="Configured models" description="Validated model identifiers only. No provider request is made."><dl>{models.map(([role, model, detail]) => <Row key={role} label={role} value={<span className={`break-all font-mono text-xs ${model === "Not configured" || model === "Invalid configuration" ? "text-amber-300" : "text-zinc-200"}`}>{model}</span>} detail={detail} />)}</dl><p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><LockKeyhole size={13} aria-hidden="true" />Configured by environment · Read only</p></Card>
      <Note>AI actions are initiated explicitly in project workspaces. This page does not test models or display credentials.</Note>
    </> },
    { id: "translation", label: "Translation", description: "Translation, quality checks and human review follow the current workflow rules.", content: <>
      <Card title="Translation workflow" description="Current processing configuration"><dl><Row label="Normal translation model" value={<Model>{config.models.translation}</Model>} /><Row label="Refinement model" value={<Model>{config.models.refinement}</Model>} /><Row label="Target language" value="Myanmar" /><Row label="Maximum refinement selection" value="24 segments" detail="Selected rows only. Selecting the entire multi-segment translation is rejected." /></dl></Card>
      <div className="grid gap-4 sm:grid-cols-2"><Card title="Human edits" description="Authoritative current target text"><p className="text-sm leading-6 text-zinc-300">Manual rows are preserved on translation reruns and protected from automatic refinement. Source changes that would invalidate manual work are rejected.</p></Card><Card title="Translation Memory" description="Project-scoped exact matches"><p className="text-sm leading-6 text-zinc-300">Saved translations are captured for reuse. Human edits create manual memory entries that automatic capture cannot overwrite.</p></Card></div>
      <Card title="Quality & approval" description="Local checks support human decisions"><ul className="space-y-3 text-sm leading-6 text-zinc-300"><Rule>Local QC checks saved text and applicable glossary rules. A human edit refreshes local QC without a model call.</Rule><Rule>Approval is human-only. Changing approved text marks it Needs review.</Rule><Rule>Refinement is an explicit paid action in the Translation workspace. It never runs automatically after an edit.</Rule></ul></Card>
    </> },
    { id: "recap", label: "Recap", description: "Scene-grounded summaries with evidence and clearly stated uncertainty.", content: <>
      <Card title="Recap workflow" description="Current generation behavior"><dl><Row label="Recap model" value={<Model>{config.models.recap}</Model>} /><Row label="Output language" value={RECAP_LANGUAGE === "my" ? "Myanmar" : RECAP_LANGUAGE} /><Row label="Scene evidence" value="Required" detail="A saved transcript and detected scenes are prerequisites for generation." /><Row label="Character analysis" value="Advisory" detail="Only current, supported character context is used. Missing or stale analysis falls back to a plot-focused recap." /></dl></Card>
      <Card title="Confidence semantics" description="Evidence strength, not a probability of truth"><dl><Row label="HIGH" value="Explicit textual support" /><Row label="MEDIUM" value="Contextual interpretation" /><Row label="LOW" value="Ambiguous evidence" /></dl><p className="mt-4 text-xs leading-5 text-zinc-500">Uncertain characters and unknown relationships remain low confidence. Recap evidence should be reviewed in context.</p></Card>
      <Note>Recap generation is an explicit paid action in the Recap workspace. Style, length and creativity controls are not available.</Note>
    </> },
    { id: "export", label: "Export", description: "Supported subtitle outputs and review modes for the current saved translation.", content: <>
      <div className="grid gap-4 sm:grid-cols-2"><Card title="SRT" description="Subtitle file"><p className="text-sm leading-6 text-zinc-300">Timed text subtitles from current saved target text.</p><Capability /></Card><Card title="ASS" description="Styled subtitle file"><p className="text-sm leading-6 text-zinc-300">Styled subtitles using the existing exporter.</p><Capability /></Card></div>
      <Card title="Export modes" description="Choose a mode when exporting from a project"><dl><Row label="All Current" value="All current translated segments" detail="Includes unreviewed and needs-review rows; not a claim of approval." /><Row label="Approved Only" value="Human-approved segments only" detail="Requires at least one approved subtitle." /></dl><p className="mt-4 text-xs leading-5 text-zinc-500">Exports use saved current text, including human edits, with existing segment timestamps.</p></Card>
      <Card title="Video outputs" description="Not implemented yet"><dl><Row label="Translated Video" value="Not implemented yet" /><Row label="Recap Video" value="Not implemented yet" /></dl></Card>
    </> },
    { id: "system", label: "System", description: "Safe runtime information and on-demand service readiness.", content: <>
      <Card title="Runtime information" description="Managed by environment · Read only"><dl><Row label="Application version" value={packageInfo.version} /><Row label="Node runtime" value={config.node} /><Row label="Environment" value={config.environment} /><Row label="Storage driver" value={config.storage} detail="Local storage configuration only. Availability is checked separately below." /></dl></Card>
      <RuntimeReadiness />
      <Note>Readiness checks cover the web runtime and its dependencies. They do not verify worker liveness or send paid AI requests. Infrastructure addresses and storage paths are never shown.</Note>
    </> },
  ];

  return <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-7xl space-y-7"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Application</p><h1 className="text-2xl font-semibold tracking-tight">Settings</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Configure Movie Translator preferences and processing defaults.</p></div><span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#111115] px-3 py-2 text-xs text-zinc-400"><LockKeyhole size={13} aria-hidden="true" />Environment managed</span></header><SettingsWorkspace panels={panels} /></div></main>;
}

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className={`${cardClass} p-5`}><h3 className="text-sm font-semibold text-zinc-100">{title}</h3><p className="mb-5 mt-1 text-xs leading-5 text-zinc-500">{description}</p>{children}</section>;
}
function Row({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return <div className="grid min-w-0 gap-2 border-b border-white/5 py-4 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] sm:gap-6"><dt className="text-sm text-zinc-400">{label}</dt><dd className="min-w-0 break-words text-sm text-zinc-200">{value}{detail && <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>}</dd></div>;
}
function Model({ children }: { children: string }) {
  return <span className="break-all font-mono text-xs">{children}</span>;
}
function Note({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4"><CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-500" /><p className="text-xs leading-6 text-zinc-400">{children}</p></div>;
}
function Rule({ children }: { children: ReactNode }) {
  return <li className="flex gap-2.5"><Check size={15} aria-hidden="true" className="mt-1 shrink-0 text-violet-400" /><span>{children}</span></li>;
}
function Capability() {
  return <p className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300"><Check size={12} aria-hidden="true" />Supported</p>;
}
