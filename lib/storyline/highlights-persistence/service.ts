import "server-only";
import { contractHash } from "../canonical";
import { array, freeze, hash, id, integer, record } from "../validation";
import { HIGHLIGHTS, type HighlightInput, type SyntheticHighlightCapture } from "../highlights/contracts";
import { generateHighlightPlan, validateHighlightPlan } from "../highlights/planner";
import { parseHighlightInput } from "../highlights/input";
import { HIGHLIGHT_STORE as S, HighlightStoreError, highlightProposalHash, parseRecordIdentity, parseSaveHighlightProposal, parseStoredRecord, parseStoreScope,
  rejectStore, savedHighlightRestrictions, storeCapture, storeSame, type DependencyView, type HighlightDependencyEnvelope, type HighlightRecordView, type HighlightSaveAuditEvent, type HighlightSaveResult, type HighlightStoreScope, type SaveHighlightProposal } from "./contracts";
import { HighlightCommitUnknown, type HighlightGateway } from "./database";

type Hook = (backendPid: number) => Promise<void>;
async function storeCall<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (e) { if (e instanceof HighlightStoreError) throw e; rejectStore("TRANSACTION_FAILED"); }
}
function dependency(value: unknown, scope: HighlightStoreScope): DependencyView {
  const d = record(value, ["id", "hash", "scope", "capture"], "highlightStore.dependency");
  const capture = storeCapture(d.capture, HIGHLIGHTS.captureBytes) as SyntheticHighlightCapture;
  const envelope: HighlightDependencyEnvelope = { schemaVersion: S.dependency, scope: parseStoreScope(d.scope), capture };
  if (!storeSame(envelope.scope, scope) || contractHash(S.dependency, envelope) !== hash(d.hash, "highlightStore.dependency.hash")) rejectStore("INTEGRITY_FAILED");
  if (!storeSame(capture.current.narration.scope, { projectId: scope.projectId, movieId: scope.movieId, studioId: scope.studioId }) ||
    capture.edit && capture.edit.payload.editor.tenantId !== scope.tenantId) rejectStore("INTEGRITY_FAILED");
  return { id: id(d.id, "highlightStore.dependency.id"), hash: d.hash as string, scope, capture };
}
function expectedInput(d: DependencyView, supplied: unknown) {
  const input = parseHighlightInput(supplied);
  if (!storeSame(input.source, d.capture.current)) rejectStore("STALE_SOURCE");
  return { schemaVersion: HIGHLIGHTS.input, execution: "SYNTHETIC_ONLY" as const, source: d.capture.current, policy: input.policy, audio: input.audio };
}
function replay(value: unknown, d: DependencyView, input: unknown, historical = false) {
  try { return validateHighlightPlan(value, expectedInput(d, input), { resolve: () => ({ status: "CAPTURED_SYNTHETIC", capture: d.capture }) }); }
  catch (e) { if (e instanceof HighlightStoreError) throw e; rejectStore(historical ? "INTEGRITY_FAILED" : "INVALID_PLAN"); }
}
function captured(value: unknown, scope: HighlightStoreScope) {
  try {
    const r = record(value, ["dependency", "reused", "current"], "highlightStore.capture");
    if (typeof r.current !== "boolean" || typeof r.reused !== "boolean") rejectStore("INTEGRITY_FAILED");
    if (!r.current) rejectStore("STALE_SOURCE");
    return dependency(r.dependency, scope);
  } catch (e) { if (e instanceof HighlightStoreError) throw e; rejectStore("INTEGRITY_FAILED"); }
}
function identityOf(v: HighlightRecordView) { return { id: v.record.id, recordHash: v.recordHash, planHash: v.record.plan.planHash, version: v.record.version }; }
function view(value: unknown, scope: HighlightStoreScope): HighlightRecordView {
  try {
    if (value === null) rejectStore("NOT_FOUND");
    const r = record(value, ["identity", "record", "recordHash", "proposal", "dependency", "parent", "audit", "auditHash", "current"], "highlightStore.view");
    const v = parseStoredRecord(r.record), d = dependency(r.dependency, scope), proposal = parseSaveHighlightProposal(r.proposal);
    if (typeof r.current !== "boolean" || !storeSame(v.scope, scope) || contractHash(S.record, v) !== r.recordHash || v.dependencyId !== d.id || v.dependencyHash !== d.hash ||
      v.proposalHash !== highlightProposalHash(proposal) || !storeSame(v.plan, proposal.plan) || !storeSame(v.previous, proposal.previous) || !storeSame(v.scope, proposal.scope) ||
      v.expectedRevision !== proposal.expectedRevision || v.idempotencyKey !== proposal.idempotencyKey || !storeSame(v.previous, r.parent)) rejectStore("INTEGRITY_FAILED");
    if (v.previous) parseRecordIdentity(r.parent);
    if (!storeSame(parseRecordIdentity(r.identity), { id: v.id, recordHash: r.recordHash, planHash: v.plan.planHash, version: v.version })) rejectStore("INTEGRITY_FAILED");
    replay(v.plan, d, v.plan.plan.input, true);
    const audit: HighlightSaveAuditEvent = { schemaVersion: S.audit, scope, versionId: v.id, version: v.version, previous: v.previous, recordHash: hash(r.recordHash, "highlightStore.recordHash"),
      proposalHash: v.proposalHash, dependencyId: d.id, dependencyHash: d.hash, actor: v.editor, createdAt: v.createdAt, action: "SAVE_HIGHLIGHT_VERSION" };
    if (!storeSame(r.audit, audit) || contractHash(S.audit, audit) !== r.auditHash) rejectStore("INTEGRITY_FAILED");
    return freeze({ record: v, recordHash: hash(r.recordHash, "highlightStore.recordHash"), currentness: r.current ? "CURRENT_AT_READ" : "STALE_DEPENDENCIES" });
  } catch (e) { if (e instanceof HighlightStoreError) throw e; rejectStore("INTEGRITY_FAILED"); }
}
function readInput(value: unknown, fields: string[]) {
  try {
    const r = record(storeCapture(value, 8192), ["scope", ...fields], "highlightStore.read");
    return { r, scope: parseStoreScope(r.scope) };
  } catch (e) { if (e instanceof HighlightStoreError) throw e; rejectStore("INVALID_INPUT"); }
}
/** Explicit injected fixture-only composition. No default database, route or session. */
export function createDisposableHighlightRepositoryForTest(options: { mode: "M602_DISPOSABLE_ONLY"; gateway: HighlightGateway;
  beforeTransactionForTest?: () => Promise<void>; afterReservationForTest?: Hook; afterInsertForTest?: Hook; beforeCommitForTest?: Hook; afterCommitForTest?: () => Promise<void> }) {
  if (options.mode !== "M602_DISPOSABLE_ONLY") rejectStore("DATABASE_UNSAFE");
  const db = options.gateway;
  const api = {
    async preparePlan(request: unknown, value: unknown) {
      return storeCall(async () => {
        const r = record(storeCapture(value), ["scope", "policy", "audio"], "highlightStore.prepare"), scope = parseStoreScope(r.scope);
        return db.transaction("read", request, scope, async tx => {
          const d = captured(await tx.call({ op: "capture", key: null, proposalHash: null }), scope);
          const input: HighlightInput = { schemaVersion: HIGHLIGHTS.input, execution: "SYNTHETIC_ONLY", source: d.capture.current, policy: r.policy as HighlightInput["policy"], audio: r.audio as HighlightInput["audio"] };
          let plan;
          try { plan = generateHighlightPlan(input, { resolve: () => ({ status: "CAPTURED_SYNTHETIC", capture: d.capture }) }); }
          catch { rejectStore("INTEGRITY_FAILED"); }
          const h = record(await tx.call({ op: "head" }), ["revision", "head"], "highlightStore.head");
          const head = h.head === null ? null : view(h.head, scope), revision = integer(h.revision, "highlightStore.revision", S.maxRevision);
          if (revision !== (head?.record.version ?? 0)) rejectStore("INTEGRITY_FAILED");
          return freeze({ scope, plan, expectedRevision: revision, previous: head ? identityOf(head) : null });
        });
      });
    },
    async readVersion(request: unknown, value: unknown) {
      return storeCall(async () => { const { r, scope } = readInput(value, ["id"]), target = id(r.id, "highlightStore.id");
        return db.transaction("read", request, scope, async tx => { const found = view(await tx.call({ op: "version", id: target }), scope); if (found.record.id !== target) rejectStore("INTEGRITY_FAILED"); return found; }); });
    },
    async readHead(request: unknown, value: unknown) {
      return storeCall(async () => { const { scope } = readInput(value, []);
        return db.transaction("read", request, scope, async tx => {
          const h = record(await tx.call({ op: "head" }), ["revision", "head"], "highlightStore.head"), head = h.head === null ? null : view(h.head, scope);
          const revision = integer(h.revision, "highlightStore.revision", S.maxRevision);
          if (revision !== (head?.record.version ?? 0)) rejectStore("INTEGRITY_FAILED"); return freeze({ scope, revision, head });
        }); });
    },
    async listHistory(request: unknown, value: unknown) {
      return storeCall(async () => { const { r, scope } = readInput(value, ["afterVersion", "limit"]);
        const afterVersion = integer(r.afterVersion, "highlightStore.after", S.maxRevision), limit = integer(r.limit, "highlightStore.limit", S.maxHistory);
        if (!limit) rejectStore("INVALID_INPUT");
        return db.transaction("read", request, scope, async tx => {
          const rows = array(await tx.call({ op: "history", afterVersion, limit }), limit + 1, "highlightStore.history");
          const entries: HighlightRecordView[] = [];
          for (const [index, raw] of rows.slice(0, limit).entries()) {
            const row = record(raw, ["id", "version"], "highlightStore.history.entry");
            if (row.version !== afterVersion + index + 1) rejectStore("INTEGRITY_FAILED");
            const v = view(await tx.call({ op: "version", id: id(row.id, "highlightStore.id") }), scope);
            if (v.record.id !== row.id || v.record.version !== row.version) rejectStore("INTEGRITY_FAILED"); entries.push(v);
          }
          return freeze({ scope, entries, nextAfterVersion: rows.length > limit ? entries.at(-1)!.record.version : null });
        }); });
    },
    async readOperation(request: unknown, value: unknown) {
      return storeCall(async () => { const { r, scope } = readInput(value, ["idempotencyKey", "proposalHash"]);
        const key = id(r.idempotencyKey, "highlightStore.key"), proposalHash = hash(r.proposalHash, "highlightStore.proposalHash");
        return db.transaction("read", request, scope, async tx => { const result = await tx.call({ op: "operation", key, proposalHash });
          if (result === null) return freeze({ status: "NOT_FOUND" as const });
          const found = view(result, scope); if (found.record.proposalHash !== proposalHash || found.record.idempotencyKey !== key) rejectStore("INTEGRITY_FAILED");
          return freeze({ status: "FOUND" as const, view: found }); }); });
    },
    async saveVersion(writeRequest: unknown, readRequest: unknown, value: unknown): Promise<HighlightSaveResult> {
      return storeCall(async () => {
        const proposal = parseSaveHighlightProposal(value), scope = proposal.scope, proposalHash = highlightProposalHash(proposal);
        const writer = db.authenticate(writeRequest, scope, "create"), reader = db.authenticate(readRequest, scope, "read");
        if (writer.sessionId !== reader.sessionId || writer.principalId !== reader.principalId || writer.tenantId !== reader.tenantId) rejectStore("FORBIDDEN");
        const preflight = await db.transaction("create", writeRequest, scope, async tx => captured(await tx.call({ op: "capture", key: proposal.idempotencyKey, proposalHash }), scope));
        replay(proposal.plan, preflight, proposal.plan.plan.input);
        await options.beforeTransactionForTest?.();
        let saved: { status: "SAVED" | "REUSED"; id: string };
        try {
          saved = await db.transaction("create", writeRequest, scope, async tx => {
            const d = captured(await tx.call({ op: "capture", key: proposal.idempotencyKey, proposalHash }), scope);
            const plan = replay(proposal.plan, d, proposal.plan.plan.input);
            const pending = await tx.call({ op: "reserve", proposal, proposalHash, dependencyId: d.id, dependencyHash: d.hash });
            if (!pending || typeof pending !== "object") rejectStore("INTEGRITY_FAILED");
            if (Object.getOwnPropertyDescriptor(pending, "status")?.value === "REUSED") {
              const r = record(pending, ["status", "id"], "highlightStore.reused"); return { status: "REUSED" as const, id: id(r.id, "highlightStore.id") };
            }
            const p = record(pending, ["status", "id", "version", "createdAt", "challenge", "dependencyId", "dependencyHash"], "highlightStore.reservation");
            if (p.status !== "OPEN" || p.dependencyId !== d.id || p.dependencyHash !== d.hash) rejectStore("INTEGRITY_FAILED");
            await options.afterReservationForTest?.(tx.backendPid);
            const stored = parseStoredRecord({ schemaVersion: S.record, scope, id: p.id, version: p.version, previous: proposal.previous, expectedRevision: proposal.expectedRevision,
              idempotencyKey: proposal.idempotencyKey, proposalHash, dependencyId: d.id, dependencyHash: d.hash, createdAt: p.createdAt,
              editor: { principalId: tx.editor.principalId, sessionId: tx.editor.sessionId }, plan, restrictions: savedHighlightRestrictions });
            const recordHash = contractHash(S.record, stored);
            const done = record(await tx.call({ op: "finish", reservationId: p.id, record: stored, recordHash,
              validationProof: tx.validationProof(stored.id, hash(p.challenge, "highlightStore.challenge"), recordHash, d.hash) }), ["status", "id"], "highlightStore.saved");
            if (done.status !== "SAVED" || done.id !== stored.id) rejectStore("INTEGRITY_FAILED");
            await options.afterInsertForTest?.(tx.backendPid); await options.beforeCommitForTest?.(tx.backendPid);
            const seal = record(await tx.call({ op: "seal", id: stored.id }), ["sealed"], "highlightStore.seal");
            if (seal.sealed !== true) rejectStore("INTEGRITY_FAILED");
            return { status: "SAVED" as const, id: stored.id };
          }, options.afterCommitForTest);
        } catch (e) {
          if (e instanceof HighlightCommitUnknown) return { status: "UNKNOWN", scope, idempotencyKey: proposal.idempotencyKey, proposalHash, safeCode: "COMMIT_ACK_LOST" };
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
export type DisposableHighlightRepository = ReturnType<typeof createDisposableHighlightRepositoryForTest>;
export type { SaveHighlightProposal };
