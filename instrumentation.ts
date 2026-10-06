export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRuntime } = await import("./lib/env");
    validateRuntime("web");
    const { localStorage } = await import("./lib/storage");
    await localStorage.initialize();
    // Liveness remains independent of live dependencies; /api/ready gates traffic.
  }
}
