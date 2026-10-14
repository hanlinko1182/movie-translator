import "server-only";
import type { Prisma, StorySourceVerification } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "./canonical";
import { LIMITS } from "./contracts";
import { parseHumanVerificationDecision } from "./human-verification";
import { HUMAN_VERIFICATION, type HumanVerificationDecision, type HumanVerificationState, type SourceVerificationProposal } from "./human-verification-contracts";
import { operatorDecisionHash, type OperatorAuditGrant } from "./operator-authority";
import { allClaims } from "./script";
import { anchorKey } from "./source";
import { verificationBinding } from "./verification";
import type { ReceiptAttestation, ReceiptAttestor } from "./verification-attestation";
import { loadVerificationContext, type VerificationContext } from "./verification-context";
import { VerificationSecurityError } from "./verification-errors";
import { date, freeze, id, record, text } from "./validation";

export const DURABLE_VERIFICATION = Object.freeze({ schemaVersion: "story-persisted-human-verification-v1", issuerPolicyVersion: "story-server-issuer-v1" } as const);
export type DurableVerificationContent = {
  schemaVersion: typeof DURABLE_VERIFICATION.schemaVersion; issuerPolicyVersion: typeof DURABLE_VERIFICATION.issuerPolicyVersion;
  persisted: true; studioId: string; scriptVersionId: string; kind: "RECEIPT" | "REVOCATION";
  previousEntryId: string | null; sequence: number; previousLedgerHash: string;
  proposal: SourceVerificationProposal; outcome: HumanVerificationState;
  comparison: HumanVerificationDecision["comparison"] | null; rationale: string;
  operator: { authority: "AUTHENTICATED_OPERATOR"; operatorId: string; auditLabel: string };
  authorityDecision: OperatorAuditGrant; reviewedAt: string; issuedAt: string;
  basisReceiptHashes: readonly { claimId: string; receiptHash: string }[];
  issuerAttestation: ReceiptAttestation;
};
export type DurableVerificationEntry = { id: string; entryHash: string; content: DurableVerificationContent };

/** Publicly reproducible proposal/hash is never an authorization capability. */
export function durableVerificationProposal(context: VerificationContext, claimId: string, ledgerHeadHash: string): SourceVerificationProposal {
  const { source, script } = context, binding = verificationBinding(claimId, source, script);
  const claim = allClaims(script).find(row => row.id === claimId)!;
  const content = { schemaVersion: HUMAN_VERIFICATION.version, kind: "SOURCE_COMPARISON_PROPOSAL" as const, persisted: false as const,
    binding, scriptHash: script.scriptHash,
    chineseEvidenceHash: contractHash("story-compared-chinese-v1", claim.evidence.map(anchor => ({ anchor: anchorKey(anchor),
      segment: source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)! }))),
    translationContextHash: contractHash("story-compared-translations-v1", binding.translationContextRefs),
    rubricVersion: HUMAN_VERIFICATION.rubricVersion, policyVersion: HUMAN_VERIFICATION.version, ledgerHeadHash };
  return freeze({ ...content, proposalHash: contractHash("story-human-verification-proposal-v1", content) });
}
export const verificationGenesis = (context: VerificationContext) => contractHash("story-verification-ledger-empty-v1", {
  projectId: context.scope.projectId, movieId: context.scope.movieId,
});
export const verificationLedgerHead = (entries: readonly DurableVerificationEntry[], context: VerificationContext) => entries.at(-1)?.entryHash ?? verificationGenesis(context);
export const latestVerification = (entries: readonly DurableVerificationEntry[], claimId: string) => entries.findLast(row => row.content.proposal.binding.claimId === claimId);

export function durableVerificationState(entries: readonly DurableVerificationEntry[], entry: DurableVerificationEntry, context: VerificationContext): HumanVerificationState {
  if (latestVerification(entries, entry.content.proposal.binding.claimId)?.id !== entry.id) return "SUPERSEDED";
  if (entry.content.kind === "REVOCATION") return "REVOKED";
  const claimId = entry.content.proposal.binding.claimId;
  if (!allClaims(context.script).some(row => row.id === claimId) || entry.content.scriptVersionId !== context.script.payload.id ||
    canonicalJson(entry.content.proposal.binding) !== canonicalJson(verificationBinding(claimId, context.source, context.script)) ||
    entry.content.proposal.scriptHash !== context.script.scriptHash) return "STALE";
  if (entry.content.outcome === "SOURCE_VERIFIED" && entry.content.basisReceiptHashes.some(basis => {
    const current = latestVerification(entries, basis.claimId);
    return !current || current.entryHash !== basis.receiptHash || durableVerificationState(entries, current, context) !== "SOURCE_VERIFIED";
  })) return "STALE";
  return entry.content.outcome;
}
export function verifiedBasisReceipts(entries: readonly DurableVerificationEntry[], context: VerificationContext, proposal: SourceVerificationProposal) {
  return proposal.binding.basisClaimHashes.map(basis => {
    const entry = latestVerification(entries, basis.claimId);
    if (!entry || durableVerificationState(entries, entry, context) !== "SOURCE_VERIFIED") throw new VerificationSecurityError("VERIFICATION_BASIS_UNVERIFIED");
    return { claimId: basis.claimId, receiptHash: entry.entryHash };
  });
}
export function signDurableVerification(content: Omit<DurableVerificationContent, "issuerAttestation">, attestor: ReceiptAttestor): DurableVerificationEntry {
  const signed = { ...content, issuerAttestation: attestor.sign(content) };
  canonicalJson(signed, LIMITS.receiptBytes);
  const entryHash = contractHash("story-persisted-human-verification-entry-v1", signed);
  return freeze({ id: `verification-${entryHash}`, entryHash, content: signed });
}

/** Revalidate every authoritative row, historical context, signature and chain.
 * Neither a valid database shape nor a caller-provided receipt supplies trust. */
export async function readDurableVerificationLedger(tx: Prisma.TransactionClient, context: VerificationContext, attestor: ReceiptAttestor): Promise<readonly DurableVerificationEntry[]> {
  try {
    const rows = await tx.storySourceVerification.findMany({ where: { studioId: context.scope.studioId }, orderBy: { sequence: "asc" }, take: HUMAN_VERIFICATION.maxEntries + 1 });
    if (rows.length > HUMAN_VERIFICATION.maxEntries) throw new Error();
    const contexts = new Map<string, VerificationContext>([[context.script.payload.id, context]]), entries: DurableVerificationEntry[] = [];
    for (const row of rows) {
      let historical = contexts.get(row.scriptVersionId);
      if (!historical) { historical = await loadVerificationContext(tx, context.scope, row.scriptVersionId, false); contexts.set(row.scriptVersionId, historical); }
      const raw = JSON.parse(row.canonicalPayload) as DurableVerificationContent;
      record(raw, ["schemaVersion", "issuerPolicyVersion", "persisted", "studioId", "scriptVersionId", "kind", "previousEntryId", "sequence", "previousLedgerHash",
        "proposal", "outcome", "comparison", "rationale", "operator", "authorityDecision", "reviewedAt", "issuedAt", "basisReceiptHashes", "issuerAttestation"], "durableReceipt");
      canonicalJson(raw, LIMITS.receiptBytes);
      const { issuerAttestation, ...unsigned } = raw;
      record(issuerAttestation, ["algorithm", "keyId", "signature"], "attestation");
      if (!attestor.verify(unsigned, issuerAttestation) || canonicalJson(raw) !== row.canonicalPayload) throw new Error();
      const previous = latestVerification(entries, row.claimId), head = verificationLedgerHead(entries, context);
      const proposal = durableVerificationProposal(historical, row.claimId, head);
      if (canonicalJson(raw.proposal) !== canonicalJson(proposal) || raw.sequence !== entries.length || raw.previousLedgerHash !== head ||
        raw.previousEntryId !== (previous?.id ?? null) || raw.studioId !== context.scope.studioId || raw.scriptVersionId !== historical.script.payload.id ||
        raw.schemaVersion !== DURABLE_VERIFICATION.schemaVersion || raw.issuerPolicyVersion !== DURABLE_VERIFICATION.issuerPolicyVersion || raw.persisted !== true) throw new Error();
      const rationale = text(raw.rationale, 2000, "rationale"), reviewedAt = date(raw.reviewedAt, "reviewedAt"), issuedAt = date(raw.issuedAt, "issuedAt");
      if (issuedAt < reviewedAt || Date.parse(issuedAt) - Date.parse(reviewedAt) > HUMAN_VERIFICATION.decisionTtlMs ||
        entries.at(-1) && issuedAt < entries.at(-1)!.content.issuedAt) throw new Error();
      let decisionHash: string;
      if (raw.kind === "RECEIPT") {
        const decision = parseHumanVerificationDecision({ proposalHash: proposal.proposalHash, chineseEvidenceHash: proposal.chineseEvidenceHash,
          translationContextHash: proposal.translationContextHash, acknowledgedChineseComparison: true,
          outcome: raw.outcome, comparison: raw.comparison, rationale }, proposal);
        decisionHash = operatorDecisionHash({ proposalHash: proposal.proposalHash, decision });
        const basis = raw.outcome === "SOURCE_VERIFIED" ? verifiedBasisReceipts(entries, historical, proposal) : [];
        if (canonicalJson(raw.basisReceiptHashes) !== canonicalJson(basis)) throw new Error();
      } else if (raw.kind === "REVOCATION") {
        if (!previous || previous.content.kind !== "RECEIPT" || raw.outcome !== "REVOKED" || raw.comparison !== null || raw.basisReceiptHashes.length ||
          raw.scriptVersionId !== previous.content.scriptVersionId || canonicalJson(proposal.binding) !== canonicalJson(previous.content.proposal.binding)) throw new Error();
        decisionHash = operatorDecisionHash({ proposalHash: proposal.proposalHash, receiptId: previous.id, rationale });
      } else throw new Error();
      const grant = raw.authorityDecision;
      record(grant, ["scope", "action", "decisionHash", "providerId", "subjectId", "auditLabel", "authenticatedAt", "authorizedAt", "expiresAt"], "authorityDecision");
      record(grant.scope, ["projectId", "movieId", "studioId"], "authorityScope");
      id(grant.providerId, "providerId"); id(grant.subjectId, "subjectId"); text(grant.auditLabel, 160, "auditLabel");
      if (canonicalJson(grant.scope) !== canonicalJson(context.scope) || grant.action !== (raw.kind === "RECEIPT" ? "VERIFY_SOURCE" : "REVOKE_VERIFICATION") ||
        grant.decisionHash !== decisionHash || date(grant.authenticatedAt, "authenticatedAt") > reviewedAt || date(grant.authorizedAt, "authorizedAt") !== reviewedAt ||
        date(grant.expiresAt, "expiresAt") < issuedAt || Date.parse(grant.expiresAt) - Date.parse(reviewedAt) > HUMAN_VERIFICATION.decisionTtlMs ||
        canonicalJson(raw.operator) !== canonicalJson({ authority: "AUTHENTICATED_OPERATOR", operatorId: grant.subjectId, auditLabel: grant.auditLabel })) throw new Error();
      const entryHash = contractHash("story-persisted-human-verification-entry-v1", raw);
      if (!matchesRow(row, raw, entryHash)) throw new Error();
      entries.push(freeze({ id: row.id, entryHash, content: raw }));
    }
    return Object.freeze(entries);
  } catch { throw new VerificationSecurityError("VERIFICATION_HISTORY_INVALID"); }
}
function matchesRow(row: StorySourceVerification, content: DurableVerificationContent, entryHash: string) {
  const b = content.proposal.binding;
  const projected = { id: `verification-${entryHash}`, entryHash, studioId: content.studioId, scriptVersionId: content.scriptVersionId,
    sourceSnapshotId: b.sourceSnapshotId, sourceContentHash: b.sourceContentHash, sourceContextHash: b.sourceContextHash,
    scriptHash: content.proposal.scriptHash, claimId: b.claimId, claimContentHash: b.claimContentHash, anchorSetHash: b.anchorSetHash,
    allowedAnchorSetHash: b.allowedAnchorSetHash, translationContextHash: content.proposal.translationContextHash, qualificationHash: b.qualificationHash,
    sequence: content.sequence, previousLedgerHash: content.previousLedgerHash, previousEntryId: content.previousEntryId, kind: content.kind, outcome: content.outcome,
    policyVersion: content.proposal.policyVersion, issuerPolicyVersion: content.issuerPolicyVersion, reviewedAt: content.reviewedAt, issuedAt: content.issuedAt };
  return Object.entries(projected).every(([key, value]) => {
    const stored = row[key as keyof StorySourceVerification];
    return (stored instanceof Date ? stored.toISOString() : stored) === value;
  });
}
