import "server-only";
import { D, exact, digest, equal, counter, myanmarText, dependentStart, deny, freeze } from "./contracts.fixture";

// Newly authored fictional demonstration text. Editorial/listening approval is NOT issued.
export const passages = freeze([
  { id: "p1", topic: "NARRATIVE", text: "မနက်ခင်းမှာ မိုးတိတ်သွားပြီး လမ်းငယ်ပေါ်မှာ နေရောင်ကျလာသည်။ သူငယ်ချင်းနှစ်ယောက်သည် စာကြည့်တိုက်သို့ အေးအေးဆေးဆေး လမ်းလျှောက်သွားကြသည်။" },
  { id: "p2", topic: "EMOTION_PACING", text: "သူမသည် သတင်းကောင်းကို ကြားသောအခါ ဝမ်းသာသွားသည်။ ခဏရပ်ပြီး အသက်ကို ဖြည်းဖြည်းရှူလိုက်သည်။ ထို့နောက် ကျေးဇူးတင်ကြောင်း ညင်သာစွာ ပြောလိုက်သည်။" },
  { id: "p3", topic: "UNCERTAIN_PSYCHOLOGY", text: "သူသည် တံခါးအနီးတွင် တိတ်တိတ်ဆိတ်ဆိတ် ရပ်နေသည်။ စိုးရိမ်နေခြင်း ဖြစ်နိုင်သော်လည်း ထိုအကြောင်းကို ကျွန်ုပ်တို့ မသိရသေးပါ။ တိတ်ဆိတ်နေခြင်းတစ်ခုတည်းဖြင့် သူ၏ရည်ရွယ်ချက်ကို မဆုံးဖြတ်သင့်ပါ။" },
  { id: "p4", topic: "FICTIONAL_CHINESE_NAMES", text: "ဤစိတ်ကူးယဉ်ဇာတ်လမ်းတွင် လီဝေနှင့် ချန်မင်တို့သည် စက္ကူလှေတစ်စင်းကို အတူတူ ခေါက်ကြသည်။ လီဝေက လှေကို ကိုင်ထားပြီး ချန်မင်က အပြာရောင် ခြယ်ပေးသည်။" },
  { id: "p5", topic: "NUMBERS_DATES", text: "၂၀၂၆ ခုနှစ်၊ အောက်တိုဘာလ ၂၁ ရက်နေ့တွင် စာအုပ် ၃ အုပ်ကို ရေတွက်ခဲ့သည်။ အချိန်မှာ နံနက် ၉ နာရီ ၃၀ မိနစ် ဖြစ်သည်။ စုစုပေါင်း ၁၂၅၀ ကျပ် ဖြစ်သလား။ ဟုတ်ပါသည်။" },
  { id: "p6", topic: "NEGATION_QUALIFIERS", text: "သူက မလာတော့ဘူးဟု မပြောခဲ့ပါ။ ယနေ့ မလာနိုင်သေးခြင်းသာ ဖြစ်သည်။ အားလုံး သဘောတူပြီဟုလည်း မဆိုလိုပါ။ အချို့ကသာ သဘောတူပြီး ကျန်သူများ၏ ဆုံးဖြတ်ချက်ကို စောင့်ရပါမည်။" },
] as const);
export const expectations = freeze({ p1: ["စာကြည့်တိုက်"], p2: ["ခဏရပ်", "ညင်သာစွာ"],
  p3: ["ဖြစ်နိုင်", "မသိရသေး", "မဆုံးဖြတ်သင့်"], p4: ["လီဝေ", "ချန်မင်"],
  p5: ["၂၀၂၆", "၂၁", "၃", "၉", "၃၀", "၁၂၅၀"], p6: ["မပြောခဲ့", "မလာနိုင်သေး", "အချို့ကသာ"] });
export type Chunk = { startUtf16: number; endUtf16: number; text: string; utf8Bytes: number; textHash: string };
export function chunkText(input: unknown, maxBytes = 256): readonly Chunk[] {
  const text = myanmarText(input); counter(maxBytes, 512); if (maxBytes < 32) deny("CHUNK_BOUND");
  const segmenter = new Intl.Segmenter("my", { granularity: "grapheme" }), out: Chunk[] = [];
  let start = 0, end = 0, size = 0;
  const emit = () => { if (end > start) { const part = text.slice(start, end); out.push({ startUtf16: start, endUtf16: end, text: part, utf8Bytes: size, textHash: digest(D.chunk, part) }); start = end; size = 0; } };
  // Conservative Myanmar extension: preserve every ICU cluster and additionally
  // merge dependent spacing signs / virama joins. This is not a full syllabifier.
  const groups: { segment: string; index: number }[] = [];
  for (const g of segmenter.segment(text)) {
    const previous = groups[groups.length - 1];
    if (previous && (dependentStart(g.segment) || previous.segment.endsWith("\u1039"))) previous.segment += g.segment;
    else groups.push({ segment: g.segment, index: g.index });
  }
  for (const g of groups) {
    const bytes = Buffer.byteLength(g.segment, "utf8"); if (bytes > maxBytes) deny("INDIVISIBLE_GRAPHEME");
    if (size + bytes > maxBytes) emit(); end = g.index + g.segment.length; size += bytes;
  }
  emit(); if (out.length > 64 || out.map(c => c.text).join("") !== text) deny("CHUNK_COVERAGE"); return freeze(out);
}
export function corpus(input: unknown = passages) {
  if (!Array.isArray(input) || input.length !== 6) deny("CORPUS_COUNT");
  const rows = input.map((v, i) => {
    const r = exact(v, ["id", "topic", "text"]);
    if (r.id !== passages[i].id || r.topic !== passages[i].topic) deny("CORPUS_ORDER");
    const text = myanmarText(r.text);
    return { id: r.id as string, topic: r.topic as string, text, textHash: digest(D.text, text), utf8Bytes: Buffer.byteLength(text, "utf8"), chunks: chunkText(text) };
  });
  const payload = { schemaVersion: D.corpus, origin: "NEW_NON_SENSITIVE_FICTIONAL_DEMO", editorialApproval: "NOT_ISSUED", normalization: "EXACT_UTF8_NO_NORMALIZATION_V1",
    segmentation: { algorithm: "INTL_MY_GRAPHEME_PLUS_DEPENDENT_SIGNS_V1", icu: process.versions.icu, unicode: process.versions.unicode }, maxChunkBytes: 256, passages: rows };
  if (!payload.segmentation.icu || !payload.segmentation.unicode) deny("SEGMENTER_UNAVAILABLE");
  return freeze({ payload, corpusHash: digest(D.corpus, payload) });
}
export type Corpus = ReturnType<typeof corpus>;
export function validateChunks(text: string, input: unknown) { if (!equal(input, chunkText(text))) deny("GRAPHEME_OR_HASH_BINDING"); }
