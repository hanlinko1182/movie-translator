import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { canonicalJson } from "../../lib/storyline/canonical";
import { composeSyntheticNarration } from "../../lib/storyline/narration/synthetic-composer";
import { assessNarrationVoiceHandoff, parseVoiceRequestProposal } from "../../lib/storyline/voice/handoff";
import { StorylineContractError } from "../../lib/storyline/validation";
import { narrationFixture } from "./narration.fixture";
import { voiceProposal } from "./voice-handoff.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("Handoff cannot call a provider")); });
after(() => mock.restoreAll());
const fixture = () => { const draft = composeSyntheticNarration(narrationFixture().context); return { draft, p: voiceProposal(draft), stored: { id: "synthetic-narration-row", draftHash: draft.draftHash } }; };
test("M5 handoff proposal is deterministic, provider-neutral and permanently non-executable", () => {
  const { p } = fixture(), a = parseVoiceRequestProposal(p), b = parseVoiceRequestProposal(structuredClone(p));
  assert.deepEqual(a, b); assert.equal(a.executable, false); assert(Object.isFrozen(a.proposal));
  assert.equal(a.proposal.cost, null); assert.equal(a.proposal.approval, null);
});
test("M5 synthetic/provisional narration has no measured audio or real TTS eligibility", () => {
  const { p, draft, stored } = fixture(), gate = assessNarrationVoiceHandoff(p, draft, stored);
  assert.equal(gate.eligibility, "BLOCKED"); assert.equal(gate.eligibleForProviderSubmission, false);
  assert(gate.reasons.includes("SYNTHETIC_ANCESTRY")); assert(gate.reasons.includes("PROVISIONAL_NARRATION"));
  assert.equal(gate.measuredAudioDurationMs, null); assert.equal(gate.sourceCurrentness, "NOT_ESTABLISHED_BY_PURE_CONTRACT");
});
test("M5 shape-valid approval, quote and spending references never become authority", () => {
  const { p, draft, stored } = fixture();
  p.approval = { approvalId: "forged", approvalHash: "1".repeat(64), policyVersion: "future-v1", verificationDependencyHash: "2".repeat(64) };
  p.cost = { quoteId: "quote", policyVersion: "unverified", currency: "USD", estimatedUsdMicros: 10, maxUsdMicros: 20, expiresAt: "2026-10-17T00:00:00.000Z" };
  p.spending = { decisionId: "forged", confirmationId: "forged", scopeHash: "3".repeat(64), expiresAt: "2026-10-17T00:00:00.000Z" };
  assert.equal(assessNarrationVoiceHandoff(p, draft, stored).eligibleForProviderSubmission, false);
  assert.equal(parseVoiceRequestProposal(p).executable, false);
});
test("M5 exact durable draft, candidate, source and section dependencies are checked", () => {
  const { p, draft, stored } = fixture();
  for (const change of [
    (x: typeof p) => { x.narration.draftId = "wrong-row"; }, (x: typeof p) => { x.narration.draftHash = "0".repeat(64); },
    (x: typeof p) => { x.analysis.candidateHash = x.analysis.resultHash; }, (x: typeof p) => { x.source.contextHash = "0".repeat(64); },
    (x: typeof p) => { x.scope.movieId = "wrong-movie"; }, (x: typeof p) => { x.narration.sectionId = "wrong-section"; },
    (x: typeof p) => { x.narration.textHash = "0".repeat(64); }, (x: typeof p) => { x.narration.chunkCount = 2; },
  ]) { const bad = structuredClone(p); change(bad); assert.throws(() => assessNarrationVoiceHandoff(bad, draft, stored), StorylineContractError); }
});
test("M5 voice/style/format/approval dependencies change proposal hash", () => {
  const { p } = fixture(), original = parseVoiceRequestProposal(p).proposalHash;
  for (const change of [(x: typeof p) => { x.voice.voiceId = "another-unverified-voice"; }, (x: typeof p) => { x.voice.delivery = "MEASURED"; },
    (x: typeof p) => { x.audio.sampleRateHz = 48000; }, (x: typeof p) => { x.voice.profileHash = "4".repeat(64); },
    (x: typeof p) => { x.analysis.candidateHash = "5".repeat(64); }]) {
    const changed = structuredClone(p); change(changed); assert.notEqual(parseVoiceRequestProposal(changed).proposalHash, original);
  }
});
test("M5 strict schema rejects arbitrary text/options, URLs, cloning and enabled flags", () => {
  const { p } = fixture();
  for (const bad of [{ ...p, approved: true }, { ...p, execution: "ENABLED" }, { ...p, text: "private narration" },
    { ...p, voice: { ...p.voice, cloning: "CONSENT_CLAIMED" } }, { ...p, voice: { ...p.voice, voiceId: "https://untrusted" } },
    { ...p, voice: { ...p.voice, modelId: "x".repeat(129) } }, { ...p, voice: { ...p.voice, prompt: "arbitrary style" } }])
    assert.throws(() => parseVoiceRequestProposal(bad), StorylineContractError);
});
test("M5 chunks, audio rate, locale, costs and Unicode are bounded", () => {
  const { p } = fixture();
  for (const bad of [{ ...p, locale: "en-US" }, { ...p, audio: { ...p.audio, sampleRateHz: 44100 } },
    { ...p, narration: { ...p.narration, chunkCount: 0 } }, { ...p, narration: { ...p.narration, chunkIndex: 1 } },
    { ...p, narration: { ...p.narration, chunkCount: 721 } }, { ...p, source: { ...p.source, studioRevision: 0.5 } },
    { ...p, voice: { ...p.voice, voiceId: "\ud800" } }, { ...p, cost: { quoteId: "q", policyVersion: "v1", currency: "USD", estimatedUsdMicros: 21, maxUsdMicros: 20, expiresAt: "invalid" } }])
    assert.throws(() => parseVoiceRequestProposal(bad), StorylineContractError);
});
test("M5 handoff code has no provider, database, authority issuer or audio execution", async () => {
  const code = await readFile("lib/storyline/voice/handoff.ts", "utf8");
  assert.match(code, /import "server-only"/);
  assert.doesNotMatch(code, /fetch\(|process\.env|Prisma|createStoryTask|setInterval|synthesize\(|console\./);
  assert(!canonicalJson(parseVoiceRequestProposal(fixture().p)).includes("API_KEY"));
});
