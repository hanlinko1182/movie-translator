import { createPrivateFakeAudioStoreForTest } from "@/lib/storyline/voice/private-artifacts/store";
import { verifiedFixture } from "../audio-verification/fixture";

export function privateFixture(limits = {}) {
  const f = verifiedFixture();
  const root = createPrivateFakeAudioStoreForTest({ maxOwners: 8, maxSubmissions: 100, maxArtifacts: 100, maxAudioBytes: 1048576, ...limits });
  const owner = root.control.createOwner({ ownerId: "fixture-owner", scope: f.scope, generation: 1, expiresAtTick: 100 });
  const operation = { scope: f.scope, generation: 1 };
  const expected = (i = 0) => ({ idempotencyKey: `expected-${i}`, plan: f.plan, chunkIndex: i, receipt: f.items[i].receipt, bytes: f.items[i].bytes });
  const prepare = (i = 0) => root.control.expect(owner, expected(i));
  const admission = (i = 0) => ({ ...operation, receipt: f.items[i].receipt, bytes: f.items[i].bytes });
  return { ...f, ...root, owner, operation, expected, prepare, admission };
}
