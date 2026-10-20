import "server-only";
import { parseEnvelope, envelopeHash, reject, same, type Context } from "./contracts";
import { byteHash, captureBytes, type PrivateBlobPort } from "./storage";

export function createFakeSourceAuthorityForTest(context: Context, binding: unknown, port: PrivateBlobPort) {
  const captured = parseEnvelope("source",binding), sourceHash = envelopeHash("source", captured);
  if (!same({namespace:captured.namespace,scope:captured.scope},context)) reject("SOURCE_BINDING");
  let revoked = false;
  return Object.freeze({
    binding: captured, sourceHash,
    revokeForTest() { revoked=true; },
    async inspect(expectedContext: Context, expectedHash: string) {
      if (revoked || Date.now() >= Number(captured.body.expiresAtMs) || expectedHash !== sourceHash || !same(expectedContext,context)) reject("SOURCE_UNAVAILABLE");
      const bytes = captureBytes(await port.read(context,String(captured.body.version)));
      if (byteHash(bytes) !== captured.body.byteSha256 || bytes.length !== captured.body.byteCount) reject("SOURCE_INTEGRITY");
      return captured;
    },
  });
}
export type FakeSourceAuthority = ReturnType<typeof createFakeSourceAuthorityForTest>;
