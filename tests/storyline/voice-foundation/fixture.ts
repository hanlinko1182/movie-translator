import { composeSyntheticNarration } from "@/lib/storyline/narration/synthetic-composer";
import { parseEditedVersion, editedContentHash } from "@/lib/storyline/studio-versions/validation";
import { STUDIO_EDIT, unapprovedEdit } from "@/lib/storyline/studio-versions/contracts";
import { m4NarrationVoiceInput, editedNarrationVoiceInput } from "@/lib/storyline/voice/foundation/narration-input";
import { syntheticVoiceCapability } from "@/lib/storyline/voice/foundation/capability";
import { planMyanmarVoice } from "@/lib/storyline/voice/foundation/chunk-plan";
import { VOICE_FOUNDATION as V, type NarrationReference, type VoicePlanInput, type FakeVoiceRequest } from "@/lib/storyline/voice/foundation/contracts";
import { narrationFixture } from "../narration.fixture";
export function voiceFoundationFixture(maxChunkBytes = 90) {
  const draft = composeSyntheticNarration(narrationFixture(true).context), receipt = { id: "m4-stored-narration", draftHash: draft.draftHash };
  const m4 = m4NarrationVoiceInput(draft, receipt), scope = m4.reference.scope;
  const edit = parseEditedVersion({ schemaVersion: STUDIO_EDIT.version, origin: "SYNTHETIC_TEST_EDIT", id: "r4-edited-narration", version: 1,
    createdAt: "2026-10-18T00:00:00.000Z", scope, binding: { original: { ...receipt, payloadId: draft.payload.id }, source: draft.payload.source, analysis: draft.payload.analysis },
    expectedRevision: 0, previousVersion: null, idempotencyKey: "edited-request", sections: m4.sections.map((s, i) => ({ sectionId: s.sectionId, paragraphs: s.paragraphs.map((p, j) => i || j ? p : "  ပြင်ဆင်ထားသော မြန်မာစာ ဖြစ်သည်။\nမူရင်းကို မပြောင်းလဲပါ။  ") })),
    editor: { tenantId: "synthetic-tenant", principalId: "synthetic-editor" }, review: unapprovedEdit });
  const capability = syntheticVoiceCapability({ maxChunkBytes, voiceId: "fixture-neutral" });
  const input: VoicePlanInput = { ...m4, capability };
  const edited = editedNarrationVoiceInput(edit, editedContentHash(edit), draft, receipt);
  const plan = planMyanmarVoice(input);
  const request: FakeVoiceRequest = { schemaVersion: V.request, execution: "FAKE_ONLY", idempotencyKey: "fake-request-one", plan, chunkIndex: 0 };
  const future: NarrationReference = { ...m4.reference, artifact: { kind: "FUTURE_APPROVED_REFERENCE", id: "future-not-verified", hash: "e".repeat(64), hashDomain: "story-approved-narration-v1",
    parent: { kind: "M4_ORIGINAL", id: receipt.id, hash: receipt.draftHash, hashDomain: "story-narration-draft-v1" },
    approval: { id: "unresolved-approval", hash: "f".repeat(64), hashDomain: "story-narration-approval-v1", policyVersion: "future-policy", verificationDependencyHash: "a".repeat(64) }, verification: "NOT_VERIFIED_BY_PLANNING" } };
  return { draft, receipt, m4, edit, edited, input, plan, request, capability, scope, future };
}
