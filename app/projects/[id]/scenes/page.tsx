import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clapperboard,
  Clock3,
  Film,
  MapPin,
  MessageSquareText,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";

type SceneStatus = "Analyzed" | "Needs Review" | "Processing";

type Scene = {
  number: string;
  title: string;
  start: string;
  end: string;
  duration: string;
  location: string;
  characters: string[];
  act: string;
  status: SceneStatus;
  summary: string;
  events: number;
};

const mockScenes: Scene[] = [
  {
    number: "06",
    title: "Across the Mountain Pass",
    start: "00:16:02",
    end: "00:19:48",
    duration: "3m 46s",
    location: "Mountain Pass",
    characters: ["Li Wei", "Master Chen"],
    act: "Act I",
    status: "Analyzed",
    summary: "Li Wei and Master Chen discuss the road ahead as they approach the village.",
    events: 2,
  },
  {
    number: "07",
    title: "Return to the Village",
    start: "00:19:49",
    end: "00:22:40",
    duration: "2m 51s",
    location: "Village Gate",
    characters: ["Li Wei", "Mei Lin"],
    act: "Act I",
    status: "Analyzed",
    summary: "Li Wei returns to the village and learns that events have moved on in his absence.",
    events: 2,
  },
  {
    number: "08",
    title: "Courtyard Confrontation",
    start: "00:22:41",
    end: "00:27:18",
    duration: "4m 37s",
    location: "Village Courtyard",
    characters: ["Li Wei", "Mei Lin", "General Zhao"],
    act: "Act I",
    status: "Analyzed",
    summary: "Li Wei encounters General Zhao after returning to the village. Their conversation reveals growing tension while Li Wei initially avoids escalating the confrontation.",
    events: 3,
  },
  {
    number: "09",
    title: "The Warning",
    start: "00:27:19",
    end: "00:30:05",
    duration: "2m 46s",
    location: "East Corridor",
    characters: ["Mei Lin", "Li Wei"],
    act: "Act I",
    status: "Needs Review",
    summary: "Mei Lin shares a warning with Li Wei. One line of dialogue still needs scene-context review.",
    events: 2,
  },
  {
    number: "10",
    title: "Orders at Dusk",
    start: "00:30:06",
    end: "00:34:52",
    duration: "4m 46s",
    location: "Command Tent",
    characters: ["General Zhao", "Captain Xu"],
    act: "Act I",
    status: "Processing",
    summary: "General Zhao gives instructions to Captain Xu while the village prepares for nightfall.",
    events: 1,
  },
  {
    number: "11",
    title: "A Quiet Promise",
    start: "00:34:53",
    end: "00:38:10",
    duration: "3m 17s",
    location: "Riverside Path",
    characters: ["Li Wei", "Mei Lin"],
    act: "Act I",
    status: "Analyzed",
    summary: "Li Wei and Mei Lin discuss what has changed and agree to face the next step together.",
    events: 2,
  },
];

const mockEvents = [
  {
    time: "00:23:04",
    observed: "General Zhao blocks Li Wei’s path and asks why he returned.",
    significance: "The exchange reconnects Li Wei with the central conflict.",
    confidence: 95,
  },
  {
    time: "00:24:18",
    observed: "Li Wei refuses to attack first despite being threatened.",
    significance: "This is evidence that he may be trying to avoid escalating the confrontation.",
    confidence: 92,
  },
  {
    time: "00:25:02",
    observed: "Mei Lin steps between the two men and asks them to stop.",
    significance: "Her intervention temporarily changes the direction of the exchange.",
    confidence: 90,
  },
  {
    time: "00:26:41",
    observed: "General Zhao leaves after telling Li Wei the situation has changed.",
    significance: "The dialogue signals that Li Wei’s return coincides with a changed situation.",
    confidence: 87,
  },
];

const mockDialogue = [
  { time: "00:23:04", speaker: "General Zhao", chinese: "你为什么回来？", myanmar: "မင်းဘာကြောင့် ပြန်လာတာလဲ။" },
  { time: "00:23:12", speaker: "Li Wei", chinese: "我不是来找你的。", myanmar: "ငါ မင်းကိုရှာဖို့ ပြန်လာတာမဟုတ်ဘူး။" },
  { time: "00:24:18", speaker: "Li Wei", chinese: "我不想让事情变得更糟。", myanmar: "အခြေအနေကို ပိုဆိုးသွားစေချင်တာ မဟုတ်ဘူး။" },
  { time: "00:25:02", speaker: "Mei Lin", chinese: "你们两个都先冷静下来。", myanmar: "မင်းတို့နှစ်ယောက်လုံး အရင်စိတ်အေးအေးထားကြပါ။" },
];

const mockStoryActs = [
  { label: "Beginning", range: "Scenes 1–5", width: "w-[22%]" },
  { label: "Act I", range: "Scenes 6–14", width: "w-[40%]", selected: true },
  { label: "Act II", range: "Scenes 15–28", width: "w-[62%]" },
  { label: "Act III", range: "Scenes 29–38", width: "w-[45%]" },
  { label: "Ending", range: "Scenes 39–42", width: "w-[20%]" },
];

export default async function ScenesPage({
  params,
}: PageProps<"/projects/[id]/scenes">) {
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
          <SidebarGroup title="Main">
            <SidebarLink href="/" label="Dashboard" />
            <SidebarLink href="/projects" label="Projects" />
            <SidebarLink href="/movies" label="Movies" />
          </SidebarGroup>
          <SidebarGroup title="Story">
            <SidebarLink href={`${projectPath}/recap`} label="Recap" />
            <SidebarLink href={`${projectPath}/characters`} label="Characters" />
            <SidebarLink href={`${projectPath}/scenes`} label="Scenes" active />
          </SidebarGroup>
          <SidebarGroup title="Subtitles">
            <SidebarLink href={`${projectPath}/subtitle-editor`} label="Subtitle Editor" />
            <SidebarLink href={`${projectPath}/glossary`} label="Glossary" />
            <SidebarLink href={`${projectPath}/translation-memory`} label="Translation Memory" />
            <SidebarLink href={`${projectPath}/translation`} label="Translation" />
          </SidebarGroup>
          <SidebarGroup title="System" last><SidebarLink href="/settings" label="Settings" /></SidebarGroup>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-[1600px]">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Link href="/projects" className="hover:text-zinc-300">Projects</Link><ChevronRight size={13} />
                <Link href={projectPath} className="hover:text-zinc-300">The Hidden Dragon</Link><ChevronRight size={13} />
                <span className="text-zinc-300">Scenes</span>
              </div>
              <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <Link href={projectPath} className="mb-2 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200"><ArrowLeft size={14} /> Project overview</Link>
                  <h1 className="text-2xl font-semibold tracking-tight">Scenes</h1>
                  <p className="mt-1 max-w-2xl text-sm text-zinc-500">Review detected scenes, story events, characters, and narrative context.</p>
                </div>
                <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300"><Film size={15} className="text-zinc-400" /> 42 Scenes Detected</span>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Scene summary">
              <SummaryCard title="Scenes" value="42" icon={<Film size={16} />} />
              <SummaryCard title="Analyzed" value="38" icon={<Sparkles size={16} />} />
              <SummaryCard title="Needs Review" value="4" icon={<Clock3 size={16} />} />
              <SummaryCard title="Story Events" value="17" icon={<BookOpen size={16} />} />
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5" aria-labelledby="timeline-title">
              <div className="flex items-center justify-between gap-3"><div><h2 id="timeline-title" className="text-sm font-medium">Movie Story Timeline</h2><p className="mt-1 text-xs text-zinc-500">Scene distribution across the narrative</p></div><span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-500">Scene 08 selected</span></div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {mockStoryActs.map((act) => <div key={act.label} className={`rounded-xl border p-3 ${act.selected ? "border-white/20 bg-white/[0.05]" : "border-white/[0.07] bg-black/10"}`}>
                  <div className="flex items-center justify-between gap-2"><span className={`text-xs font-medium ${act.selected ? "text-zinc-200" : "text-zinc-400"}`}>{act.label}</span><span className="text-[10px] text-zinc-600">{act.range}</span></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${act.selected ? "bg-zinc-200" : "bg-zinc-600"} ${act.width}`} /></div>
                </div>)}
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4" aria-label="Scene search and filters">
              <label className="relative block w-full xl:max-w-sm"><span className="sr-only">Search scenes</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input type="search" placeholder="Search scenes..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20" /></label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Status</span>
                {(["All", "Analyzed", "Needs Review"] as const).map((filter, index) => <button key={filter} type="button" aria-pressed={index === 0} className={`rounded-lg border px-3 py-2 text-xs ${index === 0 ? "border-white/20 bg-white text-black" : "border-white/10 text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}>{filter}</button>)}
                <label><span className="sr-only">Filter by story act</span><select defaultValue="All Acts" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-white/20"><option>All Acts</option><option>Beginning</option><option>Act I</option><option>Act II</option><option>Act III</option><option>Ending</option></select></label>
                <label><span className="sr-only">Filter by character</span><select defaultValue="All Characters" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-white/20"><option>All Characters</option><option>Li Wei</option><option>Mei Lin</option><option>General Zhao</option><option>Master Chen</option></select></label>
              </div>
            </section>

            <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
              <section className="min-w-0 space-y-3" aria-labelledby="scene-list-title">
                <div className="flex items-end justify-between"><div><h2 id="scene-list-title" className="font-medium">Scenes</h2><p className="mt-1 text-xs text-zinc-500">Showing 6 nearby scenes · mock analysis</p></div></div>
                {mockScenes.map((scene) => <SceneCard key={scene.number} scene={scene} selected={scene.number === "08"} />)}
              </section>

              <aside className="space-y-5 2xl:sticky 2xl:top-5">
                <section id="selected-scene" className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4"><div><p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Scene 08</p><h2 className="mt-1 text-lg font-semibold">Courtyard Confrontation</h2></div><StatusBadge status="Analyzed" /></div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                    <DetailField label="Time" value="00:22:41 → 00:27:18" />
                    <DetailField label="Duration" value="4m 37s" />
                    <DetailField label="Location" value="Village Courtyard" icon={<MapPin size={12} />} />
                    <DetailField label="Story Act" value="Act I" />
                  </dl>
                  <div className="mt-5"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Characters</p><div className="flex flex-wrap gap-2">{["Li Wei", "Mei Lin", "General Zhao"].map((name) => <Link key={name} href={`${projectPath}/characters`} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-zinc-200">{name}</Link>)}</div></div>
                  <div className="mt-5 border-t border-white/[0.08] pt-4"><h3 className="text-sm font-medium">Scene Summary</h3><p className="mt-2 text-xs leading-6 text-zinc-400">Li Wei encounters General Zhao in the village courtyard after returning. Zhao asks about his return, Mei Lin intervenes, and the exchange ends with Zhao leaving after noting that the situation has changed.</p></div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="events-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="events-title" className="text-sm font-medium">Important Events</h2><p className="mt-1 text-xs text-zinc-500">Observed action and story interpretation</p></div><span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-500">4 events</span></div>
                  <div className="space-y-3">{mockEvents.map((event) => <article key={event.time} className="rounded-xl border border-white/[0.08] bg-black/10 p-3.5">
                    <p className="font-mono text-[10px] text-zinc-500">{event.time}</p>
                    <div className="mt-2 border-l-2 border-zinc-500/50 pl-3"><p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Observed Event</p><p className="mt-1 text-xs leading-5 text-zinc-300">{event.observed}</p></div>
                    <div className="mt-3 border-l-2 border-amber-400/30 pl-3"><p className="text-[10px] font-medium uppercase tracking-wider text-amber-300/70">Story Significance · Interpretation</p><p className="mt-1 text-xs leading-5 text-zinc-400">{event.significance}</p></div>
                    <p className="mt-3 text-right text-[10px] text-zinc-600">Interpretation confidence <span className="text-zinc-400">{event.confidence}%</span></p>
                  </article>)}</div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="dialogue-title">
                  <div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="dialogue-title" className="text-sm font-medium">Dialogue Preview</h2><p className="mt-1 text-xs text-zinc-500">Sample lines from this scene</p></div><MessageSquareText size={16} className="text-zinc-500" /></div>
                  <div className="space-y-3">{mockDialogue.map((line) => <article key={line.time} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] text-zinc-600">{line.time}</span><span className="text-[11px] text-zinc-400">{line.speaker}</span></div>
                    <p lang="zh" className="mt-2 text-sm leading-6 text-zinc-200">{line.chinese}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Myanmar</p>
                    <p lang="my" className="mt-1 text-xs leading-6 text-zinc-400">{line.myanmar}</p>
                  </article>)}</div>
                  <Link href={`${projectPath}/translation`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-zinc-300 transition hover:bg-white/[0.08] hover:text-white">Open in Translation <ArrowRight size={14} /></Link>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="scene-context-title">
                  <div className="mb-4"><h2 id="scene-context-title" className="text-sm font-medium">Scene Context</h2><p className="mt-1 text-xs text-zinc-500">Neighboring scenes support translation and recap context</p></div>
                  <div className="space-y-2"><ContextScene label="Previous Scene" number="07" title="Return to the Village" /><ContextScene label="Current Scene" number="08" title="Courtyard Confrontation" active /><ContextScene label="Next Scene" number="09" title="The Warning" /></div>
                </section>

                <section className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.025] p-5" aria-labelledby="story-connection-title">
                  <div className="mb-4 flex items-center gap-2"><Sparkles size={15} className="text-amber-300/70" /><div><h2 id="story-connection-title" className="text-sm font-medium">Story Connection</h2><p className="mt-1 text-[10px] uppercase tracking-wider text-amber-200/50">Mock story analysis · interpretation</p></div></div>
                  <div className="space-y-4"><StoryState label="Previous Story State" text="Li Wei has returned to the village but has not entered the conflict." /><StoryState label="Scene Change" text="He encounters General Zhao and learns the conflict has escalated." /><StoryState label="Resulting Story State" text="Li Wei now has direct evidence that the situation has changed." /></div>
                  <p className="mt-4 border-t border-white/[0.07] pt-3 text-[10px] leading-4 text-zinc-600">These story connections are interpretations of mock scene data, not verified facts.</p>
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

function SummaryCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-xs text-zinc-500">{title}</span><span className="text-zinc-500">{icon}</span></div><p className="mt-4 text-2xl font-semibold tracking-tight">{value}</p></div>;
}

function SceneCard({ scene, selected }: { scene: Scene; selected: boolean }) {
  return <article className={`rounded-2xl border bg-white/[0.02] p-4 transition sm:p-5 ${selected ? "border-white/20 bg-white/[0.04]" : "border-white/10 hover:border-white/[0.16]"}`}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 gap-3"><span className={`flex h-10 w-11 shrink-0 items-center justify-center rounded-lg border font-mono text-xs ${selected ? "border-white/20 bg-white text-black" : "border-white/10 bg-white/[0.04] text-zinc-300"}`}>{scene.number}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{scene.title}</h3><StatusBadge status={scene.status} /></div><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500"><span className="font-mono">{scene.start} → {scene.end}</span><span className="text-zinc-700">·</span><span>{scene.duration}</span></p></div></div>
      <span className="w-fit rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-500">{scene.act}</span>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-500"><span className="inline-flex items-center gap-1.5"><MapPin size={12} /> {scene.location}</span><span className="inline-flex items-center gap-1.5"><UsersRound size={12} /> {scene.characters.join(" · ")}</span><span className="inline-flex items-center gap-1.5"><BookOpen size={12} /> {scene.events} important events</span></div>
    <p className="mt-3 text-xs leading-5 text-zinc-400">{scene.summary}</p>
    <div className="mt-4 flex justify-end border-t border-white/[0.07] pt-3"><Link href="#selected-scene" className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white">View Scene <ArrowRight size={13} /></Link></div>
  </article>;
}

function StatusBadge({ status }: { status: SceneStatus }) {
  const styles: Record<SceneStatus, string> = {
    Analyzed: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400",
    "Needs Review": "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",
    Processing: "border-sky-500/20 bg-sky-500/[0.07] text-sky-300",
  };
  return <span className={`rounded-md border px-2 py-1 text-[10px] ${styles[status]}`}>{status}</span>;
}

function DetailField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</dt><dd className="mt-1 flex items-center gap-1.5 text-xs text-zinc-300">{icon}{value}</dd></div>;
}

function ContextScene({ label, number, title, active = false }: { label: string; number: string; title: string; active?: boolean }) {
  return <div className={`flex items-center gap-3 rounded-xl border p-3 ${active ? "border-white/15 bg-white/[0.04]" : "border-white/[0.07] bg-black/10"}`}><span className="font-mono text-[10px] text-zinc-600">{number}</span><div className="min-w-0 flex-1"><p className="text-[10px] text-zinc-600">{label}</p><p className={`mt-0.5 truncate text-xs ${active ? "text-zinc-200" : "text-zinc-400"}`}>{title}</p></div>{active && <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />}</div>;
}

function StoryState({ label, text }: { label: string; text: string }) {
  return <div><p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-1 text-xs leading-5 text-zinc-400">{text}</p></div>;
}
