import { readMovieCharacters } from "@/lib/character-analysis/read-analysis";
import { characterApiError } from "@/lib/character-analysis/api-errors";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return Response.json({ data: await readMovieCharacters(id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return characterApiError(error); }
}
