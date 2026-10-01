import {
  FileVideo,
  FolderOpen,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

export default async function ProjectsPage() {
  let projects;

  try {
    projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        sourceLanguage: true,
        targetLanguage: true,
        status: true,
        updatedAt: true,
        _count: { select: { movies: true } },
      },
    });
  } catch {
    return (
      <section className="flex-1">
        <PageHeader />
        <div className="p-6 lg:p-10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <h3 className="font-medium">Projects are unavailable</h3>
            <p className="mt-2 text-sm text-zinc-500">
              We couldn’t load projects right now. Please try again shortly.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1">
      <PageHeader />

      <div className="p-6 lg:p-10">
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
              aria-label="Search projects"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-zinc-600 focus:border-white/20"
            />
          </div>
        </div>

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
              className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10 md:mt-0"
            >
              <FileVideo size={16} />
              Upload Movie
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="font-medium">Recent Projects</h4>
              <p className="mt-1 text-xs text-zinc-500">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </p>
            </div>
          </div>

          {projects.length ? (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {projects.map((project, index) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  last={index === projects.length - 1}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <FolderOpen className="mx-auto text-zinc-500" size={22} />
              <h5 className="mt-3 font-medium">No projects yet</h5>
              <p className="mt-1 text-sm text-zinc-500">
                Create a project to begin organizing your movie translation.
              </p>
              <Link
                href="/projects/new"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                <Plus size={16} />
                New Project
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PageHeader() {
  return (
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
  );
}

function ProjectRow({
  project,
  last,
}: {
  project: {
    name: string;
    slug: string;
    sourceLanguage: string;
    targetLanguage: string;
    status: "DRAFT" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED";
    updatedAt: Date;
    _count: { movies: number };
  };
  last: boolean;
}) {
  const statusLabel = project.status.charAt(0) + project.status.slice(1).toLowerCase();
  const statusClass =
    project.status === "READY"
      ? "text-emerald-400"
      : project.status === "PROCESSING"
        ? "text-amber-400"
        : project.status === "FAILED"
          ? "text-red-400"
          : "text-zinc-400";
  const projectHref = `/projects/${project.slug}`;

  return (
    <div
      className={`flex flex-col gap-5 p-5 transition hover:bg-white/[0.025] md:flex-row md:items-center ${
        !last ? "border-b border-white/10" : ""
      }`}
    >
      <Link href={projectHref} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
          <FolderOpen size={19} className="text-zinc-400" />
        </div>
        <div className="min-w-0">
          <h5 className="truncate text-sm font-medium">{project.name}</h5>
          <p className="mt-1 truncate text-xs text-zinc-600">
            {project.sourceLanguage} → {project.targetLanguage}
          </p>
        </div>
      </Link>

      <Link href={projectHref} className="flex w-full items-center justify-between md:w-64">
        <span className={`text-xs ${statusClass}`}>{statusLabel}</span>
        <span className="text-xs text-zinc-500">
          {project._count.movies} {project._count.movies === 1 ? "movie" : "movies"}
        </span>
      </Link>

      <Link href={projectHref} className="hidden w-32 xl:block">
        <p className="text-xs text-zinc-600">Updated</p>
        <p className="mt-1 text-xs text-zinc-400">
          {project.updatedAt.toLocaleDateString()}
        </p>
      </Link>
    </div>
  );
}
