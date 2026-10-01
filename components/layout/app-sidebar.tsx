"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard } from "lucide-react";

const globalLinks = [
  { label: "Dashboard", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Movies", href: "/movies" },
];

const storyLinks = [
  { label: "Recap", segment: "recap" },
  { label: "Characters", segment: "characters" },
  { label: "Scenes", segment: "scenes" },
];

const subtitleLinks = [
  { label: "Subtitle Editor", segment: "subtitles" },
  { label: "Glossary", segment: "glossary" },
  { label: "Translation Memory", segment: "translation-memory" },
  { label: "Translation", segment: "translation" },
];

export default function AppSidebar() {
  const pathname = usePathname();
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
          <span className="block text-xs text-zinc-500">AI Subtitle Studio</span>
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
        {projectBase && (
          <SidebarLink
            href={projectBase}
            label="Project Overview"
            active={pathname === projectBase}
          />
        )}
      </nav>

      {projectBase && (
        <>
          <SidebarGroup title="Story">
            {storyLinks.map((item) => (
              <SidebarLink
                key={item.segment}
                href={`${projectBase}/${item.segment}`}
                label={item.label}
                active={pathname === `${projectBase}/${item.segment}`}
              />
            ))}
          </SidebarGroup>
          <SidebarGroup title="Subtitles">
            {subtitleLinks.map((item) => (
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
      className={`block rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-white text-black"
          : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}
