import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { date, freeze, hash, id, integer, literal, nullable, record } from "../validation";
import { parseHighlightInput } from "../highlights/input";
import type { HighlightPlan, SyntheticHighlightCapture } from "../highlights/contracts";
import type { Immutable } from "../contracts";

export const HIGHLIGHT_STORE = {
  proposal: "story-highlight-save-proposal-v1", record: "story-highlight-saved-record-v1",
  dependency: "story-highlight-stored-dependency-v1", fence: "story-highlight-currentness-fence-v1",
  audit: "story-highlight-save-audit-v1", authorization: "disposable-highlight-m602-authorization-v1",
  maxBytes: 3 * 1024 * 1024, maxHistory: 5, maxRevision: 1000000,
} as const;
export const savedHighlightRestrictions = Object.freeze({ execution: "SYNTHETIC_ONLY", storage: "DISPOSABLE_POSTGRES_ONLY",
  humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false, eligibleForPublication: false,
  originalMovieAudio: "EXCLUDED", voiceSynchronization: "UNSUPPORTED" } as const);
export type HighlightStoreScope = { tenantId: string; projectId: string; movieId: string; studioId: string };
export type HighlightRecordIdentity = { id: string; recordHash: string; planHash: string; version: number };
/** Tenant-scoped immutable envelope, independently reconstructed from SQL rows. */
export type HighlightDependencyEnvelope = { schemaVersion: typeof HIGHLIGHT_STORE.dependency; scope: HighlightStoreScope; capture: SyntheticHighlightCapture };
/** The record hash binds exact source/candidate/narration revisions, policy,
 * plan and previous head. The remaining fields bind its current SQL backend. */
export type HighlightCurrentnessFence = { schemaVersion: typeof HIGHLIGHT_STORE.fence; scope: HighlightStoreScope;
  reservationId: string; challenge: string; recordHash: string; dependencyHash: string; backendPid: number; transactionId: string };
export type SaveHighlightProposal = { schemaVersion: typeof HIGHLIGHT_STORE.proposal; scope: HighlightStoreScope;
  idempotencyKey: string; expectedRevision: number; previous: HighlightRecordIdentity | null; plan: HighlightPlan };
export type StoredHighlightRecord = { schemaVersion: typeof HIGHLIGHT_STORE.record; scope: HighlightStoreScope;
  id: string; version: number; previous: HighlightRecordIdentity | null; expectedRevision: number;
  idempotencyKey: string; proposalHash: string; dependencyId: string; dependencyHash: string;
  createdAt: string; editor: { principalId: string; sessionId: string }; plan: HighlightPlan; restrictions: typeof savedHighlightRestrictions };
export type HighlightRecordView = Immutable<{ record: StoredHighlightRecord; recordHash: string;
  currentness: "CURRENT_AT_READ" | "STALE_DEPENDENCIES" }>;
export type HighlightHistoryView = Immutable<{ scope: HighlightStoreScope; entries: HighlightRecordView[]; nextAfterVersion: number | null }>;
export type HighlightSaveAuditEvent = Immutable<{ schemaVersion: typeof HIGHLIGHT_STORE.audit; scope: HighlightStoreScope;
  versionId: string; version: number; previous: HighlightRecordIdentity | null; recordHash: string; proposalHash: string;
  dependencyId: string; dependencyHash: string; actor: { principalId: string; sessionId: string }; createdAt: string; action: "SAVE_HIGHLIGHT_VERSION" }>;
export type HighlightSaveResult = { status: "SAVED" | "REUSED"; view: HighlightRecordView }
  | { status: "UNKNOWN"; scope: Immutable<HighlightStoreScope>; idempotencyKey: string; proposalHash: string;
      safeCode: "COMMIT_ACK_LOST" | "READBACK_UNAVAILABLE" };
export type DependencyView = { id: string; hash: string; scope: HighlightStoreScope; capture: SyntheticHighlightCapture };
export const STORE_ERRORS = ["AUTH_REQUIRED", "SESSION_INVALID", "ORIGIN_REJECTED", "CSRF_REJECTED", "FORBIDDEN",
  "INVALID_INPUT", "DATABASE_UNSAFE", "PROOF_INVALID", "STALE_SOURCE", "REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT",
  "INVALID_PLAN", "NOT_FOUND", "INTEGRITY_FAILED", "TRANSACTION_FAILED"] as const;
export class HighlightStoreError extends Error {
  constructor(readonly code: typeof STORE_ERRORS[number]) { super("Disposable highlight repository rejected"); this.name = "HighlightStoreError"; }
}
export function rejectStore(code: HighlightStoreError["code"]): never { throw new HighlightStoreError(code); }
export const storeSame = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
export const storeCapture = (v: unknown, max = HIGHLIGHT_STORE.maxBytes): unknown => JSON.parse(canonicalJson(v, max));
export function parseStoreScope(v: unknown): HighlightStoreScope {
  const r = record(v, ["tenantId", "projectId", "movieId", "studioId"], "highlightStore.scope");
  return { tenantId: id(r.tenantId, "highlightStore.tenant"), projectId: id(r.projectId, "highlightStore.project"),
    movieId: id(r.movieId, "highlightStore.movie"), studioId: id(r.studioId, "highlightStore.studio") };
}
export function parseRecordIdentity(v: unknown): HighlightRecordIdentity {
  const r = record(v, ["id", "recordHash", "planHash", "version"], "highlightStore.identity"), version = integer(r.version, "highlightStore.version", HIGHLIGHT_STORE.maxRevision);
  if (!version) rejectStore("INVALID_INPUT");
  return { id: id(r.id, "highlightStore.id"), recordHash: hash(r.recordHash, "highlightStore.recordHash"), planHash: hash(r.planHash, "highlightStore.planHash"), version };
}
/** Shape only. Complete M6 replay requires independently stored expectations. */
export function parseSaveHighlightProposal(value: unknown) {
  try {
    const r = record(storeCapture(value), ["schemaVersion", "scope", "idempotencyKey", "expectedRevision", "previous", "plan"], "highlightStore.proposal");
    const scope = parseStoreScope(r.scope), expectedRevision = integer(r.expectedRevision, "highlightStore.revision", HIGHLIGHT_STORE.maxRevision - 1);
    const previous = nullable(r.previous, parseRecordIdentity), plan = record(r.plan, ["plan", "planHash"], "highlightStore.plan");
    hash(plan.planHash, "highlightStore.planHash");
    if (!plan.plan || typeof plan.plan !== "object") rejectStore("INVALID_INPUT");
    const input = parseHighlightInput(Object.getOwnPropertyDescriptor(plan.plan, "input")?.value);
    const selection = { projectId: scope.projectId, movieId: scope.movieId, studioId: scope.studioId };
    if (!storeSame(selection, input.source.narration.scope) || (expectedRevision === 0) !== (previous === null) || previous && previous.version !== expectedRevision) rejectStore("INVALID_INPUT");
    return freeze({ schemaVersion: literal(r.schemaVersion, HIGHLIGHT_STORE.proposal, "highlightStore.schema"), scope,
      idempotencyKey: id(r.idempotencyKey, "highlightStore.key"), expectedRevision, previous, plan: r.plan as HighlightPlan });
  } catch (e) { if (e instanceof HighlightStoreError) throw e; rejectStore("INVALID_INPUT"); }
}
export const highlightProposalHash = (v: unknown) => contractHash(HIGHLIGHT_STORE.proposal, parseSaveHighlightProposal(v));
export function parseStoredRecord(value: unknown) {
  const r = record(storeCapture(value), ["schemaVersion", "scope", "id", "version", "previous", "expectedRevision", "idempotencyKey", "proposalHash", "dependencyId", "dependencyHash", "createdAt", "editor", "plan", "restrictions"], "highlightStore.record");
  const proposal = parseSaveHighlightProposal({ schemaVersion: HIGHLIGHT_STORE.proposal, scope: r.scope, idempotencyKey: r.idempotencyKey,
    expectedRevision: r.expectedRevision, previous: r.previous, plan: r.plan });
  const editor = record(r.editor, ["principalId", "sessionId"], "highlightStore.editor");
  const version = integer(r.version, "highlightStore.version", HIGHLIGHT_STORE.maxRevision);
  if (version !== proposal.expectedRevision + 1 || r.proposalHash !== highlightProposalHash(proposal) || !storeSame(r.restrictions, savedHighlightRestrictions)) rejectStore("INTEGRITY_FAILED");
  return freeze({ schemaVersion: literal(r.schemaVersion, HIGHLIGHT_STORE.record, "highlightStore.record.schema"), scope: proposal.scope,
    id: id(r.id, "highlightStore.id"), version, previous: proposal.previous, expectedRevision: proposal.expectedRevision,
    idempotencyKey: proposal.idempotencyKey, proposalHash: hash(r.proposalHash, "highlightStore.proposalHash"), dependencyId: id(r.dependencyId, "highlightStore.dependencyId"),
    dependencyHash: hash(r.dependencyHash, "highlightStore.dependencyHash"), createdAt: date(r.createdAt, "highlightStore.createdAt"),
    editor: { principalId: id(editor.principalId, "highlightStore.principal"), sessionId: id(editor.sessionId, "highlightStore.session") }, plan: proposal.plan, restrictions: savedHighlightRestrictions });
}
