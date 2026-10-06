import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { normalizeMemorySource, normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";
import type { TranslationResult, TranslationSegment } from "@/lib/translation/types";

export async function findExactMemoryMatches(
  projectId: string,
  sourceLanguage: string,
  targetLanguage: string,
  texts: string[],
): Promise<Map<string, string>> {
  const hashes = [...new Set(texts.map(sourceTextHash))];
  const matches = new Map<string, string>();
  for (let offset = 0; offset < hashes.length; offset += 500) {
    const entries = await prisma.translationMemoryEntry.findMany({
      where: {
        projectId,
        sourceLanguage: normalizeTerminologyLanguage(sourceLanguage),
        targetLanguage: normalizeTerminologyLanguage(targetLanguage),
        sourceHash: { in: hashes.slice(offset, offset + 500) },
      },
      select: { sourceText: true, sourceHash: true, targetText: true },
    });
    for (const entry of entries) {
      const normalized = normalizeMemorySource(entry.sourceText);
      if (sourceTextHash(normalized) === entry.sourceHash && entry.targetText.trim()) {
        matches.set(normalized, entry.targetText.trim());
      }
    }
  }
  return matches;
}

export async function captureTranslationMemory(
  transaction: Prisma.TransactionClient,
  projectId: string,
  source: TranslationSegment[],
  result: TranslationResult,
) {
  const sourceLanguage = normalizeTerminologyLanguage(result.sourceLanguage);
  const targetLanguage = normalizeTerminologyLanguage(result.targetLanguage);
  const pairs = new Map<string, Prisma.TranslationMemoryEntryCreateManyInput>();
  source.forEach((segment, index) => {
    const sourceText = normalizeMemorySource(segment.text);
    const sourceHash = sourceTextHash(sourceText);
    // The first sequence wins when a movie repeats the same normalized line.
    if (!pairs.has(sourceHash)) {
      pairs.set(sourceHash, {
        projectId, sourceLanguage, targetLanguage, sourceText, sourceHash,
        targetText: result.segments[index].text,
      });
    }
  });
  // Preserve existing pairs, including manual corrections, on automatic reruns.
  await transaction.translationMemoryEntry.createMany({
    data: [...pairs.values()],
    skipDuplicates: true,
  });
}
