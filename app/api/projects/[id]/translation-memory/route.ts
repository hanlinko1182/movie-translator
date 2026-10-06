import { terminologyCollection } from "@/lib/terminology-api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id: slug } = await context.params;
  return terminologyCollection(request, slug, "translation-memory");
}

export async function POST(request: Request, context: Context) {
  const { id: slug } = await context.params;
  return terminologyCollection(request, slug, "translation-memory");
}
