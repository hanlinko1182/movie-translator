import "server-only";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { createRenderTransport, type RenderTransport } from "@/lib/queue/render-queue";
import { claimRenderDispatch, finishRenderDispatch, recoverStaleRenderAttempt } from "./lifecycle";

export async function dispatchRenderJob(id: string, transport: RenderTransport) {
  const claim = await claimRenderDispatch(id);
  if (!claim) return;
  try {
    const result = await transport.publish(claim.reference);
    await finishRenderDispatch(claim.reference, claim.token, result);
  } catch {
    log("warn", "render_dispatch_deferred", { jobId: id, errorCode: "RENDER_QUEUE_UNAVAILABLE" });
    await finishRenderDispatch(claim.reference, claim.token, "UNAVAILABLE");
  }
}

export async function publishRenderSubmission(id: string, factory = createRenderTransport) {
  let transport: RenderTransport | undefined;
  try { transport = factory(); await dispatchRenderJob(id, transport); }
  catch { log("warn", "render_dispatch_pending", { jobId: id }); }
  finally { await transport?.close(); }
}

// Each scan is bounded; nextDispatchAt and leases are the durable outbox state.
// IDs restrict integration tests/maintenance; production scans the dedicated table.
export async function reconcileRenderDispatch(options: { limit?: number; renderIds?: string[] } = {}, factory = createRenderTransport) {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("INVALID_RECONCILE_LIMIT");
  const ids = options.renderIds ? { in: options.renderIds.slice(0, 50) } : undefined;
  const expired = await prisma.renderDispatch.findMany({ where: {
    renderJobId: ids, renderJob: { state: "ACTIVE" }, OR: [{ activeLeaseUntil: null }, { activeLeaseUntil: { lte: new Date() } }],
  }, select: { renderJobId: true }, orderBy: { activeLeaseUntil: "asc" }, take: limit });
  for (const item of expired) await recoverStaleRenderAttempt(item.renderJobId);
  const pending = await prisma.renderDispatch.findMany({ where: {
    renderJobId: ids, renderJob: { state: "QUEUED" }, deferredAt: null, nextDispatchAt: { lte: new Date() },
    OR: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { lte: new Date() } }],
  }, select: { renderJobId: true }, orderBy: { nextDispatchAt: "asc" }, take: limit });
  if (!pending.length) return;
  const transport = factory();
  try { for (const item of pending) await dispatchRenderJob(item.renderJobId, transport); }
  finally { await transport.close(); }
}
