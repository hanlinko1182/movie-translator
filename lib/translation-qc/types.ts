export type QcCategory = "EMPTY_OUTPUT" | "EXCESSIVE_LENGTH" | "POSSIBLE_OMISSION" | "NUMBER_MISMATCH" | "MARKDOWN_OR_COMMENTARY" | "GLOSSARY_MISMATCH" | "SUSPICIOUS_REPETITION" | "SOURCE_TARGET_MISMATCH" | "AMBIGUOUS_OR_WORDPLAY";
export type QcFinding = { category: QcCategory; severity: "INFO" | "WARNING" | "ERROR"; message: string };
export type QcIssueView = QcFinding & { id: string; source: string; resolvedAt: string | null; resolution: string | null };
export type QcSummary = { segmentCount: number; cleanSegments: number; flaggedSegments: number; issueCount: number; categories: Partial<Record<QcCategory, number>> };
export type ReviewStatus = "UNREVIEWED" | "NEEDS_REVIEW" | "APPROVED";
export type ReviewRow = {
  id: string; sequence: number; startMs: number; endMs: number; sourceText: string; text: string;
  provider: string | null; model: string | null; origin: string; issues: QcIssueView[];
  reviewStatus: ReviewStatus; version: string; editedAt: string | null; reviewedAt: string | null;
};
export type TranslationReview = { movieId: string; translationId: string; revision: number; sourceLanguage: string; targetLanguage: string; rows: ReviewRow[]; summary: QcSummary; qcScanned: boolean };
export type RefinementReceipt = { movieId: string; translationId: string; sequences: number[]; segmentCount: number; model: string; runtimeMs: number; modelCalls?: number; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number }; alreadyApplied?: boolean };

export function summarizeQc(rows: { issues: { category: QcCategory; resolvedAt: unknown }[] }[]): QcSummary {
  const categories: QcSummary["categories"] = {};
  let flaggedSegments = 0; let issueCount = 0;
  for (const row of rows) {
    const active = row.issues.filter((issue) => !issue.resolvedAt);
    if (active.length) flaggedSegments++;
    issueCount += active.length;
    for (const issue of active) categories[issue.category] = (categories[issue.category] ?? 0) + 1;
  }
  return { segmentCount: rows.length, cleanSegments: rows.length - flaggedSegments, flaggedSegments, issueCount, categories };
}
