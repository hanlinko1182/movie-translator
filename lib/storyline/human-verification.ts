import "server-only";
import { canonicalJson, contractHash } from "./canonical";
import { LIMITS, type Identity, type StorySourceSnapshot, type StoryScriptVersion } from "./contracts";
import { allClaims, validateScriptPayload, validateStoryEvents } from "./script";
import { anchorKey, validateSourceSnapshot } from "./source";
import { assertCurrentContracts, verificationBinding } from "./verification";
import { date, enumeration, fail, freeze, hash, id, record, text } from "./validation";
import { HUMAN_VERIFICATION, SOURCE_COMPARISON_RUBRIC, type AuthorizedHumanDecision,
  type HumanOperator, type HumanOperatorAuthority, type HumanVerificationDecision,
  type HumanVerificationEntry, type HumanVerificationState, type SourceComparison,
  type SourceVerificationProposal } from "./human-verification-contracts";

type Context = { source: StorySourceSnapshot; script: StoryScriptVersion };
type Authorization = {
  proposal: SourceVerificationProposal; operator: HumanOperator; reviewedAt: string;
  decision: HumanVerificationDecision | { receiptId: string; rationale: string };
};

const latestEntry = (entries: readonly HumanVerificationEntry[], claimId: string) => entries.findLast(row => row.proposal.binding.claimId === claimId);
/** Pure derivation from immutable context and the instance-owned ledger value.
 * Kept private: arbitrary caller/provider entries must never be a trust source.
 */
function deriveState(entries: readonly HumanVerificationEntry[], entry: HumanVerificationEntry, context: Context): HumanVerificationState {
  if (latestEntry(entries, entry.proposal.binding.claimId)?.id !== entry.id) return "SUPERSEDED";
  if (entry.kind === "REVOCATION") return "REVOKED";
  const claim = allClaims(context.script).find(row => row.id === entry.proposal.binding.claimId);
  if (!claim || entry.proposal.scriptHash !== context.script.scriptHash
    || canonicalJson(entry.proposal.binding) !== canonicalJson(verificationBinding(claim.id, context.source, context.script))) return "STALE";
  if (entry.outcome === "SOURCE_VERIFIED" && entry.basisReceiptHashes.some(basis => {
    const current = latestEntry(entries, basis.claimId);
    return !current || current.entryHash !== basis.receiptHash || deriveState(entries, current, context) !== "SOURCE_VERIFIED";
  })) return "STALE";
  return entry.outcome;
}
function deriveEligibility(context: Context, entries: readonly HumanVerificationEntry[], eventsValue: unknown) {
  const events = validateStoryEvents(eventsValue, context.source, context.script);
  const claims = allClaims(context.script).map(claim => {
    const entry = latestEntry(entries, claim.id), state = entry ? deriveState(entries, entry, context) : "PENDING" as const;
    return { claimId: claim.id, state, receiptId: entry?.id ?? null,
      sourceEligible: state === "SOURCE_VERIFIED", needsHumanReview: state !== "SOURCE_VERIFIED" };
  });
  const supported = new Set(claims.filter(row => row.sourceEligible).map(row => row.claimId));
  const eligible = new Set(events.filter(event => event.claimIds.every(claimId => supported.has(claimId))).map(row => row.id));
  // Fixed point handles same-start/point intervals regardless of event input order.
  for (let pass = 0; pass < events.length; pass++) for (const event of events) {
    if (event.precedingEventIds.some(eventId => !eligible.has(eventId))) eligible.delete(event.id);
  }
  const sourceEligible = claims.length > 0 && claims.every(row => row.sourceEligible);
  return freeze({ contextStatus: "PROVIDED_IMMUTABLE_CONTEXT_ONLY" as const, persisted: false as const,
    scriptHash: context.script.scriptHash, sourceContextHash: context.source.sourceContextHash, claims,
    draftContinuation: true, supportedEventIds: events.filter(row => eligible.has(row.id)).map(row => row.id),
    pendingEventIds: events.filter(row => !eligible.has(row.id)).map(row => row.id),
    scriptApproval: { sourceEligible, approved: false, remainingGate: "NARRATIVE_LANGUAGE_REVIEW_AND_HUMAN_SCRIPT_APPROVAL" },
    voice: { sourceEligible, eligible: false, remainingGate: "CURRENT_APPROVED_SCRIPT_AND_VOICE_AUTHORIZATION" },
    dependencyHash: contractHash("story-human-review-eligibility-v1", { scriptHash: context.script.scriptHash,
      sourceContextHash: context.source.sourceContextHash,
      ledgerHash: entries.at(-1)?.entryHash ?? contractHash("story-verification-ledger-empty-v1", { projectId: context.source.payload.projectId, movieId: context.source.payload.movieId }), claims }) });
}

/** Pure, IO-free reference authority with an ephemeral append-only ledger.
 * No default operator, external receipt import, global instance or persistence.
 * Bootstrap and context acquisition are server trust boundaries, not authentication.
 * Never expose this factory/authority adapter through a route or Server Action.
 */
export function createHumanSourceVerificationFoundation(options: {
  scope: Identity; authority: HumanOperatorAuthority | null; now: () => string;
}) {
  const scope = freeze({ projectId: id(options.scope.projectId, "scope.projectId"), movieId: id(options.scope.movieId, "scope.movieId") });
  const authority = options.authority, clock = options.now;
  const proposals = new WeakMap<SourceVerificationProposal, Context | null>();
  const authorizations = new WeakMap<AuthorizedHumanDecision, Authorization>();
  let entries: readonly HumanVerificationEntry[] = Object.freeze([]);
  const ledgerHash = () => entries.at(-1)?.entryHash ?? contractHash("story-verification-ledger-empty-v1", scope);
  const latest = (claimId: string) => latestEntry(entries, claimId);
  function checked(source: StorySourceSnapshot, script: StoryScriptVersion): Context {
    assertCurrentContracts(source, script);
    const captured = validateSourceSnapshot(source.payload, scope);
    const version = validateScriptPayload(script.payload, captured);
    return { source: captured, script: version };
  }
  function operator(session: unknown, action: "VERIFY_SOURCE" | "REVOKE_VERIFICATION"): HumanOperator {
    // Never persist/log session or adapter errors, which may contain credentials.
    let grant: unknown;
    try { grant = authority?.resolve(session, action); } catch { fail("UNTRUSTED_RECEIPT", "operator.authority"); }
    if (!grant) fail("UNTRUSTED_RECEIPT", "operator.authority");
    const row = record(grant, ["authority", "operatorId", "auditLabel"], "operator");
    return freeze({ authority: enumeration(row.authority, ["TRUSTED_LOCAL_OPERATOR", "AUTHENTICATED_OPERATOR"], "operator.authority"),
      operatorId: id(row.operatorId, "operator.operatorId"), auditLabel: text(row.auditLabel, 160, "operator.auditLabel") });
  }
  function currentState(entry: HumanVerificationEntry, context: Context): HumanVerificationState {
    return deriveState(entries, entry, context);
  }
  function basisReceipts(proposal: SourceVerificationProposal, context: Context) {
    return proposal.binding.basisClaimHashes.map(basis => {
      const current = latest(basis.claimId);
      if (!current || currentState(current, context) !== "SOURCE_VERIFIED") fail("INFERENCE_INVALID", "verification.observedBasis");
      return { claimId: basis.claimId, receiptHash: current.entryHash };
    });
  }
  function parseDecision(value: unknown, proposal: SourceVerificationProposal): HumanVerificationDecision {
    canonicalJson(value, LIMITS.receiptBytes);
    const row = record(value, ["proposalHash", "chineseEvidenceHash", "translationContextHash", "acknowledgedChineseComparison", "outcome", "comparison", "rationale"], "decision");
    for (const key of ["proposalHash", "chineseEvidenceHash", "translationContextHash"] as const) {
      if (hash(row[key], `decision.${key}`) !== proposal[key]) fail("RECEIPT_BINDING_INVALID", `decision.${key}`);
    }
    if (row.acknowledgedChineseComparison !== true) fail("UNTRUSTED_RECEIPT", "decision.acknowledgedChineseComparison");
    const raw = record(row.comparison, Object.keys(SOURCE_COMPARISON_RUBRIC), "decision.comparison");
    const comparison = Object.fromEntries(Object.keys(SOURCE_COMPARISON_RUBRIC).map(key => [key,
      enumeration(raw[key], ["SUPPORTED", "INSUFFICIENT", "CONTRADICTED", "NOT_APPLICABLE"], "decision.comparison")])) as SourceComparison;
    for (const [key, verdict] of Object.entries(comparison)) {
      if (verdict === "NOT_APPLICABLE" && (key !== "translationConsistency" || proposal.binding.translationContextRefs.length)) fail("INVALID_ENUM", "decision.comparison");
    }
    if (!proposal.binding.translationContextRefs.length && comparison.translationConsistency !== "NOT_APPLICABLE") fail("INVALID_ENUM", "decision.comparison.translationConsistency");
    const outcome = enumeration(row.outcome, ["SOURCE_VERIFIED", "INCONCLUSIVE", "UNSUPPORTED"], "decision.outcome");
    const verdicts = Object.values(comparison);
    if (outcome === "SOURCE_VERIFIED" && verdicts.some(row => row !== "SUPPORTED" && row !== "NOT_APPLICABLE")
      || outcome === "INCONCLUSIVE" && (!verdicts.includes("INSUFFICIENT") || verdicts.includes("CONTRADICTED"))
      || outcome === "UNSUPPORTED" && !verdicts.includes("CONTRADICTED")) fail("UNTRUSTED_RECEIPT", "decision.outcome");
    return freeze({ proposalHash: proposal.proposalHash, chineseEvidenceHash: proposal.chineseEvidenceHash,
      translationContextHash: proposal.translationContextHash, acknowledgedChineseComparison: true,
      outcome, comparison, rationale: text(row.rationale, 2000, "decision.rationale") });
  }
  function assertProposal(proposal: SourceVerificationProposal) {
    if (!proposals.has(proposal)) fail("UNTRUSTED_RECEIPT", "proposal");
    if (proposal.ledgerHeadHash !== ledgerHash()) fail("STALE_CONTEXT", "proposal.ledgerHeadHash");
    return proposals.get(proposal);
  }
  function token(value: Authorization): AuthorizedHumanDecision {
    const result = Object.freeze({}) as AuthorizedHumanDecision;
    authorizations.set(result, value);
    return result;
  }
  function consume(value: AuthorizedHumanDecision, source: StorySourceSnapshot, script: StoryScriptVersion) {
    const command = authorizations.get(value);
    if (!command) fail("UNTRUSTED_RECEIPT", "authorization");
    // Single use, including a failed stale/expired submission.
    authorizations.delete(value);
    const context = checked(source, script);
    assertProposal(command.proposal);
    if (!("receiptId" in command.decision) && (command.proposal.scriptHash !== context.script.scriptHash || command.proposal.binding.sourceContextHash !== context.source.sourceContextHash)) fail("STALE_CONTEXT", "authorization.context");
    const issuedAt = date(clock(), "server.issuedAt");
    if (issuedAt < command.reviewedAt || Date.parse(issuedAt) - Date.parse(command.reviewedAt) > HUMAN_VERIFICATION.decisionTtlMs) fail("STALE_CONTEXT", "authorization.reviewedAt");
    return { command, context, issuedAt };
  }
  function append(command: Authorization, issuedAt: string, context: Context): HumanVerificationEntry {
    if (entries.length >= HUMAN_VERIFICATION.maxEntries) fail("SIZE_LIMIT", "verification.ledger");
    if (entries.at(-1) && issuedAt < entries.at(-1)!.issuedAt) fail("INVALID_TIMESTAMP", "server.issuedAt");
    const decision = command.decision, revocation = "receiptId" in decision;
    const previous = latest(command.proposal.binding.claimId);
    if (revocation && (!previous || previous.id !== decision.receiptId || previous.kind !== "RECEIPT")) fail("STALE_CONTEXT", "revocation.receiptId");
    const content = {
      schemaVersion: HUMAN_VERIFICATION.version, kind: revocation ? "REVOCATION" as const : "RECEIPT" as const,
      previousEntryId: previous?.id ?? null, sequence: entries.length, previousLedgerHash: ledgerHash(), persisted: false as const,
      proposal: command.proposal, outcome: revocation ? "REVOKED" as const : decision.outcome,
      comparison: revocation ? null : decision.comparison, rationale: decision.rationale,
      operator: command.operator, reviewedAt: command.reviewedAt, issuedAt,
      basisReceiptHashes: !revocation && decision.outcome === "SOURCE_VERIFIED" ? basisReceipts(command.proposal, context) : [],
    };
    canonicalJson(content, LIMITS.receiptBytes);
    const entryHash = contractHash("story-human-verification-entry-v1", content);
    const entry = freeze({ ...content, id: `verification-${entryHash}`, entryHash });
    canonicalJson(entry, LIMITS.receiptBytes);
    entries = Object.freeze([...entries, entry]);
    // Historical receipts retain hashes, never an entire source/script per entry.
    proposals.set(command.proposal, null);
    return entry;
  }
  return Object.freeze({
    capability: Object.freeze({ persistence: "NONE", operatorAuthority: authority ? "ADAPTER_CONFIGURED" : "UNAVAILABLE", liveCurrentness: "NOT_CHECKED" }),
    propose(source: StorySourceSnapshot, script: StoryScriptVersion, request: unknown): SourceVerificationProposal {
      canonicalJson(request, LIMITS.receiptBytes);
      const row = record(request, ["projectId", "movieId", "claimId", "claimContentHash", "sourceContextHash", "scriptHash"], "proposal.request");
      if (row.projectId !== scope.projectId || row.movieId !== scope.movieId) fail("SCOPE_MISMATCH", "proposal.request");
      const context = checked(source, script);
      const binding = verificationBinding(id(row.claimId, "proposal.request.claimId"), context.source, context.script);
      if (hash(row.claimContentHash, "proposal.request.claimContentHash") !== binding.claimContentHash
        || hash(row.sourceContextHash, "proposal.request.sourceContextHash") !== binding.sourceContextHash
        || hash(row.scriptHash, "proposal.request.scriptHash") !== context.script.scriptHash) fail("STALE_CONTEXT", "proposal.request");
      const claim = allClaims(context.script).find(row => row.id === binding.claimId)!;
      const chineseEvidenceHash = contractHash("story-compared-chinese-v1", claim.evidence.map(anchor => ({
        anchor: anchorKey(anchor), segment: context.source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)!,
      })));
      const translationContextHash = contractHash("story-compared-translations-v1", binding.translationContextRefs);
      const content = { schemaVersion: HUMAN_VERIFICATION.version, kind: "SOURCE_COMPARISON_PROPOSAL" as const,
        persisted: false as const, binding, scriptHash: context.script.scriptHash,
        chineseEvidenceHash, translationContextHash, rubricVersion: HUMAN_VERIFICATION.rubricVersion,
        policyVersion: HUMAN_VERIFICATION.version, ledgerHeadHash: ledgerHash() };
      const proposal = freeze({ ...content, proposalHash: contractHash("story-human-verification-proposal-v1", content) });
      proposals.set(proposal, context);
      return proposal;
    },
    authorize(proposal: SourceVerificationProposal, value: unknown, session: unknown): AuthorizedHumanDecision {
      const context = assertProposal(proposal);
      if (!context) fail("UNTRUSTED_RECEIPT", "proposal");
      const decision = parseDecision(value, proposal), grant = operator(session, "VERIFY_SOURCE");
      if (decision.outcome === "SOURCE_VERIFIED") basisReceipts(proposal, context);
      return token({ proposal, decision, operator: grant, reviewedAt: date(clock(), "server.reviewedAt") });
    },
    issue(authorization: AuthorizedHumanDecision, source: StorySourceSnapshot, script: StoryScriptVersion) {
      const { command, context, issuedAt } = consume(authorization, source, script);
      if ("receiptId" in command.decision) fail("UNTRUSTED_RECEIPT", "authorization.kind");
      return append(command, issuedAt, context);
    },
    authorizeRevocation(receiptId: string, rationale: unknown, session: unknown): AuthorizedHumanDecision {
      const entry = entries.find(row => row.id === id(receiptId, "revocation.receiptId"));
      if (!entry || entry.kind !== "RECEIPT" || latest(entry.proposal.binding.claimId)?.id !== entry.id) fail("UNTRUSTED_RECEIPT", "revocation.receiptId");
      // Revocation does not require the old evidence to remain current. Preserve its bindings.
      const { proposalHash: previousHash, ...content } = entry.proposal;
      // The original hash remains in the historical entry; this command has a new ledger binding.
      if (!previousHash) fail("UNTRUSTED_RECEIPT", "revocation.proposal");
      const binding = { ...content, ledgerHeadHash: ledgerHash() };
      const proposal = freeze({ ...binding, proposalHash: contractHash("story-human-verification-proposal-v1", binding) });
      proposals.set(proposal, null);
      return token({ proposal, decision: { receiptId: entry.id, rationale: text(rationale, 2000, "revocation.rationale") },
        operator: operator(session, "REVOKE_VERIFICATION"), reviewedAt: date(clock(), "server.reviewedAt") });
    },
    revoke(authorization: AuthorizedHumanDecision, source: StorySourceSnapshot, script: StoryScriptVersion) {
      const { command, context, issuedAt } = consume(authorization, source, script);
      if (!("receiptId" in command.decision)) fail("UNTRUSTED_RECEIPT", "authorization.kind");
      return append(command, issuedAt, context);
    },
    lookup(receiptId: string, source: StorySourceSnapshot, script: StoryScriptVersion) {
      const context = checked(source, script), entry = entries.find(row => row.id === id(receiptId, "lookup.receiptId"));
      return entry ? freeze({ entry, state: currentState(entry, context) }) : undefined;
    },
    evaluate(source: StorySourceSnapshot, script: StoryScriptVersion, eventsValue: unknown = []) {
      return deriveEligibility(checked(source, script), entries, eventsValue);
    },
    history: () => entries,
  });
}
