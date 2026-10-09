import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { RefreshOverviewButton } from "@/app/projects/[id]/overview-action";
import { cardClass, contentClass, linkClass, pageClass } from "./styles";

export default function WorkspaceUnavailable({ title, description, href, label = "Project overview" }: { title: string; description: string; href: string; label?: string }) {
  return <main className={pageClass}><div className={contentClass}><section className={`${cardClass} p-6 sm:p-8`}>
    <CircleAlert size={24} aria-hidden="true" className="text-zinc-400" />
    <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
    <p role="alert" className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{description}</p>
    <div className="mt-5 flex flex-wrap items-center gap-4"><RefreshOverviewButton label="Try again" /><Link href={href} className={linkClass}>{label}</Link></div>
  </section></div></main>;
}
