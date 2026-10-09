import type { ReactNode } from "react";
import AppSidebar from "./app-sidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <AppSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
