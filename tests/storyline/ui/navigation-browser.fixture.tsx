// UI-only synthetic fixture. No application server, database, tasks or providers.
import { createRoot } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import AppShell from "@/components/layout/app-shell";
import RecapControls from "@/app/projects/[id]/recap/RecapControls";
import RecapStudioShell from "@/components/storyline/recap-studio-shell";
import { pageClass, contentClass } from "@/components/ui/styles";
import { recapProps } from "../../recap/recovery.fixture";
import { studioContext, recapPath, completedRecapProps } from "./navigation.fixture";

const query = new URLSearchParams(location.search);
const empty = query.has("empty");
const context = empty ? { ...studioContext, movie: null, transcriptState: "MISSING" as const, transcriptSegmentCount: 0, sceneCount: 0, characterState: "ABSENT" as const } : studioContext;
createRoot(document.getElementById("root")!).render(
  <PathnameContext.Provider value={recapPath}><SearchParamsContext.Provider value={query}>
    <AppShell><main className={pageClass}><div className={contentClass}>
      <RecapStudioShell context={context} recapPath={recapPath} query={query.toString()}><RecapControls {...(query.has("completed") ? completedRecapProps : recapProps)} /></RecapStudioShell>
    </div></main></AppShell>
  </SearchParamsContext.Provider></PathnameContext.Provider>,
);
