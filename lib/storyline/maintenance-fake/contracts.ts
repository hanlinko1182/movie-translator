import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { record, id, hash, integer, enumeration, freeze } from "../validation";

export const MAINTENANCE = {
  root: "story-recap-fake-maintenance-root-v1", owner: "story-recap-fake-maintenance-owner-v1",
  decision: "story-recap-fake-maintenance-decision-v1", writer: "story-recap-fake-maintenance-writer-closure-v1",
  reader: "story-recap-fake-maintenance-reader-closure-v1", successor: "story-recap-fake-maintenance-successor-observation-v1",
  access: "story-recap-fake-maintenance-authorization-proof-v1", result: "story-recap-fake-maintenance-decision-result-v1",
  audit: "story-recap-fake-maintenance-audit-event-v1", health: "story-recap-fake-maintenance-health-snapshot-v1",
} as const;
export const actions = ["submit", "evidence", "qualify", "reconcile", "read", "health"] as const;
export type Action = typeof actions[number];
export type Kind = Exclude<keyof typeof MAINTENANCE, "access">;
export type Scope = { tenantId: string; projectId: string; movieId: string; studioId: string };
export type Context = { namespace: string; scope: Scope };
export const restrictions = Object.freeze({ environment: "DISPOSABLE_FAKE_ONLY", execution: "SYNTHETIC_ONLY",
  media: "SIMULATED_NOT_MEDIA", verification: "MEDIA_VERIFICATION_NOT_PERFORMED", rendering: "NOT_RENDERED",
  humanApproval: "NONE", sourceVerified: false, spendingAuthority: "NONE", publicationEligibility: false,
  originalMovieAudio: "EXCLUDED", synthesizedNarration: "NONE", speech: "NOT_VERIFIED", voiceSynchronization: "UNSUPPORTED",
  operationalRecovery: false, originalProcessQuiescence: "NOT_ASSERTED" } as const);
export const limits = Object.freeze({ envelope: 8192, wire: 8192, decisions: 16, evidence: 32,
  ordinary: 1048576, total: 2097152, reserve: 1048576, decisionCharge: 32768, evidenceCharge: 16384, proofs: 4096 });
export const states = ["REGISTERED", "EVIDENCE_PENDING", "QUALIFICATION_BLOCKED", "QUALIFIED_FOR_FUTURE_PHASE_ONLY", "DECISION_RECONCILED"] as const;
export class MaintenanceError extends Error { constructor(readonly code: string) { super("Disposable maintenance rejected"); } }
export function reject(code: string): never { throw new MaintenanceError(code); }
export const same = (a: unknown, b: unknown) => canonicalJson(a, 65536) === canonicalJson(b, 65536);
const ident = (v: unknown) => id(v, "maintenance.id");
const digest = (v: unknown) => hash(v, "maintenance.hash");
const num = (v: unknown) => integer(v, "maintenance.number", 1000000);
const positive = (v: unknown) => { const n = num(v); if (!n) reject("INVALID_GENERATION"); return n; };
const choice = (...values: string[]) => (v: unknown) => enumeration(v, values, "maintenance.enum");
const bool = (v: unknown) => { if (typeof v !== "boolean") reject("INVALID_BOOLEAN"); return v; };
const hashes = (v: unknown) => { if (!Array.isArray(v) || v.length !== 3 || new Set(v).size !== 3) reject("INVALID_HASHES"); return v.map(digest); };
const closure = { rootId: ident, ownerId: ident, ownerHash: digest, supervisorHash: digest, guardHash: digest,
  generation: positive, descriptorsClosed: bool, noFutureIO: bool, descendants: choice("PROVEN_QUIESCENT", "UNKNOWN"),
  origin: choice("ORIGINAL_PHASE0_SUPERVISOR") };
const schemas = {
  root: { rootId: ident, incarnationHash: digest, guardHash: digest, writerId: ident, readerId: ident, supervisorHash: digest },
  owner: { rootId: ident, ownerId: ident, incarnationHash: digest, kind: choice("WRITER", "READER"), generation: positive },
  decision: { decisionId: ident, rootId: ident, rootHash: digest, writerId: ident, readerId: ident, expectedGeneration: positive,
    expectedRevision: num, purpose: choice("OBSERVE_CLOSURE_ONLY"), evidenceHashes: hashes },
  writer: closure, reader: closure,
  successor: { rootId: ident, writerHash: digest, readerHash: digest, guardHash: digest, generation: positive, revision: num,
    observation: choice("QUALIFIED_FOR_FUTURE_PHASE_ONLY", "BLOCKED"), origin: choice("ORIGINAL_PHASE0_SUPERVISOR") },
  result: { decisionId: ident, decisionHash: digest, outcome: choice("QUALIFICATION_BLOCKED", "QUALIFIED_FOR_FUTURE_PHASE_ONLY"),
    reason: choice("ORIGINAL_EVIDENCE_COMPLETE", "ORIGINAL_EVIDENCE_INCOMPLETE"), generation: positive, revision: num },
  audit: { decisionId: ident, decisionHash: digest, revision: num, action: choice(...actions), principalId: ident, state: choice(...states), bodyHash: digest },
  health: { decisionCount: num, evidenceCount: num, reservedBytes: (v: unknown) => integer(v, "health.bytes", limits.total), pendingCount: num,
    blockedCount: num, qualifiedCount: num, reconciledCount: num, capacity: choice("AVAILABLE", "SATURATED") },
};
export type Envelope = Context & { schemaVersion: string; restrictions: typeof restrictions; body: Record<string, unknown> };
export function parseContext(v: unknown): Context {
  const c = record(v, ["namespace", "scope"], "maintenance.context"), s = record(c.scope, ["tenantId", "projectId", "movieId", "studioId"], "maintenance.scope");
  return { namespace: ident(c.namespace), scope: { tenantId: ident(s.tenantId), projectId: ident(s.projectId), movieId: ident(s.movieId), studioId: ident(s.studioId) } };
}
export function parseEnvelope(kind: Kind, v: unknown): Envelope {
  if (!Object.hasOwn(schemas, kind)) reject("INVALID_KIND");
  const c = record(JSON.parse(canonicalJson(v, limits.envelope)), ["schemaVersion", "namespace", "scope", "restrictions", "body"], "maintenance.envelope");
  if (c.schemaVersion !== MAINTENANCE[kind] || !same(c.restrictions, restrictions)) reject("INVALID_DOMAIN");
  const schema: Record<string, (v: unknown) => unknown> = schemas[kind], body = record(c.body, Object.keys(schema), "maintenance.body");
  const parsed = Object.fromEntries(Object.entries(schema).map(([k, validate]) => [k, validate(body[k])]));
  return freeze({ ...parseContext({ namespace: c.namespace, scope: c.scope }), schemaVersion: MAINTENANCE[kind], restrictions, body: parsed });
}
export const envelope = (kind: Kind, c: Context, body: unknown) => parseEnvelope(kind, { schemaVersion: MAINTENANCE[kind], ...c, restrictions, body });
export const envelopeHash = (kind: Kind, v: unknown) => contractHash(MAINTENANCE[kind], parseEnvelope(kind, v));
export type DecisionView = { decision: Envelope; hash: string; status: typeof states[number]; revision: number;
  rootGeneration: number; rootRevision: number; evidenceHashes: string[]; result: Envelope | null };
