import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Clapperboard,
  CopyCheck,
  Download,
  FileUp,
  Languages,
  MoreHorizontal,
  Search,
  Sparkles,
} from "lucide-react";

type MemoryEntry = {
  id: string;
  chinese: string;
  myanmar: string;
  similarity: number;
  speaker: string;
  scene: string;
  usage: number;
  status: "Approved" | "Needs Review";
  lastUsed: string;
};

const mockMemoryEntries: MemoryEntry[] = [
  { id: "TM-00128", chinese: "你为什么回来？", myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။", similarity: 100, speaker: "General Zhao", scene: "Courtyard Confrontation", usage: 4, status: "Approved", lastUsed: "Scene 08" },
  { id: "TM-00241", chinese: "我不是来找你的。", myanmar: "ငါ မင်းကိုရှာဖို့ ပြန်လာတာမဟုတ်ဘူး။", similarity: 96, speaker: "Li Wei", scene: "Courtyard Confrontation", usage: 2, status: "Approved", lastUsed: "Scene 08" },
  { id: "TM-00306", chinese: "你为什么又回来了？", myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။", similarity: 93, speaker: "General Zhao", scene: "Courtyard Confrontation", usage: 1, status: "Needs Review", lastUsed: "Scene 08" },
  { id: "TM-00087", chinese: "我不会忘记你的承诺。", myanmar: "မင်းရဲ့ကတိကို ငါမမေ့ဘူး။", similarity: 88, speaker: "Mei Lin", scene: "Riverside Path", usage: 3, status: "Approved", lastUsed: "Scene 31" },
  { id: "TM-00176", chinese: "师父教过我。", myanmar: "ဆရာက ကျွန်တော့်ကို သင်ပေးခဲ့တယ်။", similarity: 82, speaker: "Li Wei", scene: "Mountain Pass", usage: 6, status: "Approved", lastUsed: "Scene 16" },
  { id: "TM-00352", chinese: "事情没有那么简单。", myanmar: "ကိစ္စတွေက ဒီလောက်မရိုးရှင်းဘူး။", similarity: 74, speaker: "Master Chen", scene: "Tea House", usage: 2, status: "Needs Review", lastUsed: "Scene 12" },
  { id: "TM-00104", chinese: "先听我说。", myanmar: "အရင် ကျွန်မပြောတာ နားထောင်ပါ။", similarity: 100, speaker: "Mei Lin", scene: "East Corridor", usage: 5, status: "Approved", lastUsed: "Scene 09" },
  { id: "TM-00209", chinese: "我们一起面对。", myanmar: "အတူတူ ရင်ဆိုင်ကြရအောင်။", similarity: 96, speaker: "Mei Lin", scene: "Riverside Path", usage: 3, status: "Approved", lastUsed: "Scene 11" },
  { id: "TM-00275", chinese: "你还是和以前一样。", myanmar: "မင်းက အရင်အတိုင်းပဲ။", similarity: 93, speaker: "General Zhao", scene: "Courtyard Confrontation", usage: 2, status: "Approved", lastUsed: "Scene 08" },
  { id: "TM-00318", chinese: "不要轻举妄动。", myanmar: "အလျင်စလို မလှုပ်ရှားနဲ့။", similarity: 88, speaker: "Master Chen", scene: "Mountain Gate", usage: 4, status: "Needs Review", lastUsed: "Scene 25" },
  { id: "TM-00381", chinese: "我知道你会回来。", myanmar: "မင်းပြန်လာမယ်ဆိုတာ ငါသိတယ်။", similarity: 82, speaker: "Mei Lin", scene: "Village Gate", usage: 1, status: "Approved", lastUsed: "Scene 07" },
  { id: "TM-00402", chinese: "我们没有时间了。", myanmar: "ငါတို့မှာ အချိန်မရှိတော့ဘူး။", similarity: 74, speaker: "General Zhao", scene: "Command Tent", usage: 2, status: "Approved", lastUsed: "Scene 10" },
];

const mockPreviousUses = [
  { scene: "Scene 08 — Courtyard Confrontation", timestamp: "00:23:04", speaker: "General Zhao", chinese: "你为什么回来？", myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။" },
  { scene: "Scene 19 — Riverside Path", timestamp: "00:48:11", speaker: "Mei Lin", chinese: "你为什么回来？", myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။" },
  { scene: "Scene 31 — Mountain Gate", timestamp: "01:17:22", speaker: "General Zhao", chinese: "你为什么回来？", myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။" },
];

const mockConflicts = [
  { chinese: "别担心。", translations: ["မစိုးရိမ်ပါနဲ့။", "စိတ်မပူပါနဲ့။"], occurrences: 7, status: "Needs Review" },
];

const matchFilters = ["All Matches", "Exact Match", "90%+", "80%+", "Below 80%"];

export default async function TranslationMemoryPage({
  params,
}: PageProps<"/projects/[id]/translation-memory">) {
  const { id } = await params;
  const projectPath = `/projects/${id}`;

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] px-4 py-5 lg:block">
          <Link href="/" className="flex items-center gap-3 px-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black"><Clapperboard size={21} /></span><span><span className="block text-sm font-semibold">Movie Translator</span><span className="block text-xs text-zinc-500">AI Subtitle Studio</span></span></Link>
          <SidebarGroup title="Main"><SidebarLink href="/" label="Dashboard" /><SidebarLink href="/projects" label="Projects" /><SidebarLink href="/movies" label="Movies" /></SidebarGroup>
          <SidebarGroup title="Story"><SidebarLink href={`${projectPath}/recap`} label="Recap" /><SidebarLink href={`${projectPath}/characters`} label="Characters" /><SidebarLink href={`${projectPath}/scenes`} label="Scenes" /></SidebarGroup>
          <SidebarGroup title="Subtitles"><SidebarLink href={`${projectPath}/subtitles`} label="Subtitle Editor" /><SidebarLink href={`${projectPath}/glossary`} label="Glossary" /><SidebarLink href={`${projectPath}/translation-memory`} label="Translation Memory" active /><SidebarLink href={`${projectPath}/translation`} label="Translation" /></SidebarGroup>
          <SidebarGroup title="System" last><SidebarLink href="/settings" label="Settings" /></SidebarGroup>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10"><div className="mx-auto max-w-[1600px]">
            <div className="flex items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-300">Projects</Link><ChevronRight size={13} /><Link href={projectPath} className="hover:text-zinc-300">The Hidden Dragon</Link><ChevronRight size={13} /><span className="text-zinc-300">Translation Memory</span></div>
            <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs text-zinc-500">Project translation resources</p><h1 className="text-2xl font-semibold tracking-tight">Translation Memory</h1><p className="mt-1 text-sm text-zinc-500">Reuse previous translations to improve consistency across the movie.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">1,248 Memory Entries</span><span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300"><Languages size={14} className="text-zinc-500" />Chinese <span className="text-zinc-600">→</span> Myanmar</span></div></div>
          </div></header>

          <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Translation memory summary"><SummaryMetric label="Memory Entries" value="1,248" /><SummaryMetric label="Exact Matches" value="186" /><SummaryMetric label="High Similarity" value="342" /><SummaryMetric label="Used This Project" value="417" /><SummaryMetric label="Needs Review" value="21" warning /></section>

            <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4" aria-label="Memory filters and maintenance">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="relative block w-full xl:max-w-sm"><span className="sr-only">Search source or translation</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input type="search" placeholder="Search source or translation..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20" /></label>
                <div className="flex flex-wrap items-center gap-2"><label><span className="sr-only">Filter by similarity</span><select defaultValue="All Matches" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none"><option>All Matches</option><option>Exact Match</option><option>90%+</option><option>80%+</option><option>Below 80%</option></select></label><label><span className="sr-only">Filter by status</span><select defaultValue="All Status" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none"><option>All Status</option><option>Approved</option><option>Needs Review</option></select></label><label><span className="sr-only">Filter by speaker</span><select defaultValue="All Speakers" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none"><option>All Speakers</option><option>Li Wei</option><option>Mei Lin</option><option>General Zhao</option><option>Master Chen</option></select></label></div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3"><button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]"><FileUp size={13} /> Import TM</button><button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]"><Download size={13} /> Export TM</button><button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]"><CopyCheck size={13} /> Find Duplicates</button><div className="ml-auto flex flex-wrap gap-1.5">{matchFilters.map((filter, index) => <button key={filter} type="button" aria-pressed={index === 0} className={`rounded-md border px-2 py-1.5 text-[9px] ${index === 0 ? "border-white/20 bg-white text-black" : "border-white/[0.08] text-zinc-500 hover:text-zinc-200"}`}>{filter}</button>)}</div></div>
            </section>

            <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
              <section className="min-w-0 space-y-3" aria-labelledby="memory-list-title">
                <div className="flex items-end justify-between"><div><h2 id="memory-list-title" className="font-medium">Translation Matches</h2><p className="mt-1 text-[11px] text-zinc-500">Showing 12 of 1,248 mock memory entries</p></div><span className="text-[10px] text-zinc-600">Sorted by similarity</span></div>
                {mockMemoryEntries.map((entry, index) => <MemoryCard key={entry.id} entry={entry} selected={index === 0} />)}
                <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-center"><p className="text-[10px] text-zinc-500">Showing <span className="text-zinc-300">1–20</span> of <span className="text-zinc-300">1,248</span> memory entries</p><div className="flex gap-1"><button type="button" className="rounded-md px-2 py-1.5 text-[10px] text-zinc-500 hover:bg-white/[0.05]">Previous</button>{["1", "2", "3"].map((page, index) => <button key={page} type="button" aria-current={index === 0 ? "page" : undefined} className={`h-7 min-w-7 rounded-md px-2 text-[10px] ${index === 0 ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.05]"}`}>{page}</button>)}<span className="px-1 text-xs text-zinc-600">...</span><button type="button" className="rounded-md px-2 py-1.5 text-[10px] text-zinc-400 hover:bg-white/[0.05]">Next</button></div></div>
              </section>

              <aside className="space-y-5 2xl:sticky 2xl:top-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5" aria-labelledby="memory-detail-title">
                  <div className="flex items-start justify-between border-b border-white/[0.08] pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Selected Memory · TM-00128</p><h2 id="memory-detail-title" className="mt-2 text-sm font-semibold">Memory Entry Details</h2></div><StatusBadge status="Approved" /></div>
                  <div className="mt-4 flex items-center justify-between text-[10px] text-zinc-600"><span>Source Language</span><span className="text-zinc-400">Chinese</span></div><div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600"><span>Target Language</span><span className="text-zinc-400">Myanmar</span></div>
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/15 p-3"><p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Chinese Source</p><p lang="zh" className="text-base text-zinc-200">你为什么回来？</p><p className="mb-1 mt-4 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Myanmar Translation</p><p lang="my" className="text-sm leading-6 text-zinc-300">မင်းဘာကြောင့် ပြန်လာတာလဲ။</p></div>
                  <div className="mt-4 grid grid-cols-2 gap-3"><DetailField label="Similarity" value="100% · Exact Match" /><DetailField label="Usage" value="4 times" /></div>
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/10 p-3"><p className="mb-3 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Source Context</p><DetailField label="Project" value="The Hidden Dragon" /><div className="mt-3"><DetailField label="Scene" value="Scene 08 — Courtyard Confrontation" /></div><div className="mt-3 grid grid-cols-2 gap-3"><DetailField label="Speaker" value="General Zhao" /><DetailField label="Timestamp" value="00:23:04" /></div><div className="mt-3 flex gap-3"><Link href={`${projectPath}/scenes`} className="text-[10px] text-zinc-400 hover:text-white">Open Scene <ArrowRight size={11} className="ml-1 inline" /></Link><Link href={`${projectPath}/translation`} className="text-[10px] text-zinc-400 hover:text-white">Open Translation <ArrowRight size={11} className="ml-1 inline" /></Link></div></div>
                  <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:bg-white/[0.05]">Edit Memory</button><button type="button" className="rounded-lg border border-emerald-500/15 px-3 py-2 text-[10px] text-emerald-400">Approve</button><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-400">Mark for Review</button><button type="button" className="rounded-lg border border-rose-500/15 px-3 py-2 text-[10px] text-rose-300/80">Delete</button></div>
                </section>

                <section className="rounded-2xl border border-sky-500/15 bg-sky-500/[0.02] p-5" aria-labelledby="current-match-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="current-match-title" className="text-sm font-medium">Current Match</h2><p className="mt-1 text-[10px] text-zinc-500">A subtitle awaiting translation</p></div><Sparkles size={15} className="text-sky-300/60" /></div>
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Current Chinese</p><p lang="zh" className="text-sm text-zinc-200">你为什么又回来了？</p>
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Suggested memory match</p><SimilarityBadge similarity={93} /></div><p lang="zh" className="mt-2 text-xs text-zinc-400">你为什么回来？</p><p lang="my" className="mt-2 text-sm text-zinc-300">မင်းဘာကြောင့် ပြန်လာတာလဲ။</p></div>
                  <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-white px-3 py-2 text-[10px] font-medium text-black">Use Translation</button><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-300">Use &amp; Edit</button><button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-zinc-500">Ignore</button></div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="difference-title">
                  <h2 id="difference-title" className="text-sm font-medium">Difference / Match Context</h2><p className="mt-1 text-[10px] text-zinc-500">Source phrase comparison</p>
                  <div className="mt-4 space-y-3"><div><p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Memory Source</p><p lang="zh" className="mt-1 text-sm text-zinc-300">你为什么回来？</p></div><div><p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Current Source</p><p lang="zh" className="mt-1 text-sm text-zinc-300">你为什么<span className="rounded bg-amber-400/15 px-0.5 text-amber-200 ring-1 ring-amber-300/20">又</span>回来了？</p></div></div>
                  <p className="mt-4 border-l-2 border-amber-300/30 pl-3 text-[11px] leading-5 text-zinc-400">The current source includes an additional meaning of “again”, so the existing translation may require editing.</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="previous-uses-title">
                  <h2 id="previous-uses-title" className="text-sm font-medium">Previous Uses</h2><p className="mt-1 text-[10px] text-zinc-500">Prior context for this memory entry</p>
                  <div className="mt-4 space-y-2">{mockPreviousUses.map((use) => <article key={`${use.scene}-${use.timestamp}`} className="rounded-lg border border-white/[0.07] bg-black/10 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-zinc-400">{use.scene}</span><span className="font-mono text-[9px] text-zinc-600">{use.timestamp}</span></div><p className="mt-1 text-[9px] text-zinc-600">{use.speaker}</p><p lang="zh" className="mt-2 text-xs text-zinc-300">{use.chinese}</p><p lang="my" className="mt-1 text-[11px] text-zinc-500">{use.myanmar}</p></article>)}</div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="memory-quality-title">
                  <h2 id="memory-quality-title" className="text-sm font-medium">Memory Quality</h2><div className="mt-4 space-y-3"><QualityRow label="Translation Quality" value="Approved" tone="green" /><QualityRow label="Glossary Consistency" value="Matched" tone="green" /><QualityRow label="Speaker Consistency" value="Good" tone="green" /><QualityRow label="Context Compatibility" value="Review Recommended" tone="amber" /></div>
                </section>

                <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.025] p-5" aria-labelledby="conflicts-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="conflicts-title" className="text-sm font-medium">Memory Consistency Issue</h2><p className="mt-1 text-[10px] text-zinc-500">Conflicting mock translations</p></div><span className="rounded-md border border-amber-500/15 px-2 py-1 text-[9px] text-amber-300">Needs Review</span></div>
                  {mockConflicts.map((conflict) => <div key={conflict.chinese} className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><p lang="zh" className="text-sm text-zinc-200">{conflict.chinese}</p><div className="mt-3 grid grid-cols-2 gap-2">{conflict.translations.map((translation, index) => <div key={translation} className="rounded-lg border border-white/[0.07] p-2"><p className="text-[9px] text-zinc-600">Translation {index + 1}</p><p lang="my" className="mt-1 text-[11px] leading-5 text-zinc-300">{translation}</p></div>)}</div><div className="mt-3 flex items-center justify-between text-[10px] text-zinc-600"><span>Occurrences</span><span className="text-zinc-400">{conflict.occurrences}</span></div><button type="button" className="mt-3 rounded-lg border border-amber-500/15 px-3 py-2 text-[10px] text-amber-200/80 hover:bg-amber-500/[0.05]">Resolve</button></div>)}
                </section>
              </aside>
            </div>
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

function MemoryCard({ entry, selected }: { entry: MemoryEntry; selected: boolean }) {
  return <article className={`rounded-2xl border p-4 transition ${selected ? "border-white/20 bg-white/[0.04]" : "border-white/10 bg-white/[0.02] hover:border-white/[0.16]"}`}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] text-zinc-500">{entry.id}</span><StatusBadge status={entry.status} /></div><p lang="zh" className="mt-3 text-sm leading-6 text-zinc-200">{entry.chinese}</p><p lang="my" className="mt-1 text-xs leading-6 text-zinc-400">{entry.myanmar}</p></div><SimilarityBadge similarity={entry.similarity} /></div>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] pt-3 text-[10px] text-zinc-500"><span>{entry.speaker}</span><span>{entry.scene}</span><span>Used {entry.usage} times</span><span>Last used {entry.lastUsed}</span><button type="button" aria-label={`More actions for ${entry.id}`} className="ml-auto rounded-md p-1 text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"><MoreHorizontal size={15} /></button></div>
  </article>;
}

function SimilarityBadge({ similarity }: { similarity: number }) {
  const label = similarity === 100 ? "Exact Match" : similarity >= 90 ? "High Match" : similarity >= 80 ? "Similar" : "Low Match";
  const color = similarity === 100 ? "text-emerald-400" : similarity >= 90 ? "text-sky-300" : similarity >= 80 ? "text-zinc-300" : "text-amber-300";
  return <div className="w-full shrink-0 sm:w-28"><div className="flex items-center justify-between gap-2"><span className={`text-xs font-semibold ${color}`}>{similarity}%</span><span className="text-[9px] text-zinc-600">{label}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-zinc-400" style={{ width: `${similarity}%` }} /></div></div>;
}

function StatusBadge({ status }: { status: MemoryEntry["status"] }) {
  return <span className={`rounded-md border px-2 py-1 text-[9px] ${status === "Approved" ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400" : "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"}`}>{status}</span>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-1 text-[11px] leading-5 text-zinc-300">{value}</p></div>;
}

function QualityRow({ label, value, tone }: { label: string; value: string; tone: "green" | "amber" }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-zinc-500">{label}</span><span className={`rounded-md border px-2 py-1 text-[9px] ${tone === "green" ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400" : "border-amber-500/20 bg-amber-500/[0.05] text-amber-300"}`}>{value}</span></div>;
}
