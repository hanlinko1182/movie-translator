import "dotenv/config";
import { ConfigurationError, type RuntimeRole, validateRuntime } from "@/lib/env";
import { log } from "@/lib/logger";
import { startupCheck, ReadinessError } from "@/lib/readiness";
const loaders = {
  media: () => import("./media-worker"), transcription: () => import("./transcription-worker"),
  translation: () => import("./translation-worker"), refinement: () => import("./translation-refinement-worker"),
  scene: () => import("./scene-detection-worker"), character: () => import("./character-analysis-worker"), recap: () => import("./recap-worker"),
  render: () => import("./render-worker"),
};
async function start() {
  const role = process.argv[2];
  if (!role || !(role in loaders)) throw new ConfigurationError("WORKER_ROLE");
  const workerRole = role as keyof typeof loaders;
  validateRuntime(workerRole as RuntimeRole);
  await startupCheck(workerRole);
  const worker = await loaders[workerRole]();
  await worker.main();
}
void start().catch(async (error: unknown) => {
  log("error", "worker_startup_failed", { errorCode: "WORKER_STARTUP_FAILED", ...(error instanceof ConfigurationError ? { field: error.field } : error instanceof ReadinessError ? { field: error.component } : {}) });
  const { disconnectPrisma } = await import("@/lib/prisma");
  await disconnectPrisma().catch(() => {});
  process.exitCode = 1;
});
