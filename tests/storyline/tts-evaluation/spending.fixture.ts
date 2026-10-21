import "server-only";
import { D, exact, digest, equal, counter, ident, sha, account, deny, freeze } from "./contracts.fixture";
import { capability, type Selection } from "./capabilities.fixture";
import type { EvaluationRequest } from "./harness.fixture";
const epoch = (v: unknown) => counter(v, Number.MAX_SAFE_INTEGER);
export function parseSpendingProposal(input: unknown) {
  const r = exact(input, ["schemaVersion", "authority", "provider", "model", "voice", "nativeFormat", "language", "locale", "accountRef", "corpusHash", "requestCountCeiling", "originalRequests", "quote", "maxTotalSpendMicros", "currency", "interval", "approvalIdentityRef", "approvalTimestampMs", "expiresAtMs", "revoked", "providerLimitEvidence"]);
  if (r.schemaVersion !== D.spending || r.authority !== "UNISSUED_OFFLINE_PROPOSAL" || r.currency !== "USD" || r.approvalIdentityRef !== "UNISSUED_REVIEWER" || typeof r.revoked !== "boolean") deny("UNISSUED_PROPOSAL_REQUIRED");
  const configured = capability(r as unknown as Selection); account(r.accountRef); sha(r.corpusHash);
  const n = counter(r.requestCountCeiling, 6); if (!n || !Array.isArray(r.originalRequests) || r.originalRequests.length !== n) deny("REQUEST_CEILING");
  const originalRequests = r.originalRequests.map(v => { const x = exact(v, ["requestId", "requestHash"]); return { requestId: ident(x.requestId), requestHash: sha(x.requestHash) }; });
  if (new Set(originalRequests.map(x => x.requestId)).size !== n || new Set(originalRequests.map(x => x.requestHash)).size !== n) deny("DUPLICATE_ORIGINAL");
  const q = exact(r.quote, ["quoteId", "components", "overheadMicros", "evidenceHash"]);
  ident(q.quoteId); sha(q.evidenceHash); counter(q.overheadMicros);
  if (!Array.isArray(q.components) || !q.components.length || q.components.length > 4) deny("MISSING_MAXIMUM_CHARGE");
  const components = q.components.map(v => { const x = exact(v, ["unit", "maximumUnitsPerRequest", "priceMicros", "perUnits"]);
    if (!["INPUT_TEXT_TOKEN", "OUTPUT_AUDIO_TOKEN", "BILLABLE_CHARACTER", "CREDIT"].includes(String(x.unit))) deny("BILLABLE_UNIT");
    const maximumUnitsPerRequest = counter(x.maximumUnitsPerRequest), priceMicros = counter(x.priceMicros), perUnits = counter(x.perUnits);
    if (!maximumUnitsPerRequest || !perUnits) deny("MISSING_MAXIMUM_CHARGE");
    return { unit: x.unit as string, maximumUnitsPerRequest, priceMicros, perUnits }; });
  if (new Set(components.map(c => c.unit)).size !== components.length) deny("DUPLICATE_BILLABLE_UNIT");
  const units = components.map(c => c.unit).sort();
  if (!equal(units, [...configured.billableUnits].sort())) deny("MODEL_BILLABLE_UNIT_MISMATCH");
  const interval = exact(r.interval, ["startsAtMs", "endsAtMs", "resetAtMs"]);
  const startsAtMs = epoch(interval.startsAtMs), endsAtMs = epoch(interval.endsAtMs), resetAtMs = epoch(interval.resetAtMs), expiresAtMs = epoch(r.expiresAtMs), approvalTimestampMs = epoch(r.approvalTimestampMs);
  if (startsAtMs >= endsAtMs || resetAtMs !== endsAtMs || expiresAtMs > endsAtMs || approvalTimestampMs < startsAtMs || approvalTimestampMs >= expiresAtMs) deny("BILLING_INTERVAL");
  const l = exact(r.providerLimitEvidence, ["kind", "evidenceHash", "limitMicros", "resetAtMs"]);
  if (l.kind !== "MOCK_NOT_PROVIDER_ENFORCED" || epoch(l.resetAtMs) !== resetAtMs) deny("PROVIDER_LIMIT_UNVERIFIED");
  sha(l.evidenceHash); const cap = counter(r.maxTotalSpendMicros), limit = counter(l.limitMicros);
  const worst = components.reduce((sum, c) => sum + (BigInt(c.maximumUnitsPerRequest) * BigInt(c.priceMicros) + BigInt(c.perUnits) - BigInt(1)) / BigInt(c.perUnits), BigInt(q.overheadMicros as number));
  if (!cap || !limit || worst > BigInt(cap) || worst * BigInt(n) > BigInt(cap) || cap > limit) deny("OVER_BUDGET");
  return freeze({ schemaVersion: D.spending, authority: "UNISSUED_OFFLINE_PROPOSAL", provider: r.provider as string, model: r.model as string, voice: r.voice as string,
    nativeFormat: r.nativeFormat as string, language: r.language as string, locale: r.locale as string, accountRef: account(r.accountRef), corpusHash: sha(r.corpusHash), revoked: r.revoked,
    originalRequests, quote: { ...q, components }, interval: { startsAtMs, endsAtMs, resetAtMs }, maxTotalSpendMicros: cap,
    providerLimitEvidence: { ...l, limitMicros: limit }, expiresAtMs, approvalTimestampMs, requestCountCeiling: n, worstPerRequestMicros: Number(worst) });
}
export type Assessment = Readonly<{ toJSON(): never }>;
type Ledger = { p: ReturnType<typeof parseSpendingProposal>; revoked: boolean; unresolved: boolean; reserved: number; originals: Set<string> };
const assessments = new WeakMap<Assessment, Ledger>();
function current(t: Assessment, now: number) {
  const l = assessments.get(t); if (!l) deny("FORGED_ASSESSMENT"); epoch(now);
  if (l.revoked || l.p.revoked || now < l.p.approvalTimestampMs || now < l.p.interval.startsAtMs || now >= l.p.expiresAtMs || now >= l.p.interval.endsAtMs) deny("EXPIRED_OR_REVOKED");
  return l;
}
/** Trusted mock composition only: no signature, approval, provider limit or live permit is issued. */
export function createMockSpendingAssessorForTest(original: unknown) {
  const p = parseSpendingProposal(original), l: Ledger = { p, revoked: false, unresolved: false, reserved: 0, originals: new Set() };
  return Object.freeze({ assess(candidate: unknown, now: number) {
    if (!equal(parseSpendingProposal(candidate), p)) deny("FORGED_SPENDING_PROPOSAL");
    const t = Object.freeze({ toJSON(): never { return deny("NON_SERIALIZABLE_MOCK_ASSESSMENT"); } }); assessments.set(t, l); current(t, now); return t;
  }, revokeForTest() { l.revoked = true; }, snapshot() { return freeze({ reservedMicros: l.reserved, originals: l.originals.size, unresolved: l.unresolved, liveAuthority: "NONE" }); } });
}
export function reserveMockBudget(t: Assessment, r: EvaluationRequest, now: number) {
  const l = current(t, now), p = l.p;
  for (const k of ["provider", "model", "voice", "nativeFormat", "language", "locale", "accountRef", "corpusHash"] as const) if (p[k] !== r[k]) deny("ACCOUNT_OR_CONFIGURATION_BINDING");
  if (!p.originalRequests.some(x => x.requestId === r.requestId && x.requestHash === digest(D.request, r))) deny("ORIGINAL_NOT_LISTED");
  if (l.originals.has(r.requestId)) deny("ORIGINAL_ALREADY_RESERVED");
  if (l.unresolved) deny("ORIGINAL_UNKNOWN_RETAINED");
  if (l.originals.size >= p.requestCountCeiling || l.reserved + p.worstPerRequestMicros > p.maxTotalSpendMicros) deny("OVER_BUDGET");
  l.originals.add(r.requestId); l.reserved += p.worstPerRequestMicros; l.unresolved = true;
}
export function finishMockObservation(t: Assessment, now: number, definitive: boolean) { const l = current(t, now); if (definitive) l.unresolved = false; }
export function proposalForTest(requests: EvaluationRequest[], now = 1000000) {
  const r = requests[0]; if (!r) deny("REQUEST_CEILING");
  return { schemaVersion: D.spending, authority: "UNISSUED_OFFLINE_PROPOSAL", provider: r.provider, model: r.model, voice: r.voice, nativeFormat: r.nativeFormat,
    language: r.language, locale: r.locale, accountRef: r.accountRef, corpusHash: r.corpusHash, requestCountCeiling: requests.length,
    originalRequests: requests.map(x => ({ requestId: x.requestId, requestHash: digest(D.request, x) })),
    // Deliberately synthetic prices/bounds, never a public or account quote.
    quote: { quoteId: "mock-quote-only", components: capability(r).billableUnits.some(unit => unit === "INPUT_TEXT_TOKEN")
      ? [{ unit: "INPUT_TEXT_TOKEN", maximumUnitsPerRequest: 100, priceMicros: 1000, perUnits: 1000 }, { unit: "OUTPUT_AUDIO_TOKEN", maximumUnitsPerRequest: 100, priceMicros: 1050, perUnits: 1000 }]
      : [{ unit: "BILLABLE_CHARACTER", maximumUnitsPerRequest: 2048, priceMicros: 100, perUnits: 1000 }], overheadMicros: 0, evidenceHash: "a".repeat(64) },
    maxTotalSpendMicros: 1230, currency: "USD", interval: { startsAtMs: now - 1, endsAtMs: now + 60000, resetAtMs: now + 60000 },
    approvalIdentityRef: "UNISSUED_REVIEWER", approvalTimestampMs: now - 1, expiresAtMs: now + 60000, revoked: false,
    providerLimitEvidence: { kind: "MOCK_NOT_PROVIDER_ENFORCED", evidenceHash: "b".repeat(64), limitMicros: 1230, resetAtMs: now + 60000 } };
}
