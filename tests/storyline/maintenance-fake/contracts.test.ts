import test from "node:test";
import assert from "node:assert/strict";
import { actions, envelope, envelopeHash, parseEnvelope, restrictions, type Kind, type Context } from "../../../lib/storyline/maintenance-fake/contracts";
import { createMaintenanceEvidenceOriginForTest, consumeMaintenanceEvidence } from "../../../lib/storyline/maintenance-fake/evidence";
const h = "a".repeat(64), c: Context = { namespace: "fixture", scope: { tenantId: "tenant", projectId: "project", movieId: "movie", studioId: "studio" } };
const rootBody = { rootId: "root", incarnationHash: h, guardHash: h, writerId: "writer", readerId: "reader", supervisorHash: h };
const closure = { rootId: "root", ownerId: "writer", ownerHash: h, supervisorHash: h, guardHash: h, generation: 1,
  descriptorsClosed: true, noFutureIO: true, descendants: "PROVEN_QUIESCENT", origin: "ORIGINAL_PHASE0_SUPERVISOR" };
const samples: Record<Kind, unknown> = {
  root: rootBody, owner: { rootId: "root", ownerId: "writer", incarnationHash: h, kind: "WRITER", generation: 1 },
  decision: { decisionId: "decision", rootId: "root", rootHash: h, writerId: "writer", readerId: "reader", expectedGeneration: 1, expectedRevision: 0,
    purpose: "OBSERVE_CLOSURE_ONLY", evidenceHashes: [h, "b".repeat(64), "c".repeat(64)] },
  writer: closure, reader: { ...closure, ownerId: "reader" },
  successor: { rootId: "root", writerHash: h, readerHash: h, guardHash: h, generation: 1, revision: 0, observation: "QUALIFIED_FOR_FUTURE_PHASE_ONLY", origin: "ORIGINAL_PHASE0_SUPERVISOR" },
  result: { decisionId: "decision", decisionHash: h, outcome: "QUALIFICATION_BLOCKED", reason: "ORIGINAL_EVIDENCE_INCOMPLETE", generation: 1, revision: 0 },
  audit: { decisionId: "decision", decisionHash: h, revision: 0, action: "submit", principalId: "actor", state: "REGISTERED", bodyHash: h },
  health: { decisionCount: 0, evidenceCount: 0, reservedBytes: 0, pendingCount: 0, blockedCount: 0, qualifiedCount: 0, reconciledCount: 0, capacity: "AVAILABLE" },
};
for (const kind of Object.keys(samples) as Kind[]) test(`maintenance ${kind}: strict domain, fake restrictions, exact bounded canonical fields`, () => {
  const value = envelope(kind, c, samples[kind]); assert.equal(envelopeHash(kind, value), envelopeHash(kind, structuredClone(value)));
  for (const bad of [{ ...value, role: "owner" }, { ...value, schemaVersion: "story-recap-execution-result-v1" },
    { ...value, restrictions: { ...restrictions, operationalRecovery: true } }, { ...value, body: { ...value.body, path: "/foreign" } }]) assert.throws(() => parseEnvelope(kind, bad));
  assert.equal(actions.includes("invoke" as never), false);
});
test("maintenance closure record is not independently admissible authority; handles cannot be copied", async () => {
  const origin = await createMaintenanceEvidenceOriginForTest(c, async () => ({ root: envelope("root", c, rootBody),
    owners: [envelope("owner", c, samples.owner), envelope("owner", c, { ...(samples.owner as object), ownerId: "reader", kind: "READER" })],
    evidence: ["writer", "reader", "successor"].map(kind => ({ kind: kind as "writer" | "reader" | "successor", fact: envelope(kind as Kind, c, samples[kind as Kind]) })) }));
  const handle = origin.handles[0]; assert.throws(() => JSON.stringify(handle));
  assert.throws(() => consumeMaintenanceEvidence({ ...handle }, c));
  assert.throws(() => consumeMaintenanceEvidence(envelope("writer", c, closure) as never, c));
  consumeMaintenanceEvidence(handle, c); assert.throws(() => consumeMaintenanceEvidence(handle, c));
});
test("maintenance serialization rejects incomplete evidence, NULL, negative zero and browser grants", () => {
  for (const patch of [{ descriptorsClosed: null }, { noFutureIO: undefined }, { generation: -0 }, { generation: 1.1 }, { role: "supervisor" }])
    assert.throws(() => envelope("writer", c, { ...closure, ...patch }));
  assert.throws(() => envelope("decision", c, { ...(samples.decision as object), evidenceHashes: [h, h, h] }));
});
