import "server-only";
import { canonicalJson, contractHash } from "../../canonical";
import { fail, freeze, integer, record } from "../../validation";
import { validateVoicePlan } from "../foundation/chunk-plan";
import { fakeVoiceRestrictions } from "../foundation/contracts";
import { AUDIO_VERIFICATION as A, type SyntheticAudioCollection, type SyntheticAudioReceipt, type SyntheticCollectionPayload } from "./contracts";
import { parseSyntheticAudioReceipt } from "./receipt";
import { pcmDurationUs } from "./wav";

/** Every item supplies receipt + actual bytes; hashes alone cannot complete a
 * collection. No WAV concatenation, final track, storage or publication. */
export function verifySyntheticAudioCollection(value: unknown): SyntheticAudioCollection {
  const r = record(value, ["plan", "items"], "audio.collection"), plan = validateVoicePlan(r.plan);
  if (!Array.isArray(r.items) || Object.getPrototypeOf(r.items) !== Array.prototype || r.items.length !== plan.plan.chunks.length || Reflect.ownKeys(r.items).length !== r.items.length + 1) fail("SIZE_LIMIT", "audio.coverage");
  const ordered: SyntheticAudioReceipt[] = [];
  let fileBytes = 0, dataBytes = 0, sampleCount = 0;
  for (let i = 0; i < r.items.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(r.items, i);
    if (!descriptor || !("value" in descriptor)) fail("INVALID_OBJECT", "audio.collection.item");
    const item = record(descriptor.value, ["receipt", "bytes"], "audio.collection.item");
    const captured: unknown = JSON.parse(canonicalJson(item.receipt, A.maxReceiptBytes));
    const envelope = record(captured, ["receipt", "receiptHash"], "audio.receipt");
    // Read no caller getter and invoke no caller array methods. Full shape and
    // provenance will be replayed against the exact expected plan below.
    const payload = envelope.receipt;
    if (!payload || typeof payload !== "object" || !("chunk" in payload) || !payload.chunk || typeof payload.chunk !== "object" || !("index" in payload.chunk)) fail("INVALID_OBJECT", "audio.chunk");
    const index = integer(payload.chunk.index, "audio.chunkIndex", plan.plan.chunks.length - 1);
    if (ordered[index]) fail("DUPLICATE_ID", "audio.coverage");
    const verified = parseSyntheticAudioReceipt(captured, { plan, chunkIndex: index, bytes: item.bytes });
    fileBytes += verified.receipt.audio.fileBytes; dataBytes += verified.receipt.audio.dataBytes; sampleCount += verified.receipt.audio.sampleCount;
    if (fileBytes > A.maxCollectionAudioBytes) fail("SIZE_LIMIT", "audio.collection.bytes");
    ordered[index] = verified;
  }
  for (let i = 0; i < plan.plan.chunks.length; i++) if (!ordered[i]) fail("INVALID_ORDER", "audio.coverage");
  const manifest: SyntheticCollectionPayload = {
    schemaVersion: A.collection, execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED",
    planHash: plan.planHash, reference: plan.plan.reference, voice: plan.plan.capability,
    entries: ordered.map(({ receipt, receiptHash }) => ({ chunk: receipt.chunk, receiptHash, audioSha256: receipt.audio.audioSha256,
      audioBytes: receipt.audio.fileBytes, sampleCount: receipt.audio.sampleCount, durationUs: receipt.audio.durationUs })),
    totals: { fileBytes, dataBytes, sampleCount, sampleRateHz: 24000, durationUs: pcmDurationUs(sampleCount, 24000), durationPolicy: A.durationPolicy },
    restrictions: fakeVoiceRestrictions,
  };
  canonicalJson(manifest, A.maxManifestBytes);
  return freeze({ manifest, manifestHash: contractHash(A.collection, manifest) });
}
/** Collection replay also requires all chunk bytes and receipts. */
export function parseSyntheticAudioCollection(value: unknown, context: unknown) {
  const captured: unknown = JSON.parse(canonicalJson(value, A.maxManifestBytes));
  record(captured, ["manifest", "manifestHash"], "audio.manifest");
  const verified = verifySyntheticAudioCollection(context);
  if (canonicalJson(captured) !== canonicalJson(verified)) fail("RECEIPT_BINDING_INVALID", "audio.manifest");
  return verified;
}
