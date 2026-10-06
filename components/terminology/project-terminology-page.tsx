import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Languages } from "lucide-react";

import EntryManager from "@/components/terminology/entry-manager";
import { getTerminologyWorkspace, TerminologyError } from "@/lib/terminology-api";
import type { TerminologyKind } from "@/lib/terminology-types";
import { normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";

export default async function ProjectTerminologyPage({ slug, kind }: { slug: string; kind: TerminologyKind }) {
  let workspace;
  try {
    workspace = await getTerminologyWorkspace(slug, kind);
  } catch (error) {
    if (error instanceof TerminologyError && error.code === "PROJECT_NOT_FOUND") notFound();
    return <section className="p-6"><p role="alert" className="rounded-xl border border-amber-500/20 p-4 text-sm text-amber-200">Unable to load project entries. Please try again.</p></section>;
  }
  const { project, entries } = workspace;
  const glossary = kind === "glossary";
  const title = glossary ? "Glossary" : "Translation Memory";
  return (
    <section className="min-w-0 flex-1">
      <header className="border-b border-white/10 px-5 py-5 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Link href="/projects" className="hover:text-zinc-300">Projects</Link><ChevronRight size={13} />
            <Link href={`/projects/${encodeURIComponent(project.slug)}`} className="hover:text-zinc-300">{project.name}</Link><ChevronRight size={13} />
            <span className="text-zinc-300">{title}</span>
          </div>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="mb-1 text-xs text-zinc-500">{glossary ? "Project terminology" : "Reusable subtitle translations"}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">{glossary
                ? "Keep names, places, titles, and phrases consistent across this project."
                : "Reuse exact source lines across this project. Add or correct translations for repeated dialogue."}</p>
            </div>
            <span className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
              <Languages size={14} className="text-zinc-500" />{normalizeTerminologyLanguage(project.sourceLanguage)} → {normalizeTerminologyLanguage(project.targetLanguage)}
            </span>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
        <EntryManager key={`${project.slug}:${kind}`} kind={kind} projectSlug={project.slug} initialEntries={entries}
          sourceLanguage={normalizeTerminologyLanguage(project.sourceLanguage)}
          targetLanguage={normalizeTerminologyLanguage(project.targetLanguage)} />
      </div>
    </section>
  );
}
