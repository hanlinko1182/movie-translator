import { terminologyEntry } from "@/lib/terminology-api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; entryId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id: slug, entryId } = await context.params;
  return terminologyEntry(request, slug, entryId, "glossary");
}

export async function DELETE(request: Request, context: Context) {
  const { id: slug, entryId } = await context.params;
  return terminologyEntry(request, slug, entryId, "glossary");
}
