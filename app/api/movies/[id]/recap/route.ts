import { readMovieRecap } from "@/lib/recap/read-recap";
import { recapApiError } from "@/lib/recap/api-errors";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return Response.json({ data: await readMovieRecap(id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return recapApiError(error); }
}
