import { createFakeVoiceHarness, createSyntheticVoiceAdapterForTest } from "@/lib/storyline/voice/foundation/fake-adapter";
import { verifyFakeVoiceOutput } from "@/lib/storyline/voice/audio-verification/receipt";
import { voiceFoundationFixture } from "../voice-foundation/fixture";

/** Synthetic sample buffers only, never speech/media execution. */
export function pcmWav(samples = 2, rate = 24000, junk?: Uint8Array) {
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(rate, 4); fmt.writeUInt32LE(rate * 2, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const chunks = [riffChunk("fmt ", fmt), ...(junk ? [riffChunk("JUNK", junk)] : []), riffChunk("data", Buffer.alloc(samples * 2))];
  return waveChunks(chunks);
}
export function riffChunk(name: string, data: Uint8Array) {
  const header = Buffer.alloc(8); header.write(name); header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, ...(data.length % 2 ? [Buffer.alloc(1)] : [])]);
}
export function waveChunks(chunks: Uint8Array[]) {
  const body = Buffer.concat([Buffer.from("WAVE"), ...chunks]), header = Buffer.alloc(8);
  header.write("RIFF"); header.writeUInt32LE(body.length, 4); return Buffer.concat([header, body]);
}
export function verifiedFixture() {
  const f = voiceFoundationFixture(), fake = createSyntheticVoiceAdapterForTest({ capability: f.capability, scenario: "FIXTURE_BYTES" });
  const harness = createFakeVoiceHarness({ adapter: fake.adapter, scope: f.scope });
  const items = f.plan.plan.chunks.map((_, chunkIndex) => {
    const output = harness.submit({ ...f.request, idempotencyKey: `chunk-${chunkIndex}`, chunkIndex });
    return { receipt: verifyFakeVoiceOutput({ plan: f.plan, chunkIndex, output }), bytes: output.bytes! };
  });
  return { ...f, fake, harness, items };
}
