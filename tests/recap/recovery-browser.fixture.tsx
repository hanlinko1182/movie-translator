// Synthetic UI-only browser fixture. Its API requests must be intercepted by
// the QA runner; it never connects to the application database or queue.
import { createRoot } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import AppShell from "@/components/layout/app-shell";
import { contentClass, pageClass } from "@/components/ui/styles";
import RecapControls from "@/app/projects/[id]/recap/RecapControls";
import { recapProps, movieId } from "./recovery.fixture";

const params = new URLSearchParams(location.search);
const props = params.get("missing") ? { ...recapProps, transcriptState: "MISSING" as const, sourceReason: "Transcript required" } : recapProps;
createRoot(document.getElementById("root")!).render(
  <PathnameContext.Provider value="/projects/synthetic/recap">
    <SearchParamsContext.Provider value={new URLSearchParams({ movieId })}>
      <AppShell><main className={pageClass}><div className={contentClass}><RecapControls {...props} /></div></main></AppShell>
    </SearchParamsContext.Provider>
  </PathnameContext.Provider>,
);
