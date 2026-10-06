import ProjectTerminologyPage from "@/components/terminology/project-terminology-page";

export default async function GlossaryPage({
  params,
}: PageProps<"/projects/[id]/glossary">) {
  const { id: slug } = await params;
  return <ProjectTerminologyPage slug={slug} kind="glossary" />;
}
