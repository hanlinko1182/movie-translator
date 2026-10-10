import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { Prisma as PrismaRuntime } from "@/generated/prisma/client";
import { RenderError, type RenderFailureCode } from "./contracts";
import type { VerifiedOutput } from "./probe";
import { withRenderCpuLock } from "./runner";
import { DISPATCH_LEASE_MS, RENDER_ATTEMPT_LIMIT, RENDER_LEASE_MS, parseRenderReference, type RenderJobReference } from "./job-contract";

async function lockedJob(transaction: Prisma.TransactionClient, id: string) {
  await transaction.$queryRaw`SELECT id FROM "RenderJob" WHERE id = ${id} FOR UPDATE`;
  return transaction.renderJob.findUnique({ where: { id }, include: { dispatch: true } });
}

export async function claimRenderDispatch(id: string) {
  return prisma.$transaction(async (tx) => {
    const job = await lockedJob(tx, id);
    const now = new Date();
    if (!job || job.state !== "QUEUED" || job.cancelRequestedAt || !job.dispatch || job.dispatch.deferredAt || job.dispatch.nextDispatchAt > now ||
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
    if (result === "TERMINAL" && job.state === "QUEUED" && !job.cancelRequestedAt && !job.dispatch.deferredAt) {
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
      job.cancelRequestedAt || job.dispatch.deferredAt || ["FAILED", "CANCELLED", "COMPLETED"].includes(job.state)) return { disposition: "IGNORED" as const };
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

export async function ownedAttempt(tx: Prisma.TransactionClient, reference: RenderJobReference, token: string) {
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

// Generation fences publication. The Linux inherited flock additionally fences
// CPU execution while any prior supervisor/encoder still holds the storage lock.
export async function recoverStaleRenderAttempt(id: string) {
  const recover = (cpuLocked = false) => prisma.$transaction(async (tx) => {
    const job = await lockedJob(tx, id);
    const now = new Date();
    if (!job || job.state !== "ACTIVE" || !job.dispatch || (job.dispatch.activeLeaseUntil && job.dispatch.activeLeaseUntil > now)) return false;
    const exhausted = job.attempts >= RENDER_ATTEMPT_LIMIT || job.generation >= 2_147_483_646;
    const cancelled = !!job.cancelRequestedAt;
    if (cancelled && !cpuLocked) return "CPU_LOCK_REQUIRED" as const;
    await tx.renderJob.update({ where: { id }, data: {
      state: cancelled ? "CANCELLED" : exhausted ? "FAILED" : "QUEUED", phase: null, progressPercent: null,
      ...(cancelled ? { cancelledAt: now } : exhausted ? { failedAt: now, errorCode: "RENDER_FAILED" } : { generation: { increment: 1 } }),
    } });
    await tx.renderDispatch.update({ where: { renderJobId: id }, data: {
      generation: exhausted || cancelled ? job.generation : job.generation + 1, activeToken: null, activeLeaseUntil: null,
      dispatchToken: null, dispatchLeaseUntil: null, dispatchedAt: null, dispatchFailures: 0, deferredAt: null, nextDispatchAt: now,
    } });
    return true;
  });
  const result = await recover();
  return result === "CPU_LOCK_REQUIRED" ? await withRenderCpuLock(() => recover(true)) === true : result;
}

export async function attemptControl(reference: RenderJobReference, token: string) {
  return prisma.$transaction(async (tx) => {
    const job = await ownedAttempt(tx, reference, token);
    return job ? { owned: true, cancel: !!job.cancelRequestedAt } : { owned: false, cancel: false };
  });
}
export async function updateRenderProgress(reference: RenderJobReference, token: string, phase: "preparing" | "encoding" | "verifying" | "publishing", percent: number | null = null) {
  return prisma.$transaction(async (tx) => {
    const job = await ownedAttempt(tx, reference, token);
    if (!job || job.cancelRequestedAt) return false;
    await tx.renderJob.update({ where: { id: job.id }, data: { phase, progressPercent: percent === null ? null : Math.min(99, Math.max(0, Math.floor(percent))) } });
    return true;
  });
}
export type Publication = VerifiedOutput & { storageKey: string; recipeHash: string };
export async function recordPublication(reference: RenderJobReference, token: string, publication: Publication) {
  return prisma.$transaction(async (tx) => {
    const job = await ownedAttempt(tx, reference, token);
    if (!job || job.cancelRequestedAt || job.recipeHash !== publication.recipeHash) return false;
    await tx.renderDispatch.update({ where: { renderJobId: job.id }, data: { publication } });
    return true;
  });
}
export async function completeRenderAttempt(reference: RenderJobReference, token: string, publication: Publication, projectId: string, sourceKey: string) {
  return prisma.$transaction(async (tx) => {
    const job = await ownedAttempt(tx, reference, token);
    if (!job || job.cancelRequestedAt || job.recipeHash !== publication.recipeHash) return false;
    // Lock Movie too: relationship/key changes cannot race the completion commit.
    await tx.$queryRaw`SELECT id FROM "Movie" WHERE id = ${job.movieId} FOR UPDATE`;
    const movie = await tx.movie.findUnique({ where: { id: job.movieId }, select: { projectId: true, storageKey: true } });
    if (movie?.projectId !== projectId || movie.storageKey !== sourceKey) throw new RenderError("SOURCE_MEDIA_CHANGED");
    const candidate = job.dispatch!.publication as unknown as Publication | null;
    if (!candidate || JSON.stringify(candidate) === "null" || candidate.storageKey !== publication.storageKey || candidate.sha256 !== publication.sha256) return false;
    const { recipeHash: _recipe, ...output } = publication; void _recipe;
    await tx.renderOutput.create({ data: { ...output, sizeBytes: BigInt(output.sizeBytes), renderJobId: job.id, filename: `translated-${job.id}.mp4`, verifiedAt: new Date() } });
    await tx.renderJob.update({ where: { id: job.id }, data: { state: "COMPLETED", completedAt: new Date(), phase: null, progressPercent: null, errorCode: null } });
    await tx.renderDispatch.update({ where: { renderJobId: job.id }, data: { activeToken: null, activeLeaseUntil: null, publication: PrismaRuntime.DbNull } });
    return true;
  });
}
export async function failRenderAttempt(reference: RenderJobReference, token: string, code: RenderFailureCode, transient: boolean) {
  const finish = (cpuLocked = false) => prisma.$transaction(async (tx) => {
    const job = await ownedAttempt(tx, reference, token);
    if (!job) return false;
    const cancel = !!job.cancelRequestedAt;
    if (cancel && !cpuLocked) return "CPU_LOCK_REQUIRED" as const;
    const retry = !cancel && transient && job.attempts < RENDER_ATTEMPT_LIMIT && job.generation < 2_147_483_646;
    await tx.renderJob.update({ where: { id: job.id }, data: {
      state: cancel ? "CANCELLED" : retry ? "QUEUED" : "FAILED", phase: null, progressPercent: null,
      ...(cancel ? { cancelledAt: new Date(), errorCode: null } : retry ? { generation: { increment: 1 }, errorCode: code } : { failedAt: new Date(), errorCode: code }),
    } });
    await tx.renderDispatch.update({ where: { renderJobId: job.id }, data: { activeToken: null, activeLeaseUntil: null,
      generation: retry ? job.generation + 1 : job.generation, dispatchedAt: null, dispatchToken: null, dispatchLeaseUntil: null,
      nextDispatchAt: new Date(Date.now() + 2000 * 2 ** Math.min(job.attempts, 5)),
    } });
    return true;
  });
  const result = await finish();
  if (result === "CPU_LOCK_REQUIRED") {
    // A descendant can release its inherited descriptor just after the parent
    // close event. Wait a bounded drain grace; never infer quiescence from EOF.
    const locked = await withRenderCpuLock(() => finish(true), 2000);
    return locked === true;
  }
  return result;
}
export async function operateRenderJob(projectId: string, movieId: string, renderId: string, operation: "cancel" | "retry") {
  parseRenderReference({ renderJobId: renderId, generation: 0 });
  const operate = (cpuLocked = false) => prisma.$transaction(async (tx) => {
    const job = await lockedJob(tx, renderId);
    const movie = await tx.movie.findFirst({ where: { id: movieId, projectId }, select: { id: true } });
    if (!job || job.movieId !== movieId || !movie) throw new RenderError("RENDER_NOT_FOUND");
    if (operation === "cancel") {
      if (job.state === "CANCELLED") return;
      if (!["QUEUED", "ACTIVE"].includes(job.state)) throw new RenderError("RENDER_OPERATION_CONFLICT");
      await tx.renderJob.update({ where: { id: job.id }, data: { cancelRequestedAt: new Date(),
        ...(job.state === "QUEUED" && cpuLocked ? { state: "CANCELLED", cancelledAt: new Date(), phase: null, progressPercent: null } : {}) } });
    } else {
      if (!(job.state === "FAILED" || job.state === "CANCELLED" || job.state === "QUEUED" && job.dispatch?.deferredAt) || job.generation >= 2_147_483_646) throw new RenderError("RENDER_OPERATION_CONFLICT");
      await tx.renderJob.update({ where: { id: job.id }, data: { state: "QUEUED", generation: { increment: 1 }, attempts: 0,
        cancelRequestedAt: null, cancelledAt: null, failedAt: null, errorCode: null, startedAt: null, phase: null, progressPercent: null } });
      await tx.renderDispatch.update({ where: { renderJobId: job.id }, data: { generation: job.generation + 1, deferredAt: null,
        activeToken: null, activeLeaseUntil: null, dispatchToken: null, dispatchLeaseUntil: null, dispatchedAt: null, nextDispatchAt: new Date(), dispatchFailures: 0 } });
    }
  });
  if (operation === "retry") return operate();
  const result = await withRenderCpuLock(async () => { await operate(true); return true; });
  if (result === null) await operate(false); // Request remains pending until safe drain/recovery.
}
