import "server-only";
import { boundedJson } from "@/lib/request-body";
import { RenderError } from "./contracts";
import { assertRenderScope, readRenderJob } from "./api";
import { operateRenderJob } from "./lifecycle";
import { publishRenderSubmission } from "./dispatch";

export async function renderOperation(request: Request, projectId: string, movieId: string, renderId: string, operation: "cancel" | "retry") {
  try {
    const value = await boundedJson(request, 128);
    if (!value || typeof value !== "object" || Array.isArray(value) || Reflect.ownKeys(value).length) throw new Error();
  } catch { throw new RenderError("INVALID_RENDER_OPERATION"); }
  await assertRenderScope(projectId, movieId);
  await operateRenderJob(projectId, movieId, renderId, operation);
  if (operation === "retry") await publishRenderSubmission(renderId);
  return readRenderJob(projectId, movieId, renderId);
}
