import "server-only";
type Metadata = { worker?: string; jobId?: string; movieId?: string; requestId?: string; errorCode?: string; field?: string; model?: string; attempt?: number; status?: number; durationMs?: number; runtimeMs?: number; modelCalls?: number; inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number };
export function log(level: "info" | "warn" | "error", event: string, metadata: Metadata = {}) {
  const safe: Record<string, string | number> = {};
  const allowed = ["worker", "jobId", "movieId", "requestId", "errorCode", "field", "model", "attempt", "status", "durationMs", "runtimeMs", "modelCalls", "inputTokens", "outputTokens", "totalTokens", "costUsd"];
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowed.includes(key)) continue;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) safe[key] = value;
    else if (typeof value === "string" && value.length <= 240 && /^[a-zA-Z0-9_.:/%+-]+$/.test(value) && !/sk-|:\/\//i.test(value)) safe[key] = value;
  }
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event: /^[a-z0-9_]+$/.test(event) ? event : "application_event", ...safe }));
}
