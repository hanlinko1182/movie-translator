import "server-only";
import { createHash } from "node:crypto";
import { fail, freeze, integer } from "../../validation";
import { AUDIO_VERIFICATION as A, type PcmMeasurement } from "./contracts";

const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArray, "byteLength")!.get!;
const arrayBuffer = Object.getOwnPropertyDescriptor(typedArray, "buffer")!.get!;
const elementType = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag)!.get!;
/** Integer microseconds, nearest with exact half rounded upward. Sample count
 * and rate remain authoritative; no floating-point or header duration. */
export function pcmDurationUs(samples: number, sampleRate: number) {
  integer(samples, "audio.samples", A.maxCollectionAudioBytes / 2);
  if (!samples || ![24000, 48000].includes(sampleRate)) fail("INVALID_NUMBER", "audio.duration");
  return Number((BigInt(samples) * BigInt(1000000) + BigInt(sampleRate / 2)) / BigInt(sampleRate));
}
/** Copy only actual bounded, non-shared Uint8Array/Buffer storage. Intrinsic
 * getters/copy avoid caller accessors, iterators and mutable shared memory. */
export function capturePcmBytes(value: unknown): Uint8Array {
  if (!ArrayBuffer.isView(value) || elementType.call(value) !== "Uint8Array" || ![Uint8Array.prototype, Buffer.prototype].includes(Object.getPrototypeOf(value))) fail("INVALID_OBJECT", "audio.bytes");
  const length = byteLength.call(value);
  if (!length || length > A.maxAudioBytes || !(arrayBuffer.call(value) instanceof ArrayBuffer)) fail("SIZE_LIMIT", "audio.bytes");
  return new Uint8Array(value as Uint8Array);
}
/** Deliberately narrow RIFF layout: fmt(16), optional single JUNK, data last.
 * No extensions, unknown chunks, nested formats, trailing bytes or decoding. */
export function verifySyntheticPcmWav(value: unknown): PcmMeasurement {
  const bytes = capturePcmBytes(value), view = new DataView(bytes.buffer);
  const bad = (): never => fail("INVALID_SERIALIZATION", "audio.wav");
  if (bytes.length < 46) bad();
  const tag = (at: number, expected: string) => [...expected].every((c, i) => bytes[at + i] === c.charCodeAt(0));
  if (!tag(0, "RIFF") || !tag(8, "WAVE") || view.getUint32(4, true) !== bytes.length - 8) bad();
  let offset = 12, format: PcmMeasurement["format"] | null = null, dataOffset = 0, dataBytes = 0, junk = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) bad();
    const size = view.getUint32(offset + 4, true), start = offset + 8, end = start + size, padded = end + size % 2;
    if (end > bytes.length || padded > bytes.length || (size % 2 && bytes[end] !== 0)) bad();
    if (tag(offset, "fmt ")) {
      if (format || offset !== 12 || size !== 16) bad();
      const rate = view.getUint32(start + 4, true);
      if (view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 || ![24000, 48000].includes(rate) ||
        view.getUint16(start + 14, true) !== 16 || view.getUint16(start + 12, true) !== 2 || view.getUint32(start + 8, true) !== rate * 2) bad();
      format = { container: "WAV", codec: "PCM16_LE", sampleRateHz: rate as 24000 | 48000, channels: 1, bitDepth: 16, blockAlign: 2, byteRate: rate * 2 };
    } else if (tag(offset, "JUNK")) {
      if (!format || junk || dataOffset || size > 1024) bad(); junk = true;
    } else if (tag(offset, "data")) {
      if (!format || dataOffset || !size || size % 2 || padded !== bytes.length) bad();
      dataOffset = start; dataBytes = size;
    } else bad();
    offset = padded;
  }
  if (!format || !dataOffset || offset !== bytes.length) return bad();
  const sampleCount = dataBytes / 2;
  return freeze({ schemaVersion: A.measurement, validator: A.validator, format, fileBytes: bytes.length, dataBytes, dataOffset,
    audioSha256: createHash("sha256").update(bytes).digest("hex"), sampleCount,
    durationUs: pcmDurationUs(sampleCount, format.sampleRateHz), durationPolicy: A.durationPolicy });
}
