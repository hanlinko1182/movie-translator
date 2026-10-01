"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileVideo,
  Upload,
  X,
} from "lucide-react";
import {
  ALLOWED_MOVIE_EXTENSIONS,
  MAX_MOVIE_UPLOAD_BYTES,
  MAX_MOVIE_UPLOAD_LABEL,
} from "@/lib/movie-upload-policy";

export default function NewProjectPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("zh");
  const [targetLanguage, setTargetLanguage] = useState("my");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    setErrorMessage("");

    const lastDot = selectedFile.name.lastIndexOf(".");
    const extension = lastDot > 0 ? selectedFile.name.slice(lastDot).toLowerCase() : "";
    if (
      !ALLOWED_MOVIE_EXTENSIONS.includes(
        extension as (typeof ALLOWED_MOVIE_EXTENSIONS)[number],
      )
    ) {
      setFile(null);
      setErrorMessage(
        `Choose a movie file ending in ${ALLOWED_MOVIE_EXTENSIONS.join(", ")}.`,
      );
      setFileInputKey((key) => key + 1);
      return;
    }

    if (selectedFile.size === 0) {
      setFile(null);
      setErrorMessage("The selected movie file is empty.");
      setFileInputKey((key) => key + 1);
      return;
    }

    if (selectedFile.size > MAX_MOVIE_UPLOAD_BYTES) {
      setFile(null);
      setErrorMessage(`Choose a movie file no larger than ${MAX_MOVIE_UPLOAD_LABEL}.`);
      setFileInputKey((key) => key + 1);
      return;
    }

    setFile(selectedFile);

    if (!projectName) {
      const filename = selectedFile.name
        .replace(/\\/g, "/")
        .split("/")
        .at(-1)
        ?.replace(/\.[^.]+$/, "");
      setProjectName(filename ?? "");
    }
  }

  function removeFile() {
    setFile(null);
    setFileInputKey((key) => key + 1);
    setErrorMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!projectName.trim() || !file) {
      setErrorMessage("Enter a project name and choose a movie file.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("name", projectName.trim());
      formData.set("sourceLanguage", sourceLanguage);
      formData.set("targetLanguage", targetLanguage);
      formData.set("movie", file);

      const response = await fetch("/api/project-uploads", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json().catch(() => null)) as {
        data?: { project?: { slug?: unknown } };
        error?: { message?: unknown };
      } | null;

      if (!response.ok) {
        setErrorMessage(
          typeof result?.error?.message === "string"
            ? result.error.message
            : "We couldn’t create the project. Please try again.",
        );
        return;
      }

      const slug = result?.data?.project?.slug;
      if (typeof slug !== "string" || !slug) {
        setErrorMessage("The project was created, but its page could not be opened.");
        return;
      }

      router.push(`/projects/${encodeURIComponent(slug)}`);
    } catch {
      setErrorMessage("We couldn’t create the project. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (


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
                Add project details and a movie file to start a translation project.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {errorMessage && (
                <p
                  role="alert"
                  className="mb-5 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300"
                >
                  {errorMessage}
                </p>
              )}

              {/* Project title */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <label htmlFor="project-name" className="text-sm font-medium">
                  Project Name
                </label>

                <input
                  id="project-name"
                  name="name"
                  type="text"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="e.g. The Hidden Dragon"
                  disabled={isSubmitting}
                  required
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
                    Supported formats: MP4, MKV, MOV, WEBM · Up to {MAX_MOVIE_UPLOAD_LABEL}
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
                    key={fileInputKey}
                    name="movie"
                    type="file"
                    accept={ALLOWED_MOVIE_EXTENSIONS.join(",")}
                    onChange={handleFileChange}
                    disabled={isSubmitting}
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
                  <label htmlFor="source-language" className="text-xs text-zinc-500">
                    Source Language
                  </label>

                  <select
                    id="source-language"
                    name="sourceLanguage"
                    value={sourceLanguage}
                    onChange={(event) => setSourceLanguage(event.target.value)}
                    disabled={isSubmitting}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-zinc-300 outline-none focus:border-white/25"
                  >
                    <option value="zh">Chinese</option>
                    <option value="yue">Cantonese</option>
                    <option value="cmn">Mandarin</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="target-language" className="text-xs text-zinc-500">
                    Target Language
                  </label>

                  <select
                    id="target-language"
                    name="targetLanguage"
                    value={targetLanguage}
                    onChange={(event) => setTargetLanguage(event.target.value)}
                    disabled={isSubmitting}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-zinc-300 outline-none focus:border-white/25"
                  >
                    <option value="my">Myanmar</option>
                    <option value="en">English</option>
                  </select>
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
                type="submit"
                disabled={!file || !projectName.trim() || isSubmitting}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {isSubmitting ? "Uploading..." : "Create Project"}
              </button>
              </div>
            </form>
          </div>
        </section>


  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
