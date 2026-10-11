import type { RecapRetryRequest } from "./recovery";
import { recapErrorMessage } from "./types";

export async function recapRequest<T>(url: string, options: { signal?: AbortSignal; retry?: RecapRetryRequest; submit?: boolean } = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher(url, {
    method: options.submit || options.retry ? "POST" : "GET", cache: "no-store", signal: options.signal,
    ...(options.retry ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.retry) } : {}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(recapErrorMessage(body.error?.code) ?? "Unable to access recap; please refresh status and check worker/provider configuration");
  return body.data;
}

// Synchronous guard: React's disabled state alone does not fence two clicks in
// the same event turn. Each component/movie owns its own gate.
export function recapSubmissionGate() {
  let busy = false;
  return {
    async run(confirmed: boolean, task: () => Promise<void>) {
      if (!confirmed || busy) return;
      busy = true;
      try { await task(); } finally { busy = false; }
    },
  };
}
