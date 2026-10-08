"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Clapperboard } from "lucide-react";

const globalLinks = [
  { label: "Dashboard", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Movies", href: "/movies" },
];

const workspaceLinks = [
  { label: "Overview", suffix: "" },
  { label: "Transcription", suffix: "/subtitles" },
  { label: "Translation", suffix: "/translation" },
  { label: "Review", suffix: "/translation?view=review#review" },
  { label: "Recap", suffix: "/recap" },
  { label: "Export", suffix: "/export" },
];

const advancedLinks = [
  { label: "Scenes", segment: "scenes" },
  { label: "Characters & evidence", segment: "characters" },
  { label: "Glossary", segment: "glossary" },
  { label: "Translation Memory", segment: "translation-memory" },
];

export default function AppSidebar() {
  return <Suspense fallback={<aside aria-label="Navigation loading" className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] lg:block" />}><SidebarNavigation /></Suspense>;
}

function SidebarNavigation() {
  const pathname = usePathname();
  const reviewView = useSearchParams().get("view") === "review";
  const segments = pathname.split("/").filter(Boolean);
  const projectId =
    segments[0] === "projects" && segments.length >= 2 && segments[1] !== "new"
      ? segments[1]
      : null;
  const projectBase = projectId ? `/projects/${projectId}` : null;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d10] px-4 py-5 lg:block">
      <Link href="/" className="flex items-center gap-3 px-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
          <Clapperboard size={21} />
        </span>
        <span>
          <span className="block text-sm font-semibold">Movie Translator</span>
          <span className="block text-xs text-zinc-500">Localization & Recap Studio</span>
        </span>
      </Link>

      <nav aria-label="Main navigation" className="mt-10 space-y-1">
        {globalLinks.map((item) => {
          const active = pathname === item.href;
          return (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={active}
            />
          );
        })}
      </nav>

      {projectBase && (
        <>
          <SidebarGroup title="Project workspace">
            {workspaceLinks.map((item) => (
              <SidebarLink
                key={item.label}
                href={`${projectBase}${item.suffix}`}
                label={item.label}
                active={item.label === "Review" ? pathname === `${projectBase}/translation` && reviewView : pathname === `${projectBase}${item.suffix}` && (item.label !== "Translation" || !reviewView)}
              />
            ))}
          </SidebarGroup>
          <SidebarGroup title="Advanced">
            {advancedLinks.map((item) => (
              <SidebarLink
                key={item.segment}
                href={`${projectBase}/${item.segment}`}
                label={item.label}
                active={pathname === `${projectBase}/${item.segment}`}
              />
            ))}
          </SidebarGroup>
        </>
      )}

      <div className="mt-8 border-t border-white/10 pt-5">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
          System
        </p>
        <SidebarLink
          href="/settings"
          label="Settings"
          active={pathname === "/settings"}
        />
      </div>
    </aside>
  );
}

function SidebarGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mt-8">
      <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
        {title}
      </p>
      <nav aria-label={title} className="space-y-1">
        {children}
      </nav>
    </div>
  );
}

function SidebarLink({
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
      aria-current={active ? "page" : undefined}
      className={`block rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${
        active
          ? "bg-violet-400/10 text-violet-300"
          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}
