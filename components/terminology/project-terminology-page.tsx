import { notFound } from "next/navigation";
import AdvancedWorkspaceHeader from "@/components/ui/advanced-workspace-header";
import WorkspaceUnavailable from "@/components/ui/workspace-unavailable";
import { contentClass, pageClass } from "@/components/ui/styles";

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
    return <WorkspaceUnavailable title="Project entries unavailable" description="Unable to load saved entries. Please try again." href={`/projects/${encodeURIComponent(slug)}`} />;
  }
  const { project, entries } = workspace;
  const glossary = kind === "glossary";
  const title = glossary ? "Glossary" : "Translation Memory";
  return <main className={pageClass}><div className={contentClass}>
    <AdvancedWorkspaceHeader projectName={project.name} projectSlug={project.slug} title={title}
      description={glossary ? "Manage terminology that should remain consistent in Myanmar translation." : "Reuse approved and saved translation pairs across the project."}
      context={`${normalizeTerminologyLanguage(project.sourceLanguage)} → ${normalizeTerminologyLanguage(project.targetLanguage)}`} />
    <EntryManager key={`${project.slug}:${kind}`} kind={kind} projectSlug={project.slug} initialEntries={entries}
      sourceLanguage={normalizeTerminologyLanguage(project.sourceLanguage)} targetLanguage={normalizeTerminologyLanguage(project.targetLanguage)} />
  </div></main>;
}
