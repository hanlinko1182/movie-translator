import Link from "next/link";
import { notFound } from "next/navigation";
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

import { prisma } from "@/lib/prisma";

const tabs = [
  { name: "Overview", href: "" },
  { name: "Translation", href: "/translation" },
  { name: "Recap", href: "/recap" },
  { name: "Characters", href: "/characters" },
  { name: "Scenes", href: "/scenes" },
  { name: "Export", href: "/export" },
];

// Demo-only processing and story values; these are not read from the database.
const pipeline = [
  { name: "Upload", status: "done" },
  { name: "Transcribe", status: "done" },
  { name: "Story Analysis", status: "done" },
  { name: "Translation", status: "processing" },
  { name: "Recap", status: "pending" },
  { name: "Export", status: "pending" },
] as const;

export default async function ProjectDetailPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id: projectSlug } = await params;
  let project;

  try {
    project = await prisma.project.findUnique({
      where: { slug: projectSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        sourceLanguage: true,
        targetLanguage: true,
        status: true,
      },
    });
  } catch {
    return (
      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <h1 className="font-medium">Project is unavailable</h1>
          <p className="mt-2 text-sm text-zinc-500">
            We couldn’t load this project right now. Please try again shortly.
          </p>
          <Link
            href="/projects"
            className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft size={16} />
            Projects
          </Link>
        </div>
      </main>
    );
  }

  if (!project) notFound();

  const sourceLanguage = languageName(project.sourceLanguage);
  const targetLanguage = languageName(project.targetLanguage);
  const projectStatus =
    project.status.charAt(0) + project.status.slice(1).toLowerCase();

  return (


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
                    <span>{project.name}</span>
                  </div>

                  <h1 className="text-2xl font-semibold tracking-tight">
                    {project.name}
                  </h1>

                  <div className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
                    <span>{sourceLanguage}</span>
                    <ChevronRight size={14} />
                    <span className="text-zinc-300">{targetLanguage}</span>
                    <span className="text-zinc-700">•</span>
                    <span>{projectStatus}</span>
                  </div>
                </div>

                <Link
                  href={`/projects/${project.slug}/export`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <Download size={16} />
                  Export
                </Link>
              </div>
            </div>
          </header>

          {/* Tabs */}
          <div className="border-b border-white/10 px-6 lg:px-10">
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto">
              {tabs.map((tab, index) => (
                <Link
                  key={tab.name}
                  href={`/projects/${project.slug}${tab.href}`}
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
                      Demo pipeline preview. Processing progress will appear here when connected.
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
                  value={project.name}
                  description={`${sourceLanguage} source video`}
                />

                <InfoCard
                  icon={<Languages size={18} />}
                  label="Translation"
                  value={`${sourceLanguage} → ${targetLanguage}`}
                  description="AI translation pipeline preview"
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
                      value="Sample: 42 analyzed"
                    />

                    <StoryRow
                      icon={<UserRound size={17} />}
                      title="Characters"
                      value="Sample: 8 identified"
                    />

                    <StoryRow
                      icon={<Sparkles size={17} />}
                      title="Story Events"
                      value="Sample: 126 detected"
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
                    href={`/projects/${project.slug}/recap`}
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

function languageName(code: string) {
  const knownLanguages: Record<string, string> = {
    zh: "Chinese",
    my: "Myanmar",
  };

  return knownLanguages[code.toLowerCase()] ?? code;
}
