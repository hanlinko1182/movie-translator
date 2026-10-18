import "server-only";
import { canonicalJson, contractHash } from "../../canonical";
import { fail, freeze, integer, record } from "../../validation";
import { validateVoicePlan } from "../foundation/chunk-plan";
import { captureVoiceJson } from "../foundation/reference";
import { VOICE_FOUNDATION as V, fakeVoiceRestrictions, type VoicePlan } from "../foundation/contracts";
import { AUDIO_VERIFICATION as A, type PcmMeasurement, type SyntheticAudioReceipt, type SyntheticVerificationPayload } from "./contracts";
import { verifySyntheticPcmWav } from "./wav";

function expected(plan: VoicePlan, index: number, audio: PcmMeasurement) {
  const chunkIndex = integer(index, "audio.chunkIndex", V.maxChunks - 1), chunk = plan.plan.chunks[chunkIndex];
  if (!chunk || plan.plan.reference.artifact.kind === "FUTURE_APPROVED_REFERENCE" || audio.format.sampleRateHz !== plan.plan.capability.declaredFormat.sampleRateHz) fail("RECEIPT_BINDING_INVALID", "audio.plan");
  const requestHash = contractHash(V.request, { schemaVersion: V.request, execution: "FAKE_ONLY", planHash: plan.planHash, chunkIndex });
  const recipeHash = contractHash(V.recipe, { reference: plan.plan.reference, planHash: plan.planHash, chunkIndex, capability: plan.plan.capability });
  // Reconstruct the unchanged M5-01 UNVERIFIED metadata. It is a linkage
  // claim checked against bytes, never the evidence used to measure them.
  const metadata = { schemaVersion: V.artifact, origin: "SYNTHETIC_TEST_AUDIO", artifactId: `fake-audio-${requestHash}`,
    reference: plan.plan.reference, voice: plan.plan.capability, recipeHash, planHash: plan.planHash,
    requestHash, requestId: `fake-request-${requestHash}`, fakeSubmissionId: `fake-submission-${requestHash}`, chunk,
    audioSha256: audio.audioSha256, nativeAudioSha256: audio.audioSha256, bytes: audio.fileBytes,
    format: plan.plan.capability.declaredFormat, formatVerification: "UNVERIFIED_FIXTURE",
    measurement: { status: "UNVERIFIED_FIXTURE", durationMs: null }, originalMovieAudio: "EXCLUDED", cloning: "NONE", restrictions: fakeVoiceRestrictions };
  const sourceMetadataHash = contractHash(V.artifact, metadata);
  const sourceResult = { schemaVersion: "story-voice-fake-result-v1", requestId: metadata.requestId, fakeSubmissionId: metadata.fakeSubmissionId,
    requestHash, restrictions: fakeVoiceRestrictions, outcome: "FIXTURE_BYTES", metadata, metadataHash: sourceMetadataHash };
  const receipt: SyntheticVerificationPayload = {
    schemaVersion: A.receipt, execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED",
    planHash: plan.planHash, reference: plan.plan.reference, voice: plan.plan.capability, chunk,
    fake: { requestHash, requestId: metadata.requestId, submissionId: metadata.fakeSubmissionId, recipeHash, sourceArtifactId: metadata.artifactId, sourceMetadataHash },
    audio, restrictions: fakeVoiceRestrictions,
  };
  canonicalJson(receipt, A.maxReceiptBytes);
  return { sourceResult, verified: freeze({ receipt, receiptHash: contractHash(A.receipt, receipt) }) };
}
/** Explicit fake-only integration. No adapter invocation/recovery occurs here.
 * UNKNOWN/failure cannot be promoted; the actual bytes are always parsed. */
export function verifyFakeVoiceOutput(value: unknown): SyntheticAudioReceipt {
  const r = record(value, ["plan", "chunkIndex", "output"], "audio.input");
  const plan = validateVoicePlan(r.plan), output = record(r.output, ["result", "bytes"], "audio.output");
  const result = captureVoiceJson(output.result);
  if (!result || typeof result !== "object" || !("outcome" in result) || result.outcome !== "FIXTURE_BYTES") fail("UNTRUSTED_RECEIPT", "audio.outcome");
  const measured = verifySyntheticPcmWav(output.bytes), bound = expected(plan, r.chunkIndex as number, measured);
  if (canonicalJson(result) !== canonicalJson(bound.sourceResult)) fail("RECEIPT_BINDING_INVALID", "audio.fakeResult");
  return bound.verified;
}
/** Strict replay parser requires exact expected plan/index AND actual bytes.
 * A JSON hash alone proves neither validation nor historical submission. */
export function parseSyntheticAudioReceipt(value: unknown, context: unknown): SyntheticAudioReceipt {
  const candidate: unknown = JSON.parse(canonicalJson(value, A.maxReceiptBytes));
  record(candidate, ["receipt", "receiptHash"], "audio.receipt");
  const r = record(context, ["plan", "chunkIndex", "bytes"], "audio.context");
  const plan = validateVoicePlan(r.plan), audio = verifySyntheticPcmWav(r.bytes);
  const bound = expected(plan, r.chunkIndex as number, audio).verified;
  if (canonicalJson(candidate) !== canonicalJson(bound)) fail("RECEIPT_BINDING_INVALID", "audio.receipt");
  return bound;
}
