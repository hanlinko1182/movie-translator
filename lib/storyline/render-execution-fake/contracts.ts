import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { enumeration, freeze, hash, id, integer, literal, record } from "../validation";
import { parseRecordIdentity, parseStoreScope, type TimelineStoreScope } from "../timeline-persistence/contracts";
import { parseRenderRecipe } from "../render-planning/recipe";

export const EXECUTION = {
  request: "story-recap-execution-request-v1", source: "story-recap-execution-source-binding-v1",
  admission: "story-recap-execution-admission-v1", submission: "story-recap-execution-submission-v1",
  checkpoint: "story-recap-execution-checkpoint-v1", result: "story-recap-execution-result-v1",
  stage: "story-recap-execution-stage-v1", verification: "story-recap-execution-fake-byte-verification-v1",
  artifact: "story-recap-execution-artifact-v1", access: "story-recap-execution-access-v1",
  lifecycle: "story-recap-execution-lifecycle-v1", recovery: "story-recap-execution-recovery-v1",
  audit: "story-recap-execution-audit-v1", profile: "story-recap-execution-profile-v1",
} as const;
export const limits = Object.freeze({ request: 2097152, capture: 33554432, blob: 1048576, total: 33554432,
  reserve: 4194304, operations: 16, versions: 32, segments: 64, concurrency: 1 });
export const restrictions = Object.freeze({ environment: "DISPOSABLE_FAKE_ONLY", execution: "SYNTHETIC_ONLY",
  media: "SIMULATED_NOT_MEDIA", verification: "MEDIA_VERIFICATION_NOT_PERFORMED", rendering: "NOT_RENDERED",
  humanApproval: "NONE", sourceVerified: false, originalMovieAudio: "EXCLUDED", synthesizedNarration: "NONE",
  speech: "NOT_VERIFIED", voiceSynchronization: "UNSUPPORTED", spendingAuthority: "NONE", publicationEligibility: false } as const);
export const measurements = Object.freeze({ codec: "NOT_MEASURED", frames: "NOT_MEASURED", duration: "NOT_MEASURED", streams: "NOT_MEASURED" } as const);
export const fakeProfile = Object.freeze({ implementation: "IN_MEMORY_FAKE_V1", media: "SIMULATED_NOT_MEDIA", concurrency: 1,
  sourceBytes: limits.blob, outputBytes: limits.blob, measurements });
export const actions = ["inspect", "execute", "observe", "validate", "finalize", "read", "recover", "quarantine", "gc"] as const;
export type Action = typeof actions[number];
export type Kind = keyof typeof EXECUTION;
export type Context = { namespace: string; scope: TimelineStoreScope };
export type Envelope = Context & { schemaVersion: string; restrictions: typeof restrictions; body: Record<string, unknown> };
export class FakeExecutionError extends Error {
  constructor(readonly code: string) { super("Disposable fake execution rejected"); this.name = "FakeExecutionError"; }
}
export function reject(code: string): never { throw new FakeExecutionError(code); }
export const same = (a: unknown, b: unknown) => canonicalJson(a, limits.capture) === canonicalJson(b, limits.capture);
const ident = (v: unknown) => id(v, "fakeExecution.id");
const digest = (v: unknown) => hash(v, "fakeExecution.hash");
const num = (v: unknown) => integer(v, "fakeExecution.number", Number.MAX_SAFE_INTEGER);
const count = (v: unknown) => { const n = integer(v, "fakeExecution.bytes", limits.blob); if (!n) reject("INVALID_BYTES"); return n; };
const one = (v: unknown) => { if (v !== 1) reject("SUBMISSION_GENERATION"); return 1; };
const generation = (v: unknown) => { const n=integer(v,"fakeExecution.generation",1000000);if(!n)reject("INVALID_GENERATION");return n; };
const version = (v: unknown) => { if (typeof v !== "string" || !/^[a-f0-9]{32}$/.test(v)) reject("INVALID_VERSION"); return v; };
const choice = (...xs: string[]) => (v: unknown) => enumeration(v, xs, "fakeExecution.enum");
const fixed = (expected: unknown) => (v: unknown) => { if (!same(v, expected)) reject("INVALID_RESTRICTION"); return v; };
const schema = {
  request: { key: ident, recipe: parseRenderRecipe, sourceHash: digest, profileHash: digest },
  source: { handle: ident, ownerId: ident, version, byteSha256: digest, byteCount: count, generation: one, expiresAtMs: num },
  admission: { operationId: ident, workHash: digest, requestHash: digest, sourceHash: digest, recipeHash: digest, quotaBytes: num },
  submission: { operationId: ident, submissionId: ident, generation: one },
  checkpoint: { operationId: ident, submissionId: ident, generation: one, ownerGeneration: generation },
  result: { operationId: ident, submissionId: ident, generation: one, outcome: choice("SUCCESS", "FAILURE"), quiescence: choice("QUIESCENT"), byteSha256: (v:unknown)=>v===null?null:digest(v), byteCount: (v:unknown)=>integer(v,"fakeExecution.resultBytes",limits.blob) },
  stage: { operationId: ident, version, byteSha256: digest, byteCount: count },
  verification: { operationId: ident, resultHash: digest, sourceHash: digest, recipeHash: digest, dependencyHash: digest, profileHash: digest,
    version, byteSha256: digest, byteCount: count, measurements: fixed(measurements) },
  artifact: { operationId: ident, admissionHash: digest, submissionHash: digest, resultHash: digest, stageHash: digest, verificationHash: digest, version,
    recipeHash: digest, sourceHash: digest, byteSha256: digest, byteCount: count, measurements: fixed(measurements) },
  access: { principalId: ident, sessionId: ident, action: (v: unknown) => enumeration(v, actions, "fakeExecution.action"), expiresAtMs: num },
  lifecycle: { operationId: ident, ownerGeneration: generation, revision: num, state: choice("RESERVED", "CHECKPOINTED", "UNKNOWN", "SUCCESS", "FAILURE", "CANCELLED"),
    availability: choice("ABSENT", "AVAILABLE", "QUARANTINED", "DELETE_PENDING", "DELETED") },
  recovery: { operationId: ident, ownerGeneration: generation, revision: num, reason: ident },
  audit: { operationId: ident, action: ident, revision: num, principalId: ident, timeMs: num },
  profile: { profile: fixed(fakeProfile) },
} satisfies Record<Kind, Record<string, (v: unknown) => unknown>>;
export function parseEnvelope(kind: Kind, input: unknown): Envelope {
  if (!Object.hasOwn(EXECUTION, kind)) reject("INVALID_KIND");
  const r = record(JSON.parse(canonicalJson(input, kind === "request" ? limits.request : 65536)), ["schemaVersion", "namespace", "scope", "restrictions", "body"], "fakeExecution.envelope");
  const scope = parseStoreScope(r.scope), fields = schema[kind] as Record<string, (v: unknown) => unknown>;
  literal(r.schemaVersion, EXECUTION[kind], "fakeExecution.domain");
  if (!same(r.restrictions, restrictions)) reject("INVALID_RESTRICTION");
  const body = record(r.body, Object.keys(fields), "fakeExecution.body");
  for (const [key, check] of Object.entries(fields)) body[key] = check(body[key]);
  if(kind==="result"&&(body.outcome==="SUCCESS"?(body.byteSha256===null||body.byteCount===0):(body.byteSha256!==null||body.byteCount!==0)))reject("INVALID_RESULT");
  if (kind === "request") {
    const recipe = body.recipe as ReturnType<typeof parseRenderRecipe>;
    if (!same(scope, recipe.recipe.input.scope) || recipe.recipe.segments.length > limits.segments || body.profileHash !== profileHash) reject("INVALID_BINDING");
    parseRecordIdentity(recipe.recipe.input.timeline);
  }
  return freeze({ schemaVersion: EXECUTION[kind], namespace: ident(r.namespace), scope, restrictions, body });
}
export function envelope(kind: Kind, context: Context, body: Record<string, unknown>) {
  return parseEnvelope(kind, { schemaVersion: EXECUTION[kind], ...context, restrictions, body });
}
export const envelopeHash = (kind: Kind, input: unknown) => contractHash(EXECUTION[kind], parseEnvelope(kind, input));
export const profileHash = contractHash(EXECUTION.profile, fakeProfile);
export function workHash(input: unknown) {
  const r = parseEnvelope("request", input);
  return contractHash(EXECUTION.admission, { namespace: r.namespace, scope: r.scope, recipe: r.body.recipe, sourceHash: r.body.sourceHash, profileHash: r.body.profileHash });
}
