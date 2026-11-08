import { INTAKE, measureNarrationWav, createOfflineNarrationRegistry, noOwnerClaims } from "../../../lib/storyline/narration-intake";

/** New deterministic synthetic PCM only, no owner sample, transcript or provider output. */
export function wav(frames = 101, rate = 24000): Buffer {
  const b = Buffer.alloc(44 + frames * 2);
  b.write("RIFF", 0); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE((i * 101 % 2001) - 1000, 44 + i * 2);
  return b;
}
export function candidate() {
  const registry = createOfflineNarrationRegistry();
  return { registry, candidate: registry.register(measureNarrationWav(wav()), noOwnerClaims) };
}
export const maxBytes = INTAKE.maxFileBytes;
