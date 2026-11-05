import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { corpus, passages } from "./corpus.fixture";
import { D, digest } from "./contracts.fixture";
import { fixedRequest, createOfflineHarnessForTest, createMockPortForTest, type Scenario } from "./harness.fixture";
import { selection } from "./capabilities.fixture";
import { createMockSpendingAssessorForTest, proposalForTest, type Assessment } from "./spending.fixture";
before(() => { for (const [object,key] of [[globalThis,"fetch"],[http,"request"],[https,"request"],[net,"connect"]] as const)
  mock.method(object, key as never, (() => { throw Error("OFFLINE_EGRESS_DENIED"); }) as never); });
after(() => mock.restoreAll());
function fixture(config=0) {
  const c = corpus(), requests = c.payload.passages.map((_,i) => fixedRequest(c,i,selection(config))), p = proposalForTest(requests), authority = createMockSpendingAssessorForTest(p);
  return { c, requests, p, authority, ticket: authority.assess(p,1000000), h: createOfflineHarnessForTest(c), port: createMockPortForTest() };
}
const badRequests = [
  ["wrong provider", { provider: "OTHER" }],
  ["direct Eleven even for reviewed model", { provider: "ELEVENLABS", model: "eleven_v3" }],
  ["direct Azure Nilar", { provider: "AZURE", model: "AZURE_PREBUILT_NEURAL_VOICE", voice: "my-MM-NilarNeural" }],
  ["direct Azure Thiha", { provider: "AZURE", model: "AZURE_PREBUILT_NEURAL_VOICE", voice: "my-MM-ThihaNeural" }],
  ["direct Google", { provider: "GOOGLE", model: "gemini-3.8-flash-tts" }],
  ["bare upstream model through gateway", { model: "eleven_v3" }],
  ["former gateway Eleven primary is no longer eligible", { model: "elevenlabs/eleven-v3", voice: "george", nativeFormat: "mp3" }],
  ["unreviewed gateway Eleven model", { model: "elevenlabs/eleven-v4" }],
  ["unreviewed gateway speech model", { model: "other/myanmar-tts" }],
  ["historical Eleven voice cannot replace Kore", { voice: "george" }], ["Flash-Lite is not the approved full model", { model: "google/gemini-3.8-flash-lite-tts" }],
  ["wrong Eleven model", { provider: "ELEVENLABS", model: "eleven_multilingual_v2" }], ["unsupported language", { language: "en" }],
  ["unknown voice", { voice: "UNREVIEWED" }], ["wrong native format", { nativeFormat: "mp4" }], ["Gemini gateway cannot select MP3", { nativeFormat: "mp3" }], ["direct WAV format is not the gateway format", { nativeFormat: "wav" }], ["empty text", { text: "" }],
  ["oversized text", { text: "က".repeat(1000) }], ["invalid surrogate", { text: "က\ud800" }], ["orphan grapheme", { text: "က \u1031" }],
  ["browser grant", { canSpend: true }], ["secret field", { apiKey: "SYNTHETIC_PRIVATE_VALUE_NEVER_LOG" }], ["missing ID", { requestId: undefined }],
  ["changed request ID", { requestId: "replacement-original" }], ["live endpoint", { endpoint: "https://tts-forbidden.invalid" }],
  ["uploaded cloning reference", { input_references: [{ type: "input_audio", data: "NON_AUDIO_PLACEHOLDER" }] }],
  ["caller provider routing", { providerOptions: { allow_fallbacks: true } }],
  ["retry", { policy: { attempts: 2, retries: 1, fallback: "NONE", parallel: false, live: false } }],
  ["fallback", { policy: { attempts: 1, retries: 0, fallback: "AZURE", parallel: false, live: false } }],
  ["M5 promotion", { schemaVersion: "story-voice-plan-v1" }], ["M8 promotion", { schemaVersion: "story-recap-execution-artifact-v1" }],
] as const;
for (const [name,patch] of badRequests) test(`request DENY: ${name}, with zero fake or network dispatch`, async () => {
  const f = fixture(); await assert.rejects(f.h.submit({ ...f.requests[0], ...patch }, f.ticket, f.port.port)); assert.equal(f.port.calls(), 0);
});
test("each required request field is mandatory when actually absent, not merely undefined", async () => {
  const f=fixture();for(const key of Object.keys(f.requests[0])){const r:Record<string,unknown>={...f.requests[0]};delete r[key];await assert.rejects(f.h.submit(r,f.ticket,f.port.port));}
  assert.equal(f.port.calls(),0);
});
const badProposals = [
  ["forged approval", { authority: "HUMAN_APPROVED" }], ["client cap only", { providerLimitEvidence: null }],
  ["unbounded quote", { quote: { quoteId: "mock", components: [], overheadMicros: 0, evidenceHash: "a".repeat(64) } }],
  ["over budget", { maxTotalSpendMicros: 1 }], ["wrong currency", { currency: "EUR" }],
  ["more than six", { requestCountCeiling: 7 }], ["changed corpus", { corpusHash: "a".repeat(64) }],
  ["cross account", { accountRef: "mock-account-b" }], ["extra grant", { approved: true }],
] as const;
for (const [name,patch] of badProposals) test(`spending DENY: ${name} cannot replace independent mock policy evidence`, () => {
  const f = fixture(); assert.throws(() => f.authority.assess({ ...f.p, ...patch },1000000));
});
test("expired or revoked proposal and independently revoked assessment deny original dispatch", async () => {
  const f = fixture(); assert.throws(() => f.authority.assess(f.p,1060000));
  const revoked = { ...f.p, revoked: true }; const a = createMockSpendingAssessorForTest(revoked); assert.throws(() => a.assess(revoked,1000000));
  f.authority.revokeForTest(); await assert.rejects(f.h.submit(f.requests[0],f.ticket,f.port.port)); assert.equal(f.port.calls(),0);
});
test("copied/reconstructed spending handle and arbitrary network port are not authority", async () => {
  const f = fixture(); assert.throws(() => JSON.stringify(f.ticket)); assert.throws(() => JSON.stringify(f.port.port));
  await assert.rejects(f.h.submit(f.requests[0], { ...f.ticket } as Assessment, f.port.port));
  let attempted = false; const arbitrary = { toJSON(): never { throw Error("not authority"); }, send() { attempted = true; return globalThis.fetch("https://tts-forbidden.invalid"); } };
  await assert.rejects(f.h.submit(f.requests[0],f.ticket,arbitrary)); assert.equal(attempted,false); assert.equal(f.port.calls(),0);
});
test("wrong account or rehashed changed corpus cannot consume the original policy", async () => {
  const f = fixture(), changed = structuredClone(passages) as unknown as { id:string; topic:string; text:string }[];
  changed[0].text += " "; const c = corpus(changed), other = createOfflineHarnessForTest(c);
  await assert.rejects(other.submit(fixedRequest(c),f.ticket,f.port.port));
  await assert.rejects(f.h.submit(fixedRequest(f.c,0,selection(),"mock-account-b"),f.ticket,f.port.port));
  assert.equal(f.port.calls(),0);
});
test("rehashed cost reductions cannot replace the independent frozen quote", () => {
  const f = fixture(), forged = structuredClone(f.p); forged.quote.components[0].priceMicros = 0;
  assert.throws(() => f.authority.assess(forged,1000000));
});
test("input-only or character-only Gemini quote cannot claim to bound output-token billing", () => {
  const f=fixture();for(const components of [[f.p.quote.components[0]],[{unit:"BILLABLE_CHARACTER",maximumUnitsPerRequest:100,priceMicros:1,perUnits:1}]])
    assert.throws(()=>createMockSpendingAssessorForTest({...f.p,quote:{...f.p.quote,components}}));
});
test("forged corpus metadata and getters cannot run during harness composition", () => {
  const f=fixture();let accessed=false;const getter=Object.defineProperty({},"payload",{enumerable:true,get(){accessed=true;return f.c.payload;}});
  assert.throws(()=>createOfflineHarnessForTest(getter as never));assert.equal(accessed,false);
  assert.throws(()=>createOfflineHarnessForTest({...f.c,payload:{...f.c.payload,editorialApproval:"APPROVED"}} as never));
});
for (const scenario of ["CLAIMS_VERIFIED","FORGED_BINDING","OVERSIZE","SECRET_ERROR","M5_PROMOTION","M8_PROMOTION"] as const) test(`response ${scenario} stays UNKNOWN without audio/hash adoption or resend`, async t => {
  const f = fixture(), p = createMockPortForTest(scenario), diagnostics: unknown[] = [];
  for (const k of ["log","error","warn"] as const) t.mock.method(console,k,(...args:unknown[]) => { diagnostics.push(args); });
  const result = await f.h.submit(f.requests[0],f.ticket,p.port); assert.equal(result.status,"UNKNOWN"); assert.equal(result.fixtureHash,null);
  assert.equal(result.audioVerified,false); assert.equal(result.actualDurationMs,null); assert.deepEqual(diagnostics,[]);
  assert.equal((await f.h.submit(f.requests[0],f.ticket,p.port)).status,"UNKNOWN"); assert.equal(p.calls(),1);
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_PRIVATE"),false);
});
test("fake M5/M8 receipt shapes and attempt to set decoded evidence are rejected as request data", async () => {
  const f=fixture(); for(const payload of [{ schemaVersion:"story-synthetic-audio-receipt-v1", speech:"VERIFIED" },{ schemaVersion:"story-recap-execution-artifact-v1", publicationEligibility:true },{...f.requests[0],decodedSamples:1000,audioVerified:true}])
    await assert.rejects(f.h.submit(payload,f.ticket,f.port.port));
  assert.equal(f.port.calls(),0);
});
test("egress tripwire rejects an attempted live call; valid offline handling makes zero fetch calls", async () => {
  assert.throws(() => globalThis.fetch("https://tts-forbidden.invalid"),/OFFLINE_EGRESS_DENIED/);
  const f=fixture(); const r=await f.h.submit(f.requests[0],f.ticket,f.port.port);
  assert.equal(r.requestHash,digest(D.request,f.requests[0]));assert.equal(r.liveEligible,false);
});
// Scenario is an exhaustive fixed enum; there is no external responder callback seam.
test("unknown mock scenario cannot install a live transport", () => { assert.throws(() => createMockPortForTest("FETCH" as Scenario)); });

test("Gemini token billing rejects upstream credits and character pricing", () => {
  const f=fixture();for(const unit of ["BILLABLE_CHARACTER", "CREDIT"])
    assert.throws(()=>createMockSpendingAssessorForTest({...f.p,quote:{...f.p.quote,components:[{...f.p.quote.components[0],unit}]}}));
});
test("direct providers cannot be restored by forging the spending configuration", () => {
  const f=fixture();for(const provider of ["ELEVENLABS", "AZURE", "GOOGLE"])
    assert.throws(()=>createMockSpendingAssessorForTest({...f.p,provider}));
});

for(const [name,patch] of [
  ["missing output component", {components:[] }],
  ["missing output maximum", {maximumUnitsPerRequest:undefined}],
  ["zero output maximum", {maximumUnitsPerRequest:0}],
  ["unknown output maximum", {maximumUnitsPerRequest:"UNKNOWN"}],
  ["unbounded output maximum", {maximumUnitsPerRequest:Infinity}],
  ["missing output rate", {priceMicros:undefined}],
  ["unknown output rate", {priceMicros:"UNKNOWN"}],
] as const)test(`Gemini charge DENY: ${name} before any mock dispatch`,async()=>{
  const f=fixture(),output={...f.p.quote.components[1],...patch};
  const components=name==="missing output component"?[f.p.quote.components[0]]:[f.p.quote.components[0],output];
  assert.throws(()=>createMockSpendingAssessorForTest({...f.p,quote:{...f.p.quote,components}}));assert.equal(f.port.calls(),0);
});
for(const overheadMicros of [undefined,"UNKNOWN",-1,Infinity])test(`Gemini charge DENY: unbounded fee overhead ${String(overheadMicros)}`,()=>{
  const f=fixture();assert.throws(()=>createMockSpendingAssessorForTest({...f.p,quote:{...f.p.quote,overheadMicros}}));assert.equal(f.port.calls(),0);
});
test("independent mock quote binds audio-token ceilings and all-in fee overhead against caller reductions",()=>{
  const f=fixture(),p={...f.p,quote:{...f.p.quote,overheadMicros:5},maxTotalSpendMicros:1260,providerLimitEvidence:{...f.p.providerLimitEvidence,limitMicros:1260}};
  const a=createMockSpendingAssessorForTest(p);a.assess(p,1000000);
  assert.throws(()=>a.assess({...p,quote:{...p.quote,overheadMicros:0}},1000000));
  const forged=structuredClone(p);forged.quote.components[1].maximumUnitsPerRequest=1;assert.throws(()=>a.assess(forged,1000000));
  assert.equal(a.snapshot().liveAuthority,"NONE");assert.equal(f.port.calls(),0);
});
