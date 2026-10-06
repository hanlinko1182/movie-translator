import { terminologyCollection } from "@/lib/terminology-api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

// The existing [id] segment is interpreted as a public project slug here.
export async function GET(request: Request, context: Context) {
  const { id: slug } = await context.params;
  return terminologyCollection(request, slug, "glossary");
}

export async function POST(request: Request, context: Context) {
  const { id: slug } = await context.params;
  return terminologyCollection(request, slug, "glossary");
}
