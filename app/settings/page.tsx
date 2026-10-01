import Link from "next/link";
import {
  Bot,
  ChevronRight,
  DollarSign,
  HardDrive,
  Languages,
  LockKeyhole,
  Save,
  Settings2,
  Sparkles,
  Subtitles,
  Workflow,
} from "lucide-react";

const settingsSections = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "ai-providers", label: "AI Providers", icon: Bot },
  { id: "translation", label: "Translation", icon: Languages },
  { id: "processing", label: "Processing", icon: Workflow },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "export-defaults", label: "Export Defaults", icon: Subtitles },
];

const pipeline = [
  "Upload",
  "Audio Extraction",
  "Transcription",
  "Scene Analysis",
  "Character Analysis",
  "Translation",
  "Quality Check",
  "Human Review",
  "Export",
];

export default function SettingsPage() {
  return (




        <section className="min-w-0 flex-1">
          <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1500px]"><div className="flex items-center gap-2 text-xs text-zinc-500"><Link href="/" className="hover:text-zinc-300">Dashboard</Link><ChevronRight size={13} /><span className="text-zinc-300">Settings</span></div><div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs text-zinc-500">Application configuration</p><h1 className="text-2xl font-semibold tracking-tight">Settings</h1><p className="mt-1 max-w-2xl text-sm text-zinc-500">Configure AI providers, translation behavior, processing, storage, and export defaults.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Local Development</span></div></div></header>

          <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
            <div className="grid items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
              <nav aria-label="Settings sections" className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.02] p-2 sm:grid-cols-3 lg:sticky lg:top-5 lg:grid-cols-1">{settingsSections.map(({ id, label, icon: Icon }) => <Link key={id} href={`#${id}`} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"><Icon size={14} />{label}</Link>)}</nav>

              <div className="min-w-0 space-y-6">
                <section id="general" className="scroll-mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="general-title"><SectionHeading id="general-title" title="General" subtitle="Application identity and default workspace preferences" icon={<Settings2 size={16} />} /><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><SettingsInput label="Application Name" value="Movie Translator" /><SettingsSelect label="Default Source Language" value="Chinese" options={["Chinese", "Cantonese", "Mandarin"]} /><SettingsSelect label="Default Target Language" value="Myanmar" options={["Myanmar"]} /><SettingsSelect label="Interface Theme" value="Dark" options={["Dark"]} /><SettingsSelect label="Timezone" value="Auto" options={["Auto", "UTC"]} /><SettingsSelect label="Autosave Interval" value="30 seconds" options={["15 seconds", "30 seconds", "1 minute"]} /></div></section>

                <section id="ai-providers" className="scroll-mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="providers-title"><SectionHeading id="providers-title" title="AI Providers" subtitle="Configure the cloud services used by the future processing pipeline" icon={<Bot size={16} />} /><div className="mt-5 grid gap-3 xl:grid-cols-3"><ProviderCard title="Speech-to-Text" provider="OpenAI" purpose="Chinese speech transcription with timestamps." maskedKey="sk-••••••••••••••••" /><ProviderCard title="Translation" provider="DeepSeek" purpose="Chinese → Myanmar contextual translation." maskedKey="••••••••••••••••" /><ProviderCard title="Quality Review" provider="DeepSeek" purpose="Translation quality and consistency review." /></div><div className="mt-4 flex gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.025] p-4"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-amber-200/70" /><p className="text-[11px] leading-5 text-zinc-400">API credentials will eventually be stored securely on the server and must never be exposed to browser code. The masked values shown here are placeholders only.</p></div>
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/10 p-4"><div className="flex items-center gap-2"><Sparkles size={14} className="text-zinc-500" /><h3 className="text-xs font-medium">Provider Strategy</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><StrategyStep label="Speech-to-Text" provider="OpenAI" /><StrategyStep label="Translation" provider="DeepSeek" /><StrategyStep label="Quality Check" provider="DeepSeek" /></div><p className="mt-4 text-[10px] leading-5 text-zinc-600">The application will later use provider abstractions so models/providers can be changed without rewriting the processing pipeline. Provider abstractions are not implemented here.</p></div>
                </section>

                <section id="translation" className="scroll-mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="translation-title"><SectionHeading id="translation-title" title="Translation" subtitle="Default behavior for Chinese → Myanmar subtitle translation" icon={<Languages size={16} />} /><div className="mt-5 grid gap-4 sm:grid-cols-2"><SettingsSelect label="Translation Style" value="Natural Myanmar" options={["Natural Myanmar", "Formal", "Conversational"]} /><SettingsSelect label="Context Window" value="Previous 3 / Next 2 segments" options={["Previous 3 / Next 2 segments"]} /></div><p className="mt-4 text-[10px] leading-5 text-zinc-500">Translation should consider dialogue context, scene information, character information, glossary rules, and translation memory.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{["Use Scene Context", "Use Character Context", "Use Glossary", "Use Translation Memory", "Preserve Names", "Prefer Natural Myanmar over Literal Translation"].map((label) => <ToggleSetting key={label} label={label} enabled />)}</div><div className="mt-6 border-t border-white/[0.07] pt-5"><h3 className="text-xs font-medium text-zinc-300">Quality Settings</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{["Auto Quality Check", "Flag Glossary Conflicts", "Flag Translation Memory Conflicts", "Flag Timing Issues", "Human Approval Required Before Export"].map((label) => <ToggleSetting key={label} label={label} enabled />)}<label className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5"><span className="text-[10px] text-zinc-400">Flag Low Confidence Below</span><select defaultValue="80%" className="rounded-md border border-white/10 bg-[#111114] px-2 py-1.5 text-[10px] text-zinc-300"><option>80%</option><option>70%</option><option>90%</option></select></label></div></div></section>

                <section id="processing" className="scroll-mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="processing-title"><SectionHeading id="processing-title" title="Processing" subtitle="Future worker and media preparation defaults" icon={<Workflow size={16} />} /><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><SettingsSelect label="Movie Chunk Length" value="10 minutes" options={["5 minutes", "10 minutes", "15 minutes"]} /><SettingsSelect label="Concurrent Jobs" value="2" options={["1", "2", "4"]} /><SettingsSelect label="Retry Failed Jobs" value="3 attempts" options={["1 attempt", "3 attempts", "5 attempts"]} /><SettingsSelect label="Audio Format" value="WAV" options={["WAV"]} /><SettingsSelect label="Audio Sample Rate" value="16 kHz" options={["16 kHz"]} /><div className="rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5"><p className="text-[10px] text-zinc-500">Processing Mode</p><p className="mt-1 text-xs text-zinc-300">Cloud AI</p></div></div><div className="mt-5 rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-medium">Processing Pipeline</h3><span className="text-[9px] text-zinc-600">Cloud processing</span></div><ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{pipeline.map((step, index) => <li key={step} className="flex items-center gap-2 text-[10px] text-zinc-400"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025] text-[9px] text-zinc-500">{index + 1}</span>{step}</li>)}</ol></div></section>

                <section id="storage" className="scroll-mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="storage-title"><SectionHeading id="storage-title" title="Storage" subtitle="Development storage and future production destination" icon={<HardDrive size={16} />} /><div className="mt-5 grid gap-4 xl:grid-cols-2"><div className="rounded-xl border border-white/[0.08] bg-black/10 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-medium">Current Development Storage</h3><span className="rounded-md border border-amber-500/15 px-2 py-1 text-[9px] text-amber-200/70">Development Only</span></div><div className="mt-4 grid grid-cols-2 gap-4"><DetailValue label="Storage" value="Local Storage" /><DetailValue label="Path" value="./storage" /></div></div><div className="rounded-xl border border-white/[0.08] bg-black/10 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-medium">Future Production Storage</h3><span className="rounded-md border border-white/10 px-2 py-1 text-[9px] text-zinc-500">S3-compatible</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{["Endpoint", "Bucket", "Region", "Access Key", "Secret Key"].map((label) => <label key={label} className="block"><span className="mb-1 block text-[9px] text-zinc-600">{label}</span><input type="password" placeholder={label.includes("Key") ? "••••••••••••••••" : `Enter ${label.toLowerCase()}`} className="w-full rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2 text-[10px] text-zinc-400 outline-none placeholder:text-zinc-700" /></label>)}</div></div></div><div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-medium">Storage Usage</h3><span className="text-xs text-zinc-300">38.4 GB</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><StorageItem label="Movies" value="31.7 GB" /><StorageItem label="Extracted Audio" value="5.2 GB" /><StorageItem label="Generated Files" value="1.5 GB" /></div></div></section>

                <section id="export-defaults" className="scroll-mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="export-defaults-title"><SectionHeading id="export-defaults-title" title="Export Defaults" subtitle="Default subtitle rendering and delivery preferences" icon={<Subtitles size={16} />} /><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><SettingsSelect label="Default Subtitle Format" value="SRT" options={["SRT", "ASS"]} /><SettingsSelect label="Encoding" value="UTF-8" options={["UTF-8"]} /><SettingsSelect label="Maximum Lines" value="2" options={["1", "2", "3"]} /><SettingsSelect label="Line Length" value="42 characters" options={["42 characters"]} /><SettingsSelect label="Minimum Duration" value="1.0 seconds" options={["1.0 seconds"]} /><SettingsSelect label="Default ASS Font" value="Noto Sans Myanmar" options={["Noto Sans Myanmar"]} /><SettingsSelect label="Subtitle Position" value="Bottom Center" options={["Bottom Center", "Top Center"]} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><ToggleSetting label="Include Speaker Names" /><ToggleSetting label="Export Only Approved" enabled /></div><p className="mt-3 text-[10px] text-zinc-600">Font selection is a future setting only; no fonts are installed or bundled.</p></section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="cost-title"><SectionHeading id="cost-title" title="AI Usage & Cost Controls" subtitle="Mock usage estimates for the current month" icon={<DollarSign size={16} />} /><div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><div className="grid grid-cols-2 gap-3"><SettingsInput label="Monthly Budget" value="$25" /><SettingsInput label="Warning Threshold" value="80%" /></div><div className="rounded-xl border border-white/[0.07] bg-black/10 p-4"><div className="flex items-center justify-between"><p className="text-[10px] text-zinc-500">This Month</p><p className="text-lg font-semibold text-zinc-200">$3.42</p></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full w-[14%] rounded-full bg-zinc-400" /></div><div className="mt-4 grid grid-cols-3 gap-3"><CostMetric label="Speech-to-Text" value="$1.18" /><CostMetric label="Translation" value="$1.76" /><CostMetric label="Quality Review" value="$0.48" /></div></div></div><div className="mt-4 flex flex-wrap gap-2">{["Speech-to-Text usage", "Translation input tokens", "Translation output tokens", "Quality review usage"].map((item) => <span key={item} className="rounded-md border border-white/[0.07] px-2.5 py-1.5 text-[9px] text-zinc-500">{item}</span>)}</div></section>

                <section className="sticky bottom-3 z-10 rounded-2xl border border-white/10 bg-[#111114]/95 p-4 shadow-2xl backdrop-blur-sm" aria-label="Save settings"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-[10px] text-zinc-500">Settings are currently UI-only and are not persisted.</p><div className="flex gap-2"><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]">Reset Changes</button><button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[10px] font-medium text-black hover:bg-zinc-200"><Save size={13} /> Save Settings</button></div></div></section>
              </div>
            </div>
          </div>
        </section>


  );
}

function SectionHeading({ id, title, subtitle, icon }: { id: string; title: string; subtitle: string; icon: React.ReactNode }) {
  return <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400">{icon}</span><div><h2 id={id} className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[10px] leading-5 text-zinc-500">{subtitle}</p></div></div>;
}

function SettingsInput({ label, value }: { label: string; value: string }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-zinc-500">{label}</span><input readOnly value={value} className="w-full rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2.5 text-xs text-zinc-300 outline-none" /></label>;
}

function SettingsSelect({ label, value, options }: { label: string; value: string; options: string[] }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-zinc-500">{label}</span><select defaultValue={value} className="w-full rounded-lg border border-white/[0.08] bg-[#111114] px-3 py-2.5 text-xs text-zinc-300 outline-none focus:border-white/20">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function ProviderCard({ title, provider, purpose, maskedKey }: { title: string; provider: string; purpose: string; maskedKey?: string }) {
  return <article className="rounded-xl border border-white/[0.08] bg-black/10 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="text-xs font-medium">{title}</h3><p className="mt-1 text-[10px] text-zinc-500">{provider}</p></div><span className="rounded-md border border-white/10 px-2 py-1 text-[9px] text-zinc-500">Not Configured</span></div><p className="mt-3 min-h-8 text-[10px] leading-5 text-zinc-500">{purpose}</p>{maskedKey && <label className="mt-3 block"><span className="mb-1 block text-[9px] text-zinc-600">API Key · placeholder</span><input type="password" placeholder={maskedKey} className="w-full rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2 text-[10px] text-zinc-400 outline-none placeholder:text-zinc-600" /></label>}<label className="mt-3 block"><span className="mb-1 block text-[9px] text-zinc-600">Model</span><select defaultValue="" className="w-full rounded-md border border-white/[0.07] bg-[#111114] px-2.5 py-2 text-[10px] text-zinc-500"><option value="" disabled>Select model</option><option>Model selection unavailable</option></select></label><button type="button" className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.04]">Test Connection</button></article>;
}

function StrategyStep({ label, provider }: { label: string; provider: string }) {
  return <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.015] px-3 py-2.5"><span className="text-[10px] text-zinc-500">{label}</span><><span className="text-zinc-700">→</span><span className="text-[10px] text-zinc-300">{provider}</span></></div>;
}

function ToggleSetting({ label, enabled = false }: { label: string; enabled?: boolean }) {
  return <label className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5"><span className="text-[10px] text-zinc-400">{label}</span><input type="checkbox" defaultChecked={enabled} className="h-3.5 w-3.5 accent-zinc-200" /></label>;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] text-zinc-600">{label}</p><p className="mt-1 text-xs text-zinc-300">{value}</p></div>;
}

function StorageItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3"><p className="text-[9px] text-zinc-600">{label}</p><p className="mt-1 text-xs text-zinc-300">{value}</p></div>;
}

function CostMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] leading-4 text-zinc-600">{label}</p><p className="mt-1 text-xs text-zinc-300">{value}</p></div>;
}
