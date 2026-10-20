import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { StorylineContractError } from "@/lib/storyline/validation";
import { planMyanmarVoice, reconstructVoiceSections, sectionSpeechText, validateVoicePlan } from "@/lib/storyline/voice/foundation/chunk-plan";
import { syntheticVoiceCapability } from "@/lib/storyline/voice/foundation/capability";
import { VOICE_FOUNDATION as V, type VoiceSectionInput } from "@/lib/storyline/voice/foundation/contracts";
import { voiceFoundationFixture } from "./fixture";
const data = voiceFoundationFixture();
function plan(paragraphs: string[], separators: string[], bytes: number) {
  return planMyanmarVoice({ ...data.input, sections: [{ sectionId: "section-one", order: 0, paragraphs, separators }], capability: syntheticVoiceCapability({ maxChunkBytes: bytes, voiceId: "fixture-neutral" }) });
}
test("M5-01 exact Myanmar paragraphs, spaces, tabs, CRLF, separators and Unicode round-trip without normalization", () => {
  const paragraphs = ["  မြန်မာစာ က\u1031\u102c ဖြစ်သည်။  ", "က္က င်္က 👩🏽‍💻 မြန်မာစာ\r\n\tဖြစ်သည်။", "ကောင်းသော စာသား။"], separators = ["\r\n\r\n", "\t "];
  const p = plan(paragraphs, separators, 44), expected = paragraphs.map((s, i) => s + (separators[i] ?? "")).join("");
  assert.equal(reconstructVoiceSections(p)[0].text, expected);
  assert.equal(Buffer.from(p.plan.chunks.map(c => c.text).join(""), "utf8").equals(Buffer.from(expected, "utf8")), true);
  assert.equal(p.plan.estimatedDurationMs, null);
  assert.equal(p.planHash, contractHash(V.plan, p.plan));
  assert.notEqual(p.plan.chunks[0].textHash, contractHash(V.section, p.plan.chunks[0].text));
  const boundaries = new Set([0, ...[...new Intl.Segmenter("my", { granularity: "grapheme" }).segment(expected)].map(s => s.index + s.segment.length)]);
  for (const [i, c] of p.plan.chunks.entries()) {
    assert.ok(boundaries.has(c.startUtf16) && boundaries.has(c.endUtf16));
    assert.ok(c.utf8Bytes <= 44); assert.equal(c.utf8Bytes, Buffer.byteLength(c.text));
    assert.equal(c.index, i); assert.equal(c.sectionChunkIndex, i); assert.equal(c.sectionChunkCount, p.plan.chunks.length);
    assert.equal(c.textHash, contractHash(V.text, c.text));
  }
});
test("M5-01 prefers complete paragraphs, preserves separator ownership and whole-section grapheme boundaries", () => {
  const p = plan(["မြန်မာ", "စာသား"], ["\n\n"], Buffer.byteLength("မြန်မာ\n\n"));
  assert.deepEqual(p.plan.chunks.map(c => c.text), ["မြန်မာ\n\n", "စာသား"]);
  const across = plan(["က", "\u1039က"], [""], 12);
  assert.equal(across.plan.chunks.length, 1); assert.equal(across.plan.chunks[0].text, "က္က");
  assert.throws(() => plan(["က", "\u1039က"], [""], 6), StorylineContractError, "cannot split a conjunct at a paragraph edge");
  const crlf = plan(["က\r", "\nက"], [""], 4);
  assert.deepEqual(crlf.plan.chunks.map(c => c.text), ["က", "\r\n", "က"]);
});
test("M5-01 deterministic, frozen plans bind section order, runtime segmentation, scope/source and voice profile", () => {
  assert.deepEqual(planMyanmarVoice(data.input), planMyanmarVoice(JSON.parse(canonicalJson(data.input))));
  assert.equal(Object.isFrozen(data.plan.plan.chunks[0]), true);
  assert.equal(data.plan.plan.segmentation.unicodeVersion, process.versions.unicode);
  assert.equal(data.plan.plan.segmentation.icuVersion, process.versions.icu);
  for (const s of data.input.sections) assert.equal(reconstructVoiceSections(data.plan).find(r => r.sectionId === s.sectionId)?.text, sectionSpeechText(s));
  const changes = [
    { ...data.input, sections: data.input.sections.map((s, i) => i ? s : { ...s, paragraphs: s.paragraphs.map(p => p + "က") }) },
    { ...data.input, reference: { ...data.input.reference, source: { ...data.input.reference.source, contextHash: "f".repeat(64) } } },
    { ...data.input, capability: syntheticVoiceCapability({ maxChunkBytes: 90, voiceId: "fixture-alternate" }) },
    { ...data.input, capability: syntheticVoiceCapability({ maxChunkBytes: 91, voiceId: "fixture-neutral" }) },
  ];
  for (const changed of changes) assert.notEqual(planMyanmarVoice(changed).planHash, data.plan.planHash);
});
test("M5-01 rejects malformed Unicode, controls, invalid paragraph topology, over-limit indivisible clusters and bytes", async t => {
  for (const bad of ["\ud800က", "က\udfff", "က\0", "က\u0085", "က\u202e", "က\u2066", "က\uffff", "English only", " ", ""]) {
    await t.test(JSON.stringify(bad), () => assert.throws(() => plan([bad], [], 30), StorylineContractError));
  }
  for (const bytes of [0, -1, 0.5, 16385, NaN]) assert.throws(() => plan(["က"], [], bytes));
  assert.throws(() => plan(["က"], [], 2));
  assert.throws(() => plan(["က" + "\u1037".repeat(8)], [], 12));
  assert.throws(() => plan(["က".repeat(1201)], [], 300));
  assert.throws(() => plan(["က", "က"], [], 30));
  assert.throws(() => plan(["က", "က"], ["<break>"], 30));
  assert.throws(() => plan(["က", "က"], [" ".repeat(65)], 30));
  assert.throws(() => plan(["က".repeat(721)], [], 3), StorylineContractError, "bounded total chunks");
  const sections: VoiceSectionInput[] = Array.from({ length: 31 }, (_, i) => ({ sectionId: `section-${i}`, order: i, paragraphs: ["က".repeat(1200)], separators: [] }));
  assert.throws(() => planMyanmarVoice({ ...data.input, sections, capability: syntheticVoiceCapability({ maxChunkBytes: 16384, voiceId: "fixture-neutral" }) }));
  assert.throws(() => planMyanmarVoice({ ...data.input, sections: [{ ...data.input.sections[0], order: 1 }] }));
  assert.throws(() => planMyanmarVoice({ ...data.input, sections: [data.input.sections[0], { ...data.input.sections[0], order: 1 }] }));
});
test("M5-01 replay validator rejects reordered/missing/duplicate chunks, forged boundaries/hashes/metadata and policies", async t => {
  const mutate = [
    (p: Record<string, unknown>) => { p.execution = "ENABLED"; },
    (p: Record<string, unknown>) => { p.estimatedDurationMs = 100; },
    (p: Record<string, unknown>) => { (p.chunks as unknown[]).reverse(); },
    (p: Record<string, unknown>) => { (p.chunks as unknown[]).pop(); },
    (p: Record<string, unknown>) => { (p.chunks as unknown[]).push((p.chunks as unknown[])[0]); },
    (p: Record<string, unknown>) => { (p.chunks as Record<string, unknown>[])[0].text = "က"; },
    (p: Record<string, unknown>) => { (p.chunks as Record<string, unknown>[])[0].startUtf16 = 1; },
    (p: Record<string, unknown>) => { p.segmentation = { algorithm: "INTL_MY_EXTENDED_GRAPHEME", unicodeVersion: "old", icuVersion: "old" }; },
  ];
  for (const [i, change] of mutate.entries()) await t.test(`tampered plan ${i}`, () => {
    const forged = JSON.parse(canonicalJson(data.plan)) as { plan: Record<string, unknown>; planHash: string };
    change(forged.plan); forged.planHash = contractHash(V.plan, forged.plan);
    assert.throws(() => validateVoicePlan(forged), StorylineContractError);
  });
});
test("M5-01 input capture rejects getters, sparse arrays, unknown fields and never executes inherited array methods", () => {
  let invoked = false;
  assert.throws(() => planMyanmarVoice(Object.defineProperty({}, "reference", { enumerable: true, get() { invoked = true; return data.input.reference; } })));
  assert.equal(invoked, false);
  const value = structuredClone(data.input); Object.setPrototypeOf(value.sections, Object.create(Array.prototype, { map: { value() { invoked = true; throw new Error(); } } }));
  assert.deepEqual(planMyanmarVoice(value), data.plan); assert.equal(invoked, false);
  assert.throws(() => planMyanmarVoice({ ...data.input, sections: new Array(1) }));
  assert.throws(() => planMyanmarVoice({ ...data.input, approved: true }));
});
