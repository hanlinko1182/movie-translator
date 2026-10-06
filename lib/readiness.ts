import "server-only";
import { execFile } from "node:child_process";
import Redis from "ioredis";
import { roleRequirements, validateRuntime, type RuntimeRole } from "./env";
import { redisConnection } from "./queue/connection";
export async function databaseCheck() {
  const { prisma } = await import("./prisma");
  await prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT 1`; }, { maxWait: 2000, timeout: 3000 });
}
export async function redisCheck() {
  const client = new Redis({ ...redisConnection("producer"), lazyConnect: true });
  client.on("error", () => {}); // diagnostics stay controlled at the caller
  try { await client.connect(); if (await client.ping() !== "PONG") throw new Error("REDIS_UNAVAILABLE"); }
  finally { client.disconnect(); }
}
export function binaryCheck(binary: "ffmpeg" | "ffprobe") {
  return new Promise<void>((accept, reject) => execFile(binary, ["-version"], { shell: false, timeout: 3000, maxBuffer: 65536, windowsHide: true }, (error) => error ? reject(new Error("BINARY_UNAVAILABLE")) : accept()));
}
export async function storageCheck() { const { localStorage } = await import("./storage"); await localStorage.check(); }
export async function boundedCheck(check: () => Promise<void>, timeoutMs = 4000) {
  let timer: NodeJS.Timeout | undefined;
  try { await Promise.race([check(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("READINESS_TIMEOUT")), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export type ReadinessChecks = Record<string, () => Promise<void>>;
export class ReadinessError extends Error {
  constructor(readonly component: string) { super("RUNTIME_NOT_READY"); this.name = "ReadinessError"; }
}
export async function readiness(checks: ReadinessChecks = { database: databaseCheck, redis: redisCheck, storage: storageCheck, ffmpeg: () => binaryCheck("ffmpeg"), ffprobe: () => binaryCheck("ffprobe") }) {
  const states: Record<string, "ok" | "unavailable"> = {};
  await Promise.all(Object.entries(checks).map(async ([name, check]) => { try { await boundedCheck(check); states[name] = "ok"; } catch { states[name] = "unavailable"; } }));
  const ready = Object.values(states).every((state) => state === "ok");
  return { status: ready ? "ready" : "not_ready", checks: states };
}
export async function startupCheck(role: RuntimeRole) {
  validateRuntime(role);
  const needs = roleRequirements[role];
  if (needs.storage) { const { localStorage } = await import("./storage"); await localStorage.initialize(); }
  const checks: ReadinessChecks = { database: databaseCheck, redis: redisCheck };
  if (needs.storage) checks.storage = storageCheck;
  if (needs.binaries) { checks.ffmpeg = () => binaryCheck("ffmpeg"); checks.ffprobe = () => binaryCheck("ffprobe"); }
  const result = await readiness(checks);
  if (result.status !== "ready") throw new ReadinessError(Object.keys(result.checks).find((key) => result.checks[key] !== "ok") ?? "runtime");
}
