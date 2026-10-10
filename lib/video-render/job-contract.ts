import { parseRenderRequest, RenderError } from "./contracts";

export const RENDER_QUEUE_NAME = "movie-video-render";
export const RENDER_JOB_NAME = "render-video";
export const RENDER_ATTEMPT_LIMIT = 3;
export const RENDER_LEASE_MS = 60_000;
export const DISPATCH_LEASE_MS = 15_000;
export const RECONCILE_INTERVAL_MS = 10_000;
export type RenderJobReference = Readonly<{ renderJobId: string; generation: number }>;
export type RenderTransportReceipt = { disposition: "DEFERRED" | "IGNORED" };

export function parseRenderReference(value: unknown): RenderJobReference {
  if (!value || typeof value !== "object" || Array.isArray(value) || Reflect.ownKeys(value).length !== 2 ||
    !Object.hasOwn(value, "renderJobId") || !Object.hasOwn(value, "generation")) throw new RenderError("INVALID_RENDER_REQUEST");
  const input = value as Record<string, unknown>;
  if (typeof input.renderJobId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.renderJobId) ||
    !Number.isSafeInteger(input.generation) || (input.generation as number) < 0 || (input.generation as number) > 2_147_483_646) throw new RenderError("INVALID_RENDER_IDENTITY");
  return Object.freeze({ renderJobId: input.renderJobId, generation: input.generation as number });
}
export function renderQueueJobId(value: RenderJobReference): string {
  const reference = parseRenderReference(value);
  return `render-${reference.renderJobId}-g${reference.generation}`;
}
export function parseRenderSubmission(projectId: string, movieId: string, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Reflect.ownKeys(body).length !== 3 ||
    !["mode", "exportMode", "profileId"].every((key) => Object.hasOwn(body, key))) throw new RenderError("INVALID_RENDER_REQUEST");
  const input = body as Record<string, unknown>;
  return parseRenderRequest({ projectId, movieId, mode: input.mode, scope: input.exportMode, profileId: input.profileId });
}
