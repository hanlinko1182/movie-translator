import type { TranslationGlossaryRule } from "@/lib/translation/types";
import type { QcFinding } from "@/lib/translation-qc/types";
import { normalizeMemorySource } from "@/lib/translation-memory/normalize";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const length = (text: string) => [...graphemes.segment(text.trim())].length;

export function checkTranslation(source: string, target: string, glossary: TranslationGlossaryRule[] = []): QcFinding[] {
  const findings: QcFinding[] = [];
  const add = (category: QcFinding["category"], message: string, severity: QcFinding["severity"] = "WARNING") => findings.push({ category, message, severity });
  const sourceLength = length(source); const targetLength = length(target);
  if (!target.trim()) add("EMPTY_OUTPUT", "Target text is empty and needs review.", "ERROR");
  else {
    if (targetLength > Math.max(200, sourceLength * 8)) add("EXCESSIVE_LENGTH", `Target has ${targetLength} graphemes for ${sourceLength} source graphemes; unusually long output may need review.`);
    if (sourceLength >= 20 && targetLength < Math.max(4, sourceLength * 0.12)) add("POSSIBLE_OMISSION", `Target has ${targetLength} graphemes for ${sourceLength} source graphemes; dialogue may be missing.`);
  }
  const targetNumbers = new Set(numbers(target));
  const missing = [...new Set(numbers(source))].filter((value) => !targetNumbers.has(value));
  if (missing.length) add("NUMBER_MISMATCH", `Numeric values not found in target: ${missing.slice(0, 10).join(", ")}. Written number words are not interpreted; review before correcting.`);
  if (/^\s*(?:#{1,6}\s|```|[-*]\s)/mu.test(target) || /^\s*(?:translation|explanation|translator['’]s note|here is the translation)\s*:/iu.test(target)) add("MARKDOWN_OR_COMMENTARY", "Target contains Markdown-like formatting or a commentary prefix; subtitle dialogue may need review.");
  for (const entry of glossary) {
    if (source.includes(entry.sourceText) && !target.includes(entry.targetText)) add("GLOSSARY_MISMATCH", `Expected glossary mapping “${entry.sourceText}” → “${entry.targetText}” is absent; review its applicability.`);
  }
  const leaked = source.match(/\p{Script=Han}{6,}/gu)?.find((span) => target.includes(span) && !glossary.some((entry) => entry.targetText.includes(span)));
  if (leaked) add("SOURCE_TARGET_MISMATCH", `Target repeats a source Chinese span of ${leaked.length} characters; it may be untranslated or intentional quoted dialogue.`);
  // General evidence signals, without claiming to understand the dialogue's semantics.
  const explanation = /\p{Script=Han}/u.test(source) && /\b(?:means?|meaning|explain)\b/iu.test(source) && (source.match(/[A-Za-z]+/gu)?.length ?? 0) >= 4;
  const questionCount = source.match(/[?？]/gu)?.length ?? 0;
  let repeatedTerm = false;
  if (questionCount >= 2) {
    const terms = new Map<string, number>();
    for (const run of source.match(/\p{Script=Han}+/gu) ?? []) {
      for (let index = 0; index + 2 <= run.length; index++) {
        const term = run.slice(index, index + 2);
        terms.set(term, (terms.get(term) ?? 0) + 1);
      }
    }
    repeatedTerm = [...terms.values()].some((count) => count >= 4);
  }
  if (explanation || repeatedTerm) add("AMBIGUOUS_OR_WORDPLAY", explanation ? "Source mixes Chinese with an English explanation of meaning; nuance or wordplay may benefit from human review." : "Source repeats a Chinese term at least four times with multiple questions; ambiguity or repetition may benefit from human review.", "INFO");
  return findings.filter((finding, index, all) => all.findIndex((other) => other.category === finding.category) === index);
}

export function checkTranslationRows(rows: { sourceText: string; text: string }[], glossary: TranslationGlossaryRule[]) {
  const findings = rows.map((row) => checkTranslation(row.sourceText, row.text, glossary));
  const grouped = new Map<string, number[]>();
  rows.forEach((row, index) => {
    if (length(row.text) < 30 || length(row.sourceText) < 10) return;
    const key = normalizeMemorySource(row.text);
    grouped.set(key, [...(grouped.get(key) ?? []), index]);
  });
  for (const indexes of grouped.values()) {
    if (new Set(indexes.map((index) => normalizeMemorySource(rows[index].sourceText))).size < 2) continue;
    for (const index of indexes) findings[index].push({ category: "SUSPICIOUS_REPETITION", severity: "WARNING", message: "Identical long target text appears for different source lines; this may be intentional, but needs review." });
  }
  return findings;
}

function numbers(text: string) {
  const normalized = text.replace(/[၀-၉]/gu, (digit) => String(digit.charCodeAt(0) - 0x1040))
    .replace(/[０-９]/gu, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/gu, (value) => value.replaceAll(",", ""));
  return (normalized.match(/\d+(?:\.\d+)?/gu) ?? []).map((value) => {
    const [integer, fraction = ""] = value.split(".");
    const digits = integer.replace(/^0+(?=\d)/u, "");
    const decimals = fraction.replace(/0+$/u, "");
    // Preserve long numeric strings without floating-point rounding.
    return decimals ? `${digits}.${decimals}` : digits;
  });
}
