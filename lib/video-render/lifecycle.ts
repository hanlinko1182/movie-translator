import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { DISPATCH_LEASE_MS, RENDER_ATTEMPT_LIMIT, RENDER_LEASE_MS, parseRenderReference, type RenderJobReference } from "./job-contract";

async function lockedJob(transaction: Prisma.TransactionClient, id: string) {
  await transaction.$queryRaw`SELECT id FROM "RenderJob" WHERE id = ${id} FOR UPDATE`;
  return transaction.renderJob.findUnique({ where: { id }, include: { dispatch: true } });
}

export async function claimRenderDispatch(id: string) {
  return prisma.$transaction(async (tx) => {
    const job = await lockedJob(tx, id);
    const now = new Date();
    if (!job || job.state !== "QUEUED" || !job.dispatch || job.dispatch.deferredAt || job.dispatch.nextDispatchAt > now ||
      (job.dispatch.dispatchLeaseUntil && job.dispatch.dispatchLeaseUntil > now)) return null;
    const token = randomUUID();
    await tx.renderDispatch.update({ where: { renderJobId: id }, data: {
      generation: job.generation, dispatchToken: token, dispatchLeaseUntil: new Date(now.getTime() + DISPATCH_LEASE_MS),
    } });
    return { reference: { renderJobId: id, generation: job.generation }, token };
  });
}

export async function finishRenderDispatch(reference: RenderJobReference, token: string, result: "PUBLISHED" | "UNAVAILABLE" | "TERMINAL") {
  return prisma.$transaction(async (tx) => {
    const job = await lockedJob(tx, reference.renderJobId);
    const now = new Date();
    if (!job?.dispatch || job.generation !== reference.generation || job.dispatch.generation !== reference.generation ||
      job.dispatch.dispatchToken !== token || !job.dispatch.dispatchLeaseUntil || job.dispatch.dispatchLeaseUntil <= now) return false;
    if (result === "TERMINAL" && job.state === "QUEUED" && !job.dispatch.deferredAt) {
      await tx.renderJob.update({ where: { id: job.id }, data: { state: "FAILED", failedAt: now, errorCode: "RENDER_FAILED" } });
    }
    const failures = result === "UNAVAILABLE" ? job.dispatch.dispatchFailures + 1 : 0;
    await tx.renderDispatch.update({ where: { renderJobId: job.id }, data: {
      dispatchToken: null, dispatchLeaseUntil: null, dispatchFailures: failures,
      ...(result === "PUBLISHED" ? { dispatchedAt: now } : {}),
      nextDispatchAt: new Date(now.getTime() + (failures ? Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5)) : 30_000)),
    } });
    return true;
  });
}

export async function claimRenderAttempt(value: RenderJobReference) {
  const reference = parseRenderReference(value);
  return prisma.$transaction(async (tx) => {
    const job = await lockedJob(tx, reference.renderJobId);
    if (!job || job.generation !== reference.generation || !job.dispatch || job.dispatch.generation !== reference.generation ||
      job.dispatch.deferredAt || ["FAILED", "CANCELLED", "COMPLETED"].includes(job.state)) return { disposition: "IGNORED" as const };
    if (job.state === "ACTIVE") return { disposition: "BUSY" as const };
    const now = new Date();
    if (job.attempts >= RENDER_ATTEMPT_LIMIT) {
      await tx.renderJob.update({ where: { id: job.id }, data: { state: "FAILED", failedAt: now, errorCode: "RENDER_FAILED" } });
      return { disposition: "IGNORED" as const };
    }
    const token = randomUUID();
    await tx.renderJob.update({ where: { id: job.id }, data: { state: "ACTIVE", attempts: { increment: 1 }, startedAt: now } });
    await tx.renderDispatch.update({ where: { renderJobId: job.id }, data: { activeToken: token, activeLeaseUntil: new Date(now.getTime() + RENDER_LEASE_MS), heartbeatAt: now } });
    return { disposition: "CLAIMED" as const, token };
  });
}

async function ownedAttempt(tx: Prisma.TransactionClient, reference: RenderJobReference, token: string) {
  const job = await lockedJob(tx, reference.renderJobId);
  return job?.state === "ACTIVE" && job.generation === reference.generation && job.dispatch?.generation === reference.generation &&
    job.dispatch.activeToken === token && job.dispatch.activeLeaseUntil && job.dispatch.activeLeaseUntil > new Date() ? job : null;
}
export async function heartbeatRenderAttempt(reference: RenderJobReference, token: string) {
  return prisma.$transaction(async (tx) => {
    if (!await ownedAttempt(tx, reference, token)) return false;
    const now = new Date();
    await tx.renderDispatch.update({ where: { renderJobId: reference.renderJobId }, data: { heartbeatAt: now, activeLeaseUntil: new Date(now.getTime() + RENDER_LEASE_MS) } });
    return true;
  });
}
export async function deferRenderAttempt(reference: RenderJobReference, token: string) {
  return prisma.$transaction(async (tx) => {
    if (!await ownedAttempt(tx, reference, token)) return false;
    await tx.renderDispatch.update({ where: { renderJobId: reference.renderJobId }, data: { deferredAt: new Date(), activeToken: null, activeLeaseUntil: null } });
    await tx.renderJob.update({ where: { id: reference.renderJobId }, data: { state: "QUEUED" } });
    return true;
  });
}

// Safe here because this phase never starts a child process. Phase 21.2C must
// terminate/fence the old process before recovery can permit another encoding.
export async function recoverStaleRenderAttempt(id: string) {
  return prisma.$transaction(async (tx) => {
    const job = await lockedJob(tx, id);
    const now = new Date();
    if (!job || job.state !== "ACTIVE" || !job.dispatch || (job.dispatch.activeLeaseUntil && job.dispatch.activeLeaseUntil > now)) return false;
    const exhausted = job.attempts >= RENDER_ATTEMPT_LIMIT || job.generation >= 2_147_483_646;
    await tx.renderJob.update({ where: { id }, data: {
      state: exhausted ? "FAILED" : "QUEUED", ...(exhausted ? { failedAt: now, errorCode: "RENDER_FAILED" } : { generation: { increment: 1 } }),
    } });
    await tx.renderDispatch.update({ where: { renderJobId: id }, data: {
      generation: exhausted ? job.generation : job.generation + 1, activeToken: null, activeLeaseUntil: null,
      dispatchToken: null, dispatchLeaseUntil: null, dispatchedAt: null, dispatchFailures: 0, deferredAt: null, nextDispatchAt: now,
    } });
    return true;
  });
}
