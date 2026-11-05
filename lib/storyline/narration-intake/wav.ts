import "server-only";
import { createHash } from "node:crypto";
import { freeze } from "../validation";
import { deny, INTAKE, rational, type WavMeasurement } from "./contracts";

const issued = new WeakSet<object>();
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const lengthOf = Object.getOwnPropertyDescriptor(typedArray, "byteLength")!.get!;
const bufferOf = Object.getOwnPropertyDescriptor(typedArray, "buffer")!.get!;
const typeOf = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag)!.get!;
/** Only bounded, non-shared intrinsic byte storage. Copy before parsing/hashing. */
function capture(value: unknown): Buffer {
  if (!ArrayBuffer.isView(value) || ![Uint8Array.prototype, Buffer.prototype].includes(Object.getPrototypeOf(value)) ||
    typeOf.call(value) !== "Uint8Array") deny("INVALID_BYTES");
  const length = lengthOf.call(value);
  if (length < 46 || length > INTAKE.maxFileBytes || !(bufferOf.call(value) instanceof ArrayBuffer)) deny("BYTE_LIMIT");
  const bytes = new Uint8Array(length);
  Uint8Array.prototype.set.call(bytes, value as Uint8Array);
  return Buffer.from(bytes.buffer);
}
/** Narrow v1 allowlist: fmt(16), then nonempty data, exactly EOF; no ancillary chunks or padding. */
export function measureNarrationWav(value: unknown): WavMeasurement {
  const bytes = capture(value);
  const tag = (at: number, expected: string) => bytes.toString("ascii", at, at + 4) === expected;
  // Compare raw ASCII bytes too: Buffer's ASCII decoding masks high bits.
  const rawTag = (at: number, expected: string) => tag(at, expected) && [...expected].every((c, i) => bytes[at + i] === c.charCodeAt(0));
  if (!rawTag(0, "RIFF") || !rawTag(8, "WAVE") || bytes.readUInt32LE(4) !== bytes.length - 8 ||
    !rawTag(12, "fmt ") || bytes.readUInt32LE(16) !== 16 || !rawTag(36, "data") ||
    bytes.readUInt32LE(40) !== bytes.length - 44) deny("INVALID_WAV_LAYOUT");
  const rate = bytes.readUInt32LE(24), dataBytes = bytes.length - 44;
  if (bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 ||
    !INTAKE.sampleRatesHz.includes(rate) || bytes.readUInt16LE(34) !== 16 ||
    bytes.readUInt16LE(32) !== 2 || bytes.readUInt32LE(28) !== rate * 2 || dataBytes % 2) deny("UNSUPPORTED_PCM");
  const result = freeze({ schemaVersion: INTAKE.measurement, format: "RIFF_WAVE_PCM_S16LE" as const,
    sha256: createHash("sha256").update(bytes).digest("hex"), byteCount: bytes.length, dataByteCount: dataBytes,
    sampleRateHz: rate, channels: 1 as const, bitDepth: 16 as const, sampleFrames: dataBytes / 2,
    durationSeconds: rational(dataBytes / 2, rate), integrity: "LOCAL_AUDIO_INTEGRITY_VERIFIED" as const });
  issued.add(result); return result;
}
/** Process-local measurement identity, not an authorization or serialized attestation. */
export function requireMeasured(value: WavMeasurement): WavMeasurement {
  if (!issued.has(value)) deny("UNTRUSTED_MEASUREMENT");
  return value;
}
