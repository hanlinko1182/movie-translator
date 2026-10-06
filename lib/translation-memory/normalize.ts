export function normalizeMemorySource(text: string) {
  return text.trim().replace(/\s+/gu, " ");
}

export function normalizeTerminologyLanguage(language: string) {
  const normalized = language.trim().toLowerCase();
  // The existing movie pipeline uses cmn for Mandarin; project defaults use zh.
  return normalized === "cmn" ? "zh" : normalized;
}
