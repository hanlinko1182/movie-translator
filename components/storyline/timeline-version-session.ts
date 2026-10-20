import type { RecapTimelineInput, RecapTimelinePlan, HighlightSourceReference, TimelineRecordView, TimelineHistoryView, SaveTimelineProposal, DisposableTimelineRepository } from "@/lib/storyline/studio-timeline-types";
import { highlightHash as timelineHash, sameHighlight as sameTimeline } from "./highlight-version-session";
export { highlightHash as timelineHash, highlightJson as timelineJson, sameHighlight as sameTimeline } from "./highlight-version-session";

type Operation = "prepareTimeline" | "saveVersion" | "readVersion" | "readHead" | "listHistory" | "readOperation";
/** Explicit test seam. identityKey is a disposal key, never authentication.
 * Each server call still requires native M7-02 authentication and scope proofs. */
export type SyntheticTimelineAdapter = {
  mode: "DISPOSABLE_SYNTHETIC_ONLY"; identityKey: string;
  target: { input: RecapTimelineInput; source: HighlightSourceReference; dependency: { id: string; hash: string } };
} & { [K in Operation]: (input: K extends "saveVersion" ? SaveTimelineProposal : K extends "prepareTimeline" ? RecapTimelineInput : Parameters<DisposableTimelineRepository[K]>[1]) => ReturnType<DisposableTimelineRepository[K]> };
type Prepared = Awaited<ReturnType<DisposableTimelineRepository["prepareTimeline"]>>;
type Head = Awaited<ReturnType<DisposableTimelineRepository["readHead"]>>;
export type TimelinePhase = "NOT_PREPARED" | "PREPARING" | "PREPARED" | "SAVING" | "SAVED" | "CONFLICT" | "STALE" | "UNAUTHORIZED" | "UNKNOWN" | "READBACK_UNAVAILABLE" | "HISTORICAL" | "ERROR";
export type TimelineState = {
  phase: TimelinePhase; busy: boolean; expanded: readonly string[]; selected: string | null; message: string; plan: RecapTimelinePlan | null;
  prepared: Prepared | null; pending: SaveTimelineProposal | null; pendingHash: string | null;
  saved: TimelineRecordView | null; preview: TimelineRecordView | null;
  history: TimelineHistoryView | null; observed: Head | null; needsAcceptance: boolean;
};
const identity = (v: TimelineRecordView) => ({ recordHashDomain: "story-recap-timeline-saved-record-v1", planHashDomain: "story-recap-timeline-plan-v1", id: v.record.id, recordHash: v.recordHash, planHash: v.record.plan.planHash, version: v.record.version });
const planRestrictions = { execution: "SYNTHETIC_ONLY", persistence: "NOT_PERSISTED", humanApproval: "NONE", sourceVerified: false, eligibleForRealTts: false, eligibleForPublication: false, rendering: "NOT_RENDERED", spendingAuthority: "NONE", syntheticAncestry: true, originalMovieAudio: "EXCLUDED", voiceSynchronization: "UNSUPPORTED" };
const savedRestrictions = { ...planRestrictions, storage: "DISPOSABLE_POSTGRES_ONLY" };
delete (savedRestrictions as Partial<typeof planRestrictions>).persistence;
const requireMatch = (v: boolean) => { if (!v) throw new Error("DTO verification failed"); };
export const timelineUnsaved = (s: TimelineState) => !!s.prepared || !!s.pending;

export class TimelineVersionSession {
  private listeners = new Set<() => void>(); private active = true; private epoch = 0;
  private accepted: Head | null = null;
  private state: TimelineState = { phase: "NOT_PREPARED", busy: false, expanded: [], selected: null, message: "Not Prepared. Explicit authorized preparation required.", plan: null, prepared: null, pending: null, pendingHash: null, saved: null, preview: null, history: null, observed: null, needsAcceptance: false };
  select = (id: string) => { if (this.state.plan?.plan.segments.some(s => s.id === id)) this.update({ selected: id, expanded: [...new Set([...this.state.expanded, id])] }); };
  constructor(readonly adapter: SyntheticTimelineAdapter, private key = () => crypto.randomUUID()) {
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
  private update(s: Partial<TimelineState>) { if (this.active) {
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
    else if (code === "STALE_SOURCE" && (!this.state.pending || saveRejected)) this.update({ phase: "STALE", message: "Stale M6/Source. Plan retained for inspection. Fresh authorized preparation required." });
    else if (["AUTH_REQUIRED", "SESSION_INVALID", "FORBIDDEN", "ORIGIN_REJECTED", "CSRF_REJECTED"].includes(code)) this.update({ phase: "UNAUTHORIZED", message: `Unauthorized (${code}). Plan and original operation retained.` });
    else this.update({ phase: this.state.pending ? "READBACK_UNAVAILABLE" : "ERROR", message: this.state.pending ? "Read-back Unavailable. Outcome may be unknown. Recover Original Operation; no automatic write retry." : "Authorized read/preparation unavailable. Current view retained." });
  }
  private async checkPlan(plan: RecapTimelinePlan) {
    const p = plan.plan;
    requireMatch(p.schemaVersion === "story-recap-timeline-plan-v1" && plan.planHash === await timelineHash(p.schemaVersion, p) && plan.id === `tl-${plan.planHash}`);
    requireMatch(p.input.schemaVersion === "story-recap-timeline-input-v1" && p.inputHash === await timelineHash(p.input.schemaVersion, p.input));
    requireMatch(p.policyHash === await timelineHash("story-recap-timeline-policy-v1", p.input.policy));
    requireMatch(sameTimeline(p.restrictions, planRestrictions) && p.input.execution === "SYNTHETIC_ONLY");
    requireMatch(sameTimeline(p.input.scope, this.adapter.target.input.scope));
    requireMatch(sameTimeline(p.source.narration.scope, { projectId: p.input.scope.projectId, movieId: p.input.scope.movieId, studioId: p.input.scope.studioId }));
    requireMatch(p.segments.length > 0 && p.segments.length <= 64 && Number.isSafeInteger(p.totalOutputMs));
    let end = 0;
    for (const [index, segment] of p.segments.entries()) {
      const { id, ...body } = segment;
      requireMatch(id === `tlseg-${await timelineHash("story-recap-timeline-segment-v1", body)}`);
      requireMatch(sameTimeline(segment.scope, p.input.scope) && sameTimeline(segment.selected, p.input.selected) && sameTimeline(segment.source, p.source) && sameTimeline(segment.restrictions, planRestrictions));
      requireMatch([segment.sourceStartMs, segment.sourceEndMs, segment.durationMs, segment.outputStartMs, segment.outputEndMs].every(Number.isSafeInteger));
      requireMatch(segment.presentationIndex === index && segment.sourceStartMs >= 0 && segment.sourceEndMs <= (p.source.media.durationMs ?? -1) && segment.durationMs > 0);
      requireMatch(segment.durationMs === segment.sourceEndMs - segment.sourceStartMs && segment.outputStartMs === end && segment.outputEndMs === end + segment.durationMs);
      end = segment.outputEndMs;
    }
    requireMatch(end === p.totalOutputMs && sameTimeline(p.presentationOrder, p.segments.map(s => s.id)));
    const source = [...p.segments].sort((a, b) => a.sourceStartMs - b.sourceStartMs || a.sourceEndMs - b.sourceEndMs || a.id.localeCompare(b.id));
    requireMatch(sameTimeline(p.sourceOrder, source.map(s => s.id)) && new Set(p.presentationOrder).size === p.segments.length);
    requireMatch(source.every((s, i) => i === 0 || s.sourceStartMs >= source[i - 1].sourceEndMs));
    requireMatch(sameTimeline(p.input.policy, this.adapter.target.input.policy));
  }
  private async checkView(v: TimelineRecordView) {
    const r = v.record; await this.checkPlan(r.plan);
    requireMatch(sameTimeline(r.scope, this.adapter.target.input.scope) && sameTimeline(r.restrictions, savedRestrictions));
    requireMatch(r.schemaVersion === "story-recap-timeline-saved-record-v1" && r.version === r.expectedRevision + 1 && (r.previous?.version ?? 0) === r.expectedRevision);
    requireMatch(v.currentness === "CURRENT_AT_READ" || v.currentness === "STALE_DEPENDENCIES" || v.currentness === "SUPERSEDED");
    requireMatch(v.recordHash === await timelineHash(r.schemaVersion, r));
    requireMatch(r.proposalHash === await timelineHash("story-recap-timeline-save-proposal-v1", { schemaVersion: "story-recap-timeline-save-proposal-v1", scope: r.scope, idempotencyKey: r.idempotencyKey, expectedRevision: r.expectedRevision, previous: r.previous, plan: r.plan }));
  }
  private async checkHistory(h: TimelineHistoryView, after: number) {
    requireMatch(sameTimeline(h.scope, this.adapter.target.input.scope) && h.entries.length <= 5);
    for (const [i, v] of h.entries.entries()) { await this.checkView(v); requireMatch(v.record.version === after + i + 1); if (i) requireMatch(sameTimeline(v.record.previous, identity(h.entries[i - 1]))); }
    requireMatch(h.nextAfterVersion === null || (h.entries.length === 5 && h.nextAfterVersion === h.entries.at(-1)?.record.version));
  }
  prepare = async () => {
    if ((this.state.pending && this.state.phase !== "STALE") || this.state.needsAcceptance) return;
    await this.run(async live => {
      this.update({ phase: "PREPARING", message: "Preparing authorized synthetic plan…" });
      const t = this.adapter.target, p = structuredClone(await this.adapter.prepareTimeline(structuredClone(t.input)));
      if (!live()) return; await this.checkPlan(p.plan); if (!live()) return;
      requireMatch(sameTimeline(p.scope, t.input.scope) && sameTimeline(p.plan.plan.input, t.input));
      if (!sameTimeline(p.plan.plan.source, t.source) || !sameTimeline(p.plan.plan.dependency, t.dependency)) throw Object.assign(new Error("Changed source identity"), { code: "STALE_SOURCE" });
      requireMatch(p.expectedRevision === (p.previous?.version ?? 0));
      if (this.accepted && !(p.expectedRevision === this.accepted.revision && sameTimeline(p.previous, this.accepted.head ? identity(this.accepted.head) : null))) throw Object.assign(new Error("Head changed again"), { code: "REVISION_CONFLICT" });
      this.accepted = null;
      this.update({ prepared: p, pending: null, pendingHash: null, expanded: [], selected: null, plan: p.plan, saved: null, phase: "PREPARED", message: "Prepared / Unsaved. Review evidence before saving." });
    });
  };
  save = async () => {
    if (!this.state.prepared || this.state.pending || this.state.phase !== "PREPARED") return;
    await this.run(async live => {
      const pending: SaveTimelineProposal = structuredClone({ schemaVersion: "story-recap-timeline-save-proposal-v1", ...this.state.prepared!, idempotencyKey: this.key() });
      const pendingHash = await timelineHash(pending.schemaVersion, pending); if (!live()) return;
      this.update({ pending, pendingHash, phase: "SAVING", message: "Saving and independently verifying…" });
      let result: Awaited<ReturnType<SyntheticTimelineAdapter["saveVersion"]>>;
      try { result = await this.adapter.saveVersion(structuredClone(pending)); }
      catch (e) { if (live()) this.fail(e, true); return; }
      if (!live()) return;
      if (result.status === "UNKNOWN") {
        requireMatch(sameTimeline(result.scope, pending.scope) && result.idempotencyKey === pending.idempotencyKey && result.proposalHash === pendingHash);
        this.update({ phase: result.safeCode === "READBACK_UNAVAILABLE" ? "READBACK_UNAVAILABLE" : "UNKNOWN", message: `${result.safeCode === "READBACK_UNAVAILABLE" ? "Read-back Unavailable" : "Unknown Save Outcome"}. Recover Original Operation. No automatic retry.` }); return;
      }
      await this.verifySaved(result.view, pending, pendingHash, live);
    });
  };
  private async verifySaved(receipt: TimelineRecordView, p: SaveTimelineProposal, proposalHash: string, live: () => boolean) {
    await this.checkView(receipt); if (!live()) return;
    const r = receipt.record;
    requireMatch(r.proposalHash === proposalHash && r.idempotencyKey === p.idempotencyKey && sameTimeline(r.plan, p.plan) && sameTimeline(r.previous, p.previous) && r.expectedRevision === p.expectedRevision);
    const read = structuredClone(await this.adapter.readVersion({ scope: p.scope, id: r.id })); if (!live()) return; await this.checkView(read);
    requireMatch(sameTimeline({ ...receipt, currentness: null }, { ...read, currentness: null })); if (!live()) return;
    const page = structuredClone(await this.adapter.listHistory({ scope: p.scope, afterVersion: r.version - 1, limit: 5 })); if (!live()) return; await this.checkHistory(page, r.version - 1);
    requireMatch(!!page.entries[0] && sameTimeline({ ...read, currentness: null }, { ...page.entries[0], currentness: null })); if (!live()) return;
    this.update({ saved: read, plan: read.record.plan, prepared: null, pending: null, pendingHash: null, history: page, phase: "SAVED", message: "Saved and Verified. Human Approved: No." });
  }
  recover = async () => {
    if (!this.state.pending || !this.state.pendingHash || this.state.needsAcceptance) return;
    await this.run(async live => {
      const p = this.state.pending!, hash = this.state.pendingHash!;
      const result = await this.adapter.readOperation({ scope: p.scope, idempotencyKey: p.idempotencyKey, proposalHash: hash }); if (!live()) return;
      if (result.status === "NOT_FOUND") { this.update({ phase: "UNKNOWN", message: "Original operation NOT_FOUND at this read. Rollback is not established. Original key retained; no new write." }); return; }
      await this.verifySaved(result.view, p, hash, live);
    });
  };
  refresh = async (more = false) => this.run(async live => {
    const scope = this.adapter.target.input.scope, after = more ? this.state.history?.nextAfterVersion : 0;
    if (after === null || after === undefined) return;
    const head = structuredClone(await this.adapter.readHead({ scope })); if (!live()) return;
    requireMatch(sameTimeline(head.scope, scope) && head.revision === (head.head?.record.version ?? 0)); if (head.head) await this.checkView(head.head); if (!live()) return;
    const history = structuredClone(await this.adapter.listHistory({ scope, afterVersion: after, limit: 5 })); if (!live()) return; await this.checkHistory(history, after); if (!live()) return;
    this.update({ ...(this.state.needsAcceptance ? { phase: "CONFLICT" as const } : {}), observed: head, history, message: "Authorized head/history refreshed. Reviewed plan unchanged." });
  });
  acceptHead() {
    if (this.state.busy || this.state.phase !== "CONFLICT" || !this.state.observed) return;
    this.accepted = this.state.observed;
    this.update({ pending: null, pendingHash: null, prepared: null, needsAcceptance: false, phase: "NOT_PREPARED", message: "Head explicitly accepted. Retained plan is read-only; prepare a fresh proposal." });
  }
  preview = async (id: string) => this.run(async live => {
    const v = structuredClone(await this.adapter.readVersion({ scope: this.adapter.target.input.scope, id })); if (!live()) return; await this.checkView(v); if (!live()) return;
    requireMatch(v.record.id === id); this.update({ preview: v, message: "Read-only historical preview. Reviewed plan and repository head unchanged." });
  });
  loadPreview() {
    if (this.state.busy || this.state.pending || !this.state.preview) return;
    this.update({ expanded: [], selected: null, plan: this.state.preview.record.plan, saved: this.state.preview, prepared: null, phase: "HISTORICAL", message: "Historical Version. Integrity verified against its saved content; currentness is a separate observation. Loading does not change the head." });
  }
}
