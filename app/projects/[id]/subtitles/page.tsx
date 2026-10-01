import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Film,
  Maximize2,
  MoreHorizontal,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
} from "lucide-react";

type SegmentStatus = "Approved" | "Needs Review" | "Untranslated" | "Timing Issue";

type SubtitleSegment = {
  number: string;
  start: string;
  end: string;
  duration: string;
  speaker: string;
  chinese: string;
  myanmar: string;
  status: SegmentStatus;
  quality?: string;
};

const mockSubtitleSegments: SubtitleSegment[] = [
  { number: "041", start: "00:23:04.120", end: "00:23:07.840", duration: "3.720s", speaker: "General Zhao", chinese: "你为什么回来？", myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။", status: "Approved" },
  { number: "042", start: "00:23:08.010", end: "00:23:11.620", duration: "3.610s", speaker: "Li Wei", chinese: "我不是来找你的。", myanmar: "ငါ မင်းကိုရှာဖို့ ပြန်လာတာမဟုတ်ဘူး။", status: "Approved" },
  { number: "043", start: "00:23:12.050", end: "00:23:15.910", duration: "3.860s", speaker: "General Zhao", chinese: "那你应该知道这里发生了什么。", myanmar: "ဒါဆို ဒီမှာ ဘာတွေဖြစ်ခဲ့လဲဆိုတာ မင်းသိသင့်တယ်။", status: "Needs Review", quality: "Translation Review" },
  { number: "044", start: "00:23:16.240", end: "00:23:19.180", duration: "2.940s", speaker: "Mei Lin", chinese: "先听我说。", myanmar: "", status: "Untranslated", quality: "Low Confidence" },
  { number: "045", start: "00:23:19.000", end: "00:23:22.060", duration: "3.060s", speaker: "Li Wei", chinese: "我不想让事情变得更糟。", myanmar: "အခြေအနေကို ပိုဆိုးသွားစေချင်တာ မဟုတ်ဘူး။", status: "Timing Issue", quality: "Timing Issue" },
  { number: "046", start: "00:23:22.410", end: "00:23:25.900", duration: "3.490s", speaker: "General Zhao", chinese: "你还是和以前一样。", myanmar: "မင်းက အရင်အတိုင်းပဲ။", status: "Approved", quality: "Glossary Match" },
  { number: "047", start: "00:23:26.120", end: "00:23:29.550", duration: "3.430s", speaker: "Mei Lin", chinese: "你们两个都先冷静下来。", myanmar: "မင်းတို့နှစ်ယောက်လုံး အရင်စိတ်အေးအေးထားကြပါ။", status: "Approved" },
  { number: "048", start: "00:23:30.040", end: "00:23:33.720", duration: "3.680s", speaker: "General Zhao", chinese: "事情已经不是你能决定的了。", myanmar: "အခုကိစ္စကို မင်းဆုံးဖြတ်လို့ မရတော့ဘူး။", status: "Needs Review", quality: "Translation Review" },
];

export default async function SubtitleEditorPage({
  params,
}: PageProps<"/projects/[id]/subtitles">) {
  const { id } = await params;
  const projectPath = `/projects/${id}`;

  return (




        <section className="min-w-0 flex-1">
          <header className="border-b border-white/10 px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1700px]">
              <div className="flex items-center gap-2 text-xs text-zinc-500"><Link href="/projects" className="hover:text-zinc-300">Projects</Link><ChevronRight size={13} /><Link href={projectPath} className="hover:text-zinc-300">The Hidden Dragon</Link><ChevronRight size={13} /><span className="text-zinc-300">Subtitle Editor</span></div>
              <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div><Link href={projectPath} className="mb-1 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200"><ArrowLeft size={13} /> Project overview</Link><h1 className="text-xl font-semibold tracking-tight">Subtitle Editor</h1><p className="mt-1 text-xs text-zinc-500">Review timing, Chinese dialogue, and Myanmar subtitles.</p></div>
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">Chinese <span className="mx-1.5 text-zinc-600">→</span> Myanmar</span><span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">428 Segments</span></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-3">
                <CompactStat label="Approved" value="257" color="text-emerald-400" />
                <CompactStat label="Needs Review" value="34" color="text-amber-300" />
                <CompactStat label="Untranslated" value="103" color="text-zinc-400" />
                <CompactStat label="Timing Issues" value="7" color="text-rose-300" />
                <div className="ml-auto flex min-w-[180px] items-center gap-2"><span className="text-[10px] text-zinc-500">Overall 68%</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-zinc-300" /></div></div>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1700px] space-y-4 p-3 sm:p-5 lg:p-6">
            <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3" aria-label="Subtitle controls">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="relative block w-full xl:max-w-xs"><span className="sr-only">Search subtitles</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input type="search" placeholder="Search subtitles..." className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-xs outline-none placeholder:text-zinc-600 focus:border-white/20" /></label>
                <div className="flex flex-wrap items-center gap-2">
                  <label><span className="sr-only">Filter by status</span><select defaultValue="All" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none"><option>All</option><option>Approved</option><option>Needs Review</option><option>Untranslated</option><option>Timing Issue</option></select></label>
                  <label><span className="sr-only">Filter by speaker</span><select defaultValue="All Speakers" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none"><option>All Speakers</option><option>Li Wei</option><option>Mei Lin</option><option>General Zhao</option></select></label>
                  <div className="flex gap-1"><button type="button" className="rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-400 hover:bg-white/[0.05]">Previous Issue</button><button type="button" className="rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-400 hover:bg-white/[0.05]">Next Issue</button></div>
                </div>
              </div>
            </section>

            <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(290px,0.8fr)]">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050506]">
                <div className="relative aspect-video min-h-[220px] overflow-hidden bg-[radial-gradient(ellipse_at_50%_36%,#27272a_0%,#111113_42%,#050506_100%)]">
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30" />
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-300"><Film size={13} /> The Hidden Dragon</div>
                  <div className="absolute right-4 top-4 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">Scene 08 · Act I</div>
                  <div className="absolute inset-x-4 bottom-[19%] flex justify-center"><span lang="my" className="max-w-[90%] rounded bg-black/65 px-4 py-2 text-center text-sm font-medium leading-6 text-white shadow-lg sm:text-lg">မင်းဘာကြောင့် ပြန်လာတာလဲ။</span></div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent px-4 pb-3 pt-10">
                    <div className="mb-2 flex items-center gap-3"><span className="font-mono text-[10px] text-zinc-300">00:23:04</span><div className="relative h-1 flex-1 rounded-full bg-white/25"><div className="h-full w-[21%] rounded-full bg-white" /><span className="absolute left-[21%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white" /></div><span className="font-mono text-[10px] text-zinc-400">01:48:32</span></div>
                    <div className="flex items-center justify-between"><div className="flex items-center gap-3 text-zinc-300"><button type="button" aria-label="Play" className="rounded-full bg-white p-2 text-black"><Play size={14} fill="currentColor" /></button><button type="button" aria-label="Skip back" className="text-zinc-500 hover:text-white"><SkipBack size={15} /></button><button type="button" aria-label="Skip forward" className="text-zinc-500 hover:text-white"><SkipForward size={15} /></button></div><div className="flex items-center gap-3 text-zinc-400"><Volume2 size={15} /><div className="h-1 w-14 rounded-full bg-white/20"><div className="h-1 w-8 rounded-full bg-zinc-300" /></div><button type="button" aria-label="Fullscreen" className="hover:text-white"><Maximize2 size={15} /></button></div></div>
                  </div>
                </div>
              </div>

              <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3"><div><p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Current Scene</p><h2 className="mt-1 text-sm font-semibold">Scene 08 · Courtyard Confrontation</h2></div><span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400">Act I</span></div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-xs"><div><p className="text-[10px] uppercase tracking-wider text-zinc-600">Characters</p><div className="mt-2 flex flex-wrap gap-1.5">{["Li Wei", "Mei Lin", "General Zhao"].map((name) => <Link key={name} href={`${projectPath}/characters`} className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-400 hover:text-white">{name}</Link>)}</div></div><div><p className="text-[10px] uppercase tracking-wider text-zinc-600">Tone</p><p className="mt-2 text-zinc-300">Tense / Controlled</p></div></div>
                <Link href={`${projectPath}/scenes`} className="mt-4 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">View Scene <ArrowRight size={13} /></Link>
              </aside>
            </section>

            <section className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_310px]">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="flex flex-col justify-between gap-3 border-b border-white/[0.08] p-4 sm:flex-row sm:items-center">
                  <div><h2 className="text-sm font-semibold">Subtitle Segments</h2><p className="mt-1 text-[11px] text-zinc-500">Review source dialogue, timing, and Myanmar subtitles</p></div>
                  <div className="flex flex-wrap gap-2"><Link href={`${projectPath}/translation`} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.05] hover:text-white">Open Translation Workspace</Link><Link href={`${projectPath}/scenes`} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.05] hover:text-white">Open Scene</Link></div>
                </div>
                <div className="divide-y divide-white/[0.07]">
                  {mockSubtitleSegments.map((segment) => <SegmentRow key={segment.number} segment={segment} selected={segment.number === "041"} />)}
                </div>
                <div className="flex flex-col justify-between gap-3 border-t border-white/[0.08] p-4 sm:flex-row sm:items-center"><p className="text-[11px] text-zinc-500">Showing <span className="text-zinc-300">41–60</span> of <span className="text-zinc-300">428</span> segments</p><nav aria-label="Subtitle segment pagination" className="flex items-center gap-1"><button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-[11px] text-zinc-500 hover:bg-white/[0.05]"><ChevronLeft size={13} /> Previous</button>{["1", "2", "3"].map((page, index) => <button key={page} type="button" aria-current={index === 0 ? "page" : undefined} className={`h-7 min-w-7 rounded-md px-2 text-[11px] ${index === 0 ? "bg-white text-black" : "text-zinc-400 hover:bg-white/[0.05]"}`}>{page}</button>)}<span className="px-1 text-xs text-zinc-600">...</span><button type="button" className="h-7 min-w-7 rounded-md px-2 text-[11px] text-zinc-400 hover:bg-white/[0.05]">22</button><button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.05]">Next <ChevronRight size={13} /></button></nav></div>
              </div>

              <aside className="space-y-4 2xl:sticky 2xl:top-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" aria-labelledby="timing-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="timing-title" className="text-sm font-medium">Selected Segment #041</h2><p className="mt-1 text-[10px] text-zinc-500">Timing controls · mock</p></div><span className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-1 text-[10px] text-emerald-400">Timing Good</span></div>
                  <div className="grid grid-cols-2 gap-3"><TimeField label="Start" value="00:23:04.120" /><TimeField label="End" value="00:23:07.840" /></div>
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2"><span className="text-[10px] text-zinc-500">Duration</span><span className="font-mono text-xs text-zinc-300">3.720s</span></div>
                  <div className="mt-3 flex gap-2"><button type="button" className="flex-1 rounded-lg border border-white/10 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.05]">−100ms</button><button type="button" className="flex-1 rounded-lg border border-white/10 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.05]">+100ms</button></div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-3"><QualityMetric label="Characters" value="17 / 42" /><QualityMetric label="Reading speed" value="4.6 chars/sec" /></div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" aria-labelledby="translation-context-title">
                  <h2 id="translation-context-title" className="text-sm font-medium">Translation Context</h2>
                  <div className="mt-4 space-y-4"><ContextField label="Current Speaker" value="General Zhao" /><ContextField label="Scene" value="Courtyard Confrontation" /><DialogueContext label="Previous Dialogue" text="ဒီနေရာကို ပြန်မလာတော့ဘူးလို့ မင်းပြောခဲ့တယ်။" /><DialogueContext label="Current Chinese" text="你为什么回来？" /><DialogueContext label="Next Dialogue" text="我不是来找你的。" />
                    <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Glossary Matches</p><GlossaryTerm source="江湖" translation="Jianghu" /><GlossaryTerm source="师父" translation="ဆရာ" /></div>
                    <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Translation Memory</p><div className="rounded-lg border border-white/[0.07] bg-black/10 p-3"><p lang="zh" className="text-xs text-zinc-400">我不会忘记你的承诺。</p><p lang="my" className="mt-2 text-xs leading-5 text-zinc-300">မင်းရဲ့ကတိကို ငါမမေ့ဘူး။</p><p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-600">Similar previous translation · 92%</p></div></div>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4" aria-labelledby="quality-flags-title">
                  <div className="mb-3 flex items-center justify-between"><h2 id="quality-flags-title" className="text-sm font-medium">Quality Flags</h2><Sparkles size={14} className="text-zinc-500" /></div>
                  <div className="flex flex-wrap gap-2"><QualityBadge label="Approved" tone="green" /><QualityBadge label="Translation Review" tone="amber" /><QualityBadge label="Glossary Match" tone="neutral" /><QualityBadge label="Low Confidence" tone="rose" /><QualityBadge label="Timing Issue" tone="rose" /></div>
                  <div className="mt-4 rounded-lg border border-amber-500/15 bg-amber-500/[0.025] p-3"><p className="text-[11px] font-medium text-amber-200/80">Segment #044 · Translation Review</p><p className="mt-1 text-[11px] leading-5 text-zinc-500">Myanmar translation may be too literal. Mock review note.</p></div>
                </section>
              </aside>
            </section>

            <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Batch actions">
              <span className="text-xs text-zinc-500">0 selected</span>
              <div className="flex flex-wrap gap-2">{["Approve Selected", "Retry Translation", "Mark for Review", "Export Selected"].map((action) => <button key={action} type="button" className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200">{action}</button>)}</div>
            </section>

            <div className="flex flex-col justify-between gap-3 border-t border-white/[0.07] py-3 sm:flex-row sm:items-center"><div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-600"><span><kbd className="rounded border border-white/10 px-1 py-0.5 text-zinc-400">Space</kbd> Play / Pause</span><span><kbd className="rounded border border-white/10 px-1 py-0.5 text-zinc-400">J / K</kbd> Previous / Next subtitle</span><span><kbd className="rounded border border-white/10 px-1 py-0.5 text-zinc-400">A</kbd> Approve</span><span><kbd className="rounded border border-white/10 px-1 py-0.5 text-zinc-400">E</kbd> Edit translation</span></div><p className="text-[10px] text-zinc-700">Keyboard shortcuts are display-only</p></div>
          </div>
        </section>


  );
}

function CompactStat({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="flex items-center gap-1.5 text-[10px]"><span className={`font-semibold ${color}`}>{value}</span><span className="text-zinc-500">{label}</span></div>;
}

function SegmentRow({ segment, selected }: { segment: SubtitleSegment; selected: boolean }) {
  return <article className={`p-3 sm:p-4 ${selected ? "border-l-2 border-white/60 bg-white/[0.035]" : "border-l-2 border-transparent"}`}>
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
      <div className="flex shrink-0 items-center gap-2 xl:w-[190px] xl:flex-col xl:items-start"><span className={`rounded-md border px-2 py-1 font-mono text-[10px] ${selected ? "border-white/20 bg-white text-black" : "border-white/10 bg-white/[0.03] text-zinc-400"}`}>#{segment.number}</span><span className="text-[10px] text-zinc-500">{segment.speaker}</span></div>
      <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-2">
        <div className="min-w-0"><p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Chinese Source</p><p lang="zh" className="text-sm leading-6 text-zinc-200">{segment.chinese}</p></div>
        <label className="min-w-0"><span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Myanmar Translation</span><textarea aria-label={`Myanmar translation for segment ${segment.number}`} defaultValue={segment.myanmar} placeholder="Enter Myanmar translation..." rows={2} className="w-full resize-y rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs leading-6 text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-white/20" /></label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 xl:w-[180px] xl:flex-col xl:items-end">
        <StatusBadge status={segment.status} />
        <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600"><Clock3 size={11} />{segment.start.slice(3)}–{segment.end.slice(3)} · {segment.duration}</span>
        <div className="flex items-center gap-1"><button type="button" className="rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.05] hover:text-white">Edit Timing</button><button type="button" className="rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.05] hover:text-white">Approve</button><button type="button" className="rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.05] hover:text-white">Retry</button><button type="button" aria-label={`More actions for segment ${segment.number}`} className="rounded-md p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-white"><MoreHorizontal size={15} /></button></div>
      </div>
    </div>
    {segment.quality && <div className="mt-2 flex justify-end"><QualityBadge label={segment.quality} tone={segment.quality === "Timing Issue" ? "rose" : segment.quality === "Glossary Match" ? "neutral" : "amber"} /></div>}
  </article>;
}

function StatusBadge({ status }: { status: SegmentStatus }) {
  const styles: Record<SegmentStatus, string> = {
    Approved: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400",
    "Needs Review": "border-amber-500/20 bg-amber-500/[0.06] text-amber-300",
    Untranslated: "border-white/10 bg-white/[0.04] text-zinc-400",
    "Timing Issue": "border-rose-500/20 bg-rose-500/[0.06] text-rose-300",
  };
  return <span className={`rounded-md border px-2 py-1 text-[9px] ${styles[status]}`}>{status}</span>;
}

function TimeField({ label, value }: { label: string; value: string }) {
  return <label className="min-w-0"><span className="mb-1 block text-[10px] text-zinc-500">{label}</span><input aria-label={label} defaultValue={value} className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-2 py-2 font-mono text-[10px] text-zinc-300 outline-none focus:border-white/20" /></label>;
}

function QualityMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] text-zinc-600">{label}</p><p className="mt-1 text-[11px] text-zinc-300">{value}</p></div>;
}

function ContextField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-1 text-xs text-zinc-300">{value}</p></div>;
}

function DialogueContext({ label, text }: { label: string; text: string }) {
  return <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{label}</p><p className="text-xs leading-5 text-zinc-400">{text}</p></div>;
}

function GlossaryTerm({ source, translation }: { source: string; translation: string }) {
  return <div className="mb-1.5 flex items-center justify-between rounded-md border border-white/[0.07] bg-black/10 px-2.5 py-2"><span lang="zh" className="text-xs text-zinc-300">{source}</span><span className="text-[10px] text-zinc-500">{translation}</span></div>;
}

function QualityBadge({ label, tone }: { label: string; tone: "green" | "amber" | "neutral" | "rose" }) {
  const styles = {
    green: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400",
    amber: "border-amber-500/20 bg-amber-500/[0.06] text-amber-300",
    neutral: "border-white/10 bg-white/[0.03] text-zinc-400",
    rose: "border-rose-500/20 bg-rose-500/[0.06] text-rose-300",
  };
  return <span className={`rounded-md border px-2 py-1 text-[9px] ${styles[tone]}`}>{label}</span>;
}
