import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { authorizeStorylineOperator, consumeStorylineOperator, createStorylineOperatorAuthority, operatorDecisionHash,
  type ServerOperatorDecision, type TrustedOperatorAuthority } from "../../lib/storyline/operator-authority";
import { createStorylineReceiptAttestor } from "../../lib/storyline/verification-attestation";
import { VerificationSecurityError } from "../../lib/storyline/verification-errors";
import { date, scope } from "./fixtures";

const session = Object.freeze({ syntheticSession: true });
const binding = { scope: { ...scope, studioId: "synthetic-studio" }, action: "VERIFY_SOURCE" as const,
  decisionHash: operatorDecisionHash({ synthetic: true }) };
const identity = { subjectId: "synthetic-operator", auditLabel: "Synthetic human", authenticatedAt: date, expiresAt: "2026-10-01T00:10:00.000Z" };
const unauthorized = (error: unknown) => error instanceof VerificationSecurityError && error.code === "OPERATOR_UNAUTHORIZED";
const invalid = (error: unknown) => error instanceof VerificationSecurityError && error.code === "VERIFICATION_AUTHORIZATION_INVALID";

test("authority denies absent providers, labels, cloned sessions and forged handles", async () => {
  const denied = createStorylineOperatorAuthority(null, () => date);
  await assert.rejects(() => authorizeStorylineOperator(denied, session, binding), unauthorized);
  await assert.rejects(() => authorizeStorylineOperator({} as TrustedOperatorAuthority, session, binding), unauthorized);
  const authority = createStorylineOperatorAuthority({ providerId: "synthetic-provider", resolve: async candidate => candidate === session ? identity : null }, () => date);
  for (const fake of [{ auditLabel: "human" }, { authenticated: true }, structuredClone(session), { issuer: "AI", approved: true }]) {
    await assert.rejects(() => authorizeStorylineOperator(authority, fake, binding), unauthorized);
  }
});
test("server authorization capabilities bind scope, action and decision; replay and cloning fail", async () => {
  const authority = createStorylineOperatorAuthority({ providerId: "synthetic-provider", resolve: async () => identity }, () => date);
  const token = await authorizeStorylineOperator(authority, session, binding);
  assert.throws(() => consumeStorylineOperator(authority, structuredClone(token), binding), invalid);
  const grant = consumeStorylineOperator(authority, token, binding);
  assert.equal(grant.subjectId, identity.subjectId); assert.equal(grant.expiresAt, "2026-10-01T00:05:00.000Z");
  assert.throws(() => consumeStorylineOperator(authority, token, binding), invalid);
  for (const expected of [{ ...binding, scope: { ...binding.scope, movieId: "other-movie" } },
    { ...binding, action: "REVOKE_VERIFICATION" as const }, { ...binding, decisionHash: "a".repeat(64) }]) {
    const fresh = await authorizeStorylineOperator(authority, session, binding);
    assert.throws(() => consumeStorylineOperator(authority, fresh, expected), invalid);
    assert.throws(() => consumeStorylineOperator(authority, fresh, binding), invalid);
  }
  assert.throws(() => consumeStorylineOperator(authority, {} as ServerOperatorDecision, binding), invalid);
});
test("expired sessions and decisions fail, and provider errors reveal no private diagnostics", async () => {
  let clock = date;
  const authority = createStorylineOperatorAuthority({ providerId: "synthetic-provider", resolve: async () => identity }, () => clock);
  const token = await authorizeStorylineOperator(authority, session, binding);
  clock = "2026-10-01T00:05:00.001Z";
  assert.throws(() => consumeStorylineOperator(authority, token, binding), invalid);
  const expired = createStorylineOperatorAuthority({ providerId: "synthetic-provider", resolve: async () => ({ ...identity, expiresAt: date }) }, () => date);
  await assert.rejects(() => authorizeStorylineOperator(expired, session, binding), unauthorized);
  const broken = createStorylineOperatorAuthority({ providerId: "synthetic-provider", resolve: async () => { throw new Error("SYNTHETIC_PRIVATE_SESSION_DATA"); } }, () => date);
  await assert.rejects(() => authorizeStorylineOperator(broken, session, binding), error => unauthorized(error) && !String(error).includes("SYNTHETIC_PRIVATE"));
});
test("pinned public key verifies exact content; public-only verifier cannot issue or trust another key", () => {
  const keys = generateKeyPairSync("ed25519"), other = generateKeyPairSync("ed25519");
  const issuer = createStorylineReceiptAttestor({ keyId: "synthetic-key", ...keys });
  const reader = createStorylineReceiptAttestor({ keyId: "synthetic-key", publicKey: keys.publicKey });
  const wrong = createStorylineReceiptAttestor({ keyId: "synthetic-key", publicKey: other.publicKey });
  const content = { chinese: "原文", myanmar: "မြန်မာ", outcome: "SOURCE_VERIFIED" }, signature = issuer.sign(content);
  assert.equal(reader.verify(content, signature), true);
  assert.equal(reader.verify({ ...content, outcome: "UNSUPPORTED" }, signature), false);
  assert.equal(reader.verify(content, { ...signature, keyId: "untrusted-key" }), false);
  assert.equal(wrong.verify(content, signature), false);
  assert.throws(() => reader.sign(content), error => error instanceof VerificationSecurityError && error.code === "VERIFICATION_DISABLED");
});
