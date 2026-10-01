import {
  FolderKanban,
  Film,
  Subtitles,
  Upload,
  MoreHorizontal,
  Clock3,
  CheckCircle2,
  Loader2,
  ArrowUpRight,
} from "lucide-react";


const projects = [
  {
    title: "The Hidden Dragon",
    language: "Chinese → Myanmar",
    progress: 82,
    status: "Processing",
    icon: Loader2,
  },
  {
    title: "Moonlight Sword",
    language: "Chinese → Myanmar",
    progress: 100,
    status: "Completed",
    icon: CheckCircle2,
  },
  {
    title: "Legend of the Phoenix",
    language: "Chinese → Myanmar",
    progress: 34,
    status: "Processing",
    icon: Loader2,
  },
];

const stats = [
  {
    label: "Total Projects",
    value: "24",
    icon: FolderKanban,
  },
  {
    label: "Processing",
    value: "03",
    icon: Clock3,
  },
  {
    label: "Completed",
    value: "18",
    icon: CheckCircle2,
  },
  {
    label: "Subtitles",
    value: "1,284",
    icon: Subtitles,
  },
];

export default function Home() {
  return (


        <section className="flex-1">
          {/* Header */}
          <header className="flex h-20 items-center justify-between border-b border-white/10 px-6 lg:px-10">
            <div>
              <p className="text-xs text-zinc-500">Workspace</p>
              <h2 className="text-lg font-semibold">Dashboard</h2>
            </div>

            <div className="flex items-center gap-3">
              <button className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5 sm:block">
                Settings
              </button>

              <button className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200">
                <Upload size={16} />
                New Movie
              </button>
            </div>
          </header>

          {/* Content */}
          <div className="p-6 lg:p-10">
            <div className="mb-8">
              <p className="text-sm text-zinc-500">Welcome back</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                Movie Translation Studio
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-zinc-500">
                Translate Chinese movies into natural Myanmar subtitles with
                AI-powered transcription and translation.
              </p>
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;

                return (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-500">
                        {stat.label}
                      </span>

                      <div className="rounded-lg border border-white/10 p-2 text-zinc-400">
                        <Icon size={16} />
                      </div>
                    </div>

                    <p className="mt-5 text-3xl font-semibold tracking-tight">
                      {stat.value}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Upload */}
            <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Upload size={23} className="text-zinc-400" />
                </div>

                <h4 className="mt-4 text-base font-medium">
                  Upload a movie
                </h4>

                <p className="mt-2 max-w-md text-sm text-zinc-500">
                  Upload your Chinese movie and start the AI transcription and
                  Myanmar subtitle translation workflow.
                </p>

                <button className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-zinc-200">
                  Choose Movie
                </button>

                <p className="mt-3 text-xs text-zinc-600">
                  MP4, MKV, MOV · Large files supported
                </p>
              </div>
            </div>

            {/* Projects */}
            <div className="mt-10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Recent Projects</h4>
                  <p className="mt-1 text-xs text-zinc-500">
                    Your latest movie translation jobs
                  </p>
                </div>

                <button className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                  View all
                  <ArrowUpRight size={14} />
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10">
                {projects.map((project, index) => {
                  const Icon = project.icon;

                  return (
                    <div
                      key={project.title}
                      className={`flex flex-col gap-4 p-5 transition hover:bg-white/[0.025] sm:flex-row sm:items-center ${
                        index !== projects.length - 1
                          ? "border-b border-white/10"
                          : ""
                      }`}
                    >
                      <div className="flex flex-1 items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
                          <Film size={19} className="text-zinc-400" />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {project.title}
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            {project.language}
                          </p>
                        </div>
                      </div>

                      <div className="w-full sm:w-48">
                        <div className="mb-2 flex justify-between text-xs">
                          <span className="text-zinc-500">
                            {project.status}
                          </span>

                          <span className="text-zinc-400">
                            {project.progress}%
                          </span>
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-white"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <Icon
                            size={14}
                            className={
                              project.status === "Processing"
                                ? "animate-spin"
                                : ""
                            }
                          />
                          {project.status}
                        </span>

                        <button className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white">
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>


  );
}
