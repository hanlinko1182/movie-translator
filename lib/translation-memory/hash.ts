import "server-only";

import { createHash } from "node:crypto";
import { normalizeMemorySource } from "@/lib/translation-memory/normalize";

export function sourceTextHash(text: string) {
  return createHash("sha256").update(normalizeMemorySource(text), "utf8").digest("hex");
}
