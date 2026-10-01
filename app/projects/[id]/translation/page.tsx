import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Clock3,
  Languages,
  MoreHorizontal,
  Search,
  Sparkles,
} from "lucide-react";

type SegmentStatus = "Approved" | "Needs Review" | "Untranslated" | "Translating";

const mockSegments: {
  number: string;
  start: string;
  end: string;
  speaker: string;
  chinese: string;
  myanmar: string;
  status: SegmentStatus;
}[] = [
  {
    number: "001",
    start: "00:02:14",
    end: "00:02:19",
    speaker: "Li Wei",
    chinese: "你为什么要回来？",
    myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။",
    status: "Approved",
  },
  {
    number: "002",
    start: "00:02:20",
    end: "00:02:26",
    speaker: "Mei Lin",
    chinese: "因为这里还有我必须完成的事情。",
    myanmar: "ဒီနေရာမှာ ကျွန်မ ပြီးမြောက်အောင်လုပ်ရမယ့် အရာတစ်ခု ကျန်နေသေးလို့ပါ။",
    status: "Needs Review",
  },
  {
    number: "003",
    start: "00:02:27",
    end: "00:02:31",
    speaker: "General Zhao",
    chinese: "你们没有时间了。",
    myanmar: "မင်းတို့မှာ အချိန်မရှိတော့ဘူး။",
    status: "Approved",
  },
  {
    number: "004",
    start: "00:02:32",
    end: "00:02:37",
    speaker: "Li Wei",
    chinese: "师父教过我，真正的选择从来都不容易。",
    myanmar: "ဆရာက သင်ပေးခဲ့တယ်၊ မှန်ကန်တဲ့ရွေးချယ်မှုဆိုတာ ဘယ်တော့မှ မလွယ်ကူဘူးတဲ့။",
    status: "Translating",
  },
  {
    number: "005",
    start: "00:02:38",
    end: "00:02:43",
    speaker: "Mei Lin",
    chinese: "那就让我们一起面对。",
    myanmar: "ဒါဆို အတူတူ ရင်ဆိုင်ကြရအောင်။",
    status: "Untranslated",
  },
];

const projectSections = [
  { label: "Recap", path: "recap" },
  { label: "Characters", path: "characters" },
  { label: "Scenes", path: "scenes" },
];

const subtitleSections = [
  { label: "Subtitle Editor", path: "subtitle-editor" },
  { label: "Glossary", path: "glossary" },
  { label: "Translation Memory", path: "translation-memory" },
];

export default async function TranslationPage({
  params,
}: PageProps<"/projects/[id]/translation">) {
  const { id } = await params;
  const projectPath = `/projects/${id}`;

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] px-4 py-5 lg:block">
          <Link href="/" className="flex items-center gap-3 px-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <Clapperboard size={21} />
            </span>
            <span>
              <span className="block text-sm font-semibold">Movie Translator</span>
              <span className="block text-xs text-zinc-500">AI Subtitle Studio</span>
            </span>
          </Link>

          <SidebarGroup title="Main">
            <SidebarLink href="/" label="Dashboard" />
            <SidebarLink href="/projects" label="Projects" />
            <SidebarLink href="/movies" label="Movies" />
          </SidebarGroup>
          <SidebarGroup title="Story">
            {projectSections.map(({ label, path }) => (
              <SidebarLink key={path} href={`${projectPath}/${path}`} label={label} />
            ))}
          </SidebarGroup>
          <SidebarGroup title="Subtitles">
            {subtitleSections.map(({ label, path }) => (
              <SidebarLink key={path} href={`${projectPath}/${path}`} label={label} active={path === "subtitle-editor"} />
            ))}
            <SidebarLink href={`${projectPath}/translation`} label="Translation" active />
          </SidebarGroup>
          <SidebarGroup title="System" last>
            <SidebarLink href="/settings" label="Settings" />
          </SidebarGroup>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-[1600px]">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <Link href="/projects" className="hover:text-zinc-300">Projects</Link>
                <ChevronRight size={13} />
                <Link href={projectPath} className="hover:text-zinc-300">The Hidden Dragon</Link>
                <ChevronRight size={13} />
                <span className="text-zinc-300">Translation</span>
              </div>
              <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <Link href={projectPath} className="mb-2 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200">
                    <ArrowLeft size={14} /> Project overview
                  </Link>
                  <h1 className="text-2xl font-semibold tracking-tight">Translation</h1>
                  <p className="mt-1 text-sm text-zinc-500">Review Chinese dialogue and refine natural Myanmar translations.</p>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                  <Languages size={15} className="text-zinc-400" /> Chinese <span className="text-zinc-600">→</span> Myanmar
                </div>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="progress-title">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 id="progress-title" className="font-medium">Translation Progress</h2>
                      <p className="mt-1 text-xs text-zinc-500">Chinese transcript review and Myanmar subtitle status</p>
                    </div>
                    <span className="text-2xl font-semibold">68%</span>
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Translation progress" aria-valuenow={68} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full w-[68%] rounded-full bg-zinc-100" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 md:min-w-[480px]">
                  <Metric label="Segments" value="428" />
                  <Metric label="Translated" value="291" />
                  <Metric label="Needs Review" value="34" />
                  <Metric label="Approved" value="257" />
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4" aria-label="Translation filters">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="relative block min-w-0 flex-1 xl:max-w-sm">
                  <span className="sr-only">Search dialogue</span>
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input type="search" placeholder="Search dialogue..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20" />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {(["All", "Needs Review", "Approved", "Untranslated"] as const).map((filter, index) => (
                    <button key={filter} type="button" aria-pressed={index === 0} className={`rounded-lg border px-3 py-2 text-xs transition ${index === 0 ? "border-white/20 bg-white text-black" : "border-white/10 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"}`}>
                      {filter}
                    </button>
                  ))}
                  <label className="relative">
                    <span className="sr-only">Filter by speaker</span>
                    <select defaultValue="All Speakers" className="appearance-none rounded-lg border border-white/10 bg-[#111114] py-2 pl-3 pr-8 text-xs text-zinc-300 outline-none focus:border-white/20">
                      <option>All Speakers</option><option>Li Wei</option><option>Mei Lin</option><option>General Zhao</option>
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  </label>
                  <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition hover:bg-zinc-200">
                    <Sparkles size={14} /> Translate Remaining
                  </button>
                </div>
              </div>
            </section>

            <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
              <section className="min-w-0 space-y-3" aria-label="Translation segments">
                {mockSegments.map((segment) => (
                  <article key={segment.number} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="font-mono text-xs font-medium text-zinc-300">#{segment.number}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><Clock3 size={13} /> {segment.start} <span className="text-zinc-700">→</span> {segment.end}</span>
                        <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400">{segment.speaker}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white">Edit</button>
                        <button type="button" aria-label={`Approve segment ${segment.number}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white"><Check size={13} /> Approve</button>
                        <button type="button" aria-label={`More actions for segment ${segment.number}`} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><MoreHorizontal size={17} /></button>
                      </div>
                    </div>
                    <div className="grid gap-4 pt-4 lg:grid-cols-2">
                      <div className="min-w-0">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Chinese source</p>
                        <p lang="zh" className="text-base leading-7 text-zinc-200">{segment.chinese}</p>
                      </div>
                      <div className="min-w-0 border-t border-white/[0.06] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Myanmar translation</p>
                        <p lang="my" className="text-sm leading-7 text-zinc-300">{segment.myanmar}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
                      <StatusBadge status={segment.status} />
                      <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"><Sparkles size={13} /> Retry Translation</button>
                    </div>
                  </article>
                ))}

                <nav aria-label="Pagination" className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center">
                  <p className="text-xs text-zinc-500">Showing <span className="text-zinc-300">1–20</span> of <span className="text-zinc-300">428</span> segments</p>
                  <div className="flex items-center gap-1">
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"><ChevronLeft size={14} /> Previous</button>
                    {["1", "2", "3"].map((page, index) => <button key={page} type="button" aria-current={index === 0 ? "page" : undefined} className={`h-8 min-w-8 rounded-lg px-2 text-xs ${index === 0 ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.05]"}`}>{page}</button>)}
                    <span className="px-1 text-xs text-zinc-600">...</span>
                    <button type="button" className="h-8 min-w-8 rounded-lg px-2 text-xs text-zinc-400 hover:bg-white/[0.05]">18</button>
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200">Next <ChevronRight size={14} /></button>
                  </div>
                </nav>
              </section>

              <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 2xl:sticky 2xl:top-5">
                <div className="flex items-center gap-2 border-b border-white/[0.08] pb-4">
                  <CircleHelp size={16} className="text-zinc-500" />
                  <h2 className="text-sm font-semibold">Translation Context</h2>
                </div>
                <div className="space-y-5 pt-4">
                  <ContextField label="Current Speaker" value="Li Wei" />
                  <ContextField label="Scene" value="Courtyard confrontation" />
                  <ContextField label="Tone" value="Calm / Suspicious" />
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Previous Dialogue</p>
                    <p lang="my" className="border-l border-white/15 pl-3 text-xs leading-6 text-zinc-400">“ဒီနေရာကို ပြန်မလာတော့ဘူးလို့ မင်းပြောခဲ့တယ်။”</p>
                  </div>
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Glossary Matches</p>
                    <div className="space-y-2">
                      <GlossaryTerm source="江湖" translation="Jianghu" />
                      <GlossaryTerm source="师父" translation="ဆရာ" />
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">Translation Memory</p>
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                      <p lang="zh" className="text-xs text-zinc-400">我不会忘记你的承诺。</p>
                      <p lang="my" className="mt-2 text-xs leading-5 text-zinc-300">မင်းရဲ့ကတိကို ငါမမေ့ဘူး။</p>
                      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[10px] text-zinc-600"><span>Similar match</span><span className="text-zinc-400">92%</span></div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarGroup({ children, title, last = false }: { children: React.ReactNode; title: string; last?: boolean }) {
  return <div className={`${last ? "mt-8 border-t border-white/10 pt-5" : "mt-8"}`}>
    <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">{title}</p>
    <nav className="space-y-1">{children}</nav>
  </div>;
}

function SidebarLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`block rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white text-black" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"}`}>{label}</Link>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold tracking-tight">{value}</p></div>;
}

function StatusBadge({ status }: { status: SegmentStatus }) {
  const styles: Record<SegmentStatus, string> = {
    Approved: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400",
    "Needs Review": "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",
    Untranslated: "border-white/10 bg-white/[0.04] text-zinc-400",
    Translating: "border-sky-500/20 bg-sky-500/[0.07] text-sky-300",
  };
  return <span className={`rounded-md border px-2.5 py-1 text-[11px] ${styles[status]}`}>{status}</span>;
}

function ContextField({ label, value }: { label: string; value: string }) {
  return <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">{label}</p><p className="text-sm text-zinc-300">{value}</p></div>;
}

function GlossaryTerm({ source, translation }: { source: string; translation: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2"><span lang="zh" className="text-sm text-zinc-300">{source}</span><span className="text-xs text-zinc-500">{translation}</span></div>;
}
