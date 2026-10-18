import "server-only";
import { canonicalJson, contractHash } from "../../canonical";
import { enumeration, fail, freeze, integer, record } from "../../validation";
import { captureVoiceJson } from "./reference";
import { VOICE_FOUNDATION as V, type SyntheticVoiceCapability } from "./contracts";

export const productionVoiceCapabilities = Object.freeze([] as readonly never[]);
/** Data only: this manifest is never a runtime permit or support certification. */
export function syntheticVoiceCapability(value: unknown) {
  const r = record(captureVoiceJson(value), ["maxChunkBytes", "voiceId"], "voice.capability.options");
  const maxChunkBytes = integer(r.maxChunkBytes, "voice.capability.bytes", V.maxChunkBytes);
  if (!maxChunkBytes) fail("INVALID_NUMBER", "voice.capability.bytes");
  const voiceId = enumeration(r.voiceId, ["fixture-neutral", "fixture-alternate"], "voice.capability.voice");
  const capability: SyntheticVoiceCapability = { schemaVersion: V.capability, execution: "FAKE_ONLY", providerId: "synthetic-voice", voiceId,
    profileId: "fixed-bytes-v1", profileHash: contractHash(V.profile, { voiceId, fixture: "silent-pcm-fixture-v1", synthesis: "NONE" }),
    language: "my", locale: "my-MM", maxChunkBytes, declaredFormat: { container: "WAV", codec: "PCM16_LE", sampleRateHz: 24000, channels: 1 },
    support: "UNVERIFIED_SYNTHETIC_FIXTURE", cloning: "NONE", originalMovieAudio: "EXCLUDED" };
  return freeze(capability);
}
export function parseSyntheticVoiceCapability(value: unknown) {
  const captured = captureVoiceJson(value);
  const r = record(captured, ["schemaVersion", "execution", "providerId", "voiceId", "profileId", "profileHash", "language", "locale", "maxChunkBytes", "declaredFormat", "support", "cloning", "originalMovieAudio"], "voice.capability");
  const expected = syntheticVoiceCapability({ maxChunkBytes: r.maxChunkBytes, voiceId: r.voiceId });
  if (canonicalJson(captured) !== canonicalJson(expected)) fail("UNTRUSTED_RECEIPT", "voice.capability");
  return expected;
}
