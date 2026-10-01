import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Circle,
  Download,
  Film,
  Languages,
  Sparkles,
  UserRound,
} from "lucide-react";

const tabs = [
  { name: "Overview", href: "" },
  { name: "Translation", href: "/translation" },
  { name: "Recap", href: "/recap" },
  { name: "Characters", href: "/characters" },
  { name: "Scenes", href: "/scenes" },
  { name: "Export", href: "/export" },
];

const pipeline = [
  { name: "Upload", status: "done" },
  { name: "Transcribe", status: "done" },
  { name: "Story Analysis", status: "done" },
  { name: "Translation", status: "processing" },
  { name: "Recap", status: "pending" },
  { name: "Export", status: "pending" },
];

export default async function ProjectDetailPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0c0c0f] px-4 py-6 lg:block">
          <div className="mb-8 flex items-center gap-3 px-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black">
              <Film size={19} />
            </div>

            <div>
              <p className="text-sm font-semibold">Movie Studio</p>
              <p className="text-xs text-zinc-500">AI Translation</p>
            </div>
          </div>

          <nav className="space-y-1">
            <SidebarItem label="Dashboard" href="/" />
            <SidebarItem label="Projects" href="/projects" active />
            <SidebarItem label="Movies" href="/movies" />
            <SidebarItem label="Subtitles" href="/subtitles" />
          </nav>

          <div className="mt-8">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
              Story
            </p>

            <nav className="space-y-1">
              <SidebarItem label="Recap" href="#" />
              <SidebarItem label="Characters" href="#" />
              <SidebarItem label="Scenes" href="#" />
            </nav>
          </div>

          <div className="mt-8">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
              Subtitles
            </p>

            <nav className="space-y-1">
              <SidebarItem label="Subtitle Editor" href="#" />
              <SidebarItem label="Glossary" href="#" />
              <SidebarItem label="Translation Memory" href="#" />
            </nav>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <SidebarItem label="Settings" href="/settings" />
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          {/* Header */}
          <header className="border-b border-white/10 px-6 py-5 lg:px-10">
            <div className="mx-auto max-w-7xl">
              <Link
                href="/projects"
                className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
              >
                <ArrowLeft size={16} />
                Projects
              </Link>

              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                    <span>Projects</span>
                    <ChevronRight size={13} />
                    <span>The Hidden Dragon</span>
                  </div>

                  <h1 className="text-2xl font-semibold tracking-tight">
                    The Hidden Dragon
                  </h1>

                  <div className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
                    <span>Chinese</span>
                    <ChevronRight size={14} />
                    <span className="text-zinc-300">Myanmar</span>
                    <span className="text-zinc-700">•</span>
                    <span>01:48:32</span>
                  </div>
                </div>

                <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.08] hover:text-white">
                  <Download size={16} />
                  Export
                </button>
              </div>
            </div>
          </header>

          {/* Tabs */}
          <div className="border-b border-white/10 px-6 lg:px-10">
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto">
              {tabs.map((tab, index) => (
                <Link
                  key={tab.name}
                  href={`/projects/${id}${tab.href}`}
                  className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm transition ${
                    index === 0
                      ? "border-white text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {tab.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Content */}
          <section className="px-6 py-8 lg:px-10">
            <div className="mx-auto max-w-7xl space-y-6">
              {/* Progress */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-medium">Processing Progress</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Your movie is being prepared for translation.
                    </p>
                  </div>

                  <span className="text-2xl font-semibold">68%</span>
                </div>

                <div className="mb-7 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[68%] rounded-full bg-white" />
                </div>

                <div className="grid grid-cols-2 gap-5 md:grid-cols-6">
                  {pipeline.map((item) => (
                    <PipelineStep
                      key={item.name}
                      name={item.name}
                      status={item.status}
                    />
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid gap-4 md:grid-cols-3">
                <InfoCard
                  icon={<Film size={18} />}
                  label="Movie"
                  value="The Hidden Dragon"
                  description="Chinese source video"
                />

                <InfoCard
                  icon={<Languages size={18} />}
                  label="Translation"
                  value="Chinese → Myanmar"
                  description="AI translation pipeline"
                />

                <InfoCard
                  icon={<Sparkles size={18} />}
                  label="Narrative Recap"
                  value="Waiting"
                  description="Character-driven storytelling"
                />
              </div>

              {/* Workspace preview */}
              <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h2 className="font-medium">Story Understanding</h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        AI analysis generated from the movie.
                      </p>
                    </div>

                    <Sparkles size={18} className="text-zinc-500" />
                  </div>

                  <div className="space-y-3">
                    <StoryRow
                      icon={<Film size={17} />}
                      title="Scenes"
                      value="42 analyzed"
                    />

                    <StoryRow
                      icon={<UserRound size={17} />}
                      title="Characters"
                      value="8 identified"
                    />

                    <StoryRow
                      icon={<Sparkles size={17} />}
                      title="Story Events"
                      value="126 detected"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                  <h2 className="font-medium">Next Step</h2>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    After translation is completed, generate a narrative recap
                    based on characters, scenes, actions and consequences.
                  </p>

                  <Link
                    href="/projects/hidden-dragon/recap"
                    className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-200"
                  >
                    <Sparkles size={16} />
                    Open Recap
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  href,
  active = false,
}: {
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-white text-black"
          : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}

function PipelineStep({
  name,
  status,
}: {
  name: string;
  status: "done" | "processing" | "pending";
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full border ${
          status === "done"
            ? "border-white bg-white text-black"
            : status === "processing"
              ? "border-white bg-white/10 text-white"
              : "border-white/10 text-zinc-600"
        }`}
      >
        {status === "done" ? (
          <Check size={15} />
        ) : status === "processing" ? (
          <Circle size={10} fill="currentColor" />
        ) : (
          <Circle size={10} />
        )}
      </div>

      <span className="text-xs text-zinc-500">{name}</span>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="mb-4 flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>

      <p className="font-medium">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
    </div>
  );
}

function StoryRow({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-sm">{title}</span>
      </div>

      <span className="text-sm text-zinc-500">{value}</span>
    </div>
  );
}
