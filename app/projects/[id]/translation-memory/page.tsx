import ProjectTerminologyPage from "@/components/terminology/project-terminology-page";

export default async function TranslationMemoryPage({
  params,
}: PageProps<"/projects/[id]/translation-memory">) {
  const { id: slug } = await params;
  return <ProjectTerminologyPage slug={slug} kind="translation-memory" />;
}
