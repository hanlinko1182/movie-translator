import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { date, freeze, hash, id, integer, literal, nullable, record } from "../validation";
import { parseRecapTimelineInput } from "../timeline/input";
import { TIMELINE, type RecapTimelinePlan as TimelinePlan, type TimelineObservation } from "../timeline/contracts";
import type { Immutable } from "../contracts";

export const TIMELINE_STORE = {
  proposal: "story-recap-timeline-save-proposal-v1", record: "story-recap-timeline-saved-record-v1",
  dependency: "story-recap-timeline-stored-dependency-v1", fence: "story-recap-timeline-currentness-fence-v1",
  audit: "story-recap-timeline-save-audit-v1", authorization: "disposable-timeline-m702-authorization-v1",
  maxBytes: 3 * 1024 * 1024, maxHistory: 5, maxRevision: 1000000,
} as const;
export const savedTimelineRestrictions = Object.freeze({ execution: "SYNTHETIC_ONLY", storage: "DISPOSABLE_POSTGRES_ONLY",
  humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false, eligibleForPublication: false,
  originalMovieAudio: "EXCLUDED", voiceSynchronization: "UNSUPPORTED", rendering: "NOT_RENDERED", spendingAuthority: "NONE", syntheticAncestry: true } as const);
export type TimelineStoreScope = { tenantId: string; projectId: string; movieId: string; studioId: string };
export type TimelineRecordIdentity = { id: string; recordHash: string; recordHashDomain: typeof TIMELINE_STORE.record; planHash: string; planHashDomain: typeof TIMELINE.plan; version: number };
/** Tenant-scoped immutable envelope, independently reconstructed from SQL rows. */
export type TimelineDependencyEnvelope = { schemaVersion: typeof TIMELINE_STORE.dependency; scope: TimelineStoreScope; observation: TimelineObservation };
/** The record hash binds exact source/candidate/narration revisions, policy,
 * plan and previous head. The remaining fields bind its current SQL backend. */
export type TimelineCurrentnessFence = { schemaVersion: typeof TIMELINE_STORE.fence; scope: TimelineStoreScope;
  reservationId: string; challenge: string; recordHash: string; dependencyHash: string; backendPid: number; transactionId: string };
export type SaveTimelineProposal = { schemaVersion: typeof TIMELINE_STORE.proposal; scope: TimelineStoreScope;
  idempotencyKey: string; expectedRevision: number; previous: TimelineRecordIdentity | null; plan: TimelinePlan };
export type StoredTimelineRecord = { schemaVersion: typeof TIMELINE_STORE.record; scope: TimelineStoreScope;
  id: string; version: number; previous: TimelineRecordIdentity | null; expectedRevision: number;
  idempotencyKey: string; proposalHash: string; dependencyId: string; dependencyHash: string;
  createdAt: string; editor: { principalId: string; sessionId: string }; plan: TimelinePlan; restrictions: typeof savedTimelineRestrictions };
export type TimelineRecordView = Immutable<{ record: StoredTimelineRecord; recordHash: string;
  currentness: "CURRENT_AT_READ" | "STALE_DEPENDENCIES" | "SUPERSEDED" }>;
export type TimelineHistoryView = Immutable<{ scope: TimelineStoreScope; entries: TimelineRecordView[]; nextAfterVersion: number | null }>;
export type TimelineSaveAuditEvent = Immutable<{ schemaVersion: typeof TIMELINE_STORE.audit; scope: TimelineStoreScope;
  versionId: string; version: number; previous: TimelineRecordIdentity | null; recordHash: string; proposalHash: string;
  dependencyId: string; dependencyHash: string; actor: { principalId: string; sessionId: string }; createdAt: string; action: "SAVE_TIMELINE_VERSION" }>;
export type TimelineSaveResult = { status: "SAVED" | "REUSED"; view: TimelineRecordView }
  | { status: "UNKNOWN"; scope: Immutable<TimelineStoreScope>; idempotencyKey: string; proposalHash: string;
      safeCode: "COMMIT_ACK_LOST" | "READBACK_UNAVAILABLE" };
export type DependencyView = Immutable<{ id: string; hash: string; scope: TimelineStoreScope; observation: TimelineObservation }>;
export const STORE_ERRORS = ["AUTH_REQUIRED", "SESSION_INVALID", "ORIGIN_REJECTED", "CSRF_REJECTED", "FORBIDDEN",
  "INVALID_INPUT", "DATABASE_UNSAFE", "PROOF_INVALID", "STALE_SOURCE", "REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT",
  "INVALID_PLAN", "NOT_FOUND", "INTEGRITY_FAILED", "TRANSACTION_FAILED"] as const;
export class TimelineStoreError extends Error {
  constructor(readonly code: typeof STORE_ERRORS[number]) { super("Disposable timeline repository rejected"); this.name = "TimelineStoreError"; }
}
export function rejectStore(code: TimelineStoreError["code"]): never { throw new TimelineStoreError(code); }
export const storeSame = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
export const storeCapture = (v: unknown, max = TIMELINE_STORE.maxBytes): unknown => JSON.parse(canonicalJson(v, max));
export function parseStoreScope(v: unknown): TimelineStoreScope {
  const r = record(v, ["tenantId", "projectId", "movieId", "studioId"], "timelineStore.scope");
  return { tenantId: id(r.tenantId, "timelineStore.tenant"), projectId: id(r.projectId, "timelineStore.project"),
    movieId: id(r.movieId, "timelineStore.movie"), studioId: id(r.studioId, "timelineStore.studio") };
}
export function parseRecordIdentity(v: unknown): TimelineRecordIdentity {
  const r = record(v, ["id", "recordHash", "recordHashDomain", "planHash", "planHashDomain", "version"], "timelineStore.identity"), version = integer(r.version, "timelineStore.version", TIMELINE_STORE.maxRevision);
  if (!version) rejectStore("INVALID_INPUT");
  return { id: id(r.id, "timelineStore.id"), recordHash: hash(r.recordHash, "timelineStore.recordHash"), planHash: hash(r.planHash, "timelineStore.planHash"), version, recordHashDomain: literal(r.recordHashDomain, TIMELINE_STORE.record, "timelineStore.recordDomain"), planHashDomain: literal(r.planHashDomain, TIMELINE.plan, "timelineStore.planDomain") };
}
/** Shape only. Complete M7/M6 replay requires independent stored expectations. */
export function parseSaveTimelineProposal(value: unknown) {
  try {
    const r = record(storeCapture(value), ["schemaVersion", "scope", "idempotencyKey", "expectedRevision", "previous", "plan"], "timelineStore.proposal");
    const scope = parseStoreScope(r.scope), expectedRevision = integer(r.expectedRevision, "timelineStore.revision", TIMELINE_STORE.maxRevision - 1);
    const previous = nullable(r.previous, parseRecordIdentity), plan = record(r.plan, ["id", "plan", "planHash"], "timelineStore.plan");
    hash(plan.planHash, "timelineStore.planHash");
    if (plan.id !== `tl-${plan.planHash}`) rejectStore("INVALID_INPUT");
    if (!plan.plan || typeof plan.plan !== "object") rejectStore("INVALID_INPUT");
    const input = parseRecapTimelineInput(Object.getOwnPropertyDescriptor(plan.plan, "input")?.value);
    const selection = scope;
    if (!storeSame(selection, input.scope) || (expectedRevision === 0) !== (previous === null) || previous && previous.version !== expectedRevision) rejectStore("INVALID_INPUT");
    return freeze({ schemaVersion: literal(r.schemaVersion, TIMELINE_STORE.proposal, "timelineStore.schema"), scope,
      idempotencyKey: id(r.idempotencyKey, "timelineStore.key"), expectedRevision, previous, plan: r.plan as TimelinePlan });
  } catch (e) { if (e instanceof TimelineStoreError) throw e; rejectStore("INVALID_INPUT"); }
}
export const timelineProposalHash = (v: unknown) => contractHash(TIMELINE_STORE.proposal, parseSaveTimelineProposal(v));
export function parseStoredRecord(value: unknown) {
  const r = record(storeCapture(value), ["schemaVersion", "scope", "id", "version", "previous", "expectedRevision", "idempotencyKey", "proposalHash", "dependencyId", "dependencyHash", "createdAt", "editor", "plan", "restrictions"], "timelineStore.record");
  const proposal = parseSaveTimelineProposal({ schemaVersion: TIMELINE_STORE.proposal, scope: r.scope, idempotencyKey: r.idempotencyKey,
    expectedRevision: r.expectedRevision, previous: r.previous, plan: r.plan });
  const editor = record(r.editor, ["principalId", "sessionId"], "timelineStore.editor");
  const version = integer(r.version, "timelineStore.version", TIMELINE_STORE.maxRevision);
  if (proposal.previous?.id === r.id || version !== proposal.expectedRevision + 1 || r.proposalHash !== timelineProposalHash(proposal) || !storeSame(r.restrictions, savedTimelineRestrictions)) rejectStore("INTEGRITY_FAILED");
  return freeze({ schemaVersion: literal(r.schemaVersion, TIMELINE_STORE.record, "timelineStore.record.schema"), scope: proposal.scope,
    id: id(r.id, "timelineStore.id"), version, previous: proposal.previous, expectedRevision: proposal.expectedRevision,
    idempotencyKey: proposal.idempotencyKey, proposalHash: hash(r.proposalHash, "timelineStore.proposalHash"), dependencyId: id(r.dependencyId, "timelineStore.dependencyId"),
    dependencyHash: hash(r.dependencyHash, "timelineStore.dependencyHash"), createdAt: date(r.createdAt, "timelineStore.createdAt"),
    editor: { principalId: id(editor.principalId, "timelineStore.principal"), sessionId: id(editor.sessionId, "timelineStore.session") }, plan: proposal.plan, restrictions: savedTimelineRestrictions });
}
