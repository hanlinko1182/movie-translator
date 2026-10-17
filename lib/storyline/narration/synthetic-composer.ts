import "server-only";
import { freeze, fail } from "../validation";
import { checkSyntheticNarrationContext } from "./context";
import type { NarrationDraft, NarrationSpeechText, SyntheticNarrationContext } from "./contracts";
import { projectSyntheticNarration } from "./synthetic-projection";
import { validateSyntheticNarrationDraft } from "./validate";

/** Explicit, deterministic, zero IO. No provider port or database dependency. */
export function composeSyntheticNarration(context: SyntheticNarrationContext): NarrationDraft {
  const payload = projectSyntheticNarration(checkSyntheticNarrationContext(context));
  return validateSyntheticNarrationDraft(payload, context);
}

/** Provider-neutral text preview, not a TTS execution request. */
export function prepareNarrationSpeechText(draft: NarrationDraft, context: SyntheticNarrationContext): NarrationSpeechText {
  const checked = validateSyntheticNarrationDraft(draft.payload, context);
  if (draft.draftHash !== checked.draftHash) fail("STALE_CONTEXT", "narration.speech.draftHash");
  return freeze({ schemaVersion: "story-narration-speech-text-v1", language: "my", draftHash: checked.draftHash,
    eligibleForSynthesis: false, reason: "PROVISIONAL_SYNTHETIC_DRAFT",
    sections: checked.payload.sections.map(section => ({ sectionId: section.id, order: section.order,
      text: checked.payload.beats.find(beat => beat.id === section.beatId)!.narration.map(row => row.text).join("\n\n"), estimatedDurationMs: null })) });
}
