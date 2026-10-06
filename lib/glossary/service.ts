import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";
import type { TranslationGlossaryRule } from "@/lib/translation/types";

export async function getRelevantGlossaryEntries(
  projectId: string,
  sourceLanguage: string,
  targetLanguage: string,
  texts: string[],
): Promise<TranslationGlossaryRule[]> {
  const candidates = await prisma.glossaryEntry.findMany({
    where: {
      projectId,
      sourceLanguage: normalizeTerminologyLanguage(sourceLanguage),
      targetLanguage: normalizeTerminologyLanguage(targetLanguage),
    },
    select: { sourceText: true, targetText: true },
  });
  return selectRelevantGlossaryEntries(candidates, texts);
}

export function selectRelevantGlossaryEntries(
  candidates: TranslationGlossaryRule[],
  texts: string[],
): TranslationGlossaryRule[] {
  const matches = candidates.filter((entry) => texts.some((text) => text.includes(entry.sourceText)))
    .sort((a, b) => b.sourceText.length - a.sourceText.length || a.sourceText.localeCompare(b.sourceText));
  const selected: TranslationGlossaryRule[] = [];
  let characters = 0;
  for (const entry of matches) {
    const size = entry.sourceText.length + entry.targetText.length;
    if (selected.length >= 20) break;
    if (characters + size > 2_000) continue;
    selected.push(entry);
    characters += size;
  }
  return selected;
}
