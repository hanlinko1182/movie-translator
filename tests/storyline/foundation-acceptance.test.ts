// M1-F boundary audit: synthetic inputs only; never install a runtime issuer.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { after, before, mock, test } from "node:test";
import { planStoryDuration } from "../../lib/storyline/duration-engine";
import { createStorylineOperatorAuthority } from "../../lib/storyline/operator-authority";
import type { StorylineReadDatabase } from "../../lib/storyline/read-source";
import { StorylineContractError } from "../../lib/storyline/validation";
import { createStorylineReceiptAttestor } from "../../lib/storyline/verification-attestation";
import { VerificationSecurityError } from "../../lib/storyline/verification-errors";
import { STORYLINE_VERIFICATION_ISSUANCE_ENABLED } from "../../lib/storyline/verification-issuance";
import { createDurableStorylineVerificationService } from "../../lib/storyline/verification-service";
import { durationFixture } from "./duration.fixture";
import { date, scope } from "./fixtures";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No network/provider calls in acceptance tests")); });
after(() => mock.restoreAll());

const disabled = (error: unknown) => error instanceof VerificationSecurityError && error.code === "VERIFICATION_DISABLED";

test("missing, cloned and public-only signing capabilities cannot issue or bypass validation", async () => {
  let transactions = 0;
  const database = { $transaction: async () => { transactions++; assert.fail("Disabled service must fail before database access"); } } as unknown as StorylineReadDatabase;
  const keys = generateKeyPairSync("ed25519");
  const signer = createStorylineReceiptAttestor({ keyId: "synthetic-acceptance-key", ...keys });
  const publicOnly = createStorylineReceiptAttestor({ keyId: "synthetic-acceptance-key", publicKey: keys.publicKey });
  const authority = createStorylineOperatorAuthority({ providerId: "synthetic-provider", resolve: async () => null }, () => date);
  const selection = { ...scope, studioId: "synthetic-studio", scriptVersionId: "synthetic-script" };
  for (const attestor of [null, { ...signer }, publicOnly]) {
    const service = createDurableStorylineVerificationService({ readerDatabase: database, issuerDatabase: database, authority, attestor, now: () => date });
    await assert.rejects(() => service.propose(selection, "claim-0"), disabled);
    await assert.rejects(() => service.issue({} as Parameters<typeof service.issue>[0]), disabled);
    if (attestor !== publicOnly) await assert.rejects(() => service.lookup(selection), disabled);
    assert.equal(service.capability.applicationEnabled, false);
  }
  const noAuthority = createDurableStorylineVerificationService({ readerDatabase: database, issuerDatabase: database, authority: null, attestor: signer, now: () => date });
  await assert.rejects(() => noAuthority.propose(selection, "claim-0"), disabled);
  assert.equal(transactions, 0);
  assert.equal(STORYLINE_VERIFICATION_ISSUANCE_ENABLED, false);
});

test("duration rejects durable services and serialized current-status objects instead of inventing a trust bridge", () => {
  const f = durationFixture();
  const service = createDurableStorylineVerificationService({ readerDatabase: null, issuerDatabase: null, authority: null, attestor: null, now: () => date });
  const serializedView = { persisted: true, contextState: "CURRENT", scriptHash: f.script.scriptHash,
    sourceContextHash: f.source.sourceContextHash, sourceEligible: true,
    claims: f.script.payload.beats.flatMap(beat => beat.claims.map(claim => ({ claimId: claim.id, state: "SOURCE_VERIFIED" }))) };
  for (const untrusted of [service, serializedView, { evaluate: () => serializedView }, { ...f.authority }]) {
    assert.throws(() => planStoryDuration(f.source, f.script, f.inventory, f.policy, untrusted),
      (error: unknown) => error instanceof StorylineContractError && error.rule === "UNTRUSTED_RECEIPT");
  }
});

test("existing duration calculations explicitly retain their immutable-context-only limitation", () => {
  const f = durationFixture();
  for (const claim of f.script.payload.beats.flatMap(beat => beat.claims)) f.verify(claim.id);
  const result = planStoryDuration(f.source, f.script, f.inventory, f.policy, f.authority);
  assert.equal(result.counts.supportedEvents, 2);
  assert.equal(result.contextStatus, "PROVIDED_IMMUTABLE_CONTEXT_ONLY");
  assert.equal(result.persisted, false);
  assert.equal(result.policy.calibrationStatus, "UNCALIBRATED");
  assert.equal(result.budget.estimatedVoiceDurationMs, null);
});

test("application routes, UI and workers do not bootstrap Storyline persistence or verification", async () => {
  async function files(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
  }
  const paths = (await Promise.all(["app", "components", "workers"].map(files))).flat().filter(path => /\.tsx?$/.test(path));
  for (const path of paths) {
    assert.doesNotMatch(await readFile(path, "utf8"), /\b(?:createDurableStorylineVerificationService|createStorylineOperatorAuthority|createStorylineReceiptAttestor|persistPreparedStorylineSource|persistStorylineScriptDraft|planStoryDuration)\b/, path);
  }
});
