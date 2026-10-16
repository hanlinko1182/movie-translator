import "server-only";
import type { createStoryTaskReader, StoryTaskReadStatus } from "./read";
import { taskScope, type StoryTaskScope } from "./service-boundary";
import { id } from "../validation";

/** A real adapter must derive this from an authenticated server session and
 * verify the exact persisted Project → Movie → Studio relationship. The
 * request's headers, body and route IDs cannot themselves produce a principal. */
export type StoryTaskOperatorAuthority<Principal extends object> = Readonly<{
  authenticate(request: Request): Promise<Principal | null>;
  canRead(principal: Principal, scope: StoryTaskScope): Promise<boolean>;
  canCreate(principal: Principal, scope: StoryTaskScope): Promise<boolean>;
  canSpend(principal: Principal, binding: Readonly<{
    scope: StoryTaskScope; canonicalRecipe: string; recipeHash: string; sourceSnapshotId: string;
    scriptVersionId: string | null; expectedStudioRevision: number; profileHash: string;
    costPolicyHash: string; quoteMaxUsdMicros: number; generation: number; idempotencyKey: string;
  }>): Promise<boolean>;
  canCancel(principal: Principal, scope: StoryTaskScope, taskId: string): Promise<boolean>;
}>;

type Reader = Pick<ReturnType<typeof createStoryTaskReader>, "list" | "get">;
type Params = { id: string; movieId: string; studioId: string; taskId?: string };
type Context = { params: Promise<Params> };
const safeHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie, Authorization" };
function error(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: safeHeaders });
}
const unavailable = () => error("STORYLINE_TASKS_UNAVAILABLE", "Storyline tasks are not enabled", 503);
function project(value: StoryTaskReadStatus) {
  // Explicit HTTP allowlist. Synthetic result existence is not presented as a
  // real AI candidate or as current/approved Storyline content.
  return { taskId: value.taskId, kind: value.kind, state: value.state, generation: value.generation,
    createdAt: value.createdAt, stateChangedAt: value.stateChangedAt, errorCode: value.errorCode,
    usage: { classification: value.usage.classification, inputTokens: value.usage.inputTokens,
      outputTokens: value.usage.outputTokens, costUsdMicros: value.usage.costUsdMicros } };
}
function page(request: Request) {
  const url = new URL(request.url);
  if (url.search.length > 512 || [...url.searchParams.keys()].some(key => key !== "limit" && key !== "afterTaskId") ||
    url.searchParams.getAll("limit").length > 1 || url.searchParams.getAll("afterTaskId").length > 1) throw new Error("Invalid page");
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit !== null && !/^[1-9][0-9]?$/.test(rawLimit)) throw new Error("Invalid limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (limit > 50) throw new Error("Invalid limit");
  const cursor = url.searchParams.get("afterTaskId");
  return { afterTaskId: cursor === null ? null : id(cursor, "page.afterTaskId"), limit };
}

/** Explicit server composition. The production routes pass no adapter and no
 * datasource, so neither an env flag nor an HTTP value can enable reads/writes.
 * Only disposable tests inject a synthetic authority and restricted reader. */
export function createScopedStoryTaskApi<Principal extends object>(dependencies?: Readonly<{
  authority: StoryTaskOperatorAuthority<Principal>; reader: Reader;
}>) {
  const ready = !!dependencies && typeof dependencies.authority?.authenticate === "function" &&
    typeof dependencies.authority?.canRead === "function" && typeof dependencies.reader?.list === "function" &&
    typeof dependencies.reader?.get === "function";
  async function read(request: Request, context: Context, one: boolean): Promise<Response> {
    if (!ready || !dependencies) return unavailable();
    let principal: Principal | null;
    try { principal = await dependencies.authority.authenticate(request); }
    catch { return unavailable(); }
    if (!principal) return error("STORYLINE_AUTH_REQUIRED", "Authentication required", 401);
    let scope: StoryTaskScope, taskId: string | null = null, pagination: ReturnType<typeof page> | null = null;
    try {
      const params = await context.params;
      scope = taskScope({ projectId: params.id, movieId: params.movieId, studioId: params.studioId });
      if (one) {
        taskId = id(params.taskId, "route.taskId");
        if (new URL(request.url).search) throw new Error("Unexpected query");
      } else pagination = page(request);
    } catch {
      return error("STORYLINE_INVALID_REQUEST", "Invalid Storyline task request", 400);
    }
    try {
      if (!await dependencies.authority.canRead(principal, scope))
        return error("STORYLINE_TASKS_NOT_FOUND", "Storyline tasks not found", 404);
    } catch { return unavailable(); }
    try {
      if (one) {
        const item = await dependencies.reader.get({ scope, taskId });
        return item ? Response.json({ data: project(item) }, { headers: safeHeaders }) :
          error("STORYLINE_TASK_NOT_FOUND", "Storyline task not found", 404);
      }
      const result = await dependencies.reader.list({ scope, ...pagination! });
      return Response.json({ data: { items: result.items.map(project), nextAfterTaskId: result.nextAfterTaskId } }, { headers: safeHeaders });
    } catch { return error("STORYLINE_STATUS_UNAVAILABLE", "Unable to read Storyline task status", 503); }
  }
  return Object.freeze({
    list: (request: Request, context: Context) => read(request, context, false),
    one: (request: Request, context: Context) => read(request, context, true),
    // No production authenticated spending authority or deployment gate exists.
    // Keep all HTTP mutations nonexecutable even in synthetic read tests.
    disabledMutation: async (request: Request, context: Context) => {
      void request; void context;
      return unavailable();
    },
  });
}
