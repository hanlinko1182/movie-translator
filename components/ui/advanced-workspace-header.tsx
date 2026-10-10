import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { badgeClass, badgeTones } from "./styles";
import { withMovieSelection } from "@/lib/source-video/selection";

export default function AdvancedWorkspaceHeader({ projectName, projectSlug, title, description, context, movieId }: {
  projectName: string; projectSlug: string; title: string; description: string; context?: string; movieId?: string;
}) {
  return <header className="space-y-4">
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
      <Link href="/projects" className="hover:text-zinc-200">Projects</Link><ChevronRight size={13} aria-hidden="true" />
      <Link href={withMovieSelection(`/projects/${encodeURIComponent(projectSlug)}`, movieId)} className="break-words hover:text-zinc-200">{projectName}</Link><ChevronRight size={13} aria-hidden="true" />
      <span aria-current="page" className="text-zinc-300">{title}</span>
    </nav>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Advanced workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>
      </div>
      {context && <span className={`${badgeClass} ${badgeTones.neutral} break-words`}>{context}</span>}
    </div>
  </header>;
}
