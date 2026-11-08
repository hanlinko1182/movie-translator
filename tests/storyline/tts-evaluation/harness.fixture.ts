import "server-only";
import { D, exact, digest, equal, account, sha, myanmarText, policy, deny, freeze, byteHash } from "./contracts.fixture";
import { capability, selection, type Selection } from "./capabilities.fixture";
import { corpus, validateChunks, type Corpus } from "./corpus.fixture";
import { reserveMockBudget, finishMockObservation, type Assessment } from "./spending.fixture";

export function fixedRequest(c: Corpus = corpus(), passageIndex = 0, s: Selection = selection(), accountRef = "mock-account-a") {
  const p = c.payload.passages[passageIndex]; if (!p) deny("PASSAGE_UNKNOWN"); capability(s);
  return freeze({ schemaVersion: D.request, mode: "MOCK_ONLY", accountRef: account(accountRef), ...s, corpusHash: c.corpusHash,
    requestId: `original-${p.id}`, passageId: p.id, text: p.text, textHash: p.textHash, chunks: p.chunks, policy });
}
export type EvaluationRequest = ReturnType<typeof fixedRequest>;
export function parseRequest(v: unknown, c: Corpus) {
  const r = exact(v, ["schemaVersion", "mode", "accountRef", "provider", "model", "voice", "nativeFormat", "language", "locale", "corpusHash", "requestId", "passageId", "text", "textHash", "chunks", "policy"]);
  if (r.schemaVersion !== D.request || r.mode !== "MOCK_ONLY" || !equal(r.policy, policy)) deny("MOCK_ONLY_NO_RETRY");
  capability(r as unknown as Selection); account(r.accountRef); sha(r.corpusHash); sha(r.textHash);
  const text = myanmarText(r.text); validateChunks(text, r.chunks);
  const index = c.payload.passages.findIndex(p => p.id === r.passageId);
  if (index < 0 || !equal(r, fixedRequest(c, index, r as unknown as Selection, r.accountRef as string))) deny("EXACT_CORPUS_BINDING");
  return freeze(r as EvaluationRequest);
}
export type Scenario = "SUCCESS" | "HELD_SUCCESS" | "LOST_ACK" | "TIMEOUT" | "HTTP_429" | "REJECTED" | "CLAIMS_VERIFIED" | "FORGED_BINDING" | "OVERSIZE" | "SECRET_ERROR" | "M5_PROMOTION" | "M8_PROMOTION";
type Port = Readonly<{ toJSON(): never }>;
type Mock = { scenario: Scenario; calls: number; wait: Promise<void>; release: () => void };
const mocks = new WeakMap<Port, Mock>();
const nonAudio = Buffer.from("M1002A_ARBITRARY_NON_AUDIO_FIXTURE", "utf8");
export function createMockPortForTest(scenario: Scenario = "SUCCESS") {
  if (!["SUCCESS", "HELD_SUCCESS", "LOST_ACK", "TIMEOUT", "HTTP_429", "REJECTED", "CLAIMS_VERIFIED", "FORGED_BINDING", "OVERSIZE", "SECRET_ERROR", "M5_PROMOTION", "M8_PROMOTION"].includes(scenario)) deny("MOCK_SCENARIO");
  let release!: () => void; const wait = new Promise<void>(done => { release = done; }), m = { scenario, calls: 0, wait, release };
  const port = Object.freeze({ toJSON(): never { return deny("NON_SERIALIZABLE_MOCK_PORT"); } }); mocks.set(port, m);
  return Object.freeze({ port, credentialLabel: "OFFLINE_PLACEHOLDER_NOT_A_KEY", calls: () => m.calls, releaseForTest: release });
}
async function simulate(m: Mock, r: EvaluationRequest): Promise<unknown> {
  m.calls++; if (m.scenario === "HELD_SUCCESS") await m.wait;
  if (m.scenario === "SECRET_ERROR") throw Error("SYNTHETIC_PRIVATE_DIAGNOSTIC_NEVER_LOG");
  if (["LOST_ACK", "TIMEOUT", "HTTP_429"].includes(m.scenario)) throw Error("Untrusted response diagnostic intentionally discarded");
  const response = { schemaVersion: D.response, kind: "NON_AUDIO_MOCK_RESULT", requestHash: digest(D.request, r), accountRef: r.accountRef, model: r.model, voice: r.voice,
    fixtureHex: nonAudio.toString("hex"), verification: "NOT_PERFORMED", providerDurationMs: null, status: m.scenario === "REJECTED" ? "MOCK_REJECTED" : "MOCK_SUCCESS" };
  if (m.scenario === "CLAIMS_VERIFIED") return { ...response, verification: "REAL_AUDIO_VERIFIED", decodedSamples: 1000 };
  if (m.scenario === "FORGED_BINDING") return { ...response, requestHash: "c".repeat(64), accountRef: "mock-account-b" };
  if (m.scenario === "OVERSIZE") return { ...response, fixtureHex: "a".repeat(4096) };
  if (m.scenario === "M5_PROMOTION") return { schemaVersion: "story-synthetic-audio-verification-v1", execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED" };
  if (m.scenario === "M8_PROMOTION") return { schemaVersion: "story-recap-execution-artifact-v1", media: "SIMULATED_NOT_MEDIA", verification: "MEDIA_VERIFICATION_NOT_PERFORMED" };
  return response;
}
export type Observation = Readonly<{ schemaVersion: string; mode: "OFFLINE_ONLY"; requestHash: string; corpusHash: string;
  status: "RESERVED" | "MOCK_OBSERVED" | "MOCK_REJECTED" | "UNKNOWN"; attempts: 1; audioVerified: false; actualDurationMs: null; liveEligible: false; fixtureHash: string | null; fixtureByteCount: number | null }>;
let active = false;
export function createOfflineHarnessForTest(c: Corpus = corpus()) {
  // Reconstruct the supplied corpus to reject promoted/forged metadata and mutable aliases.
  const safe = exact(c, ["payload", "corpusHash"]) as unknown as Corpus;
  const captured = corpus(safe.payload.passages.map(p => ({ id: p.id, topic: p.topic, text: p.text })));
  if (!equal(safe, captured)) deny("CORPUS_INTEGRITY");
  const originals = new Map<string, Observation>();
  async function submit(input: unknown, assessment: Assessment, port: Port, now = 1000000, responseNow = now): Promise<Observation> {
    const r = parseRequest(input, captured), h = digest(D.request, r), old = originals.get(r.requestId);
    if (old) { if (old.requestHash !== h) deny("ORIGINAL_ID_CONFLICT"); return old; }
    const m = mocks.get(port); if (!m) deny("IN_MEMORY_PORT_REQUIRED"); if (active) deny("PARALLEL_DISPATCH_DENIED");
    reserveMockBudget(assessment, r, now);
    let result: Observation = freeze({ schemaVersion: D.receipt, mode: "OFFLINE_ONLY", requestHash: h, corpusHash: captured.corpusHash, status: "RESERVED",
      attempts: 1, audioVerified: false, actualDurationMs: null, liveEligible: false, fixtureHash: null, fixtureByteCount: null });
    originals.set(r.requestId, result); active = true;
    try {
      const v = exact(await simulate(m, r), ["schemaVersion", "kind", "requestHash", "accountRef", "model", "voice", "fixtureHex", "verification", "providerDurationMs", "status"]);
      if (v.schemaVersion !== D.response || v.kind !== "NON_AUDIO_MOCK_RESULT" || v.requestHash !== h || v.accountRef !== r.accountRef || v.model !== r.model || v.voice !== r.voice
        || v.verification !== "NOT_PERFORMED" || v.providerDurationMs !== null || !["MOCK_SUCCESS", "MOCK_REJECTED"].includes(String(v.status))
        || typeof v.fixtureHex !== "string" || !/^(?:[a-f0-9]{2}){1,256}$/.test(v.fixtureHex)) deny("UNTRUSTED_MOCK_RESPONSE");
      const bytes = Buffer.from(v.fixtureHex, "hex"); if (!bytes.equals(nonAudio)) deny("NON_AUDIO_FIXTURE_REQUIRED");
      finishMockObservation(assessment, responseNow, true);
      result = freeze({ ...result, status: v.status === "MOCK_SUCCESS" ? "MOCK_OBSERVED" : "MOCK_REJECTED", fixtureHash: byteHash(bytes), fixtureByteCount: bytes.length });
    } catch { result = freeze({ ...result, status: "UNKNOWN" }); }
    finally { active = false; }
    originals.set(r.requestId, result); return result;
  }
  return Object.freeze({ submit, inspect(requestHash: string) { sha(requestHash); return [...originals.values()].find(v => v.requestHash === requestHash) ?? null; },
    liveReadiness: () => freeze({ verdict: "NO_GO", account: "ACCOUNT_VERIFICATION_REQUIRED", privacy: "HUMAN_ACCEPTANCE_REQUIRED", spending: "PROVIDER_HARD_CAP_UNVERIFIED", outputAudioTokenCharge: "INDEPENDENT_MAXIMUM_REQUIRED", fees: "ALL_APPLICABLE_FEES_UNVERIFIED", requestOwnership: "DURABLE_OWNERSHIP_UNREVIEWED", audio: "NOT_GENERATED" }) });
}
