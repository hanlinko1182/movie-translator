import "server-only";
import { canonicalJson, contractHash } from "../../canonical";
import { array, fail, freeze, id, integer, record, text, unique } from "../../validation";
import { captureVoiceJson, parseNarrationReference } from "./reference";
import { parseSyntheticVoiceCapability } from "./capability";
import { VOICE_FOUNDATION as V, type VoiceChunk, type VoicePlan, type VoicePlanInput, type VoiceSectionInput } from "./contracts";

function plainText(value: unknown, path: string, separator = false) {
  const t = text(value, separator ? 64 : 1200, path, separator);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u.test(t) ||
    (separator ? /[^\t\r\n ]/u.test(t) : !/\p{Script=Myanmar}/u.test(t))) fail("INVALID_TEXT", path);
  return t;
}
function sections(value: unknown): VoiceSectionInput[] {
  let total = 0;
  const result = array(value, 60, "voice.sections", 1).map((raw, index) => {
    const r = record(raw, ["sectionId", "order", "paragraphs", "separators"], "voice.section");
    const paragraphs = array(r.paragraphs, 12, "voice.paragraphs", 1).map(v => plainText(v, "voice.paragraph"));
    const separators = array(r.separators, 11, "voice.separators").map(v => plainText(v, "voice.separator", true));
    if (integer(r.order, "voice.section.order", 59) !== index || separators.length !== paragraphs.length - 1) fail("INVALID_ORDER", "voice.sections");
    const count = paragraphs.reduce((n, p) => n + [...p].length, 0); total += count;
    if (count > 1200 || total > 36000) fail("SIZE_LIMIT", "voice.text");
    return { sectionId: id(r.sectionId, "voice.section.id"), order: index, paragraphs, separators };
  });
  unique(result, s => s.sectionId, "voice.sections"); return result;
}
export function sectionSpeechText(section: VoicePlanInput["sections"][number] | VoicePlan["plan"]["sections"][number]) {
  return section.paragraphs.map((p, i) => p + (section.separators[i] ?? "")).join("");
}
/** Deterministic for the recorded Unicode/ICU policy. No I/O or duration guess. */
export function planMyanmarVoice(value: unknown): VoicePlan {
  const input = record(captureVoiceJson(value), ["reference", "sections", "capability"], "voice.plan.input");
  const reference = parseNarrationReference(input.reference), capability = parseSyntheticVoiceCapability(input.capability), source = sections(input.sections);
  const segmenter = new Intl.Segmenter("my", { granularity: "grapheme" });
  const unicodeVersion = process.versions.unicode, icuVersion = process.versions.icu;
  if (!unicodeVersion || !icuVersion) fail("INVALID_ENUM", "voice.segmentation");
  const segmentation = { algorithm: "INTL_MY_EXTENDED_GRAPHEME" as const, unicodeVersion, icuVersion };
  const chunks: VoiceChunk[] = [], sectionHashes: { sectionId: string; textHash: string }[] = [];
  for (const section of source) {
    const exact = sectionSpeechText(section), preferred = new Set<number>(); let cursor = 0;
    for (let i = 0; i < section.paragraphs.length; i++) {
      cursor += section.paragraphs[i].length; preferred.add(cursor);
      cursor += section.separators[i]?.length ?? 0; preferred.add(cursor);
    }
    // Whole-section segmentation prevents a paragraph/separator edge from
    // accidentally cutting a CRLF, combining sequence or conjunct cluster.
    const boundaries = [{ offset: 0, bytes: 0 }]; let bytes = 0;
    for (const { segment, index } of segmenter.segment(exact)) {
      const size = Buffer.byteLength(segment, "utf8");
      if (size > capability.maxChunkBytes) fail("SIZE_LIMIT", "voice.indivisibleGrapheme");
      bytes += size; boundaries.push({ offset: index + segment.length, bytes });
    }
    const firstIndex = chunks.length; let start = 0;
    while (start < boundaries.length - 1) {
      let end = start, paragraphEnd = start;
      while (end + 1 < boundaries.length && boundaries[end + 1].bytes - boundaries[start].bytes <= capability.maxChunkBytes) {
        end++; if (preferred.has(boundaries[end].offset)) paragraphEnd = end;
      }
      if (end === start) fail("SIZE_LIMIT", "voice.indivisibleGrapheme");
      if (paragraphEnd > start) end = paragraphEnd;
      const startUtf16 = boundaries[start].offset, endUtf16 = boundaries[end].offset, chunkText = exact.slice(startUtf16, endUtf16);
      chunks.push({ index: chunks.length, sectionId: section.sectionId, sectionOrder: section.order, sectionChunkIndex: chunks.length - firstIndex,
        sectionChunkCount: 0, startUtf16, endUtf16, text: chunkText, utf8Bytes: Buffer.byteLength(chunkText, "utf8"), textHash: contractHash(V.text, chunkText) });
      if (chunks.length > V.maxChunks) fail("SIZE_LIMIT", "voice.chunks");
      start = end;
    }
    for (let i = firstIndex; i < chunks.length; i++) chunks[i].sectionChunkCount = chunks.length - firstIndex;
    sectionHashes.push({ sectionId: section.sectionId, textHash: contractHash(V.section, exact) });
  }
  const plan = { schemaVersion: V.plan, execution: "FAKE_ONLY" as const, reference, sections: source, capability, segmentation, sectionHashes, chunks, estimatedDurationMs: null };
  canonicalJson(plan, V.maxBytes);
  return freeze({ plan, planHash: contractHash(V.plan, plan) });
}
/** Replay validation checks every boundary/index/hash, not a caller's planHash. */
export function validateVoicePlan(value: unknown): VoicePlan {
  const r = record(captureVoiceJson(value), ["plan", "planHash"], "voice.plan");
  const p = record(r.plan, ["schemaVersion", "execution", "reference", "sections", "capability", "segmentation", "sectionHashes", "chunks", "estimatedDurationMs"], "voice.plan.payload");
  const expected = planMyanmarVoice({ reference: p.reference, sections: p.sections, capability: p.capability });
  if (canonicalJson(r) !== canonicalJson(expected)) fail("RECEIPT_BINDING_INVALID", "voice.plan");
  return expected;
}
export function reconstructVoiceSections(value: unknown) {
  const { plan } = validateVoicePlan(value);
  return freeze(plan.sections.map(s => ({ sectionId: s.sectionId, text: plan.chunks.filter(c => c.sectionId === s.sectionId).map(c => c.text).join("") })));
}
