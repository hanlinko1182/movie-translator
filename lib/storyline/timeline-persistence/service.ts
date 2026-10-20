import "server-only";
import { TIMELINE, TimelineError } from "../timeline/contracts";
import { parseRecapTimelineInput } from "../timeline/input";
import { parseTimelineDependency, replayCurrentTimeline, validateHistoricalTimelineIntegrity } from "./resolution";
import { contractHash } from "../canonical";
import { StorylineContractError, array, freeze, hash, id, integer, record } from "../validation";
import { TIMELINE_STORE as S, TimelineStoreError, timelineProposalHash, parseRecordIdentity, parseSaveTimelineProposal, parseStoredRecord, parseStoreScope,
  rejectStore, savedTimelineRestrictions, storeCapture, storeSame, type TimelineRecordView, type TimelineSaveAuditEvent, type TimelineSaveResult, type TimelineStoreScope, type SaveTimelineProposal } from "./contracts";
import { TimelineCommitUnknown, type TimelineGateway } from "./database";

type Hook = (backendPid: number) => Promise<void>;
async function storeCall<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (e) { if (e instanceof TimelineStoreError) throw e; if (e instanceof StorylineContractError || e instanceof TimelineError) rejectStore("INVALID_INPUT"); rejectStore("TRANSACTION_FAILED"); }
}
async function captured(value: unknown, scope: TimelineStoreScope, input: unknown, plan: unknown) {
  const r = record(value, ["dependency", "reused", "current", "observation"], "timelineStore.capture");
  if (typeof r.current !== "boolean" || typeof r.reused !== "boolean") rejectStore("INTEGRITY_FAILED");
  const d = parseTimelineDependency(r.dependency, scope);
  if (!r.reused && !r.current) rejectStore("STALE_SOURCE");
  const checked = r.reused ? await validateHistoricalTimelineIntegrity(plan, input, d) : await replayCurrentTimeline(plan, input, d, r.observation);
  return { dependency: d, plan: checked, reused: r.reused };
}
function identityOf(v: TimelineRecordView) { return { recordHashDomain: S.record, planHashDomain: TIMELINE.plan, id: v.record.id, recordHash: v.recordHash, planHash: v.record.plan.planHash, version: v.record.version }; }
async function view(value: unknown, scope: TimelineStoreScope): Promise<TimelineRecordView> {
  try {
    if (value === null) rejectStore("NOT_FOUND");
    const r = record(value, ["identity", "record", "recordHash", "proposal", "dependency", "parent", "audit", "auditHash", "current", "isHead"], "timelineStore.view");
    const v = parseStoredRecord(r.record), d = parseTimelineDependency(r.dependency, scope), proposal = parseSaveTimelineProposal(r.proposal);
    if (typeof r.current !== "boolean" || typeof r.isHead !== "boolean" || !storeSame(v.scope, scope) || contractHash(S.record, v) !== r.recordHash || v.dependencyId !== d.id || v.dependencyHash !== d.hash ||
      v.proposalHash !== timelineProposalHash(proposal) || !storeSame(v.plan, proposal.plan) || !storeSame(v.previous, proposal.previous) || !storeSame(v.scope, proposal.scope) ||
      v.expectedRevision !== proposal.expectedRevision || v.idempotencyKey !== proposal.idempotencyKey || !storeSame(v.previous, r.parent)) rejectStore("INTEGRITY_FAILED");
    if (v.previous) parseRecordIdentity(r.parent);
    if (!storeSame(parseRecordIdentity(r.identity), { id: v.id, recordHash: r.recordHash, recordHashDomain: S.record, planHash: v.plan.planHash, planHashDomain: TIMELINE.plan, version: v.version })) rejectStore("INTEGRITY_FAILED");
    await validateHistoricalTimelineIntegrity(v.plan, v.plan.plan.input, d);
    const audit: TimelineSaveAuditEvent = { schemaVersion: S.audit, scope, versionId: v.id, version: v.version, previous: v.previous, recordHash: hash(r.recordHash, "timelineStore.recordHash"),
      proposalHash: v.proposalHash, dependencyId: d.id, dependencyHash: d.hash, actor: v.editor, createdAt: v.createdAt, action: "SAVE_TIMELINE_VERSION" };
    if (!storeSame(r.audit, audit) || contractHash(S.audit, audit) !== r.auditHash) rejectStore("INTEGRITY_FAILED");
    return freeze({ record: v, recordHash: hash(r.recordHash, "timelineStore.recordHash"), currentness: r.current ? r.isHead ? "CURRENT_AT_READ" : "SUPERSEDED" : "STALE_DEPENDENCIES" });
  } catch (e) { if (e instanceof TimelineStoreError) throw e; rejectStore("INTEGRITY_FAILED"); }
}
/** Independently replay the immediate parent too; no unbounded recursive chain. */
async function verifiedView(tx: { call(body: Record<string, unknown>): Promise<unknown> }, value: unknown, scope: TimelineStoreScope) {
  const found = await view(value, scope);
  if (found.record.previous) {
    const parent = await view(await tx.call({ op: "version", id: found.record.previous.id }), scope);
    if (!storeSame(identityOf(parent), found.record.previous)) rejectStore("INTEGRITY_FAILED");
  }
  return found;
}
function readInput(value: unknown, fields: string[]) {
  try {
    const r = record(storeCapture(value, 8192), ["scope", ...fields], "timelineStore.read");
    return { r, scope: parseStoreScope(r.scope) };
  } catch (e) { if (e instanceof TimelineStoreError) throw e; rejectStore("INVALID_INPUT"); }
}
/** Explicit injected fixture-only composition. No default database, route or session. */
export function createDisposableTimelineRepositoryForTest(options: { mode: "M702_DISPOSABLE_ONLY"; gateway: TimelineGateway;
  beforeTransactionForTest?: () => Promise<void>; afterReservationForTest?: Hook; afterInsertForTest?: Hook; beforeCommitForTest?: Hook; afterCommitForTest?: () => Promise<void> }) {
  if (options.mode !== "M702_DISPOSABLE_ONLY") rejectStore("DATABASE_UNSAFE");
  const db = options.gateway;
  const api = {
    async prepareTimeline(request: unknown, value: unknown) {
      return storeCall(async () => {
        const input = parseRecapTimelineInput(value), scope = input.scope;
        return db.transaction("read", request, scope, async tx => {
          const c = await captured(await tx.call({ op: "capture", input, key: null, proposalHash: null }), scope, input, null);
          const h = record(await tx.call({ op: "head" }), ["revision", "head"], "timelineStore.head");
          const head = h.head === null ? null : await verifiedView(tx, h.head, scope), revision = integer(h.revision, "timelineStore.revision", S.maxRevision);
          if (revision !== (head?.record.version ?? 0)) rejectStore("INTEGRITY_FAILED");
          return freeze({ scope, plan: c.plan, expectedRevision: revision, previous: head ? identityOf(head) : null });
        });
      });
    },
    async readVersion(request: unknown, value: unknown) {
      return storeCall(async () => { const { r, scope } = readInput(value, ["id"]), target = id(r.id, "timelineStore.id");
        return db.transaction("read", request, scope, async tx => { const found = await verifiedView(tx, await tx.call({ op: "version", id: target }), scope); if (found.record.id !== target) rejectStore("INTEGRITY_FAILED"); return found; }); });
    },
    async readHead(request: unknown, value: unknown) {
      return storeCall(async () => { const { scope } = readInput(value, []);
        return db.transaction("read", request, scope, async tx => {
          const h = record(await tx.call({ op: "head" }), ["revision", "head"], "timelineStore.head"), head = h.head === null ? null : await verifiedView(tx, h.head, scope);
          const revision = integer(h.revision, "timelineStore.revision", S.maxRevision);
          if (revision !== (head?.record.version ?? 0)) rejectStore("INTEGRITY_FAILED"); return freeze({ scope, revision, head });
        }); });
    },
    async listHistory(request: unknown, value: unknown) {
      return storeCall(async () => { const { r, scope } = readInput(value, ["afterVersion", "limit"]);
        const afterVersion = integer(r.afterVersion, "timelineStore.after", S.maxRevision), limit = integer(r.limit, "timelineStore.limit", S.maxHistory);
        if (!limit) rejectStore("INVALID_INPUT");
        return db.transaction("read", request, scope, async tx => {
          const rows = array(await tx.call({ op: "history", afterVersion, limit }), limit + 1, "timelineStore.history");
          const entries: TimelineRecordView[] = [];
          for (const [index, raw] of rows.slice(0, limit).entries()) {
            const row = record(raw, ["id", "version"], "timelineStore.history.entry");
            if (row.version !== afterVersion + index + 1) rejectStore("INTEGRITY_FAILED");
            const v = await verifiedView(tx, await tx.call({ op: "version", id: id(row.id, "timelineStore.id") }), scope);
            if (v.record.id !== row.id || v.record.version !== row.version) rejectStore("INTEGRITY_FAILED"); entries.push(v);
          }
          return freeze({ scope, entries, nextAfterVersion: rows.length > limit ? entries.at(-1)!.record.version : null });
        }); });
    },
    async readOperation(request: unknown, value: unknown) {
      return storeCall(async () => { const { r, scope } = readInput(value, ["idempotencyKey", "proposalHash"]);
        const key = id(r.idempotencyKey, "timelineStore.key"), proposalHash = hash(r.proposalHash, "timelineStore.proposalHash");
        return db.transaction("read", request, scope, async tx => { const result = await tx.call({ op: "operation", key, proposalHash });
          if (result === null) return freeze({ status: "NOT_FOUND" as const });
          const found = await verifiedView(tx, result, scope); if (found.record.proposalHash !== proposalHash || found.record.idempotencyKey !== key) rejectStore("INTEGRITY_FAILED");
          return freeze({ status: "FOUND" as const, view: found }); }); });
    },
    async saveVersion(writeRequest: unknown, readRequest: unknown, value: unknown): Promise<TimelineSaveResult> {
      return storeCall(async () => {
        const proposal = parseSaveTimelineProposal(value), scope = proposal.scope, proposalHash = timelineProposalHash(proposal);
        const writer = db.authenticate(writeRequest, scope, "create"), reader = db.authenticate(readRequest, scope, "read");
        if (writer.sessionId !== reader.sessionId || writer.principalId !== reader.principalId || writer.tenantId !== reader.tenantId) rejectStore("FORBIDDEN");
        await db.transaction("create", writeRequest, scope, async tx => captured(await tx.call({ op: "capture", input: proposal.plan.plan.input, key: proposal.idempotencyKey, proposalHash }), scope, proposal.plan.plan.input, proposal.plan));
        await options.beforeTransactionForTest?.();
        let saved: { status: "SAVED" | "REUSED"; id: string };
        try {
          saved = await db.transaction("create", writeRequest, scope, async tx => {
            const checked = await captured(await tx.call({ op: "capture", input: proposal.plan.plan.input, key: proposal.idempotencyKey, proposalHash }), scope, proposal.plan.plan.input, proposal.plan);
            const d = checked.dependency, plan = checked.plan;
            const pending = await tx.call({ op: "reserve", proposal, proposalHash, dependencyId: d.id, dependencyHash: d.hash });
            if (!pending || typeof pending !== "object") rejectStore("INTEGRITY_FAILED");
            if (Object.getOwnPropertyDescriptor(pending, "status")?.value === "REUSED") {
              const r = record(pending, ["status", "id"], "timelineStore.reused"); return { status: "REUSED" as const, id: id(r.id, "timelineStore.id") };
            }
            const p = record(pending, ["status", "id", "version", "createdAt", "challenge", "dependencyId", "dependencyHash"], "timelineStore.reservation");
            if (p.status !== "OPEN" || p.dependencyId !== d.id || p.dependencyHash !== d.hash) rejectStore("INTEGRITY_FAILED");
            await options.afterReservationForTest?.(tx.backendPid);
            const stored = parseStoredRecord({ schemaVersion: S.record, scope, id: p.id, version: p.version, previous: proposal.previous, expectedRevision: proposal.expectedRevision,
              idempotencyKey: proposal.idempotencyKey, proposalHash, dependencyId: d.id, dependencyHash: d.hash, createdAt: p.createdAt,
              editor: { principalId: tx.editor.principalId, sessionId: tx.editor.sessionId }, plan, restrictions: savedTimelineRestrictions });
            const recordHash = contractHash(S.record, stored);
            const done = record(await tx.call({ op: "finish", reservationId: p.id, record: stored, recordHash,
              validationProof: tx.validationProof(stored.id, hash(p.challenge, "timelineStore.challenge"), recordHash, d.hash) }), ["status", "id"], "timelineStore.saved");
            if (done.status !== "SAVED" || done.id !== stored.id) rejectStore("INTEGRITY_FAILED");
            await options.afterInsertForTest?.(tx.backendPid); await options.beforeCommitForTest?.(tx.backendPid);
            const seal = record(await tx.call({ op: "seal", id: stored.id }), ["sealed"], "timelineStore.seal");
            if (seal.sealed !== true) rejectStore("INTEGRITY_FAILED");
            return { status: "SAVED" as const, id: stored.id };
          }, options.afterCommitForTest);
        } catch (e) {
          if (e instanceof TimelineCommitUnknown) return { status: "UNKNOWN", scope, idempotencyKey: proposal.idempotencyKey, proposalHash, safeCode: "COMMIT_ACK_LOST" };
          throw e;
        }
        // Fresh independently authorized read transaction. A failure here must
        // never be mistaken for a rolled-back save or trigger another creation.
        try {
          const result = await api.readVersion(readRequest, { scope, id: saved.id });
          if (result.record.proposalHash !== proposalHash || result.record.plan.planHash !== proposal.plan.planHash) rejectStore("INTEGRITY_FAILED");
          return { status: saved.status, view: result };
        } catch { return { status: "UNKNOWN", scope, idempotencyKey: proposal.idempotencyKey, proposalHash, safeCode: "READBACK_UNAVAILABLE" }; }
      });
    },
  };
  return Object.freeze(api);
}
export type DisposableTimelineRepository = ReturnType<typeof createDisposableTimelineRepositoryForTest>;
export type { SaveTimelineProposal };
