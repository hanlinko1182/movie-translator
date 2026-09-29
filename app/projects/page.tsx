import {
  Clapperboard,
  FileVideo,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from "lucide-react";

import Link from "next/link";

const projects = [
  {
    title: "The Hidden Dragon",
    file: "the-hidden-dragon.mkv",
    status: "Processing",
    progress: 82,
    updated: "2 minutes ago",
  },
  {
    title: "Moonlight Sword",
    file: "moonlight-sword.mp4",
    status: "Completed",
    progress: 100,
    updated: "1 hour ago",
  },
  {
    title: "Legend of the Phoenix",
    file: "legend-phoenix.mkv",
    status: "Processing",
    progress: 34,
    updated: "18 minutes ago",
  },
  {
    title: "The Last Emperor",
    file: "last-emperor.mp4",
    status: "Draft",
    progress: 0,
    updated: "Yesterday",
  },
];

export default function ProjectsPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] px-4 py-5 lg:block">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <Clapperboard size={21} />
            </div>

            <div>
              <h1 className="text-sm font-semibold">Movie Translator</h1>
              <p className="text-xs text-zinc-500">AI Subtitle Studio</p>
            </div>
          </div>

          <nav className="mt-10 space-y-1">
            <SidebarItem href="/" label="Dashboard" />

            <SidebarItem href="/projects" label="Projects" active />

            <SidebarItem href="/movies" label="Movies" />

            <SidebarItem href="/subtitles" label="Subtitles" />
          </nav>

          <div className="mt-8 border-t border-white/10 pt-5">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
              System
            </p>

            <SidebarItem href="/settings" label="Settings" />
          </div>
        </aside>

        {/* Main */}
        <section className="flex-1">
          {/* Header */}
          <header className="flex min-h-20 items-center justify-between border-b border-white/10 px-6 py-4 lg:px-10">
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Link href="/" className="hover:text-zinc-300">
                  Dashboard
                </Link>

                <span>/</span>

                <span>Projects</span>
              </div>

              <h2 className="mt-1 text-lg font-semibold">Projects</h2>
            </div>

            <Link
              href="/projects/new"
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
            >
              <Plus size={17} />
              New Project
            </Link>
          </header>

          {/* Content */}
          <div className="p-6 lg:p-10">
            {/* Page intro */}
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-sm text-zinc-500">
                  Manage your movie translation projects
                </p>

                <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                  All Projects
                </h3>
              </div>

              <div className="relative w-full md:w-72">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                />

                <input
                  type="text"
                  placeholder="Search projects..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20"
                />
              </div>
            </div>

            {/* Upload area */}
            <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6">
              <div className="flex flex-col items-center justify-center text-center md:flex-row md:justify-between md:text-left">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                    <Upload size={20} className="text-zinc-400" />
                  </div>

                  <div>
                    <h4 className="text-sm font-medium">
                      Start a new translation
                    </h4>

                    <p className="mt-1 text-xs text-zinc-500">
                      Upload a Chinese movie to create a translation project.
                    </p>
                  </div>
                </div>

                <Link 
                  href="/projects/new"
                  className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10 md:mt-0">
                  <FileVideo size={16} />
                  Upload Movie
                </Link>
              </div>
            </div>

            {/* Project list */}
            <div className="mt-10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Recent Projects</h4>

                  <p className="mt-1 text-xs text-zinc-500">
                    {projects.length} projects
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10">
                {projects.map((project, index) => (
                  <ProjectRow
                    key={project.title}
                    project={project}
                    last={index === projects.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarItem({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-white text-black"
          : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
      }`}
    >
      {label}
    </a>
  );
}

function ProjectRow({
  project,
  last,
}: {
  project: (typeof projects)[number];
  last: boolean;
}) {
  const statusClass =
    project.status === "Completed"
      ? "text-emerald-400"
      : project.status === "Processing"
        ? "text-amber-400"
        : "text-zinc-500";

  return (
    <div
      className={`flex flex-col gap-5 p-5 transition hover:bg-white/[0.025] xl:flex-row xl:items-center ${
        !last ? "border-b border-white/10" : ""
      }`}
    >
      {/* Project info */}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
          <FolderOpen size={19} className="text-zinc-400" />
        </div>

        <div className="min-w-0">
          <h5 className="truncate text-sm font-medium">{project.title}</h5>

          <p className="mt-1 truncate text-xs text-zinc-600">{project.file}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="w-full xl:w-64">
        <div className="mb-2 flex justify-between text-xs">
          <span className={statusClass}>{project.status}</span>

          <span className="text-zinc-500">{project.progress}%</span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      {/* Updated */}
      <div className="hidden w-28 xl:block">
        <p className="text-xs text-zinc-600">Updated</p>
        <p className="mt-1 text-xs text-zinc-400">{project.updated}</p>
      </div>

      {/* Menu */}
      <button className="self-end rounded-lg p-2 text-zinc-600 transition hover:bg-white/5 hover:text-zinc-300 xl:self-auto">
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
