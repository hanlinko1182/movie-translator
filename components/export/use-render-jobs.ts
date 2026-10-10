"use client";
import { useEffect, useRef, useState } from "react";
import type { SubtitleExportMode } from "@/lib/subtitle-export/types";
import { needsRenderPolling, renderBase, renderRequest, type RenderItem } from "./render-model";

export function useRenderJobs(projectId: string, movieId?: string) {
  const [items, setItems] = useState<RenderItem[]>([]);
  const [loading, setLoading] = useState(!!movieId);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);
  const mutation = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const base = movieId ? renderBase(projectId, movieId) : "";
  useEffect(() => () => { mutation.current?.abort(); }, []);
  useEffect(() => {
    if (!movieId) return;
    const controller = new AbortController();
    reading.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let failures = 0;
    async function read() {
      try {
        const rows = await renderRequest(base, movieId!, controller.signal);
        if (controller.signal.aborted) return;
        setItems(rows); setError(""); failures = 0;
        if (needsRenderPolling(rows)) {
          if (++polls < 100) timer = setTimeout(() => void read(), 5000);
          else setNotice("Automatic status checks paused. Refresh status to continue checking.");
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Render history unavailable.");
        if (++failures < 3) timer = setTimeout(() => void read(), 5000);
        else setNotice("Automatic status checks paused. Refresh status to try again.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, movieId, refresh]);
  async function act(action: { scope: SubtitleExportMode } | { job: RenderItem; operation: "retry" | "cancel" }) {
    if (!movieId || mutation.current) return;
    const controller = new AbortController(); mutation.current = controller;
    reading.current?.abort(); setBusy("job" in action ? action.job.id : "submit"); setActionError(""); setNotice("");
    try {
      const [job] = await renderRequest(base, movieId, controller.signal, action);
      if (controller.signal.aborted) return;
      setItems((previous) => [job, ...previous.filter((item) => item.id !== job.id)].slice(0, 50));
      setNotice("scope" in action ? "Render recipe accepted. Identical inputs reuse the retained job; terminal and deferred jobs require explicit Retry or Resume." : action.operation === "retry" ? "Queued the same frozen subtitle snapshot for another attempt." : job.state === "CANCELLED" ? "Render cancelled." : "Cancellation requested; waiting for the worker to stop safely.");
    } catch (failure) {
      if (!controller.signal.aborted) setActionError(failure instanceof Error ? failure.message : "Render action failed.");
    } finally {
      mutation.current = null;
      if (!controller.signal.aborted) { setBusy(""); setRefresh((value) => value + 1); }
    }
  }
  return { items, loading, error, actionError, notice, busy, base, act, reload: () => { setNotice(""); setActionError(""); setRefresh((value) => value + 1); } };
}
