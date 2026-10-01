import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Download,
  FileJson2,
  FileText,
  Settings2,
  ShieldCheck,
  Subtitles,
} from "lucide-react";

const mockValidationIssues = [
  {
    type: "Timing Issue",
    title: "Segment #128",
    detail: "00:42:18.200 → 00:42:18.650",
    description: "Subtitle duration may be too short.",
    action: "Open Subtitle Editor",
    href: "subtitles",
  },
  {
    type: "Glossary Issue",
    title: "师父",
    detail: "Preferred: ဆရာ · Found: ဆရာကြီး",
    description: "This term has inconsistent translations in 4 segments.",
    action: "Open Glossary",
    href: "glossary",
  },
  {
    type: "Translation Memory Conflict",
    title: "别担心。",
    detail: "Multiple approved translations found.",
    description: "Review the conflicting memory entries before delivery.",
    action: "Open Translation Memory",
    href: "translation-memory",
  },
];

const mockRecentExports = [
  { name: "the-hidden-dragon-mm-v2.srt", type: "SRT", detail: "428 segments", status: "Completed", time: "2 minutes ago" },
  { name: "the-hidden-dragon-recap.txt", type: "Recap Script", detail: "Myanmar narrative", status: "Completed", time: "Yesterday" },
];

const exportTypes = [
  { title: "SRT Subtitles", description: "Standard subtitle format compatible with most video players.", meta: ["428 segments", "UTF-8", "Chinese → Myanmar"], icon: Subtitles, selected: true, action: "Configure SRT" },
  { title: "ASS Subtitles", description: "Advanced subtitle format supporting styling and positioning.", meta: ["428 segments", "UTF-8", "Styled subtitles"], icon: FileText, selected: false, action: "Configure ASS" },
  { title: "Recap Script", description: "Export the generated character-driven Myanmar recap script.", meta: ["Myanmar", "Narrative format"], icon: Clapperboard, selected: false, action: "Configure Recap" },
  { title: "Translation Data", description: "Export reviewed Chinese and Myanmar translation pairs.", meta: ["CSV", "JSON"], icon: FileJson2, selected: false, action: "Configure Data" },
];

export default async function ExportPage({
  params,
}: PageProps<"/projects/[id]/export">) {
  const { id } = await params;
  const projectPath = `/projects/${id}`;

  return (




        <section className="min-w-0 flex-1">
          <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1550px]">
            <div className="flex items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-300">Projects</Link><ChevronRight size={13} /><Link href={projectPath} className="hover:text-zinc-300">The Hidden Dragon</Link><ChevronRight size={13} /><span className="text-zinc-300">Export</span></div>
            <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs text-zinc-500">Final delivery</p><h1 className="text-2xl font-semibold tracking-tight">Export</h1><p className="mt-1 text-sm text-zinc-500">Prepare reviewed subtitles and story content for final delivery.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">Chinese <span className="mx-1.5 text-zinc-600">→</span> Myanmar</span><span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-200"><AlertTriangle size={13} /> Ready with Warnings</span></div></div>
          </div></header>

          <div className="mx-auto max-w-[1550px] space-y-5 p-4 sm:p-6 lg:p-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="readiness-title">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                <div className="min-w-[180px] xl:w-56"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-zinc-400" /><h2 id="readiness-title" className="text-sm font-medium">Export Readiness</h2></div><p className="mt-3 text-3xl font-semibold tracking-tight">92<span className="text-lg text-zinc-500">%</span></p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[92%] rounded-full bg-zinc-200" /></div><p className="mt-2 text-[10px] text-amber-300/80">Warnings remain before final export</p></div>
                <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4 xl:grid-cols-7"><ReadinessMetric label="Subtitle Segments" value="428" /><ReadinessMetric label="Approved" value="391" tone="green" /><ReadinessMetric label="Needs Review" value="30" tone="amber" /><ReadinessMetric label="Timing Issues" value="7" tone="amber" /><ReadinessMetric label="Untranslated" value="0" tone="green" /><ReadinessMetric label="Glossary Issues" value="2" tone="amber" /><ReadinessMetric label="TM Conflicts" value="1" tone="amber" /></div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3 border-t border-white/[0.07] pt-4"><Link href={`${projectPath}/subtitles`} className="text-[11px] text-zinc-400 hover:text-white">Review Subtitles <ArrowRight size={12} className="ml-1 inline" /></Link><Link href={`${projectPath}/glossary`} className="text-[11px] text-zinc-400 hover:text-white">Review Glossary <ArrowRight size={12} className="ml-1 inline" /></Link><Link href={`${projectPath}/translation-memory`} className="text-[11px] text-zinc-400 hover:text-white">Review Translation Memory <ArrowRight size={12} className="ml-1 inline" /></Link></div>
            </section>

            <section aria-labelledby="export-types-title"><div className="mb-3 flex items-end justify-between"><div><h2 id="export-types-title" className="text-sm font-medium">Export Types</h2><p className="mt-1 text-[10px] text-zinc-500">Choose what to prepare for delivery</p></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{exportTypes.map(({ title, description, meta, icon: Icon, selected, action }) => <article key={title} className={`rounded-2xl border p-4 ${selected ? "border-white/20 bg-white/[0.04]" : "border-white/10 bg-white/[0.02]"}`}><div className="flex items-start justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400"><Icon size={17} /></span>{selected && <span className="rounded-md border border-white/10 px-2 py-1 text-[9px] text-zinc-300">Selected</span>}</div><h3 className="mt-4 text-sm font-medium">{title}</h3><p className="mt-1 min-h-10 text-[11px] leading-5 text-zinc-500">{description}</p><div className="mt-3 flex flex-wrap gap-1.5">{meta.map((item) => <span key={item} className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-zinc-600">{item}</span>)}</div><button type="button" className={`mt-4 w-full rounded-lg border px-3 py-2 text-[10px] ${selected ? "border-white/15 bg-white text-black" : "border-white/10 text-zinc-400 hover:bg-white/[0.05]"}`}>{action}</button></article>)}</div></section>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
              <section className="space-y-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="configuration-title">
                  <div className="mb-5 flex items-center justify-between"><div><h2 id="configuration-title" className="text-sm font-medium">SRT Configuration</h2><p className="mt-1 text-[10px] text-zinc-500">Selected export format · SRT</p></div><Settings2 size={16} className="text-zinc-500" /></div>
                  <div className="grid gap-4 sm:grid-cols-2"><ConfigField label="Format" value="SRT" /><ConfigField label="Filename" value="the-hidden-dragon-mm.srt" /><ConfigField label="Encoding" value="UTF-8" /><ConfigField label="Language" value="Myanmar" /></div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2"><ToggleMock label="Include speaker names" checked /><ToggleMock label="Include untranslated segments" /><ToggleMock label="Export only approved segments" checked /></div>
                  <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/[0.07] pt-4"><ConfigField label="Line wrapping" value="42 characters" /><ConfigField label="Minimum duration" value="1.0 seconds" /><ConfigField label="Maximum lines" value="2" /></div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="ass-preview-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="ass-preview-title" className="text-sm font-medium">ASS Style Preview</h2><p className="mt-1 text-[10px] text-zinc-500">Secondary format settings · preview only</p></div><span className="rounded-md border border-white/10 px-2 py-1 text-[9px] text-zinc-500">ASS</span></div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><ConfigField label="Font" value="Noto Sans Myanmar" /><ConfigField label="Font Size" value="48" /><ConfigField label="Position" value="Bottom Center" /><ConfigField label="Outline / Shadow" value="Enabled / Enabled" /></div>
                  <p className="mt-4 text-[10px] text-zinc-600">Font settings are descriptive only. No font files are bundled.</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="recent-exports-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="recent-exports-title" className="text-sm font-medium">Recent Exports</h2><p className="mt-1 text-[10px] text-zinc-500">Mock export history</p></div><Clock3 size={15} className="text-zinc-500" /></div>
                  <div className="space-y-2">{mockRecentExports.map((item) => <div key={item.name} className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] text-zinc-500"><FileText size={15} /></span><div className="min-w-0"><p className="truncate text-xs text-zinc-300">{item.name}</p><p className="mt-1 text-[9px] text-zinc-600">{item.type} · {item.detail} · {item.time}</p></div><span className="hidden rounded-md border border-emerald-500/15 px-2 py-1 text-[9px] text-emerald-400 sm:inline">{item.status}</span></div><div className="flex gap-2"><button type="button" className="rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.05]">View</button><button type="button" className="rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.05]">Download</button></div></div>)}</div>
                </section>
              </section>

              <aside className="space-y-5">
                <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#050506]" aria-labelledby="subtitle-preview-title">
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><h2 id="subtitle-preview-title" className="text-xs font-medium">Subtitle Preview</h2><p className="mt-0.5 text-[9px] text-zinc-600">1920 × 1080 preview · visual only</p></div><span className="text-[9px] text-zinc-600">SRT · Myanmar</span></div>
                  <div className="relative aspect-video overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#27272a_0%,#111113_45%,#050506_100%)]"><div className="absolute inset-x-[7%] top-[7%] bottom-[7%] border border-dashed border-white/[0.07]" /><div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" /><div className="absolute inset-x-[7%] bottom-[7%] border-b border-dashed border-white/[0.1]" /><div className="absolute inset-x-4 bottom-[15%] flex flex-col items-center gap-1"><span lang="my" className="rounded bg-black/65 px-3 py-1.5 text-center text-sm text-white shadow-lg">မင်းဘာကြောင့် ပြန်လာတာလဲ။</span><span lang="zh" className="rounded bg-black/50 px-2 py-1 text-center text-[10px] text-zinc-200">你为什么回来？</span></div><span className="absolute left-3 top-3 text-[9px] text-zinc-600">Safe area</span></div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="validation-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="validation-title" className="text-sm font-medium">Pre-export Validation</h2><p className="mt-1 text-[10px] text-zinc-500">Ready with warnings</p></div><AlertTriangle size={16} className="text-amber-300/70" /></div>
                  <div className="space-y-2"><ValidationCheck label="All segments translated" /><ValidationCheck label="UTF-8 compatible" /><ValidationCheck label="Timeline order valid" /><ValidationCheck label="No overlapping approved subtitles" /></div>
                  <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.025] p-3"><p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-amber-200/70">Warnings</p><div className="grid grid-cols-2 gap-y-2"><WarningCount label="Timing issues" value="7" /><WarningCount label="Glossary inconsistencies" value="2" /><WarningCount label="TM conflicts" value="1" /><WarningCount label="Segments need review" value="30" /></div></div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="issues-title">
                  <div className="mb-4"><h2 id="issues-title" className="text-sm font-medium">Issue Details</h2><p className="mt-1 text-[10px] text-zinc-500">Examples to review before delivery</p></div>
                  <div className="space-y-3">{mockValidationIssues.map((issue) => <article key={issue.type} className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-amber-200/70">{issue.type}</p><p className="mt-2 text-xs font-medium text-zinc-300">{issue.title}</p><p className="mt-1 font-mono text-[9px] text-zinc-600">{issue.detail}</p><p className="mt-2 text-[10px] leading-5 text-zinc-500">{issue.description}</p><Link href={`${projectPath}/${issue.href}`} className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-zinc-300 hover:text-white">{issue.action} <ArrowRight size={12} /></Link></article>)}</div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="export-summary-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="export-summary-title" className="text-sm font-medium">Export Summary</h2><p className="mt-1 text-[10px] text-zinc-500">Current selection</p></div><FileText size={15} className="text-zinc-500" /></div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3"><SummaryField label="Project" value="The Hidden Dragon" /><SummaryField label="Runtime" value="1h 48m" /><SummaryField label="Source" value="Chinese" /><SummaryField label="Target" value="Myanmar" /><SummaryField label="Subtitle Segments" value="428" /><SummaryField label="Selected Format" value="SRT" /><SummaryField label="Estimated File Size" value="~68 KB" /><SummaryField label="Encoding" value="UTF-8" /></div>
                  <div className="mt-5 space-y-2"><button type="button" className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"><Download size={16} /> Export SRT</button><button type="button" className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-xs text-zinc-300 hover:bg-white/[0.05]">Save Export Settings</button></div>
                  <p className="mt-3 text-center text-[9px] leading-4 text-zinc-600">File generation will be available when the export backend is connected.</p>
                </section>
              </aside>
            </div>
          </div>
        </section>


  );
}

function ReadinessMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "amber" }) {
  const colors = { neutral: "text-zinc-200", green: "text-emerald-400", amber: "text-amber-300" };
  return <div><p className="text-[9px] leading-4 text-zinc-600">{label}</p><p className={`mt-1 text-sm font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function ConfigField({ label, value }: { label: string; value: string }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] text-zinc-500">{label}</span><input readOnly value={value} className="w-full rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2.5 text-xs text-zinc-300 outline-none" /></label>;
}

function ToggleMock({ label, checked = false }: { label: string; checked?: boolean }) {
  return <label className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5"><input type="checkbox" defaultChecked={checked} disabled className="h-3.5 w-3.5 accent-zinc-200" /><span className="text-[10px] text-zinc-400">{label}</span></label>;
}

function ValidationCheck({ label }: { label: string }) {
  return <div className="flex items-center gap-2 text-[10px] text-zinc-400"><CheckCircle2 size={13} className="shrink-0 text-emerald-400/80" />{label}</div>;
}

function WarningCount({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-2 text-[9px] text-zinc-500"><span>{label}</span><span className="font-medium text-amber-200/80">{value}</span></div>;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] text-zinc-600">{label}</p><p className="mt-1 text-[11px] text-zinc-300">{value}</p></div>;
}
