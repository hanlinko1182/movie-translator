import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Clapperboard,
  Film,
  MessageSquareText,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";

type Character = {
  name: string;
  chineseName: string;
  role: string;
  category: "Main" | "Supporting" | "Antagonist";
  scenes: number;
  dialogue: number;
  confidence: number;
  initials: string;
  description: string;
};

const mockCharacters: Character[] = [
  {
    name: "Li Wei",
    chineseName: "李伟",
    role: "Protagonist",
    category: "Main",
    scenes: 24,
    dialogue: 138,
    confidence: 96,
    initials: "LW",
    description: "A cautious fighter whose decisions gradually pull him back into the conflict.",
  },
  {
    name: "Mei Lin",
    chineseName: "美琳",
    role: "Main Character",
    category: "Main",
    scenes: 19,
    dialogue: 104,
    confidence: 94,
    initials: "ML",
    description: "A determined ally whose return to the village changes Li Wei’s course.",
  },
  {
    name: "General Zhao",
    chineseName: "赵将军",
    role: "Antagonist",
    category: "Antagonist",
    scenes: 16,
    dialogue: 82,
    confidence: 91,
    initials: "GZ",
    description: "A military leader whose plans place him in direct opposition to the others.",
  },
  {
    name: "Master Chen",
    chineseName: "陈师父",
    role: "Mentor",
    category: "Supporting",
    scenes: 11,
    dialogue: 47,
    confidence: 89,
    initials: "MC",
    description: "Li Wei’s teacher, whose advice shapes how he approaches conflict.",
  },
  {
    name: "Wang Jun",
    chineseName: "王军",
    role: "Village Guard",
    category: "Supporting",
    scenes: 8,
    dialogue: 29,
    confidence: 86,
    initials: "WJ",
    description: "A village guard who appears during the growing unrest.",
  },
  {
    name: "Auntie Lin",
    chineseName: "林婶",
    role: "Family Friend",
    category: "Supporting",
    scenes: 7,
    dialogue: 24,
    confidence: 83,
    initials: "AL",
    description: "A familiar presence in the village with ties to Mei Lin’s family.",
  },
  {
    name: "Captain Xu",
    chineseName: "徐队长",
    role: "Zhao’s Officer",
    category: "Supporting",
    scenes: 6,
    dialogue: 21,
    confidence: 81,
    initials: "CX",
    description: "An officer seen carrying out orders during the search for the rebels.",
  },
  {
    name: "The Messenger",
    chineseName: "信使",
    role: "Messenger",
    category: "Supporting",
    scenes: 3,
    dialogue: 9,
    confidence: 74,
    initials: "TM",
    description: "A minor character who brings news that alters the group’s plans.",
  },
];

const mockEvidence = [
  {
    timestamp: "00:24:18",
    scene: "Courtyard confrontation",
    observation: "Li Wei refuses to attack first despite being threatened.",
    inference: "He may be trying to avoid escalating the confrontation.",
    confidence: 92,
  },
  {
    timestamp: "00:41:06",
    scene: "Village entrance",
    observation: "After hearing Mei Lin is in danger, Li Wei turns back toward the village.",
    inference: "This suggests her safety is influencing his choice to re-enter the conflict.",
    confidence: 96,
  },
  {
    timestamp: "01:12:44",
    scene: "Abandoned watchtower",
    observation: "Li Wei asks General Zhao who gave the order before drawing his sword.",
    inference: "He appears to question Zhao’s motives rather than act on suspicion alone.",
    confidence: 88,
  },
];

const mockRelationships = [
  { person: "Mei Lin", chinese: "美琳", nature: "Childhood friends / trusted allies", strength: 94 },
  { person: "General Zhao", chinese: "赵将军", nature: "Opposing sides", strength: 89 },
  { person: "Master Chen", chinese: "陈师父", nature: "Student / mentor", strength: 91 },
];

const storyPresence = [
  { act: "Beginning", count: 4, width: "w-[24%]" },
  { act: "Act I", count: 7, width: "w-[42%]" },
  { act: "Act II", count: 9, width: "w-[58%]" },
  { act: "Act III", count: 8, width: "w-[50%]" },
  { act: "Ending", count: 3, width: "w-[19%]" },
];

export default async function CharactersPage({
  params,
}: PageProps<"/projects/[id]/characters">) {
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
            <SidebarLink href={`${projectPath}/characters`} label="Characters" active />
            <SidebarLink href={`${projectPath}/scenes`} label="Scenes" />
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
            <div className="mx-auto max-w-[1500px]">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Link href="/projects" className="hover:text-zinc-300">Projects</Link><ChevronRight size={13} />
                <Link href={projectPath} className="hover:text-zinc-300">The Hidden Dragon</Link><ChevronRight size={13} />
                <span className="text-zinc-300">Characters</span>
              </div>
              <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="mb-1 text-xs text-zinc-500">Story analysis</p>
                  <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
                  <p className="mt-1 max-w-2xl text-sm text-zinc-500">Explore characters, relationships, story roles, and evidence discovered from the movie.</p>
                </div>
                <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300"><UsersRound size={15} className="text-zinc-400" /> 8 Characters Detected</span>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Character summary">
              <SummaryCard label="Characters" value="8" icon={<UsersRound size={16} />} />
              <SummaryCard label="Main Characters" value="3" icon={<Sparkles size={16} />} />
              <SummaryCard label="Supporting" value="5" icon={<Film size={16} />} />
              <SummaryCard label="Relationships" value="12" icon={<ArrowRight size={16} />} />
            </section>

            <section aria-label="Search and filter characters" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
              <label className="relative block w-full xl:max-w-sm">
                <span className="sr-only">Search characters</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input type="search" placeholder="Search characters..." className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {(["All", "Main", "Supporting", "Antagonist"] as const).map((filter, index) => <button key={filter} type="button" aria-pressed={index === 0} className={`rounded-lg border px-3 py-2 text-xs transition ${index === 0 ? "border-white/20 bg-white text-black" : "border-white/10 text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}>{filter}</button>)}
                <label><span className="sr-only">Sort characters</span><select defaultValue="Most Scenes" className="rounded-lg border border-white/10 bg-[#111114] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-white/20"><option>Most Scenes</option><option>Most Dialogue</option><option>Confidence</option></select></label>
              </div>
            </section>

            <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
              <section className="min-w-0" aria-labelledby="character-list-title">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div><h2 id="character-list-title" className="font-medium">Detected Characters</h2><p className="mt-1 text-xs text-zinc-500">Mock story analysis · 8 characters</p></div>
                  <button type="button" className="hidden rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.05] sm:block">Most Scenes</button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {mockCharacters.map((character) => <CharacterCard key={character.name} character={character} />)}
                </div>

                <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="relationships-title">
                  <div className="mb-5 flex items-center justify-between"><div><h2 id="relationships-title" className="font-medium">Character Relationships</h2><p className="mt-1 text-xs text-zinc-500">Connections inferred from dialogue and shared scenes</p></div><UsersRound size={17} className="text-zinc-500" /></div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    {mockRelationships.map((relationship) => <div key={relationship.person} className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
                      <div className="flex items-center gap-2 text-sm"><span className="font-medium">Li Wei</span><span className="text-zinc-600">↔</span><span className="text-zinc-300">{relationship.person}</span></div>
                      <p lang="zh" className="mt-1 text-xs text-zinc-600">李伟 ↔ {relationship.chinese}</p>
                      <p className="mt-4 text-xs text-zinc-400">{relationship.nature}</p>
                      <div className="mt-3 flex items-center gap-3"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-zinc-400" style={{ width: `${relationship.strength}%` }} /></div><span className="text-[10px] text-zinc-500">{relationship.strength}%</span></div>
                    </div>)}
                  </div>
                </section>
              </section>

              <aside id="character-detail" className="space-y-5 2xl:sticky 2xl:top-5">
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
                  <div className="flex items-center gap-4 border-b border-white/[0.08] pb-5">
                    <Avatar initials="LW" large />
                    <div><h2 className="text-lg font-semibold">Li Wei</h2><p lang="zh" className="mt-0.5 text-sm text-zinc-500">李伟</p><span className="mt-2 inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-300">Protagonist</span></div>
                  </div>
                  <div className="pt-5"><h3 className="text-sm font-medium">Character Summary</h3><p className="mt-2 text-sm leading-6 text-zinc-400">Across the story, Li Wei initially avoids confrontation, but returns when Mei Lin is threatened. He later questions General Zhao’s motives before choosing to confront him.</p></div>
                  <div className="mt-5 space-y-5">
                    <ObservationList title="Observed Behavior" items={["Avoids unnecessary confrontation", "Returns when another character is threatened", "Questions General Zhao’s motives"]} />
                    <ObservationList title="Important Decisions" items={["Returns to the village", "Protects Mei Lin", "Confronts General Zhao"]} />
                  </div>
                  <div className="mt-5 border-t border-white/[0.08] pt-5">
                    <h3 className="mb-4 text-sm font-medium">Story Arc</h3>
                    <ol className="space-y-3">
                      <ArcStep label="Beginning" text="Avoids the conflict" />
                      <ArcStep label="Turning Point" text="Returns after learning Mei Lin is in danger" />
                      <ArcStep label="Conflict" text="Discovers General Zhao’s plan" />
                      <ArcStep label="Decision" text="Chooses to confront Zhao" />
                      <ArcStep label="Current Outcome" text="Accepts responsibility for the conflict" last />
                    </ol>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="presence-title">
                  <div className="mb-4 flex items-center justify-between"><div><h2 id="presence-title" className="text-sm font-medium">Story Presence</h2><p className="mt-1 text-xs text-zinc-500">Scenes featuring Li Wei</p></div><Film size={16} className="text-zinc-500" /></div>
                  <div className="space-y-3">{storyPresence.map(({ act, count, width }) => <div key={act} className="grid grid-cols-[68px_1fr_22px] items-center gap-3"><span className="text-[11px] text-zinc-500">{act}</span><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full bg-zinc-400 ${width}`} /></div><span className="text-[10px] text-zinc-600">{count}</span></div>)}</div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="evidence-title">
                  <div className="mb-4"><h2 id="evidence-title" className="text-sm font-medium">Character Evidence</h2><p className="mt-1 text-xs text-zinc-500">Observed movie information and its interpretation</p></div>
                  <div className="space-y-3">
                    {mockEvidence.map((item) => <article key={item.timestamp} className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
                      <div className="flex items-center justify-between gap-3"><span className="font-mono text-[11px] text-zinc-400">{item.timestamp}</span><span className="text-[10px] text-zinc-600">{item.confidence}% confidence</span></div>
                      <h3 className="mt-2 text-xs font-medium text-zinc-300">{item.scene}</h3>
                      <div className="mt-3 border-l-2 border-zinc-500/50 pl-3"><p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Observed in movie</p><p className="mt-1 text-xs leading-5 text-zinc-400">{item.observation}</p></div>
                      <div className="mt-3 border-l-2 border-amber-400/30 pl-3"><p className="text-[10px] font-medium uppercase tracking-wider text-amber-300/70">Interpretation</p><p className="mt-1 text-xs leading-5 text-zinc-400">{item.inference}</p></div>
                    </article>)}
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-zinc-600">Interpretations are mock analysis and should be reviewed against the source scene.</p>
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

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-xs text-zinc-500">{label}</span><span className="text-zinc-500">{icon}</span></div><p className="mt-4 text-2xl font-semibold tracking-tight">{value}</p></div>;
}

function CharacterCard({ character }: { character: Character }) {
  return <article className="flex min-h-[230px] flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/[0.16] hover:bg-white/[0.035] sm:p-5">
    <div className="flex items-start gap-3"><Avatar initials={character.initials} /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{character.name}</h3><p lang="zh" className="mt-0.5 text-xs text-zinc-500">{character.chineseName}</p></div><span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-400">{character.role}</span></div>
    <p className="mt-4 min-h-10 text-xs leading-5 text-zinc-500">{character.description}</p>
    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3"><SmallMetric label="Scenes" value={character.scenes} icon={<Film size={12} />} /><SmallMetric label="Dialogue" value={character.dialogue} icon={<MessageSquareText size={12} />} /><SmallMetric label="Confidence" value={`${character.confidence}%`} /></div>
    <Link href="#character-detail" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white">View Character <ArrowRight size={13} /></Link>
  </article>;
}

function Avatar({ initials, large = false }: { initials: string; large?: boolean }) {
  return <div aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-700/70 to-zinc-900 text-xs font-semibold tracking-wide text-zinc-300 ${large ? "h-14 w-14 text-sm" : "h-11 w-11"}`}>{initials}</div>;
}

function SmallMetric({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return <div><span className="flex items-center gap-1 text-[10px] text-zinc-600">{icon}{label}</span><span className="mt-1 block text-xs font-medium text-zinc-300">{value}</span></div>;
}

function ObservationList({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</h3><ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-zinc-400"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />{item}</li>)}</ul></div>;
}

function ArcStep({ label, text, last = false }: { label: string; text: string; last?: boolean }) {
  return <li className="relative flex gap-3"><span className="relative mt-0.5 flex w-3 shrink-0 justify-center"><span className="z-10 h-2.5 w-2.5 rounded-full border border-zinc-500 bg-[#131316]" />{!last && <span className="absolute top-2.5 h-full w-px bg-white/10" />}</span><span className="-mt-0.5 pb-3"><span className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</span><span className="mt-1 block text-xs leading-5 text-zinc-300">{text}</span></span></li>;
}
