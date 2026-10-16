import { createScopedStoryTaskApi } from "@/lib/storyline/jobs/api-boundary";

export const runtime = "nodejs";
const api = createScopedStoryTaskApi();
export const GET = api.one;
