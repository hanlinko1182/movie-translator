import test from "node:test";
import assert from "node:assert/strict";
import { D, digest, myanmarText } from "./contracts.fixture";
import { corpus, passages, expectations, chunkText, validateChunks } from "./corpus.fixture";
import { fixedRequest, parseRequest } from "./harness.fixture";
import { parseSpendingProposal, proposalForTest } from "./spending.fixture";

test("six original passages retain exact UTF-8, semantic review tokens and versioned corpus identity", () => {
  const c = corpus(); assert.equal(c.payload.passages.length, 6); assert.equal(new Set(Object.values(D)).size, 7);
  assert.equal(c.corpusHash, corpus(structuredClone(passages)).corpusHash);
  for (const [i,p] of c.payload.passages.entries()) {
    assert.equal(p.text, passages[i].text); assert.equal(p.utf8Bytes, Buffer.byteLength(p.text));
    for (const token of expectations[p.id as keyof typeof expectations]) assert.ok(p.text.includes(token));
  }
  const changed = structuredClone(passages) as unknown as { id: string; topic: string; text: string }[];
  changed[0].text += " "; assert.notEqual(corpus(changed).corpusHash, c.corpusHash);
  assert.equal(c.payload.editorialApproval, "NOT_ISSUED"); assert.ok(Object.isFrozen(c.payload.passages));
});
for (let i = 0; i < 6; i++) test(`passage ${i+1}: exact reconstruction and grapheme-safe bounded chunks replay`, () => {
  const c = corpus(), p = c.payload.passages[i], request = fixedRequest(c, i);
  assert.deepEqual(parseRequest(request, c), request);
  const boundaries = new Set([0, ...Array.from(new Intl.Segmenter("my", { granularity: "grapheme" }).segment(p.text), g => g.index + g.segment.length)]);
  assert.equal(p.chunks.map(g => g.text).join(""), p.text);
  for (const g of p.chunks) { assert.ok(boundaries.has(g.startUtf16) && boundaries.has(g.endUtf16)); assert.ok(g.utf8Bytes <= 256); }
  const forged = p.chunks.map(g => ({ ...g })); forged[0].endUtf16--;
  assert.throws(() => validateChunks(p.text, forged));
});
test("unissued cost proposal uses exact integer ceiling arithmetic and reserves six worst-case requests", () => {
  const c = corpus(), p = proposalForTest(c.payload.passages.map((_,i) => fixedRequest(c,i))), parsed = parseSpendingProposal(p);
  assert.equal(parsed.worstPerRequestMicros, 205); assert.equal(parsed.maxTotalSpendMicros, 1230);
  assert.equal(parsed.authority, "UNISSUED_OFFLINE_PROPOSAL");
  const token = structuredClone(p); token.quote.components = [{ unit: "INPUT_TEXT_TOKEN", maximumUnitsPerRequest: 10, priceMicros: 500000, perUnits: 1000000 }, { unit: "OUTPUT_AUDIO_TOKEN", maximumUnitsPerRequest: 10, priceMicros: 9000000, perUnits: 1000000 }];
  assert.equal(parseSpendingProposal(token).worstPerRequestMicros, 95);
});
test("strict serialization denies getters, cycles, lossy Unicode and unsafe billable numbers", () => {
  let accessed = false; const getter = Object.defineProperty({}, "text", { enumerable: true, get() { accessed = true; return "က"; } });
  assert.throws(() => digest(D.request, getter)); assert.equal(accessed, false);
  const cycle: { self?: unknown } = {}; cycle.self = cycle;
  for (const v of [cycle, -0, NaN, 0.1, Number.MAX_SAFE_INTEGER + 1, "\ud800"]) assert.throws(() => digest(D.request, v));
  assert.throws(() => chunkText("က" + "\u1037".repeat(100)));
});
test("exact text policy rejects markup, foreign script, controls and orphan marks without rewriting", () => {
  for (const t of ["", " ", "\u1031က", "က \u1031", "က\u200b", "က\r\n", "က<script>", "က中文", "ကhello", "က\ud800", "က".repeat(1000)]) assert.throws(() => myanmarText(t));
  assert.equal(myanmarText(" က။ "), " က။ ");
});
test("Myanmar spacing vowels and tone signs remain with their bases across chunk boundaries", () => {
  const t = "ကား".repeat(20), chunks = chunkText(t,32);
  assert.equal(chunks.map(c=>c.text).join(""),t);
  for(const c of chunks) { assert.ok(c.text.startsWith("က")); assert.ok(c.text.endsWith("း")); }
});
