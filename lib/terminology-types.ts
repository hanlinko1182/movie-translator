export const glossaryCategories = [
  "CHARACTER", "PLACE", "TITLE", "ORGANIZATION", "TERM", "PHRASE", "OTHER",
] as const;

export type GlossaryCategory = typeof glossaryCategories[number];
export type TerminologyKind = "glossary" | "translation-memory";

export type TerminologyEntry = {
  id: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  category?: GlossaryCategory;
  notes?: string | null;
  sourceHash?: string;
  createdAt: string;
  updatedAt: string;
};

export function categoryLabel(category: GlossaryCategory) {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
