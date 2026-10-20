import "server-only";
import { canonicalJson, contractHash } from "../../canonical";
import { array, enumeration, freeze, hash, id, integer, record } from "../../validation";
import { validateVoicePlan } from "../foundation/chunk-plan";
import { parseNarrationReference } from "../foundation/reference";
import { VOICE_FOUNDATION, fakeVoiceRestrictions, type VoicePlan } from "../foundation/contracts";
import { parseSyntheticAudioReceipt } from "../audio-verification/receipt";
import { parseSyntheticAudioCollection } from "../audio-verification/collection";
import { AUDIO_VERIFICATION } from "../audio-verification/contracts";

const KiB = 1024;
export const DURABLE_FAKE = {
  request: ["voice-request", 2048 * KiB], binding: ["synthetic-narration-binding", 64 * KiB],
  recipe: ["voice-recipe", 64 * KiB], submission: ["voice-submission", 32 * KiB], reservation: ["audio-reservation", 64 * KiB],
  stage: ["audio-stage", 16 * KiB], verification: ["synthetic-audio-verification", 128 * KiB],
  artifact: ["synthetic-audio-artifact", 256 * KiB], collection: ["synthetic-audio-collection", 4096 * KiB],
  access: ["audio-access-policy", 32 * KiB], lifecycle: ["audio-lifecycle", 8 * KiB], recovery: ["audio-recovery", 64 * KiB],
  audit: ["audio-audit", 16 * KiB],
} as const;
export type Kind = keyof typeof DURABLE_FAKE;
export type Scope = { projectId: string; movieId: string; studioId: string };
export type Context = { namespace: string; tenantId: string; scope: Scope };
type Check = (v: unknown) => unknown;
const ident: Check = v => id(v, "durable.id"), digest: Check = v => hash(v, "durable.hash");
const num: Check = v => integer(v, "durable.integer", Number.MAX_SAFE_INTEGER);
const choice = (...values: string[]): Check => v => enumeration(v, values, "durable.enum");
const bool: Check = v => { if (typeof v !== "boolean") throw new Error("DURABLE_BOOLEAN"); return v; };
const innerReceipt: Check = v => { canonicalJson(v, AUDIO_VERIFICATION.maxReceiptBytes); const r=record(v, ["receipt", "receiptHash"], "durable.innerReceipt"); hash(r.receiptHash,"durable.innerHash"); return r; };
const innerManifest: Check = v => { canonicalJson(v, AUDIO_VERIFICATION.maxManifestBytes); const r=record(v, ["manifest", "manifestHash"], "durable.innerManifest"); hash(r.manifestHash,"durable.innerHash"); return r; };
const reference: Check = v => { const r = parseNarrationReference(v); if (r.artifact.kind === "FUTURE_APPROVED_REFERENCE") throw new Error("DURABLE_SYNTHETIC_ONLY"); return r; };
const schemas: Record<Kind, Record<string, Check>> = {
  request: { bindingHash: digest, recipeHash: digest, plan: validateVoicePlan, chunkIndex: v => integer(v, "durable.chunk", 719), idempotencyKey: ident },
  binding: { reference, planHash: digest, eligibility: choice("SYNTHETIC_ONLY"), approval: choice("NONE") },
  recipe: { bindingHash: digest, planHash: digest, chunkIndex: v => integer(v, "durable.chunk", 719), capabilityHash: digest, profileHash: digest, innerRecipeHash: digest, validator: choice(AUDIO_VERIFICATION.validator) },
  submission: { id: ident, requestHash: digest, recipeHash: digest, generation: num, innerRequestHash: digest, innerSubmissionId: ident, checkpointId: ident },
  reservation: { id: ident, submissionHash: digest, planHash: digest, chunkIndex: num, principalId: ident, ownerGeneration: num, revision: num },
  stage: { id: ident, reservationId: ident, submissionId: ident, ownerGeneration: num, objectVersion: ident, audioSha256: digest, bytes: v => integer(v, "durable.bytes", AUDIO_VERIFICATION.maxAudioBytes) },
  verification: { stageHash: digest, submissionId: ident, ownerGeneration: num, revision: num, inner: innerReceipt },
  artifact: { id: ident, requestHash: digest, recipeHash: digest, submissionHash: digest, reservationHash: digest, stageHash: digest, verificationHash: digest, planHash: digest, chunkIndex: num, objectVersion: ident, inner: innerReceipt },
  collection: { id: ident, planHash: digest, artifacts: v => array(v, 720, "durable.artifacts", 1).map(digest), inner: innerManifest },
  access: { principalId: ident, sessionId: ident, action: choice("create", "observe", "validate", "finalize", "replay", "recovery", "gc"), sourceEpoch: num, policyEpoch: num, expiresAtMs: num },
  lifecycle: { id: ident, delivery: choice("PREPARED", "AWAITING_RESULT", "UNKNOWN", "DEFINITIVE_SUCCESS", "DEFINITIVE_FAILURE", "CANCELLED"), artifact: choice("PREPARED", "STAGED", "VERIFIED", "COMMITTED", "QUARANTINED"), availability: choice("ABSENT", "AVAILABLE", "QUARANTINED", "DELETE_PENDING", "DELETED"), revision: num, ownerGeneration: num, cancelled: bool },
  recovery: { id: ident, submissionId: ident, ownerGeneration: num, revision: num, reason: ident, action: ident, auditId: ident },
  audit: { id: ident, aggregateId: ident, principalId: ident, action: ident, priorRevision: num, nextRevision: num, timeMs: num, reason: ident },
};
export type Envelope = Readonly<Context & { schemaVersion: string; execution: "FAKE_ONLY"; restrictions: typeof fakeVoiceRestrictions; body: Record<string, unknown> }>;
export function domain(kind: Kind) { return `story-durable-${DURABLE_FAKE[kind][0]}-v1`; }
/** Structural parsing is not historical execution, source-currentness or authority.
 * Receipt/collection replay additionally requires independent expected plan+bytes. */
function captureEnvelope(kind: Kind, value: unknown): Envelope {
  const bytes = canonicalJson(value, DURABLE_FAKE[kind][1]);
  const row = record(JSON.parse(bytes), ["schemaVersion", "execution", "namespace", "tenantId", "scope", "restrictions", "body"], "durable.envelope");
  if (row.schemaVersion !== domain(kind) || row.execution !== "FAKE_ONLY" || canonicalJson(row.restrictions) !== canonicalJson(fakeVoiceRestrictions)) throw new Error("DURABLE_SYNTHETIC_ONLY");
  const scope = record(row.scope, ["projectId", "movieId", "studioId"], "durable.scope");
  for (const key of Object.keys(scope)) ident(scope[key]);
  const body = record(row.body, Object.keys(schemas[kind]), "durable.body");
  for (const [key, check] of Object.entries(schemas[kind])) body[key] = check(body[key]);
  const result = { ...row, namespace: ident(row.namespace), tenantId: ident(row.tenantId), body } as Envelope;
  if (kind === "request") {
    const p = body.plan as VoicePlan;
    if (!p.plan.chunks[body.chunkIndex as number] || p.plan.reference.artifact.kind === "FUTURE_APPROVED_REFERENCE" || canonicalJson(p.plan.reference.scope) !== canonicalJson(scope)) throw new Error("DURABLE_BINDING");
  }
  if (kind === "binding" && canonicalJson((body.reference as { scope: unknown }).scope) !== canonicalJson(scope)) throw new Error("DURABLE_BINDING");
  return freeze(result);
}
/** Receipt-bearing untrusted wire values require independent plan+actual bytes.
 * Hash construction alone is deliberately not this admission parser. */
export function parseEnvelope(kind: Kind, value: unknown, verificationContext?: unknown): Envelope {
  const result=captureEnvelope(kind,value);
  if(kind==="verification"||kind==="artifact") {
    if(!verificationContext) throw new Error("DURABLE_BYTES_REQUIRED");
    const inner=parseSyntheticAudioReceipt(result.body.inner,verificationContext);
    if(kind==="artifact"&&(result.body.planHash!==inner.receipt.planHash||result.body.chunkIndex!==inner.receipt.chunk.index)) throw new Error("DURABLE_BINDING");
  }
  if(kind==="collection") {
    if(!verificationContext) throw new Error("DURABLE_BYTES_REQUIRED");
    const inner=parseSyntheticAudioCollection(result.body.inner,verificationContext);
    if(result.body.planHash!==inner.manifest.planHash|| (result.body.artifacts as string[]).length!==inner.manifest.entries.length) throw new Error("DURABLE_BINDING");
  }
  return result;
}
export function envelope(kind: Kind, context: Context, body: Record<string, unknown>) {
  return captureEnvelope(kind, { schemaVersion: domain(kind), execution: "FAKE_ONLY", ...context, restrictions: fakeVoiceRestrictions, body });
}
export function envelopeHash(kind: Kind, value: unknown) { return contractHash(domain(kind), captureEnvelope(kind, value)); }
export function expectedRequest(context: Context, input: unknown, chunkIndex: number, key: string) {
  const plan = validateVoicePlan(input);
  const binding = envelope("binding", context, { reference: plan.plan.reference, planHash: plan.planHash, eligibility: "SYNTHETIC_ONLY", approval: "NONE" });
  const bindingHash = envelopeHash("binding", binding);
  const innerRecipeHash = contractHash(VOICE_FOUNDATION.recipe, { reference: plan.plan.reference, planHash: plan.planHash, chunkIndex, capability: plan.plan.capability });
  const recipe = envelope("recipe", context, { bindingHash, planHash: plan.planHash, chunkIndex, capabilityHash: contractHash(VOICE_FOUNDATION.capability, plan.plan.capability), profileHash: plan.plan.capability.profileHash, innerRecipeHash, validator: AUDIO_VERIFICATION.validator });
  const request = envelope("request", context, { bindingHash, recipeHash: envelopeHash("recipe", recipe), plan, chunkIndex, idempotencyKey: key });
  return { binding, recipe, request, hash: envelopeHash("request", request) };
}
