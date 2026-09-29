"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  FileVideo,
  Upload,
  X,
} from "lucide-react";

export default function NewProjectPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    setFile(selectedFile);

    if (!title) {
      const filename = selectedFile.name.replace(/\.[^/.]+$/, "");
      setTitle(filename);
    }
  }

  function removeFile() {
    setFile(null);
  }

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
              <h1 className="text-sm font-semibold">
                Movie Translator
              </h1>
              <p className="text-xs text-zinc-500">
                AI Subtitle Studio
              </p>
            </div>
          </div>

          <nav className="mt-10 space-y-1">
            <NavItem href="/" label="Dashboard" />
            <NavItem href="/projects" label="Projects" active />
            <NavItem href="/movies" label="Movies" />
            <NavItem href="/subtitles" label="Subtitles" />
          </nav>

          <div className="mt-8 border-t border-white/10 pt-5">
            <NavItem href="/settings" label="Settings" />
          </div>
        </aside>

        {/* Main */}
        <section className="flex-1">
          <header className="flex min-h-20 items-center border-b border-white/10 px-6 lg:px-10">
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Link
                  href="/projects"
                  className="hover:text-zinc-300"
                >
                  Projects
                </Link>

                <span>/</span>
                <span>New Project</span>
              </div>

              <h2 className="mt-1 text-lg font-semibold">
                New Project
              </h2>
            </div>
          </header>

          <div className="mx-auto max-w-3xl p-6 lg:p-10">
            <div className="mb-8">
              <Link
                href="/projects"
                className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200"
              >
                <ArrowLeft size={16} />
                Back to Projects
              </Link>

              <h3 className="text-2xl font-semibold tracking-tight">
                Create Translation Project
              </h3>

              <p className="mt-2 text-sm text-zinc-500">
                Upload a Chinese movie and prepare it for AI
                transcription and Myanmar translation.
              </p>
            </div>

            {/* Project title */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <label className="text-sm font-medium">
                Project Name
              </label>

              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. The Hidden Dragon"
                className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-700 focus:border-white/25"
              />
            </div>

            {/* Upload */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="mb-5">
                <h4 className="text-sm font-medium">
                  Movie File
                </h4>

                <p className="mt-1 text-xs text-zinc-500">
                  Supported formats: MP4, MKV, MOV, WEBM
                </p>
              </div>

              {!file ? (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center transition hover:border-white/25 hover:bg-white/[0.04]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05]">
                    <Upload
                      size={22}
                      className="text-zinc-400"
                    />
                  </div>

                  <p className="mt-4 text-sm font-medium">
                    Choose a movie file
                  </p>

                  <p className="mt-2 text-xs text-zinc-600">
                    Click to browse files
                  </p>

                  <input
                    type="file"
                    accept=".mp4,.mkv,.mov,.webm,video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
                      <FileVideo
                        size={21}
                        className="text-zinc-400"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {file.name}
                      </p>

                      <p className="mt-1 text-xs text-zinc-600">
                        {formatFileSize(file.size)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={removeFile}
                      className="rounded-lg p-2 text-zinc-600 hover:bg-white/5 hover:text-zinc-300"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400">
                    <CheckCircle2 size={14} />
                    File selected
                  </div>
                </div>
              )}
            </div>

            {/* Translation settings */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h4 className="text-sm font-medium">
                Translation Settings
              </h4>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-zinc-500">
                    Source Language
                  </label>

                  <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
                    Chinese
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-500">
                    Target Language
                  </label>

                  <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
                    Myanmar
                  </div>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="mt-6 flex justify-end gap-3">
              <Link
                href="/projects"
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              >
                Cancel
              </Link>

              <button
                disabled={!file || !title.trim()}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Create Project
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function NavItem({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-white text-black"
          : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}