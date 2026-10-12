import type { Immutable, SourceVerificationReceipt } from "./contracts";

export const HUMAN_VERIFICATION = Object.freeze({
  version: "story-human-verification-v1", rubricVersion: "chinese-source-comparison-v1",
  maxEntries: 2048, decisionTtlMs: 5 * 60 * 1000,
} as const);
export const SOURCE_COMPARISON_RUBRIC = Object.freeze({
  identityAttribution: "Identity and speaker/character attribution are supported, with uncertainty preserved.",
  chineseMeaning: "Compare the exact claim and narration against the original Chinese dialogue; do not substitute Myanmar text.",
  translationConsistency: "Compare referenced Myanmar interpretations with Chinese meaning, including approval, provenance and QC context.",
  observedVsInferred: "Separate observed behavior from qualified inference. Cautious wording alone cannot support a motivation.",
  anchorRelevance: "Every cited source anchor supports the attributed claim, not merely the surrounding scene.",
  evidenceOwnership: "Character and relationship claims use only their own permitted anchors and endpoints.",
  chronologyCausality: "Preserve chronology and qualify causal interpretation; sequence alone does not establish causation.",
  evidenceSufficiency: "Unknown, contradictory or insufficient evidence cannot support verification.",
} as const);
export type HumanVerificationOutcome = "SOURCE_VERIFIED" | "INCONCLUSIVE" | "UNSUPPORTED";
export type ComparisonVerdict = "SUPPORTED" | "INSUFFICIENT" | "CONTRADICTED" | "NOT_APPLICABLE";
export type SourceComparison = { -readonly [K in keyof typeof SOURCE_COMPARISON_RUBRIC]: ComparisonVerdict };
export type HumanOperator = {
  authority: "TRUSTED_LOCAL_OPERATOR" | "AUTHENTICATED_OPERATOR";
  operatorId: string; auditLabel: string;
};
/** Trusted bootstrap port, never constructed from a request body or provider output.
 * Local audit labels are NOT authentication. There is no installed adapter in M1-C.
 */
export type HumanOperatorAuthority = {
  resolve(session: unknown, action: "VERIFY_SOURCE" | "REVOKE_VERIFICATION"): HumanOperator | null;
};
export type VerificationBinding = Omit<SourceVerificationReceipt,
  "schemaVersion" | "id" | "issuer" | "policyVersion" | "outcome" | "operatorLabel" | "rationale" | "verifiedAt">;
export type SourceVerificationProposal = Immutable<{
  schemaVersion: typeof HUMAN_VERIFICATION.version; kind: "SOURCE_COMPARISON_PROPOSAL";
  persisted: false; binding: VerificationBinding; scriptHash: string;
  chineseEvidenceHash: string; translationContextHash: string;
  rubricVersion: typeof HUMAN_VERIFICATION.rubricVersion; policyVersion: typeof HUMAN_VERIFICATION.version;
  proposalHash: string; ledgerHeadHash: string;
}>;
export type HumanVerificationDecision = {
  proposalHash: string; chineseEvidenceHash: string; translationContextHash: string;
  acknowledgedChineseComparison: true; outcome: HumanVerificationOutcome;
  comparison: SourceComparison; rationale: string;
};
export type HumanVerificationEntry = Immutable<{
  schemaVersion: typeof HUMAN_VERIFICATION.version; id: string; entryHash: string;
  kind: "RECEIPT" | "REVOCATION"; previousEntryId: string | null;
  sequence: number; previousLedgerHash: string; persisted: false;
  proposal: SourceVerificationProposal;
  outcome: HumanVerificationOutcome | "REVOKED";
  comparison: SourceComparison | null; rationale: string;
  operator: HumanOperator; reviewedAt: string; issuedAt: string;
  basisReceiptHashes: { claimId: string; receiptHash: string }[];
}>;
export type HumanVerificationState = HumanVerificationOutcome | "PENDING" | "STALE" | "REVOKED" | "SUPERSEDED";
// Runtime trust is instance-owned WeakMap identity, not a TypeScript assertion or JSON field.
declare const authorization: unique symbol;
export type AuthorizedHumanDecision = { readonly [authorization]: true };
