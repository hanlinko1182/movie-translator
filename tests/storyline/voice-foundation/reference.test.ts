import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { checkedEditedNarration, parseNarrationReference, referenceFromM4, referenceFromR4 } from "@/lib/storyline/voice/foundation/reference";
import { editedNarrationVoiceInput } from "@/lib/storyline/voice/foundation/narration-input";
import { parseEditedVersion, editedContentHash } from "@/lib/storyline/studio-versions/validation";
import { type NarrationReference } from "@/lib/storyline/voice/foundation/contracts";
import { voiceFoundationFixture } from "./fixture";
const f = voiceFoundationFixture();
test("M5-01 M4 and R4 references bind distinct actual hash domains, durable/payload IDs and complete source/M3/M2 provenance", () => {
  assert.equal(f.m4.reference.artifact.kind, "M4_ORIGINAL"); assert.equal(f.edited.reference.artifact.kind, "R4_EDITED");
  assert.equal(f.m4.reference.original.payloadId, f.draft.payload.id); assert.notEqual(f.receipt.id, f.draft.payload.id);
  assert.deepEqual(f.edited.reference.original, f.m4.reference.original);
  assert.deepEqual(f.edited.reference.source, f.draft.payload.source); assert.deepEqual(f.edited.reference.analysis, f.draft.payload.analysis);
  assert.notEqual(f.edited.reference.artifact.hash, f.m4.reference.artifact.hash);
  assert.equal(f.edited.reference.artifact.hashDomain, "story-edited-narration-v1");
  assert.equal(f.edited.sections[0].paragraphs[0], f.edit.sections[0].paragraphs[0]);
  assert.notEqual(f.edited.sections[0].paragraphs[0], f.m4.sections[0].paragraphs[0]);
  assert.deepEqual(parseNarrationReference(f.edited.reference), f.edited.reference);
  assert.equal(Object.isFrozen(f.edited.reference.analysis), true);
});
test("M5-01 independently approved reference is explicitly unresolved shape, not issued approval or inherited authority", () => {
  assert.equal(parseNarrationReference(f.future).artifact.kind, "FUTURE_APPROVED_REFERENCE");
  assert.throws(() => parseNarrationReference({ ...f.future, artifact: { ...f.future.artifact, verification: "APPROVED" } }));
  assert.throws(() => parseNarrationReference({ ...f.future, humanApproval: true }));
});
test("M5-01 wrong M4/edit/future hash domains, scope, lineage and candidate fields reject", async t => {
  const changes: ((r: NarrationReference) => unknown)[] = [
    r => ({ ...r, artifact: { ...r.artifact, hashDomain: "story-edited-narration-v1" } }),
    r => ({ ...r, original: { ...r.original, hashDomain: "story-approved-narration-v1" } }),
    r => ({ ...r, scope: { ...r.scope, movieId: "other-movie" } }),
    r => ({ ...r, artifact: { ...r.artifact, id: "other-original" } }),
    r => ({ ...r, analysis: { ...r.analysis, candidateHash: "bad" } }),
    r => ({ ...r, source: { ...r.source, contextHash: "bad" } }),
  ];
  for (const [i, change] of changes.entries()) await t.test(`invalid reference ${i}`, () => assert.throws(() => parseNarrationReference(change(f.m4.reference))));
  assert.throws(() => parseNarrationReference({ ...f.edited.reference, artifact: { ...f.edited.reference.artifact, hashDomain: "story-narration-draft-v1" } }));
  assert.throws(() => parseNarrationReference({ ...f.edited.reference, artifact: { ...f.edited.reference.artifact, version: 2 } }));
});
test("M5-01 canonical converters reject forged bytes/parent/topology; R4 is never cast into M4", () => {
  assert.throws(() => referenceFromM4({ ...f.draft, draftHash: "0".repeat(64) }, f.receipt));
  assert.throws(() => referenceFromR4(f.edit, "0".repeat(64), f.m4.reference));
  const changed = { ...f.edit, binding: { ...f.edit.binding, original: { ...f.edit.binding.original, id: "another-original" } } };
  assert.throws(() => referenceFromR4(changed, editedContentHash(changed), f.m4.reference));
  const topology = { ...f.edit, sections: f.edit.sections.slice().reverse() };
  assert.throws(() => editedNarrationVoiceInput(topology, editedContentHash(topology), f.draft, f.receipt));
  const bytes = canonicalJson(f.draft); referenceFromM4(f.draft, f.receipt); assert.equal(canonicalJson(f.draft), bytes);
  assert.throws(() => referenceFromM4(JSON.parse(canonicalJson(f.edit)), { id: f.edit.id, draftHash: contractHash("story-narration-draft-v1", f.edit) }));
});
test("M5-01 edited previous version and original parent draft identities remain explicit and domain-bound", () => {
  const edit = { ...f.edit, id: "edit-two", version: 2, expectedRevision: 1, previousVersion: { id: f.edit.id, contentHash: editedContentHash(f.edit) }, idempotencyKey: "next-edit" };
  const r = referenceFromR4(edit, editedContentHash(edit), f.m4.reference);
  assert.equal(r.artifact.kind, "R4_EDITED");
  if (r.artifact.kind === "R4_EDITED") assert.deepEqual(r.artifact.previous, { id: f.edit.id, hash: editedContentHash(f.edit), hashDomain: "story-edited-narration-v1" });
  const payload = { ...f.draft.payload, parentDraft: { id: "older-draft", hash: "b".repeat(64) } };
  const draftHash = contractHash("story-narration-draft-v1", payload), parent = referenceFromM4({ payload, draftHash }, { ...f.receipt, draftHash });
  assert.equal(parent.original.parentDraft?.hashDomain, "story-narration-draft-v1");
});

test("M5-01 pure R4 capture matches canonical existing contract and rejects changed metadata/text without DB dependencies", async t => {
  assert.deepEqual(checkedEditedNarration(f.edit, editedContentHash(f.edit), f.m4.reference), parseEditedVersion(f.edit));
  const changes = [
    { origin: "HUMAN_APPROVED" }, { schemaVersion: "unknown" }, { version: 0 }, { expectedRevision: 4 },
    { createdAt: "yesterday" }, { idempotencyKey: "bad!" }, { review: { ...f.edit.review, eligibleForTts: true } },
    { editor: { ...f.edit.editor, role: "admin" } }, { sections: [] },
    { sections: [{ sectionId: "section-one", paragraphs: ["English only"] }] },
    { sections: [{ sectionId: "section-one", paragraphs: ["က\u202e"] }] },
  ];
  for (const [i, patch] of changes.entries()) await t.test(`invalid R4 payload ${i}`, () => {
    const invalid = { ...f.edit, ...patch };
    assert.throws(() => parseEditedVersion(invalid));
    assert.throws(() => checkedEditedNarration(invalid, contractHash("story-edited-narration-v1", invalid), f.m4.reference));
  });
  await t.test("current R4 stays synthetic-only even when a model-origin planning parent is structurally valid", () => {
    const model = { ...f.m4.reference, analysis: { ...f.m4.reference.analysis, candidateOrigin: "MODEL_CANDIDATE" as const } };
    assert.equal(parseNarrationReference(model).analysis.candidateOrigin, "MODEL_CANDIDATE");
    const invalid = { ...f.edit, binding: { ...f.edit.binding, analysis: model.analysis } };
    assert.throws(() => parseEditedVersion(invalid));
    assert.throws(() => checkedEditedNarration(invalid, contractHash("story-edited-narration-v1", invalid), model));
  });
});
