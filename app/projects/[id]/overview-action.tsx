"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, LoaderCircle, RefreshCw } from "lucide-react";
import type { OverviewAction } from "./overview-model";

const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-50";

export function RefreshOverviewButton({ label = "Refresh overview" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-violet-300 hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300 disabled:opacity-50"><RefreshCw size={13} aria-hidden="true" className={pending ? "animate-spin" : ""} />{pending ? "Refreshing…" : label}</button>;
}

// POST is exclusively an explicit user action. Rendering and refreshing only read state.
export default function OverviewActionButton({ action }: { action: OverviewAction }) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  if (action.href) return <Link href={action.href} className={buttonClass}>{action.label}<ArrowRight size={16} aria-hidden="true" /></Link>;

  async function start() {
    if (!action.endpoint || busy || submitted || (action.kind === "ai" && !acknowledged)) return;
    setBusy(true); setFeedback(""); setFailed(false);
    try {
      const response = await fetch(action.endpoint, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error("Request failed");
      const state = payload.data?.state;
      setSubmitted(true);
      setFeedback(state === "failed" ? "The existing job failed. Check the workspace and worker setup before retrying." : state === "completed" ? "This job has already completed. Refresh to check its saved output." : "Processing requested. The configured worker will handle the job. Refresh to check progress.");
      setFailed(state === "failed");
      router.refresh();
    } catch {
      setFailed(true);
      setFeedback("We couldn’t start processing. Check the source media and worker configuration, then try again.");
    } finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <p className="text-xs text-zinc-400">{action.kind === "ai" ? "AI action · may use OpenRouter" : "Local processing · media worker"}</p>
    {action.kind === "ai" && <label className="flex items-start gap-2 text-xs leading-5 text-zinc-300"><input type="checkbox" checked={acknowledged} disabled={busy || submitted} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 accent-violet-500 focus-visible:outline-2 focus-visible:outline-violet-300" />I understand this action may make paid AI requests.</label>}
    <button type="button" onClick={() => void start()} disabled={busy || submitted || (action.kind === "ai" && !acknowledged)} className={buttonClass}>{busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}{busy ? "Submitting…" : submitted ? "Request submitted" : action.label}</button>
    {feedback && <p role={failed ? "alert" : "status"} className={`max-w-lg text-sm leading-6 ${failed ? "text-amber-200" : "text-zinc-300"}`}>{feedback}</p>}
    {submitted && <button type="button" onClick={() => router.refresh()} className="block text-sm text-violet-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-violet-300">Refresh status</button>}
  </div>;
}
