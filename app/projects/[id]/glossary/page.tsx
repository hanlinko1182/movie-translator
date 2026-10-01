import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clapperboard,
  Download,
  FileUp,
  Languages,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

type GlossaryEntry = {
  chinese: string;
  pinyin: string;
  translation: string;
  category: string;
  usage: number;
  status: "Approved" | "Needs Review";
};

const mockGlossaryEntries: GlossaryEntry[] = [
  { chinese: "江湖", pinyin: "Jiānghú", translation: "Jianghu", category: "Cultural", usage: 17, status: "Approved" },
  { chinese: "师父", pinyin: "Shīfu", translation: "ဆရာ", category: "Title", usage: 23, status: "Approved" },
  { chinese: "赵将军", pinyin: "Zhào Jiāngjūn", translation: "ဗိုလ်ချုပ် ကျောက်", category: "Character / Title", usage: 31, status: "Needs Review" },
  { chinese: "李伟", pinyin: "Lǐ Wěi", translation: "Li Wei", category: "Character", usage: 138, status: "Approved" },
  { chinese: "美琳", pinyin: "Měi Lín", translation: "Mei Lin", category: "Character", usage: 104, status: "Approved" },
  { chinese: "陈师父", pinyin: "Chén Shīfu", translation: "ဆရာ ချန်", category: "Character / Title", usage: 47, status: "Approved" },
  { chinese: "青龙寨", pinyin: "Qīnglóng Zhài", translation: "ချင်းလုံစခန်း", category: "Place", usage: 12, status: "Needs Review" },
  { chinese: "内力", pinyin: "Nèilì", translation: "အတွင်းအား", category: "Martial Arts", usage: 9, status: "Approved" },
  { chinese: "飞云门", pinyin: "Fēiyún Mén", translation: "ဖေးယွင်ဂိုဏ်း", category: "Organization", usage: 6, status: "Approved" },
  { chinese: "有话好好说", pinyin: "Yǒu huà hǎohǎo shuō", translation: "စကားကို အေးအေးဆေးဆေး ပြောကြရအောင်", category: "Phrase", usage: 8, status: "Needs Review" },
  { chinese: "长安", pinyin: "Cháng'ān", translation: "ချန်အန်း", category: "Place", usage: 14, status: "Approved" },
  { chinese: "掌门", pinyin: "Zhǎngmén", translation: "ဂိုဏ်းချုပ်", category: "Title", usage: 11, status: "Approved" },
];

const mockOccurrences = [
  {
    timestamp: "00:31:42",
    scene: "Scene 12 — Tea House",
    speaker: "Master Chen",
    chinese: "江湖上的事情没有那么简单。",
    myanmar: "Jianghu လောကထဲက ကိစ္စတွေက ဒီလောက်မရိုးရှင်းဘူး။",
  },
  {
    timestamp: "00:48:16",
    scene: "Scene 18 — Riverside Path",
    speaker: "Li Wei",
    chinese: "你已经走进了江湖。",
    myanmar: "မင်းက Jianghu လောကထဲကို ဝင်လာခဲ့ပြီ။",
  },
  {
    timestamp: "01:06:53",
    scene: "Scene 25 — Mountain Gate",
    speaker: "Mei Lin",
    chinese: "江湖从来不是一个人的路。",
    myanmar: "Jianghu လမ်းဆိုတာ တစ်ယောက်တည်း လျှောက်ရတဲ့လမ်း မဟုတ်ခဲ့ဘူး။",
  },
];

const mockConsistencyIssues = [
  {
    term: "师父",
    found: ["ဆရာ", "ဆရာကြီး"],
    preferred: "ဆရာ",
    affectedSegments: 4,
  },
];

const categories = ["All", "Character", "Place", "Title", "Cultural", "Martial Arts", "Organization", "Phrase"];

export default async function GlossaryPage({
  params,
}: PageProps<"/projects/[id]/glossary">) {
  const { id } = await params;
  const projectPath = `/projects/${id}`;

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] px-4 py-5 lg:block">
          <Link href="/" className="flex items-center gap-3 px-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black"><Clapperboard size={21} /></span>
            <span><span className="block text-sm font-semibold">Movie Translator</span><span className="block text-xs text-zinc-500">AI Subtitle Studio</span></span>
          </Link>
          <SidebarGroup title="Main"><SidebarLink href="/" label="Dashboard" /><SidebarLink href="/projects" label="Projects" /><SidebarLink href="/movies" label="Movies" /></SidebarGroup>
          <SidebarGroup title="Story"><SidebarLink href={`${projectPath}/recap`} label="Recap" /><SidebarLink href={`${projectPath}/characters`} label="Characters" /><SidebarLink href={`${projectPath}/scenes`} label="Scenes" /></SidebarGroup>
          <SidebarGroup title="Subtitles"><SidebarLink href={`${projectPath}/subtitles`} label="Subtitle Editor" /><SidebarLink href={`${projectPath}/glossary`} label="Glossary" active /><SidebarLink href={`${projectPath}/translation`} label="Translation" /></SidebarGroup>
          <SidebarGroup title="System" last><SidebarLink href="/settings" label="Settings" /></SidebarGroup>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-[1600px]">
              <div className="flex items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-300">Projects</Link><ChevronRight size={13} /><Link href={projectPath} className="hover:text-zinc-300">The Hidden Dragon</Link><ChevronRight size={13} /><span className="text-zinc-300">Glossary</span></div>
              <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs text-zinc-500">Project terminology</p><h1 className="text-2xl font-semibold tracking-tight">Glossary</h1><p className="mt-1 text-sm text-zinc-500">Manage terminology and translation rules for consistent Myanmar subtitles.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">42 Terms</span><span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300"><Languages size={14} className="text-zinc-500" />Chinese <span className="text-zinc-600">→</span> Myanmar</span></div></div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Glossary summary">
              <SummaryMetric label="Total Terms" value="42" /><SummaryMetric label="Characters" value="8" /><SummaryMetric label="Places" value="6" /><SummaryMetric label="Cultural Terms" value="12" /><SummaryMetric label="Needs Review" value="4" warning />
            </section>

            <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4" aria-label="Glossary filters">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="relative block w-full xl:max-w-sm"><span className="sr-only">Search terminology</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input type="search" placeholder="Search terminology..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20" /></label>
                <div className="flex flex-wrap items-center gap-2"><label><span className="sr-only">Filter by status</span><select defaultValue="All Status" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none"><option>All Status</option><option>Approved</option><option>Needs Review</option></select></label><button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.05]"><FileUp size={14} /> Import</button><button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black hover:bg-zinc-200"><Plus size={14} /> Add Term</button></div>
              </div>
              <div className="flex flex-wrap gap-1.5">{categories.map((category, index) => <button key={category} type="button" aria-pressed={index === 0} className={`rounded-lg border px-2.5 py-1.5 text-[10px] transition ${index === 0 ? "border-white/20 bg-white text-black" : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"}`}>{category}</button>)}</div>
            </section>

            <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
              <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]" aria-labelledby="terms-title">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-4"><div><h2 id="terms-title" className="text-sm font-medium">Project Terms</h2><p className="mt-1 text-[11px] text-zinc-500">Consistent names, titles, places, and story language</p></div><span className="text-[10px] text-zinc-600">12 shown of 42</span></div>
                <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[780px] text-left"><thead><tr className="border-b border-white/[0.07] text-[9px] font-medium uppercase tracking-wider text-zinc-600"><th className="px-4 py-3">Chinese Term</th><th className="px-3 py-3">Pinyin</th><th className="px-3 py-3">Myanmar Translation</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Usage</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-white/[0.06]">{mockGlossaryEntries.map((entry, index) => <tr key={entry.chinese} className={index === 0 ? "bg-white/[0.035]" : "hover:bg-white/[0.02]"}><td className="px-4 py-3"><span lang="zh" className="text-sm text-zinc-200">{entry.chinese}</span>{index === 0 && <span className="ml-2 rounded border border-white/10 px-1.5 py-0.5 text-[8px] text-zinc-500">Selected</span>}</td><td className="px-3 py-3 text-[11px] italic text-zinc-500">{entry.pinyin}</td><td className="px-3 py-3 text-xs text-zinc-300">{entry.translation}</td><td className="px-3 py-3"><CategoryBadge category={entry.category} /></td><td className="px-3 py-3 text-[10px] text-zinc-500">{entry.usage} occurrences</td><td className="px-3 py-3"><StatusBadge status={entry.status} /></td><td className="px-3 py-3"><button type="button" aria-label={`More actions for ${entry.chinese}`} className="rounded-md p-1.5 text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"><MoreHorizontal size={16} /></button></td></tr>)}</tbody></table></div>
                <div className="divide-y divide-white/[0.07] lg:hidden">{mockGlossaryEntries.map((entry, index) => <article key={entry.chinese} className={`p-4 ${index === 0 ? "bg-white/[0.035]" : ""}`}><div className="flex items-start justify-between gap-3"><div><p lang="zh" className="text-base text-zinc-200">{entry.chinese}</p><p className="mt-0.5 text-[10px] italic text-zinc-500">{entry.pinyin}</p></div><StatusBadge status={entry.status} /></div><p className="mt-3 text-sm text-zinc-300">{entry.translation}</p><div className="mt-3 flex flex-wrap items-center gap-2"><CategoryBadge category={entry.category} /><span className="text-[10px] text-zinc-600">{entry.usage} occurrences</span><button type="button" aria-label={`More actions for ${entry.chinese}`} className="ml-auto rounded-md p-1.5 text-zinc-600"><MoreHorizontal size={16} /></button></div></article>)}</div>
                <div className="flex flex-col justify-between gap-3 border-t border-white/[0.08] p-4 sm:flex-row sm:items-center"><p className="text-[10px] text-zinc-500">Showing <span className="text-zinc-300">1–12</span> of <span className="text-zinc-300">42</span> terms</p><div className="flex gap-1"><button type="button" className="rounded-md px-2 py-1.5 text-[10px] text-zinc-500 hover:bg-white/[0.05]">Previous</button>{["1", "2", "3", "4"].map((page, index) => <button key={page} type="button" aria-current={index === 0 ? "page" : undefined} className={`h-7 min-w-7 rounded-md px-2 text-[10px] ${index === 0 ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.05]"}`}>{page}</button>)}<button type="button" className="rounded-md px-2 py-1.5 text-[10px] text-zinc-400 hover:bg-white/[0.05]">Next</button></div></div>
              </section>

              <aside className="space-y-5 2xl:sticky 2xl:top-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="term-detail-title">
                  <div className="flex items-start justify-between border-b border-white/[0.08] pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Selected Term</p><h2 id="term-detail-title" lang="zh" className="mt-1 text-2xl font-semibold">江湖</h2><p className="mt-1 text-xs italic text-zinc-500">Jiānghú</p></div><StatusBadge status="Approved" /></div>
                  <dl className="mt-4 grid grid-cols-2 gap-4"><DetailField label="Preferred Translation" value="Jianghu" /><DetailField label="Category" value="Cultural Term" /><DetailField label="Occurrences" value="17" /></dl>
                  <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/15 p-4"><div className="flex items-center gap-2"><Sparkles size={14} className="text-zinc-500" /><h3 className="text-xs font-medium text-zinc-300">Translation Rule</h3></div><p className="mt-2 text-xs leading-5 text-zinc-400">“Keep as Jianghu rather than translating literally when it refers to the martial-arts social world.”</p><p className="mt-2 text-[9px] font-medium uppercase tracking-wider text-zinc-600">Project translation rule</p></div>
                  <div className="mt-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Alternative Translations</p><div className="flex flex-wrap gap-2"><span className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-500">martial world</span><span className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-500">martial society</span><span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.05] px-2 py-1 text-[10px] text-emerald-400"><Check size={11} /> Preferred: Jianghu</span></div></div>
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4"><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]">Edit</button><button type="button" className="rounded-lg border border-emerald-500/15 px-3 py-2 text-[10px] text-emerald-400 hover:bg-emerald-500/[0.05]">Approve</button><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]">Mark for Review</button><button type="button" className="rounded-lg border border-rose-500/15 px-3 py-2 text-[10px] text-rose-300/80 hover:bg-rose-500/[0.05]">Delete</button></div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="occurrences-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="occurrences-title" className="text-sm font-medium">Context Examples</h2><p className="mt-1 text-[10px] text-zinc-500">3 occurrences from the mock transcript</p></div><span className="text-[10px] text-zinc-600">江湖</span></div>
                  <div className="space-y-3">{mockOccurrences.map((occurrence) => <article key={occurrence.timestamp} className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-zinc-500">{occurrence.timestamp}</span><span className="text-[9px] text-zinc-600">{occurrence.speaker}</span></div><p className="mt-1 text-[10px] text-zinc-500">{occurrence.scene}</p><p lang="zh" className="mt-3 text-xs leading-5 text-zinc-300">{occurrence.chinese}</p><p lang="my" className="mt-1 text-xs leading-5 text-zinc-400">{occurrence.myanmar}</p></article>)}</div>
                  <Link href={`${projectPath}/translation`} className="mt-4 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">Open in Translation <ArrowRight size={13} /></Link>
                </section>

                <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.025] p-5" aria-labelledby="consistency-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="consistency-title" className="text-sm font-medium">Consistency Issues</h2><p className="mt-1 text-[10px] text-zinc-500">Alternate translations found in mock segments</p></div><span className="rounded-md border border-amber-500/15 px-2 py-1 text-[9px] text-amber-300">1 issue</span></div>
                  {mockConsistencyIssues.map((issue) => <div key={issue.term} className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><p lang="zh" className="text-sm text-zinc-200">{issue.term}</p><p className="mt-3 text-[10px] text-zinc-600">Found translations</p><div className="mt-1 flex gap-2">{issue.found.map((variant) => <span key={variant} className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-400">{variant}</span>)}</div><p className="mt-3 text-[10px] text-zinc-500">Preferred: <span className="text-zinc-200">{issue.preferred}</span></p><p className="mt-1 text-[10px] text-zinc-600">Affected segments: {issue.affectedSegments}</p><Link href={`${projectPath}/translation`} className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-zinc-300 hover:text-white">Review Segments <ArrowRight size={12} /></Link></div>)}
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" aria-label="Glossary import and export"><p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Import / Export</p><div className="flex gap-2"><button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]"><FileUp size={13} /> Import CSV</button><button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]"><Download size={13} /> Export CSV</button></div></section>
              </aside>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5" aria-labelledby="add-term-title">
              <div className="mb-4 flex items-center justify-between"><div><h2 id="add-term-title" className="text-sm font-medium">Add Glossary Term</h2><p className="mt-1 text-[10px] text-zinc-500">Draft a project term · changes are not saved</p></div><Plus size={16} className="text-zinc-500" /></div>
              <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <FormField label="Chinese Term" placeholder="e.g. 江湖" />
                <FormField label="Pinyin" placeholder="e.g. Jiānghú" />
                <FormField label="Myanmar Translation" placeholder="Preferred Myanmar term" />
                <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-zinc-500">Category</span><select defaultValue="" className="w-full rounded-lg border border-white/10 bg-[#111114] px-3 py-2.5 text-xs text-zinc-300 outline-none focus:border-white/20"><option value="" disabled>Select category</option>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label>
                <FormField label="Translation Rule" placeholder="How should translators use this term?" />
                <FormField label="Notes" placeholder="Optional context or usage notes" />
                <div className="flex items-end sm:col-span-2 xl:col-span-3"><button type="button" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-medium text-black hover:bg-zinc-200"><Plus size={14} /> Add to Glossary</button></div>
              </form>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarGroup({ children, title, last = false }: { children: React.ReactNode; title: string; last?: boolean }) {
  return <div className={last ? "mt-8 border-t border-white/10 pt-5" : "mt-8"}><p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">{title}</p><nav className="space-y-1">{children}</nav></div>;
}

function SidebarLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`block rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white text-black" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"}`}>{label}</Link>;
}

function SummaryMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"><p className="text-[10px] text-zinc-500">{label}</p><p className={`mt-1 text-lg font-semibold ${warning ? "text-amber-300" : "text-zinc-200"}`}>{value}</p></div>;
}

function CategoryBadge({ category }: { category: string }) {
  return <span className="rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[9px] text-zinc-500">{category}</span>;
}

function StatusBadge({ status }: { status: GlossaryEntry["status"] }) {
  return <span className={`rounded-md border px-2 py-1 text-[9px] ${status === "Approved" ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400" : "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"}`}>{status}</span>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">{label}</dt><dd className="mt-1 text-xs text-zinc-300">{value}</dd></div>;
}

function FormField({ label, placeholder }: { label: string; placeholder: string }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-zinc-500">{label}</span><input type="text" placeholder={placeholder} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-white/20" /></label>;
}
