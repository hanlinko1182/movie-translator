import type { HighlightPlan, HighlightSourceReference, HighlightPolicy, HighlightAudioReference } from "@/lib/storyline/studio-highlight-types";
import type { HighlightStoreScope, HighlightRecordView, HighlightHistoryView, SaveHighlightProposal } from "@/lib/storyline/studio-highlight-types";
import type { DisposableHighlightRepository } from "@/lib/storyline/studio-highlight-types";

type Operation = "preparePlan" | "saveVersion" | "readVersion" | "readHead" | "listHistory" | "readOperation";
/** Erased service contracts only. An injection seam grants no identity or authority.
 * All six calls must independently authenticate on the isolated server. */
export type SyntheticHighlightAdapter = {
  mode: "DISPOSABLE_SYNTHETIC_ONLY"; identityKey: string;
  target: { scope: HighlightStoreScope; source: HighlightSourceReference; policy: HighlightPolicy; audio: HighlightAudioReference | null };
} & { [K in Operation]: (input: K extends "saveVersion" ? SaveHighlightProposal : Parameters<DisposableHighlightRepository[K]>[1]) => ReturnType<DisposableHighlightRepository[K]> };
type Prepared = Awaited<ReturnType<DisposableHighlightRepository["preparePlan"]>>;
type Head = Awaited<ReturnType<DisposableHighlightRepository["readHead"]>>;
export type HighlightPhase = "NOT_PREPARED" | "PREPARING" | "PREPARED" | "SAVING" | "SAVED" | "CONFLICT" | "STALE" | "UNAUTHORIZED" | "UNKNOWN" | "READBACK_UNAVAILABLE" | "HISTORICAL" | "ERROR";
export type HighlightState = {
  phase: HighlightPhase; busy: boolean; expanded: readonly string[]; message: string; plan: HighlightPlan | null;
  prepared: Prepared | null; pending: SaveHighlightProposal | null; pendingHash: string | null;
  saved: HighlightRecordView | null; preview: HighlightRecordView | null;
  history: HighlightHistoryView | null; observed: Head | null; needsAcceptance: boolean;
};
// JSON DTO consistency checks, not authentication or a replacement for M6 replay.
// Bound and canonicalize independently of server-only Node hashing modules.
export function highlightJson(value: unknown): string {
  let nodes = 0; const ancestors = new Set<object>();
  function visit(v: unknown, depth: number): string {
    if (++nodes > 500000 || depth > 32) throw new Error("DTO bounds");
    if (v === null) return "null";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "number" && Number.isSafeInteger(v) && !Object.is(v, -0)) return String(v);
    if (typeof v === "string" && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)) return JSON.stringify(v);
    if (!v || typeof v !== "object" || ancestors.has(v)) throw new Error("Invalid DTO");
    ancestors.add(v); let result: string;
    if (Array.isArray(v)) {
      if (Reflect.ownKeys(v).length !== v.length + 1) throw new Error("Invalid DTO");
      result = `[${Array.from({ length: v.length }, (_, i) => { const d = Object.getOwnPropertyDescriptor(v, i); if (!d || !("value" in d)) throw new Error("Invalid DTO"); return visit(d.value, depth + 1); }).join(",")}]`;
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error("Invalid DTO");
      const keys = Object.keys(v).sort(); if (Reflect.ownKeys(v).length !== keys.length) throw new Error("Invalid DTO");
      result = `{${keys.map(k => { const d = Object.getOwnPropertyDescriptor(v, k)!; if (!("value" in d)) throw new Error("Invalid DTO"); return `${visit(k, depth + 1)}:${visit(d.value, depth + 1)}`; }).join(",")}}`;
    }
    ancestors.delete(v); return result;
  }
  const result = visit(value, 0); if (new TextEncoder().encode(result).length > 3 * 1024 * 1024) throw new Error("DTO bounds"); return result;
}
export const sameHighlight = (a: unknown, b: unknown) => highlightJson(a) === highlightJson(b);
export async function highlightHash(domain: string, value: unknown) {
  const bytes = new TextEncoder().encode(`${domain}\n${highlightJson(value)}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
const identity = (v: HighlightRecordView) => ({ id: v.record.id, recordHash: v.recordHash, planHash: v.record.plan.planHash, version: v.record.version });
const planRestrictions = { execution: "SYNTHETIC_ONLY", persistence: "NOT_PERSISTED", humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false, eligibleForPublication: false, originalMovieAudio: "EXCLUDED", voiceSynchronization: "UNSUPPORTED" };
const savedRestrictions = { ...planRestrictions, storage: "DISPOSABLE_POSTGRES_ONLY" };
delete (savedRestrictions as Partial<typeof planRestrictions>).persistence;
const requireMatch = (v: boolean) => { if (!v) throw new Error("DTO verification failed"); };
export const highlightUnsaved = (s: HighlightState) => !!s.prepared || !!s.pending;

export class HighlightVersionSession {
  private listeners = new Set<() => void>(); private active = true; private epoch = 0;
  private accepted: Head | null = null;
  private state: HighlightState = { phase: "NOT_PREPARED", busy: false, expanded: [], message: "Not Prepared. Explicit authorized preparation required.", plan: null, prepared: null, pending: null, pendingHash: null, saved: null, preview: null, history: null, observed: null, needsAcceptance: false };
  constructor(readonly adapter: SyntheticHighlightAdapter, private key = () => crypto.randomUUID()) {
    this.adapter = { ...adapter, target: structuredClone(adapter.target) };
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  disclosure = (id: string, open: boolean) => {
    if (this.state.expanded.includes(id) === open) return;
    this.update({ expanded: open ? [...this.state.expanded, id].slice(-1601) : this.state.expanded.filter(value => value !== id) });
  };
  connect() { this.active = true; }
  dispose() { this.active = false; this.epoch++; this.listeners.clear(); }
  private update(s: Partial<HighlightState>) { if (this.active) {
    const freeze = (v: unknown): void => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } };
    freeze(s); this.state = { ...this.state, ...s }; this.listeners.forEach(f => f()); } }
  private async run(work: (live: () => boolean) => Promise<void>) {
    if (!this.active || this.state.busy) return;
    const epoch = this.epoch, live = () => this.active && epoch === this.epoch;
    this.update({ busy: true });
    try { await work(live); } catch (e) { if (live()) this.fail(e); } finally { if (live()) this.update({ busy: false }); }
  }
  private fail(e: unknown, saveRejected = false) {
    const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
    if ((!this.state.pending || saveRejected) && ["REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(code)) this.update({ phase: "CONFLICT", needsAcceptance: true, observed: null, message: "Revision Conflict. Plan retained. Refresh head/history, explicitly accept the head, then prepare again." });
    else if (code === "STALE_SOURCE" && (!this.state.pending || saveRejected)) this.update({ phase: "STALE", message: "Stale Source. Plan retained for inspection. Fresh authorized preparation required." });
    else if (["AUTH_REQUIRED", "SESSION_INVALID", "FORBIDDEN", "ORIGIN_REJECTED", "CSRF_REJECTED"].includes(code)) this.update({ phase: "UNAUTHORIZED", message: `Unauthorized (${code}). Plan and original operation retained.` });
    else this.update({ phase: this.state.pending ? "READBACK_UNAVAILABLE" : "ERROR", message: this.state.pending ? "Read-back Unavailable. Outcome may be unknown. Recover Original Operation; no automatic write retry." : "Authorized read/preparation unavailable. Current view retained." });
  }
  private async checkPlan(plan: HighlightPlan) {
    requireMatch(plan.planHash === await highlightHash("story-highlight-plan-v1", plan.plan));
    requireMatch(plan.plan.inputHash === await highlightHash("story-highlight-input-v1", plan.plan.input));
    requireMatch(sameHighlight(plan.plan.restrictions, planRestrictions) && plan.plan.input.execution === "SYNTHETIC_ONLY");
    requireMatch(sameHighlight(plan.plan.input.source.narration.scope, { projectId: this.adapter.target.scope.projectId, movieId: this.adapter.target.scope.movieId, studioId: this.adapter.target.scope.studioId }));
  }
  private async checkView(v: HighlightRecordView) {
    const r = v.record; await this.checkPlan(r.plan);
    requireMatch(sameHighlight(r.scope, this.adapter.target.scope) && sameHighlight(r.restrictions, savedRestrictions));
    requireMatch(r.schemaVersion === "story-highlight-saved-record-v1" && r.version === r.expectedRevision + 1 && (r.previous?.version ?? 0) === r.expectedRevision);
    requireMatch(v.currentness === "CURRENT_AT_READ" || v.currentness === "STALE_DEPENDENCIES");
    requireMatch(v.recordHash === await highlightHash(r.schemaVersion, r));
    requireMatch(r.proposalHash === await highlightHash("story-highlight-save-proposal-v1", { schemaVersion: "story-highlight-save-proposal-v1", scope: r.scope, idempotencyKey: r.idempotencyKey, expectedRevision: r.expectedRevision, previous: r.previous, plan: r.plan }));
  }
  private async checkHistory(h: HighlightHistoryView, after: number) {
    requireMatch(sameHighlight(h.scope, this.adapter.target.scope) && h.entries.length <= 5);
    for (const [i, v] of h.entries.entries()) { await this.checkView(v); requireMatch(v.record.version === after + i + 1); if (i) requireMatch(sameHighlight(v.record.previous, identity(h.entries[i - 1]))); }
    requireMatch(h.nextAfterVersion === null || (h.entries.length === 5 && h.nextAfterVersion === h.entries.at(-1)?.record.version));
  }
  prepare = async () => {
    if ((this.state.pending && this.state.phase !== "STALE") || this.state.needsAcceptance) return;
    await this.run(async live => {
      this.update({ phase: "PREPARING", message: "Preparing authorized synthetic plan…" });
      const t = this.adapter.target, p = structuredClone(await this.adapter.preparePlan({ scope: t.scope, policy: t.policy, audio: t.audio }));
      if (!live()) return; await this.checkPlan(p.plan); if (!live()) return;
      requireMatch(sameHighlight(p.scope, t.scope) && sameHighlight(p.plan.plan.input.policy, t.policy) && sameHighlight(p.plan.plan.input.audio, t.audio));
      if (!sameHighlight(p.plan.plan.input.source, t.source)) throw Object.assign(new Error("Changed source identity"), { code: "STALE_SOURCE" });
      requireMatch(p.expectedRevision === (p.previous?.version ?? 0));
      if (this.accepted && !(p.expectedRevision === this.accepted.revision && sameHighlight(p.previous, this.accepted.head ? identity(this.accepted.head) : null))) throw Object.assign(new Error("Head changed again"), { code: "REVISION_CONFLICT" });
      this.accepted = null;
      this.update({ prepared: p, pending: null, pendingHash: null, expanded: [], plan: p.plan, saved: null, phase: "PREPARED", message: "Prepared / Unsaved. Review evidence before saving." });
    });
  };
  save = async () => {
    if (!this.state.prepared || this.state.pending || this.state.phase !== "PREPARED") return;
    await this.run(async live => {
      const pending: SaveHighlightProposal = structuredClone({ schemaVersion: "story-highlight-save-proposal-v1", ...this.state.prepared!, idempotencyKey: this.key() });
      const pendingHash = await highlightHash(pending.schemaVersion, pending); if (!live()) return;
      this.update({ pending, pendingHash, phase: "SAVING", message: "Saving and independently verifying…" });
      let result: Awaited<ReturnType<SyntheticHighlightAdapter["saveVersion"]>>;
      try { result = await this.adapter.saveVersion(structuredClone(pending)); }
      catch (e) { if (live()) this.fail(e, true); return; }
      if (!live()) return;
      if (result.status === "UNKNOWN") {
        requireMatch(sameHighlight(result.scope, pending.scope) && result.idempotencyKey === pending.idempotencyKey && result.proposalHash === pendingHash);
        this.update({ phase: result.safeCode === "READBACK_UNAVAILABLE" ? "READBACK_UNAVAILABLE" : "UNKNOWN", message: `${result.safeCode === "READBACK_UNAVAILABLE" ? "Read-back Unavailable" : "Unknown Save Outcome"}. Recover Original Operation. No automatic retry.` }); return;
      }
      await this.verifySaved(result.view, pending, pendingHash, live);
    });
  };
  private async verifySaved(receipt: HighlightRecordView, p: SaveHighlightProposal, proposalHash: string, live: () => boolean) {
    await this.checkView(receipt); if (!live()) return;
    const r = receipt.record;
    requireMatch(r.proposalHash === proposalHash && r.idempotencyKey === p.idempotencyKey && sameHighlight(r.plan, p.plan) && sameHighlight(r.previous, p.previous) && r.expectedRevision === p.expectedRevision);
    const read = structuredClone(await this.adapter.readVersion({ scope: p.scope, id: r.id })); if (!live()) return; await this.checkView(read);
    requireMatch(sameHighlight({ ...receipt, currentness: null }, { ...read, currentness: null })); if (!live()) return;
    const page = structuredClone(await this.adapter.listHistory({ scope: p.scope, afterVersion: r.version - 1, limit: 5 })); if (!live()) return; await this.checkHistory(page, r.version - 1);
    requireMatch(!!page.entries[0] && sameHighlight({ ...read, currentness: null }, { ...page.entries[0], currentness: null })); if (!live()) return;
    this.update({ saved: read, plan: read.record.plan, prepared: null, pending: null, pendingHash: null, history: page, phase: "SAVED", message: "Saved and Verified. Human Approved: No." });
  }
  recover = async () => {
    if (!this.state.pending || !this.state.pendingHash || this.state.phase === "CONFLICT") return;
    await this.run(async live => {
      const p = this.state.pending!, hash = this.state.pendingHash!;
      const result = await this.adapter.readOperation({ scope: p.scope, idempotencyKey: p.idempotencyKey, proposalHash: hash }); if (!live()) return;
      if (result.status === "NOT_FOUND") { this.update({ phase: "UNKNOWN", message: "Original operation NOT_FOUND at this read. Rollback is not established. Original key retained; no new write." }); return; }
      await this.verifySaved(result.view, p, hash, live);
    });
  };
  refresh = async (more = false) => this.run(async live => {
    const scope = this.adapter.target.scope, after = more ? this.state.history?.nextAfterVersion : 0;
    if (after === null || after === undefined) return;
    const head = structuredClone(await this.adapter.readHead({ scope })); if (!live()) return;
    requireMatch(sameHighlight(head.scope, scope) && head.revision === (head.head?.record.version ?? 0)); if (head.head) await this.checkView(head.head); if (!live()) return;
    const history = structuredClone(await this.adapter.listHistory({ scope, afterVersion: after, limit: 5 })); if (!live()) return; await this.checkHistory(history, after); if (!live()) return;
    this.update({ observed: head, history, message: "Authorized head/history refreshed. Reviewed plan unchanged." });
  });
  acceptHead() {
    if (this.state.busy || this.state.phase !== "CONFLICT" || !this.state.observed) return;
    this.accepted = this.state.observed;
    this.update({ pending: null, pendingHash: null, prepared: null, needsAcceptance: false, phase: "NOT_PREPARED", message: "Head explicitly accepted. Retained plan is read-only; prepare a fresh proposal." });
  }
  preview = async (id: string) => this.run(async live => {
    const v = structuredClone(await this.adapter.readVersion({ scope: this.adapter.target.scope, id })); if (!live()) return; await this.checkView(v); if (!live()) return;
    requireMatch(v.record.id === id); this.update({ preview: v, message: "Read-only historical preview. Reviewed plan and repository head unchanged." });
  });
  loadPreview() {
    if (this.state.busy || this.state.pending || !this.state.preview) return;
    this.update({ expanded: [], plan: this.state.preview.record.plan, saved: this.state.preview, prepared: null, phase: "HISTORICAL", message: "Historical Version. Integrity verified against its saved content; currentness is a separate observation. Loading does not change the head." });
  }
}
