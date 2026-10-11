import { retryRecap } from "@/lib/queue/recap-queue";
import { recapApiError } from "@/lib/recap/api-errors";
import { RecapError } from "@/lib/recap/types";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    let body: unknown;
    try { body = await request.json(); } catch { throw new RecapError("RECAP_RETRY_INVALID"); }
    return Response.json({ data: await retryRecap(id, body) }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return recapApiError(error, true); }
}
