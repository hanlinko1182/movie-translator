import type { EditedSection, OriginalIdentity, SaveStudioEdit, StudioHistoryView, StudioOriginalView, StudioSavedView } from "@/lib/storyline/studio-versions/contracts";
import { originalSectionText, type StudioPreviewArtifact } from "./local-script-model";

type ReadTarget = { scope: SaveStudioEdit["scope"]; original: OriginalIdentity };
/** Client-only injection seam. Native Request/session verification stays on the
 * isolated harness server. This label/key confers no authorization. */
export type SyntheticScriptVersionAdapter = {
  mode: "DISPOSABLE_SYNTHETIC_ONLY";
  identityKey: string;
  target: ReadTarget;
  readOriginal: (input: ReadTarget) => Promise<StudioOriginalView>;
  saveVersion: (input: SaveStudioEdit) => Promise<StudioSavedView>;
  readVersion: (input: ReadTarget & { versionId: string }) => Promise<StudioSavedView>;
  listVersions: (input: ReadTarget & { afterVersion: number; limit: number }) => Promise<StudioHistoryView>;
};
export type VersionState = {
  phase: "IDLE" | "LOADING" | "SAVING" | "SAVED" | "ERROR" | "CONFLICT";
  message: string;
  base: StudioOriginalView | null;
  observed: StudioOriginalView | null;
  history: StudioHistoryView | null;
  selected: StudioSavedView | null;
  baseline: readonly { readonly sectionId: string; readonly paragraphs: readonly string[] }[];
  canReconcile: boolean;
  pending: SaveStudioEdit | null;
};
const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => Object.hasOwn(y, k) && same(x[k], y[k]));
  }
  return a === b;
};
export function scriptSections(artifact: StudioPreviewArtifact, edits: Readonly<Record<string, readonly string[]>>): EditedSection[] {
  return artifact.draft.payload.sections.map(s => ({ sectionId: s.id, paragraphs: [...(edits[s.id] ?? originalSectionText(artifact, s.id))] }));
}
export function versionBufferDirty(state: VersionState, sections: readonly EditedSection[]) { return !same(state.baseline, sections); }

const messages: Record<string, string> = {
  R4_REVISION_CONFLICT: "Another version was saved. Refresh history and explicitly use its head before saving a new proposal. Local text is retained.",
  R4_IDEMPOTENCY_CONFLICT: "This request key belongs to different text. Refresh history and reconcile before a new proposal. Local text is retained.",
  R4_PARENT_MISMATCH: "The original draft or its binding does not match. Reload the authorized artifact. Local text is retained.",
  R4_SOURCE_STALE: "The authoritative source changed. Saving is blocked; load a current authorized artifact. Local text is retained.",
  R4_FORBIDDEN: "Read or save permission denied. Local text is retained.",
  R4_AUTH_REQUIRED: "Authentication required. Local text is retained.",
  R4_SESSION_INVALID: "Session expired or changed. Reconnect with an authorized session. Local text is retained.",
  R4_ORIGIN_REJECTED: "Request origin rejected. Local text is retained.",
  R4_CSRF_REJECTED: "Session request verification failed. Local text is retained.",
  R4_NOT_FOUND: "The requested original or version is unavailable. Refresh authorized history. Local text is retained.",
  R4_INVALID_INPUT: "Saved text must contain Myanmar and meet the server text limits. Fix the text, refresh history and explicitly use its head for a new proposal. Local text is retained.",
};
const noApproval = (v: { review: StudioSavedView["review"] }) => v.review.humanApproval === "NONE" && !v.review.sourceVerified && !v.review.eligibleForTts && !v.review.readyForPublication && v.review.semanticReview === "NOT_REVIEWED";

/** Memory-only coordinator; the server remains authoritative. Stable snapshots
 * survive uncertain failures; there are no automatic save retries or rebases. */
export class ScriptVersionSession {
  private listeners = new Set<() => void>();
  private active = true;
  private busy = false;
  private state: VersionState;
  constructor(readonly adapter: SyntheticScriptVersionAdapter, private artifact: StudioPreviewArtifact, private key = () => crypto.randomUUID()) {
    this.state = { phase: "IDLE", message: "Load authorized saved versions to enable synthetic saving.", base: null, observed: null, history: null, selected: null, baseline: scriptSections(artifact, {}), pending: null, canReconcile: false };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  connect() { this.active = true; }
  dispose() { this.active = false; this.listeners.clear(); }
  private update(next: Partial<VersionState>) { if (this.active) { this.state = { ...this.state, ...next }; this.listeners.forEach(l => l()); } }
  private bindingMatches(v: StudioOriginalView | StudioSavedView | StudioHistoryView) {
    const b = v.binding, d = this.artifact.draft;
    if (!same(b.source, d.payload.source) || !same(b.analysis, d.payload.analysis) || b.original.id !== this.adapter.target.original.id ||
      b.original.draftHash !== d.draftHash || b.original.payloadId !== d.payload.id || !noApproval(v)) throw new Error("Read-back mismatch");
  }
  private failed(error: unknown) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
    this.update({ phase: ["R4_REVISION_CONFLICT", "R4_IDEMPOTENCY_CONFLICT"].includes(code) ? "CONFLICT" : "ERROR",
      message: messages[code] ?? "Save/read verification failed. The commit outcome may be unknown. Retry the same request to reconcile; local text is retained." });
  }
  private async run(phase: "LOADING" | "SAVING", work: () => Promise<void>) {
    if (this.busy || !this.active) return;
    this.busy = true; this.update({ phase, message: phase === "SAVING" ? "Saving and verifying immutable version…" : "Loading authorized versions…" });
    try { await work(); } catch (error) { this.failed(error); } finally { this.busy = false; }
  }
  refresh = async (more = false) => this.run("LOADING", async () => {
    const [original, history] = await Promise.all([
      this.adapter.readOriginal(this.adapter.target),
      this.adapter.listVersions({ ...this.adapter.target, afterVersion: more ? this.state.history?.nextAfterVersion ?? 0 : 0, limit: 50 }),
    ]);
    this.bindingMatches(original); this.bindingMatches(history);
    if (!same(original.sections.map(s => ({ sectionId: s.sectionId, paragraphs: s.paragraphs })), scriptSections(this.artifact, {}))) throw new Error("Original mismatch");
    this.update({ observed: original, canReconcile: !!this.state.pending || (!!this.state.base && this.state.base.latestRevision !== original.latestRevision), base: this.state.base ?? original,
      history: more && this.state.history ? { ...history, versions: [...this.state.history.versions, ...history.versions] } : history,
      phase: "IDLE", message: original.currentness === "STALE_DEPENDENCIES" ? "Stale authoritative source · Saving unavailable." : "History refreshed. Local text is unchanged." });
  });
  acceptObservedHead() {
    if (this.busy || !this.state.canReconcile || !this.state.observed || this.state.observed.currentness !== "CURRENT_AT_READ") return;
    this.update({ base: this.state.observed, pending: null, canReconcile: false, phase: "IDLE", message: "Refreshed history head accepted explicitly. Local text is unchanged; review it before saving." });
  }
  save = async (sections: EditedSection[]) => {
    if (!this.state.base || this.state.pending || this.state.base.currentness !== "CURRENT_AT_READ" || this.state.observed?.currentness === "STALE_DEPENDENCIES" || this.state.history?.currentness === "STALE_DEPENDENCIES") return;
    const b = this.state.base;
    const pending: SaveStudioEdit = structuredClone({ scope: this.adapter.target.scope, binding: b.binding,
      expectedRevision: b.latestRevision, previousVersion: b.latestVersion, idempotencyKey: this.key(), sections });
    if (this.busy || !this.active) return;
    this.update({ pending, canReconcile: false }); await this.commit(pending);
  };
  retry = async () => { if (this.state.pending) await this.commit(this.state.pending); };
  private commit = async (pending: SaveStudioEdit) => this.run("SAVING", async () => {
    const saved = await this.adapter.saveVersion(structuredClone(pending));
    if (!this.active) return;
    this.bindingMatches(saved);
    if (!same(saved.sections, pending.sections) || !same(saved.binding, pending.binding) || !same(saved.scope, pending.scope) || saved.version !== pending.expectedRevision + 1 || !same(saved.previousVersion, pending.previousVersion)) throw new Error("Receipt mismatch");
    const read = await this.adapter.readVersion({ ...this.adapter.target, versionId: saved.id });
    if (!this.active) return;
    this.bindingMatches(read);
    // Currentness is observed separately at save and read. Every other field
    // (including immutable identity/hash/time/editor/lineage/text) must round-trip.
    if (!same({ ...saved, currentness: null }, { ...read, currentness: null })) throw new Error("Read-back mismatch");
    const history = await this.adapter.listVersions({ ...this.adapter.target, afterVersion: read.version - 1, limit: 50 });
    if (!this.active) return;
    this.bindingMatches(history);
    const summary = history.versions[0];
    if (!summary || summary.id !== read.id || summary.contentHash !== read.contentHash || summary.version !== read.version || !same(summary.previousVersion, read.previousVersion) || summary.createdAt !== read.createdAt || !same(summary.editor, read.editor)) throw new Error("History mismatch");
    const base = { ...this.state.base!, latestRevision: read.version, latestVersion: { id: read.id, contentHash: read.contentHash }, currentness: read.currentness === "STALE_DEPENDENCIES" ? "STALE_DEPENDENCIES" as const : "CURRENT_AT_READ" as const };
    const first = await this.adapter.listVersions({ ...this.adapter.target, afterVersion: 0, limit: 50 });
    if (!this.active) return;
    this.bindingMatches(first);
    this.update({ history: first, phase: "SAVED", message: "Saved Version · Read-back verified. Human Approved: No.", baseline: structuredClone(read.sections), selected: read, base, observed: base, pending: null });
  });
  preview = async (id: string) => this.run("LOADING", async () => {
    const selected = await this.adapter.readVersion({ ...this.adapter.target, versionId: id }); this.bindingMatches(selected);
    if (selected.id !== id) throw new Error("Version mismatch");
    this.update({ selected, phase: "IDLE", message: "Saved version preview loaded. Editor text is unchanged." });
  });
  useSelectedInEditor() {
    if (this.busy || !this.state.selected) return null;
    const sections = structuredClone(this.state.selected.sections);
    this.update({ baseline: sections }); return Object.fromEntries(sections.map(s => [s.sectionId, s.paragraphs]));
  }
}
