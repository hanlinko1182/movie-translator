import { contractHash } from "../../lib/storyline/canonical";
import type { NarrationDraft } from "../../lib/storyline/narration/contracts";
import { VOICE_HANDOFF, type VoiceRequestProposal } from "../../lib/storyline/voice/contracts";

/** Synthetic, unavailable provider identity; never a model/support approval. */
export function voiceProposal(draft: NarrationDraft, draftId = "synthetic-narration-row"): VoiceRequestProposal {
  const d = draft.payload, section = d.sections[0], beat = d.beats.find(row => row.id === section.beatId)!;
  return { schemaVersion: VOICE_HANDOFF.version, execution: "DISABLED_HANDOFF_ONLY",
    scope: { projectId: d.source.projectId, movieId: d.source.movieId, studioId: d.source.studioId },
    narration: { draftId, draftHash: draft.draftHash, sectionId: section.id, sectionOrder: section.order, chunkIndex: 0, chunkCount: 1,
      textHash: contractHash("story-voice-section-text-v1", beat.narration.map(row => row.text).join("\n\n")) },
    source: { snapshotId: d.source.snapshotId, contentHash: d.source.contentHash, contextHash: d.source.contextHash, dependencyHash: d.source.dependencyHash,
      bindingHash: d.source.bindingHash, mediaSha256: d.source.mediaSha256, studioRevision: d.source.expectedStudioRevision },
    analysis: { candidateId: d.analysis.candidateId, candidateHash: d.analysis.candidateHash, taskId: d.analysis.taskId,
      generation: d.analysis.generation, resultId: d.analysis.resultId, resultHash: d.analysis.resultHash, recipeHash: d.analysis.recipeHash },
    approval: null, language: "my", locale: "my-MM",
    voice: { providerId: "unverified-test-provider", modelId: "unverified-test-model", voiceId: "unverified-test-voice", profileId: "disabled-test-profile",
      profileHash: "1".repeat(64), capabilityEvidenceHash: "2".repeat(64), delivery: "REFLECTIVE", cloning: "NONE" },
    audio: { format: "WAV_PCM16", sampleRateHz: 24000, channels: 1 }, cost: null, spending: null };
}
