import { createScopedStoryTaskApi } from "@/lib/storyline/jobs/api-boundary";

export const runtime = "nodejs";
const api = createScopedStoryTaskApi(); // No operator authority or M2 database installed.
export const GET = api.list;
export const POST = api.disabledMutation;
