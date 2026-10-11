import "server-only";
import { canonicalJson, contractHash } from "./canonical";
import { LIMITS, STORYLINE, type ClaimReview, type SourceReviewEligibility, type SourceVerificationReceipt,
  type StoryScriptVersion, type StorySourceSnapshot, type TrustedReceiptLookup } from "./contracts";
import { allClaims, allowedClaimAnchors, claimContentHash, validateScriptPayload } from "./script";
import { anchorKey, validateSourceSnapshot } from "./source";
import { array, date, enumeration, fail, freeze, hash, id, literal, record, text, unique } from "./validation";

export function assertCurrentContracts(source: StorySourceSnapshot, script: StoryScriptVersion) {
  const checkedSource = validateSourceSnapshot(source.payload, { projectId: source.payload.projectId, movieId: source.payload.movieId });
  if (checkedSource.sourceContentHash !== source.sourceContentHash || checkedSource.sourceContextHash !== source.sourceContextHash || canonicalJson(checkedSource.admissions) !== canonicalJson(source.admissions)) fail("STALE_CONTEXT", "source");
  if (validateScriptPayload(script.payload, checkedSource).scriptHash !== script.scriptHash) fail("STALE_CONTEXT", "script.scriptHash");
}

/** Binding calculation, not a receipt issuer. It contains no human authorization. */
export function verificationBinding(claimId: string, source: StorySourceSnapshot, script: StoryScriptVersion) {
  const claims = allClaims(script), claim = claims.find(row => row.id === claimId);
  if (!claim) fail("INVALID_ANCHOR", "receipt.claimId");
  const basisClaimHashes = claim.kind === "INFERRED" ? claim.inferenceBasisClaimIds.map(claimId => ({ claimId, hash: claimContentHash(claims.find(row => row.id === claimId)!, script) })) : [];
  return {
    projectId: source.payload.projectId, movieId: source.payload.movieId,
    sourceSnapshotId: source.payload.id, sourceContentHash: source.sourceContentHash, sourceContextHash: source.sourceContextHash,
    claimId, claimContentHash: claimContentHash(claim, script),
    anchorSetHash: contractHash("story-cited-anchors-v1", claim.evidence.map(anchorKey).sort()),
    allowedAnchorSetHash: contractHash("story-allowed-anchors-v1", allowedClaimAnchors(claim, source).map(anchorKey).sort()),
    translationContextRefs: claim.translationContextRefs, basisClaimHashes,
    qualificationHash: contractHash("story-qualification-v1", claim.kind === "INFERRED" ? claim.qualification : null),
  };
}

/** Valid shape/bindings DO NOT establish origin or trust. Only server lookup can do that. */
export function validateVerificationReceipt(value: unknown, source: StorySourceSnapshot, script: StoryScriptVersion): import("./contracts").Immutable<SourceVerificationReceipt> {
  assertCurrentContracts(source, script);
  return parseReceipt(value, source, script);
}
function parseReceipt(value: unknown, source: StorySourceSnapshot, script: StoryScriptVersion): import("./contracts").Immutable<SourceVerificationReceipt> {
  canonicalJson(value, LIMITS.receiptBytes);
  const p = "receipt", row = record(value, ["schemaVersion", "id", "issuer", "projectId", "movieId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "claimId", "claimContentHash", "anchorSetHash", "allowedAnchorSetHash", "translationContextRefs", "basisClaimHashes", "qualificationHash", "policyVersion", "outcome", "operatorLabel", "rationale", "verifiedAt"], p);
  const receipt: SourceVerificationReceipt = {
    schemaVersion: literal(row.schemaVersion, STORYLINE.verificationVersion, `${p}.schemaVersion`), id: id(row.id, `${p}.id`), issuer: literal(row.issuer, "HUMAN", `${p}.issuer`),
    projectId: id(row.projectId, `${p}.projectId`), movieId: id(row.movieId, `${p}.movieId`), sourceSnapshotId: id(row.sourceSnapshotId, `${p}.sourceSnapshotId`),
    sourceContentHash: hash(row.sourceContentHash, `${p}.sourceContentHash`), sourceContextHash: hash(row.sourceContextHash, `${p}.sourceContextHash`), claimId: id(row.claimId, `${p}.claimId`), claimContentHash: hash(row.claimContentHash, `${p}.claimContentHash`),
    anchorSetHash: hash(row.anchorSetHash, `${p}.anchorSetHash`), allowedAnchorSetHash: hash(row.allowedAnchorSetHash, `${p}.allowedAnchorSetHash`), qualificationHash: hash(row.qualificationHash, `${p}.qualificationHash`),
    translationContextRefs: array(row.translationContextRefs, LIMITS.anchors, `${p}.translationContextRefs`).map(raw => {
      const item = record(raw, ["translationSegmentId", "rowContextHash"], `${p}.translationContextRefs`);
      return { translationSegmentId: id(item.translationSegmentId, `${p}.translationContextRefs.translationSegmentId`), rowContextHash: hash(item.rowContextHash, `${p}.translationContextRefs.rowContextHash`) };
    }).sort((a, b) => a.translationSegmentId < b.translationSegmentId ? -1 : 1),
    basisClaimHashes: array(row.basisClaimHashes, LIMITS.claimsPerBeat, `${p}.basisClaimHashes`).map(raw => {
      const item = record(raw, ["claimId", "hash"], `${p}.basisClaimHashes`);
      return { claimId: id(item.claimId, `${p}.basisClaimHashes.claimId`), hash: hash(item.hash, `${p}.basisClaimHashes.hash`) };
    }).sort((a, b) => a.claimId < b.claimId ? -1 : 1),
    policyVersion: literal(row.policyVersion, STORYLINE.verificationVersion, `${p}.policyVersion`), outcome: enumeration(row.outcome, ["SUPPORTED", "UNSUPPORTED", "INCONCLUSIVE"], `${p}.outcome`),
    operatorLabel: text(row.operatorLabel, 160, `${p}.operatorLabel`), rationale: text(row.rationale, 2000, `${p}.rationale`), verifiedAt: date(row.verifiedAt, `${p}.verifiedAt`),
  };
  unique(receipt.translationContextRefs, row => row.translationSegmentId, `${p}.translationContextRefs`); unique(receipt.basisClaimHashes, row => row.claimId, `${p}.basisClaimHashes`);
  const expected = verificationBinding(receipt.claimId, source, script);
  const actual = Object.fromEntries(Object.keys(expected).map(key => [key, receipt[key as keyof SourceVerificationReceipt]]));
  if (canonicalJson(actual) !== canonicalJson(expected)) fail("RECEIPT_BINDING_INVALID", p);
  return freeze(receipt);
}

/** Only source-review eligibility, NOT final script approval or evidence of objective truth.
 * M1-B must supply a server-owned, latest/non-revoked receipt lookup from authoritative storage.
 * Client/provider receipt bodies and status fields are never accepted here.
 */
export function evaluateSourceReview(source: StorySourceSnapshot, script: StoryScriptVersion, references: unknown = [], lookup: TrustedReceiptLookup = () => undefined): SourceReviewEligibility {
  assertCurrentContracts(source, script);
  canonicalJson(references, LIMITS.scriptBytes);
  const claims = allClaims(script);
  const refs = array(references, LIMITS.beats * LIMITS.claimsPerBeat, "receiptReferences").map(raw => {
    const row = record(raw, ["claimId", "receiptId"], "receiptReferences");
    const ref = { claimId: id(row.claimId, "receiptReferences.claimId"), receiptId: id(row.receiptId, "receiptReferences.receiptId") };
    if (!claims.some(claim => claim.id === ref.claimId)) fail("INVALID_ANCHOR", "receiptReferences.claimId");
    return ref;
  });
  unique(refs, row => row.claimId, "receiptReferences"); unique(refs, row => row.receiptId, "receiptReferences");
  const receipts = refs.map(ref => {
    let stored: unknown;
    try { stored = lookup(ref.receiptId); } catch { fail("UNTRUSTED_RECEIPT", "receiptReferences"); }
    if (stored === undefined) fail("UNTRUSTED_RECEIPT", "receiptReferences");
    const receipt = parseReceipt(stored, source, script);
    if (receipt.id !== ref.receiptId || receipt.claimId !== ref.claimId) fail("RECEIPT_BINDING_INVALID", "receiptReferences");
    return receipt;
  });
  const reviews: ClaimReview[] = claims.map(claim => {
    const receipt = receipts.find(row => row.claimId === claim.id);
    if (!receipt) return { claimId: claim.id, verificationStatus: claim.translationContextRefs.length ? "PROVISIONAL_TRANSLATION_CONTEXT" : "PENDING_SOURCE_REVIEW", reviewStatus: "NEEDS_HUMAN_REVIEW", receiptId: null };
    if (receipt.outcome === "SUPPORTED") return { claimId: claim.id, verificationStatus: "SOURCE_VERIFIED", reviewStatus: "ACCEPTED", receiptId: receipt.id };
    if (receipt.outcome === "INCONCLUSIVE") return { claimId: claim.id, verificationStatus: claim.translationContextRefs.length ? "PROVISIONAL_TRANSLATION_CONTEXT" : "PENDING_SOURCE_REVIEW", reviewStatus: "NEEDS_HUMAN_REVIEW", receiptId: receipt.id };
    return { claimId: claim.id, verificationStatus: "UNSUPPORTED_OR_INVALID_EVIDENCE", reviewStatus: "BLOCKED", receiptId: receipt.id };
  });
  for (const claim of claims) if (claim.kind === "INFERRED" && claim.inferenceBasisClaimIds.some(id => reviews.find(row => row.claimId === id)?.verificationStatus !== "SOURCE_VERIFIED")) {
    const review = reviews.find(row => row.claimId === claim.id)!;
    review.verificationStatus = claim.translationContextRefs.length ? "PROVISIONAL_TRANSLATION_CONTEXT" : "PENDING_SOURCE_REVIEW";
    review.reviewStatus = "NEEDS_HUMAN_REVIEW";
    if (receipts.some(row => row.claimId === claim.id && row.outcome === "UNSUPPORTED")) { review.verificationStatus = "UNSUPPORTED_OR_INVALID_EVIDENCE"; review.reviewStatus = "BLOCKED"; }
  }
  return freeze({ scriptHash: script.scriptHash, sourceContextHash: source.sourceContextHash, claims: reviews,
    sourceEligible: reviews.every(row => row.verificationStatus === "SOURCE_VERIFIED" && row.reviewStatus === "ACCEPTED"),
    dependencyHash: contractHash("story-source-review-v1", { scriptHash: script.scriptHash, context: source.sourceContextHash, receipts: receipts.sort((a, b) => a.id < b.id ? -1 : 1), reviews }) });
}
