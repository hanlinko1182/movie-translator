import "server-only";
import { prisma } from "@/lib/prisma";
import { buildDashboard, dashboardSelect } from "./dashboard-model";

export async function readDashboard() {
  // One consistent read-only snapshot, with bulk review aggregation instead of
  // long subtitle arrays or separate application queries for each project.
  return prisma.$transaction(async (database) => {
    const projects = await database.project.findMany({ select: dashboardSelect });
    const translationIds = projects.flatMap((project) => project.movies[0]?.translation?.id ?? []);
    const counts = translationIds.length ? await database.translatedSegment.groupBy({
      by: ["translationId", "reviewStatus"],
      where: { translationId: { in: translationIds } },
      _count: { _all: true },
    }) : [];
    return buildDashboard(projects, counts);
  }, { isolationLevel: "RepeatableRead" });
}
