import "server-only";
import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJson } from "./canonical";
import { VerificationSecurityError } from "./verification-errors";
import { id } from "./validation";

export type ReceiptAttestation = { algorithm: "Ed25519"; keyId: string; signature: string };
export type ReceiptAttestor = ReturnType<typeof createStorylineReceiptAttestor>;
const attestors = new WeakSet<object>();
export const isStorylineReceiptAttestor = (value: unknown): value is ReceiptAttestor => !!value && typeof value === "object" && attestors.has(value);
/** Trusted bootstrap supplies an independently pinned verification key. No key is
 * loaded from environment, request, receipt JSON or the application database. */
export function createStorylineReceiptAttestor(options: { keyId: string; publicKey: KeyObject; privateKey?: KeyObject }) {
  const keyId = id(options.keyId, "attestor.keyId"), publicKey = options.publicKey, privateKey = options.privateKey;
  if (publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519" || privateKey &&
    (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519" || !createPublicKey(privateKey).equals(publicKey))) {
    throw new VerificationSecurityError("VERIFICATION_DISABLED");
  }
  const attestor = Object.freeze({
    canIssue: !!privateKey,
    sign(content: unknown): ReceiptAttestation {
      if (!privateKey) throw new VerificationSecurityError("VERIFICATION_DISABLED");
      return { algorithm: "Ed25519", keyId, signature: sign(null, Buffer.from(canonicalJson(content), "utf8"), privateKey).toString("hex") };
    },
    verify(content: unknown, attestation: ReceiptAttestation): boolean {
      try {
        return attestation.algorithm === "Ed25519" && attestation.keyId === keyId && /^[a-f0-9]{128}$/.test(attestation.signature) &&
          verify(null, Buffer.from(canonicalJson(content), "utf8"), publicKey, Buffer.from(attestation.signature, "hex"));
      } catch { return false; }
    },
  });
  attestors.add(attestor);
  return attestor;
}
